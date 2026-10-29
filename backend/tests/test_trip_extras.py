"""Weather / disruption risk, booking links, the way home, and "I'm running late"."""

from __future__ import annotations

import time as _time
from datetime import date, datetime, timedelta, timezone

from helpers import MISSION_DAY

from app.integrations.serpapi.conditions import parse_news, parse_weather, weather_kind
from app.services.booking import google_flights_url, redbus_url, tatkal_note

BODY = {"origin": "Indore", "destination": "Bangalore", "venue": "Manyata Tech Park", "mission_type": "interview",
        "travel_date": MISSION_DAY.isoformat(), "arrival_deadline": "10:00", "budget": 10000}

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def forecast_payload(today: date, foggy_day: date) -> dict:
    forecast = []
    for i in range(8):
        d = today + timedelta(days=i)
        forecast.append({"day": DAYS[d.weekday()], "weather": "Fog" if d == foggy_day else "Sunny",
                         "temperature": {"high": "29", "low": "17"}, "precipitation": "0%"})
    return {"answer_box": {"type": "weather_result", "location": "Bengaluru, Karnataka", "unit": "°C",
                           "temperature": "24", "weather": "Clear", "forecast": forecast}}


def news_payload(now: datetime) -> dict:
    fresh = (now - timedelta(hours=5)).isoformat().replace("+00:00", "Z")
    old = (now - timedelta(days=9)).isoformat().replace("+00:00", "Z")
    return {"news_results": [
        {"title": "Transport strike called in Bengaluru on Friday", "link": "https://news.example/strike",
         "source": {"name": "The Daily"}, "iso_date": fresh},
        {"title": "Bengaluru flood warning lifted", "link": "https://news.example/old", "iso_date": old},
        {"title": "Mumbai bandh announced", "link": "https://news.example/mumbai", "iso_date": fresh},
        {"title": "Bengaluru startup raises funding", "link": "https://news.example/biz", "iso_date": fresh},
    ]}


def wait_complete(api, mission_id: str, seconds: float = 20) -> dict:
    deadline = _time.time() + seconds
    status = {}
    while _time.time() < deadline:
        status = api.get(f"/api/v1/missions/{mission_id}").json()
        if status["status"] in ("complete", "failed"):
            break
        _time.sleep(0.05)
    assert status.get("status") == "complete", status
    return api.get(f"/api/v1/missions/{mission_id}/recommendations").json()


# ------------------------------------------------------------------ parsing
def test_weather_parse_picks_the_travel_day():
    today = date(2026, 10, 22)
    w = parse_weather(forecast_payload(today, date(2026, 10, 25)), date(2026, 10, 25), today)
    assert w["summary"] == "Fog" and w["kind"] == "fog" and w["high"] == 29 and w["low"] == 17
    assert parse_weather(forecast_payload(today, today), date(2026, 11, 20), today) is None  # beyond the forecast
    assert parse_weather({"organic_results": []}, today, today) is None


def test_light_rain_is_not_a_travel_risk():
    assert weather_kind("Scattered showers", 20) == (None, None)
    assert weather_kind("Rain", 80) == ("rain", "Rain")
    assert weather_kind("Thunderstorms", None)[0] == "storm"


def test_news_keeps_only_fresh_local_disruption_headlines():
    now = datetime.now(timezone.utc)
    alerts = parse_news(news_payload(now), "Bengaluru", now)
    assert [a["url"] for a in alerts] == ["https://news.example/strike"]
    assert alerts[0]["word"] == "strike" and alerts[0]["source"] == "The Daily"


def test_disruption_phrases_not_words():
    """Found on real Google News results: 'bird strike' must not read as a transport strike."""
    from app.integrations.serpapi.conditions import disruption_label

    assert disruption_label("Air India Express flight en route to Bengaluru reports bird strike") is None
    assert disruption_label("Kohli's strike rate at Bengaluru") is None
    assert disruption_label("Auto strike called in Bengaluru tomorrow") == "strike"
    assert disruption_label("Dense fog delays 40 flights at Delhi airport") == "fog"
    assert disruption_label("Trains cancelled after flooding near Patna") == "flooding"
    assert disruption_label("Bengaluru roads closed for marathon on Sunday") == "road closure"


def test_same_story_from_several_outlets_is_shown_once():
    now = datetime.now(timezone.utc)
    fresh = (now - timedelta(hours=2)).isoformat()
    payload = {"news_results": [
        {"title": "Bengaluru auto strike called for Monday over fare hike", "link": "https://a.example/1", "iso_date": fresh},
        {"title": "Auto strike called in Bengaluru on Monday over fare hike", "link": "https://b.example/2", "iso_date": fresh},
        {"title": "Heavy rain alert for Bengaluru this week", "link": "https://c.example/3", "iso_date": fresh},
    ]}
    assert [a["url"] for a in parse_news(payload, "Bengaluru", now)] == ["https://a.example/1", "https://c.example/3"]


def test_weather_unit_is_normalised():
    today = date(2026, 10, 22)
    payload = forecast_payload(today, today)
    payload["answer_box"]["unit"] = "Celsius"
    assert parse_weather(payload, today, today)["unit"] == "°C"


def test_booking_helpers():
    assert redbus_url("Indore", "Bengaluru") == "https://www.redbus.in/bus-tickets/indore-to-bengaluru"
    assert google_flights_url("IDR", "BLR", date(2026, 11, 14)).startswith("https://www.google.com/travel/flights?q=")
    assert "Tatkal" in tatkal_note(date(2026, 11, 14), date(2026, 11, 13))
    assert "waitlist" in tatkal_note(date(2026, 11, 14), date(2026, 11, 1))


# ------------------------------------------------------------------ end to end
def test_weather_and_news_become_risk_factors(api, mock_serpapi):
    mock_serpapi.weather = forecast_payload(date.today(), MISSION_DAY)
    mock_serpapi.news = news_payload(datetime.now(timezone.utc))
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    result = api.get(f"/api/v1/missions/{mission_id}/recommendations").json()
    cond = result["conditions"]
    assert cond["weather"]["kind"] == "fog" and cond["alerts"][0]["word"] == "strike"
    same_day_flights = [i for i in result["itineraries"] if i["mode"] == "flight" and i["strategy"] == "same_day"]
    for itin in same_day_flights:
        keys = {f["key"]: f for f in itin["risk"]["factors"]}
        assert keys["weather"]["severity"] == "medium" and "disruption" in keys
    assert mock_serpapi.count("google_news") == 1


def test_no_conditions_data_never_fails_the_mission(api, mock_serpapi):
    import httpx
    mock_serpapi.overrides["google_news"] = httpx.Response(500, json={"error": "boom"})
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    result = api.get(f"/api/v1/missions/{mission_id}/recommendations").json()
    assert result["status"] in ("complete", "partial") and result["conditions"]["alerts"] == []


def test_every_journey_has_booking_steps(api):
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    result = api.get(f"/api/v1/missions/{mission_id}/recommendations").json()
    for itin in result["itineraries"]:
        steps = itin["booking"]
        assert steps, itin["id"]
        assert all(l["url"].startswith("https://") for s in steps for l in s["links"])
        if itin["mode"] == "flight":
            assert steps[0]["key"] == "flight" and steps[0]["links"][0]["label"] == "Google Flights"
        if itin["hotel"]:
            assert any(s["key"] == "hotel" for s in steps)
        order = [s["key"] for s in steps]
        if "hotel" in order and "cab" in order:
            assert order.index("hotel") < order.index("cab")


def test_return_journey(api):
    body = {**BODY, "return_trip": {"date": MISSION_DAY.isoformat(), "leave_after": "15:00"}}
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=body).json()["mission_id"]
    plan = api.get(f"/api/v1/missions/{mission_id}/recommendations").json()["return_plan"]
    assert plan["date"] == MISSION_DAY.isoformat() and plan["leave_after"] == "15:00"
    assert plan["options"], plan
    free = datetime.combine(MISSION_DAY, datetime.strptime("15:00", "%H:%M").time())
    for opt in plan["options"]:
        assert datetime.fromisoformat(opt["leave_venue_at"]) >= free
        assert opt["arrival_label"] == "Indore"
    assert "earliest_home" in plan["options"][0]["tags"]
    assert plan["round_trip_total"] is None or plan["round_trip_total"] > 0


def test_return_must_be_after_the_mission(api):
    body = {**BODY, "return_trip": {"date": MISSION_DAY.isoformat(), "leave_after": "08:00"}}
    response = api.post("/api/v1/missions/analyze", json=body)
    assert response.status_code == 422


def test_running_late_replans_from_here(api):
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    now = datetime.now().replace(second=0, microsecond=0)  # must be close to the server clock
    response = api.post(f"/api/v1/missions/{mission_id}/replan", json={"location": "Indore", "now": now.isoformat()})
    assert response.status_code == 202, response.text
    new_id = response.json()["mission_id"]
    assert new_id != mission_id
    result = wait_complete(api, new_id)
    assert result["replan_of"] == mission_id
    earliest = now + timedelta(minutes=15)
    for itin in result["itineraries"]:
        assert datetime.fromisoformat(itin["timeline"][0]["time"]) >= earliest
    assert result["mission"]["min_buffer_minutes"] <= 30


def test_running_late_with_phone_location(api):
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    now = datetime.now().replace(second=0, microsecond=0).isoformat()
    # near Indore city centre
    response = api.post(f"/api/v1/missions/{mission_id}/replan", json={"lat": 22.72, "lng": 75.86, "now": now})
    assert response.status_code == 202, response.text
    # middle of the Arabian Sea: no town nearby
    response = api.post(f"/api/v1/missions/{mission_id}/replan", json={"lat": 15.0, "lng": 65.0, "now": now})
    assert response.status_code == 422 and response.json()["error"]["details"]["field"] == "location"


def test_running_late_when_already_in_the_city(api):
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    now = datetime.now().replace(second=0, microsecond=0).isoformat()
    response = api.post(f"/api/v1/missions/{mission_id}/replan",
                        json={"lat": 12.97, "lng": 77.59, "now": now})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "already_there" and "cab" in error["message"]


def test_running_late_rejects_a_wrong_clock(api):
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    response = api.post(f"/api/v1/missions/{mission_id}/replan",
                        json={"location": "Indore", "now": "2020-01-01T09:00:00"})
    assert response.status_code == 422


def test_running_late_is_owner_only(api, anon_api):
    mission_id = api.post("/api/v1/missions/analyze?wait=true", json=BODY).json()["mission_id"]
    api.post("/api/v1/auth/logout")
    response = api.post(f"/api/v1/missions/{mission_id}/replan",
                        json={"location": "Indore", "now": datetime.now().isoformat()})
    assert response.status_code in (401, 404)


# ------------------------------------------------------------------ trains from Google Search when Maps has none
def test_trains_from_google_search_when_maps_has_no_schedule():
    """Recorded Google Search transport-options box for Indore -> Bhopal (Google Maps transit returned nothing
    for this route): every listed departure becomes a door-to-venue option with estimated station transfers."""
    import json
    from pathlib import Path

    from helpers import context

    from app.engines.itinerary_engine import ItineraryEngine
    from app.engines.mission_engine import transit_from_reported
    from app.integrations.serpapi.transport import parse_transport_options
    from app.services.booking import booking_steps

    payload = json.loads((Path(__file__).parent / "fixtures" / "serpapi_trains_idr_bpl.json").read_text(encoding="utf-8"))
    routes = parse_transport_options(payload)
    assert len(routes) == 10 and routes[0].from_label == "Indore Junction"
    ctx = context(hotel_required=False, min_buffer_minutes=30)
    options = transit_from_reported(routes, "train", ctx)
    assert len(options) == 10
    first = options[0]
    train, cab = first.segments
    assert (train.depart_at.hour, train.depart_at.minute) == (6, 10) and train.from_stop == "Indore Junction"
    assert train.to_stop == "Bhopal" and cab.mode == "walk" and "estimated" in cab.name
    assert first.fare == 856 and first.source == "google_search_transport_options"
    assert first.departure_time < train.depart_at and first.arrival_time > train.arrive_at  # door to venue

    itin = ItineraryEngine(ctx).build_transit(first, hotel=None)
    assert itin is not None and itin.strategy == "same_day"
    assert itin.main.data_source == "Google Search transport options"
    assert itin.cost.ticket_source == "live" and itin.cost.ticket == 856
    assert any("estimated" in q for q in itin.data_quality)
    steps = booking_steps(itin, ctx)
    assert steps[0].key == "train" and steps[0].links[0].label == "IRCTC"


def test_overnight_trains_from_the_day_before_are_kept_and_distinct():
    """Real Indore -> Bhopal departures searched for the mission day and the day before. Every option must get its
    own itinerary id (they once collapsed into one), and the shortlist must keep the overnight train."""
    import json
    from pathlib import Path

    from helpers import context

    from app.engines.itinerary_engine import ItineraryEngine
    from app.engines.mission_engine import MissionEngine, transit_from_reported
    from app.engines.risk_engine import RiskEngine
    from app.integrations.serpapi.transport import parse_transport_options

    payload = json.loads((Path(__file__).parent / "fixtures" / "serpapi_trains_idr_bpl.json").read_text(encoding="utf-8"))
    routes = parse_transport_options(payload)
    from app.schemas.result import VenueInfo

    ctx = context(hotel_required=False, min_buffer_minutes=45, allow_previous_day=False)
    ctx.venue = VenueInfo(name="RICR", location=ctx.destination.location, resolved=True)  # a venue in the city
    options = transit_from_reported(routes, "train", ctx, ctx.day_before) + transit_from_reported(routes, "train", ctx)
    builder = ItineraryEngine(ctx)
    same_day, _ = MissionEngine._classify_transit(object.__new__(MissionEngine), builder, options, {"train"})
    boards = {(o.segments[0].depart_at.date(), o.segments[0].depart_at.strftime("%H:%M")) for o in same_day}
    assert (ctx.day_before, "23:15") in boards        # overnight, arrives 05:10 on the mission day
    assert (ctx.mission_date, "06:10") in boards      # the quickest on the day
    itins = [builder.build_transit(o, hotel=None) for o in same_day]
    assert len({i.id for i in itins}) == len(itins)
    night = next(i for i in itins if i.arrival.venue_arrival.hour < 5) if any(i.arrival.venue_arrival.hour < 5 for i in itins) else None
    if night is not None:
        assert "night_arrival" in {f.key for f in RiskEngine(ctx).assess(night).factors}
    assert all("train from Indore Junction" in i.main.title for i in itins)
