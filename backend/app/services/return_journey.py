"""Getting home: return options that leave the venue after the traveller is free.

Searches (only when the mission asks for a return):
* flights destination airport -> origin airport on the return date (Google Flights), if flights were evaluated;
* the Google Search transport-options box for trains and buses (departures, fares and ticket sellers);
* the road route already measured for the outbound trip, reversed.

Every option is timed from the venue: a flight is only offered if the airport transfer + check-in still fit
after `leave_after`. Station transfers aren't known for search-box routes, so a fixed allowance is used and
labelled. Return fares are not part of the outbound score — they're shown beside it, with a round-trip total.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from app.core.config import Settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.engines.context import MissionContext
from app.integrations.serpapi.client import CallTracker, SerpApiError
from app.schemas.result import BookingLink, ReturnOption, ReturnPlan
from app.services.booking import IRCTC_SEARCH, google_flights_url, redbus_url
from app.services.geo import ROAD_FACTOR, estimate_drive_minutes, haversine_km
from app.services.providers import TravelDataProvider
from app.utils.format import fmt_clock

log = get_logger(__name__)

STATION_TRANSFER_MINUTES = 45   # venue -> railway station / bus point when the stop isn't known
STATION_EARLY_MINUTES = 20      # be on the platform this early
MAX_OPTIONS = 6


def _drive(a, b) -> int:
    return estimate_drive_minutes(max(0.5, haversine_km(a, b) * ROAD_FACTOR))


async def plan_return(provider: TravelDataProvider, ctx: MissionContext, settings: Settings, tracker: CallTracker,
                      *, outbound_total: float | None) -> ReturnPlan | None:
    rt = ctx.request.return_trip
    if rt is None:
        return None
    req, plan = ctx.request, ctx.plan
    free_at = datetime.combine(rt.date, rt.leave_after)
    modes = set(plan.modes_evaluated if plan else [str(m) for m in req.modes])
    home, away = ctx.origin, ctx.destination
    options: list[ReturnOption] = []
    notes: list[str] = []

    async def flights() -> None:
        if not (ctx.origin_airport and ctx.destination_airport and "flight" in modes):
            return
        dep_ap, arr_ap = ctx.destination_airport, ctx.origin_airport
        to_airport = _drive(ctx.venue.location, dep_ap.location)
        from_airport = _drive(arr_ap.location, home.location)
        found = await provider.search_flights(dep_ap.code, arr_ap.code, rt.date, adults=req.travelers,
                                              max_stops=req.max_stops, currency=ctx.currency, tracker=tracker,
                                              purpose="return flights")
        for f in found:
            if f.departure_airport != dep_ap.code:
                continue
            leave = f.departure_time - timedelta(minutes=to_airport + ctx.assumptions.airport_checkin_minutes)
            if leave < free_at:
                continue
            options.append(ReturnOption(
                id=f"ret-{f.id}", mode="flight", title=f"{f.airline} {' / '.join(f.flight_numbers)}",
                departure_label=dep_ap.code, arrival_label=home.city, leave_venue_at=leave,
                departure_time=f.departure_time,
                arrival_time=f.arrival_time + timedelta(minutes=from_airport + ctx.assumptions.airport_exit_minutes),
                duration_minutes=f.duration_minutes, fare=f.price * req.travelers if f.price is not None else None,
                fare_source="live" if f.price is not None else "estimated",
                note=f"{'Direct' if not f.stops else f'{f.stops} stop'} · leave the venue {to_airport + ctx.assumptions.airport_checkin_minutes} min "
                     f"before departure for the airport and check-in",
                links=[BookingLink(label="Google Flights", url=google_flights_url(dep_ap.code, arr_ap.code, rt.date,
                                                                                  f.airline), kind="search")]))

    async def services(mode: str) -> None:
        if mode not in modes:
            return
        routes = await provider.transport_options(mode, away.city, home.city, rt.date, tracker=tracker)
        allowance = STATION_TRANSFER_MINUTES + STATION_EARLY_MINUTES
        per_km = ctx.assumptions.train_fare_per_km if mode == "train" else ctx.assumptions.bus_fare_per_km
        km = plan.road_km if plan else haversine_km(away.location, home.location) * ROAD_FACTOR
        fallback = BookingLink(label="IRCTC", url=IRCTC_SEARCH, kind="search") if mode == "train" else \
            BookingLink(label="redBus", url=redbus_url(away.city, home.city), kind="search")
        added = 0
        for r in routes:
            if r.depart_clock is None or (r.mode and r.mode != mode):
                continue
            depart = datetime.combine(rt.date, datetime.min.time()).replace(hour=r.depart_clock[0], minute=r.depart_clock[1])
            leave = depart - timedelta(minutes=allowance)
            if leave < free_at:
                continue
            duration = r.duration_minutes
            if duration is None and r.arrive_clock is not None:
                duration = (r.arrive_clock[0] * 60 + r.arrive_clock[1] - depart.hour * 60 - depart.minute) % 1440
            if not duration:
                continue
            live = r.fare is not None and r.currency == ctx.currency
            fare = (r.fare if live else max(ctx.assumptions.train_min_fare if mode == "train" else 0, km * per_km)) * req.travelers
            numbers = f" {', '.join(r.numbers)}" if r.numbers else ""
            options.append(ReturnOption(
                id=f"ret-{mode}-{depart:%H%M}-{added}", mode=mode, title=f"{(r.operators or [mode.title()])[0]}{numbers}",
                departure_label=away.city, arrival_label=home.city, leave_venue_at=leave, departure_time=depart,
                arrival_time=depart + timedelta(minutes=duration), duration_minutes=duration, fare=fare,
                fare_source="live" if live else "estimated",
                note=f"Allow ~{STATION_TRANSFER_MINUTES} min to reach the {'station' if mode == 'train' else 'bus point'} "
                     f"(estimated){' · ' + str(r.changes) + ' change' if r.changes else ''}",
                links=[BookingLink(label=l.company, url=l.url, kind="seller") for l in r.ticket_links] or [fallback]))
            added += 1
        if not added:
            notes.append(f"Google didn't list {mode} departures after {fmt_clock(free_at)} — check "
                         f"{'IRCTC' if mode == 'train' else 'redBus'} directly.")

    def road() -> None:
        if "ground" not in modes or plan is None or not plan.ground_search:
            return
        minutes, km = plan.road_minutes, plan.road_km
        options.append(ReturnOption(
            id="ret-road", mode="ground", title=f"Drive {km:,.0f} km", departure_label=ctx.venue.name,
            arrival_label=home.city, leave_venue_at=free_at, departure_time=free_at,
            arrival_time=free_at + timedelta(minutes=minutes), duration_minutes=minutes,
            fare=round(km * ctx.assumptions.outstation_cab_per_km), fare_source="estimated",
            note="One-way outstation cab, estimated from the road distance"))

    async def safe(coro, label: str) -> None:
        try:
            await asyncio.wait_for(coro, timeout=settings.serpapi_timeout_seconds)
        except (SerpApiError, AppError, asyncio.TimeoutError) as exc:
            log.info("return search skipped", extra={"context": {"part": label, "error": type(exc).__name__}})
            notes.append(f"Return {label} couldn't be checked right now.")

    await asyncio.gather(safe(flights(), "flights"), safe(services("train"), "trains"), safe(services("bus"), "buses"))
    road()

    options.sort(key=lambda o: o.arrival_time)
    keep: list[ReturnOption] = []
    per_mode: dict[str, int] = {}
    for o in options:
        if per_mode.get(o.mode, 0) < 2 and len(keep) < MAX_OPTIONS:
            keep.append(o)
            per_mode[o.mode] = per_mode.get(o.mode, 0) + 1
    if keep:
        keep[0].tags.append("earliest_home")
        priced = [o for o in keep if o.fare is not None]
        if priced:
            min(priced, key=lambda o: o.fare).tags.append("cheapest")
    cheapest = min((o.fare for o in keep if o.fare is not None), default=None)
    return ReturnPlan(
        date=rt.date, leave_after=rt.leave_after.strftime("%H:%M"), options=keep,
        message=" ".join(notes) or (None if keep else f"No way home found after {fmt_clock(free_at)} on {rt.date:%d %b}."),
        round_trip_total=round(outbound_total + cheapest) if outbound_total is not None and cheapest is not None else None)
