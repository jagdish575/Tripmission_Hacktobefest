"""Travel conditions at the destination: the Google weather answer box and recent disruption news.

* Weather — SerpApi engine=google, q="weather <city>": `answer_box.type == "weather_result"` carries today's
  conditions and a `forecast` list (about 8 days, one entry per day, `day` = weekday name). A date beyond the
  forecast is reported as "not available yet", never guessed.
* News — SerpApi engine=google_news with a disruption query. Only headlines that name the city, use a
  disruption word and are at most a few days old are kept. We never infer anything beyond the headline: the
  traveller sees the title, the publisher, the date and a link.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.integrations.serpapi.client import SerpApiMalformedResponse

WEATHER_ENGINE = "google"
NEWS_ENGINE = "google_news"
WEATHER_TTL_SECONDS = 3 * 3600
NEWS_TTL_SECONDS = 2 * 3600
NEWS_MAX_AGE_DAYS = 4

# Phrases that mean "getting around may be disrupted" -> the short label shown to the traveller. Phrases, not
# single words: "bird strike", "strike rate" or "air strike" must never read as a transport strike.
_DISRUPTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(bus|auto|taxi|cab|truck|transport|transporters?|rail|railway|metro|airline|pilots?|drivers?|"
                r"general|nationwide|statewide|state-wide|city-wide|citywide|bharat)\s+(strike|bandh)", re.I), "strike"),
    (re.compile(r"\bstrike\s+(call|called|today|tomorrow|on (mon|tue|wed|thu|fri|sat|sun))|\bon strike\b|\bgo on strike\b",
                re.I), "strike"),
    (re.compile(r"\bbandh\b|\bhartal\b|\bchakka jam\b", re.I), "bandh"),
    (re.compile(r"\bcurfew\b|section 144|prohibitory orders", re.I), "curfew"),
    (re.compile(r"\bflood(s|ed|ing)?\b|waterlogg|inundat", re.I), "flooding"),
    (re.compile(r"\bcyclone\b|\blandslide", re.I), "severe weather"),
    (re.compile(r"\b(red|orange) alert\b|heavy rain", re.I), "weather alert"),
    (re.compile(r"\b(dense|thick) fog\b|fog (delays|disrupts|hits)", re.I), "fog"),
    (re.compile(r"\b(flights?|trains?|metro|bus(es)?|services?)\b[^.]{0,30}\b(cancell?ed|suspended|delayed|diverted)\b",
                re.I), "cancellations"),
    (re.compile(r"\b(roads?|highway|flyover|bridge)\b[^.]{0,25}\b(closed|closure|blocked|shut)\b|traffic (advisory|diversion|"
                r"diverted)|road blockade", re.I), "road closure"),
]
_NOT_DISRUPTION = re.compile(r"bird strike|strike rate|air ?strikes?|strikes? (a |back|gold|deal)|hunger strike", re.I)
_NEWS_QUERY_WORDS = "strike OR bandh OR protest OR flood OR curfew OR fog OR \"heavy rain\" OR closure OR cancelled"

# weather words -> (kind, label). First match wins, most disruptive first.
_WEATHER_KINDS: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"cyclone|hurricane|typhoon", re.I), "storm", "Cyclone"),
    (re.compile(r"thunder|storm|squall", re.I), "storm", "Thunderstorms"),
    (re.compile(r"heavy rain|torrential|downpour", re.I), "heavy_rain", "Heavy rain"),
    (re.compile(r"snow|sleet|blizzard", re.I), "snow", "Snow"),
    (re.compile(r"fog|mist|smog|haze", re.I), "fog", "Fog"),
    (re.compile(r"rain|shower|drizzle", re.I), "rain", "Rain"),
]


_UNITS = {"celsius": "°C", "°c": "°C", "c": "°C", "fahrenheit": "°F", "°f": "°F", "f": "°F"}


def build_weather_params(city: str, *, gl: str = "in", hl: str = "en") -> dict[str, Any]:
    return {"q": f"weather {city}", "gl": gl, "hl": hl}


def build_news_params(city: str, *, gl: str = "in", hl: str = "en") -> dict[str, Any]:
    return {"q": f"{city} ({_NEWS_QUERY_WORDS})", "gl": gl, "hl": hl}


def _num(value: Any) -> float | None:
    match = re.search(r"-?\d+(?:\.\d+)?", str(value or ""))
    return float(match.group()) if match else None


def weather_kind(summary: str, precipitation: float | None = None) -> tuple[str | None, str | None]:
    for pattern, kind, label in _WEATHER_KINDS:
        if pattern.search(summary or ""):
            if kind == "rain" and precipitation is not None and precipitation < 50:
                return None, None  # "chance of showers" at 20% is not a travel risk
            return kind, label
    return None, None


def parse_weather(payload: Any, travel_date: date, today: date) -> dict[str, Any] | None:
    """-> {date, summary, high, low, unit, precipitation, kind, label, location} or None when unavailable."""
    if not isinstance(payload, dict):
        raise SerpApiMalformedResponse("search payload is not an object", engine=WEATHER_ENGINE)
    box = payload.get("answer_box")
    if not isinstance(box, dict) or box.get("type") != "weather_result":
        return None
    forecast = [f for f in box.get("forecast") or [] if isinstance(f, dict)]
    offset = (travel_date - today).days
    if offset < 0 or not forecast:
        return None
    weekday = travel_date.strftime("%A").casefold()
    entry = next((f for f in forecast[offset:offset + 2] if str(f.get("day", "")).casefold().startswith(weekday[:3])),
                 forecast[offset] if offset < len(forecast) else None)
    if entry is None:
        return None
    temps = entry.get("temperature") if isinstance(entry.get("temperature"), dict) else {}
    summary = str(entry.get("weather") or "").strip()
    precipitation = _num(entry.get("precipitation"))
    kind, label = weather_kind(summary, precipitation)
    return {"date": travel_date.isoformat(), "summary": summary or None, "high": _num(temps.get("high")),
            "low": _num(temps.get("low")), "unit": _UNITS.get(str(box.get("unit") or "").casefold(), "°C"),
            "precipitation": precipitation,
            "kind": kind, "label": label, "location": box.get("location")}


def _news_items(payload: dict) -> list[dict]:
    items: list[dict] = []
    for raw in payload.get("news_results") or []:
        if not isinstance(raw, dict):
            continue
        items.append(raw)
        items += [s for s in raw.get("stories") or [] if isinstance(s, dict)]
    return items


def _published(raw: dict) -> datetime | None:
    iso = raw.get("iso_date")
    if isinstance(iso, str):
        try:
            return datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def disruption_label(title: str) -> str | None:
    if _NOT_DISRUPTION.search(title):
        return None
    return next((label for pattern, label in _DISRUPTIONS if pattern.search(title)), None)


def _significant(title: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", title.casefold()) if len(w) > 3}


def parse_news(payload: Any, city: str, now: datetime | None = None, limit: int = 3) -> list[dict[str, Any]]:
    """Recent headlines that name the city and a disruption word -> [{title, source, url, published_at, word}]."""
    if not isinstance(payload, dict):
        raise SerpApiMalformedResponse("news payload is not an object", engine=NEWS_ENGINE)
    now = now or datetime.now(timezone.utc)
    city_re = re.compile(rf"\b{re.escape(city)}\b", re.I)
    out: list[dict[str, Any]] = []
    seen: list[set[str]] = []
    for raw in _news_items(payload):
        title, url = raw.get("title"), raw.get("link")
        if not isinstance(title, str) or not isinstance(url, str) or not url.startswith("https://"):
            continue
        published = _published(raw)
        if published is None or now - published > timedelta(days=NEWS_MAX_AGE_DAYS) or published > now + timedelta(hours=6):
            continue
        word = disruption_label(title)
        if word is None or not city_re.search(title):
            continue
        words = _significant(title)
        if any(len(words & other) >= 0.5 * min(len(words), len(other)) for other in seen):
            continue  # the same story from another outlet
        seen.append(words)
        source = raw.get("source")
        out.append({"title": title.strip(), "url": url, "word": word, "published_at": published.isoformat(),
                    "source": (source.get("name") if isinstance(source, dict) else source) or None})
        if len(out) >= limit:
            break
    return out
