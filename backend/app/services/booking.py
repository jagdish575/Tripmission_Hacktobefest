"""Booking hand-off: what to book for a journey, in which order, and where.

TripMission never books or holds anything. For each journey it lists the things to book — the scarcest first
(train berths, then flights, then buses, then the hotel, then cabs on the day) — with links:

* `seller` — a ticket seller Google Search listed for this exact route (transport-options box), e.g. IRCTC;
* `search` — a pre-filled search on the operator or a well-known booking site (Google Flights, IRCTC, redBus,
  Google Hotels), which the traveller completes;
* `hotel`  — the hotel's own page as Google Hotels returned it.

No extra API calls: everything comes from data the mission already fetched.
"""

from __future__ import annotations

import re
from datetime import date
from urllib.parse import quote, quote_plus

from app.engines.context import MissionContext
from app.schemas.result import BookingLink, BookingStep, Itinerary
from app.utils.format import fmt_clock

IRCTC_SEARCH = "https://www.irctc.co.in/nget/train-search"
_ORDER = {"train": 0, "flight": 1, "bus": 2, "transit": 3, "hotel": 4, "cab": 5}


def _slug(city: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", city.casefold()).strip("-")


def google_flights_url(origin_code: str, destination_code: str, day: date, airline: str | None = None) -> str:
    q = f"One way flights from {origin_code} to {destination_code} on {day.isoformat()}"
    if airline:
        q += f" {airline}"
    return f"https://www.google.com/travel/flights?q={quote_plus(q)}"


def redbus_url(origin_city: str, destination_city: str) -> str:
    return f"https://www.redbus.in/bus-tickets/{_slug(origin_city)}-to-{_slug(destination_city)}"


def google_hotels_url(name: str, city: str) -> str:
    return f"https://www.google.com/travel/search?q={quote(f'{name} {city}')}"


def tatkal_note(travel_day: date, today: date) -> str:
    days = (travel_day - today).days
    if days <= 0:
        return "Same-day travel: only unreserved or current-booking tickets are left — check at the station."
    if days == 1:
        return ("Reserved berths may be full by now. Tatkal opens one day before departure — 10:00 for AC "
                "classes, 11:00 for sleeper — so be ready at that time.")
    return "Book this first — reserved berths on long-distance trains can go to waitlist days ahead."


def booking_steps(itin: Itinerary, ctx: MissionContext, *, today: date | None = None) -> list[BookingStep]:
    today = today or date.today()
    steps: list[BookingStep] = []
    travellers = ctx.request.travelers
    who = f" for {travellers} travellers" if travellers > 1 else ""
    depart_day = itin.main.departure_time.date()

    if itin.mode == "flight" and itin.flight is not None:
        f = itin.flight
        steps.append(BookingStep(
            key="flight", title=f"Flight {' / '.join(f.flight_numbers)} · {f.airline}",
            detail=f"{f.departure_airport} {fmt_clock(f.departure_time)} → {f.arrival_airport} "
                   f"{fmt_clock(f.arrival_time)}, {depart_day:%d %b}{who}.",
            when="Fares change often — book soon and check the flight number matches.",
            links=[BookingLink(label="Google Flights", url=google_flights_url(
                f.departure_airport, f.arrival_airport, depart_day, f.airline), kind="search")]))
    elif itin.mode in ("train", "bus", "transit") and itin.transit is not None:
        t = itin.transit
        services = [s for s in t.segments if s.mode in ("train", "bus") and s.duration_minutes >= 45]
        kinds = {s.mode for s in services} or {itin.mode}
        names = ", ".join(dict.fromkeys(s.name for s in services)) or t.title
        sellers = [BookingLink(label=l.company, url=l.url, kind="seller") for l in t.ticket_links]
        if "train" in kinds:
            first = next((s for s in services if s.mode == "train"), None)
            board = first.from_stop if first and first.from_stop else ctx.origin.city
            steps.append(BookingStep(
                key="train", title=f"Train · {names}",
                detail=f"Board at {board} at {fmt_clock(t.departure_time)} on {depart_day:%d %b}{who}.",
                when=tatkal_note(depart_day, today),
                links=sellers or [BookingLink(label="IRCTC", url=IRCTC_SEARCH, kind="search")]))
        if "bus" in kinds:
            steps.append(BookingStep(
                key="bus", title=f"Bus · {names}" if "train" not in kinds else "Bus connection",
                detail=f"Departs {fmt_clock(t.departure_time)} on {depart_day:%d %b}{who}.",
                when="Sleeper seats on overnight buses fill up — book a day or two ahead.",
                links=(sellers if "train" not in kinds else [])
                or [BookingLink(label="redBus", url=redbus_url(ctx.origin.city, ctx.destination.city), kind="search")]))

    if itin.hotel is not None:
        h = itin.hotel
        nights = (itin.hotel_check_out - itin.hotel_check_in).days if itin.hotel_check_in and itin.hotel_check_out else 1
        links = [BookingLink(label="Hotel page", url=h.link, kind="hotel")] if h.link else []
        links.append(BookingLink(label="Google Hotels", url=google_hotels_url(h.name, ctx.destination.city), kind="search"))
        check_in = f"{itin.hotel_check_in:%d %b}" if itin.hotel_check_in else ""
        steps.append(BookingStep(
            key="hotel", title=h.name,
            detail=f"Check in {check_in}, {nights} night{'s' if nights != 1 else ''}{who}.",
            when="Book after your ticket is confirmed — prefer free cancellation.", links=links))

    taxi = [l for l in itin.legs if l.mode.casefold() == "taxi" and l.day == "mission" and l.to_kind == "venue"]
    if taxi:
        leg = taxi[0]
        steps.append(BookingStep(
            key="cab", title=f"Cab to {ctx.venue.name}",
            detail=f"From {leg.from_label} at {fmt_clock(leg.depart_at)} — about {leg.duration_minutes} min.",
            when="Schedule it the night before (Ola / Uber / hotel desk) so you aren't waiting on the day."))
    elif itin.mode == "ground":
        steps.append(BookingStep(
            key="cab", title="Outstation cab",
            detail=f"Leave at {fmt_clock(itin.main.departure_time)} on {depart_day:%d %b}.",
            when="Book a one-way outstation cab a day ahead and confirm the pickup time."))

    steps.sort(key=lambda s: _ORDER[s.key])
    return steps
