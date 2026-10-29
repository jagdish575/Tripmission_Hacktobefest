"""Engine output models — the contract between the backend and the results UI."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.travel import (Airport, GeoPoint, NearbyHub, NormalizedFlight, NormalizedHotel, NormalizedPlace,
                                NormalizedTransit, ResolvedLocation)

Strategy = Literal["same_day", "night_before"]
Mode = Literal["flight", "train", "bus", "transit", "ground"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]
Impact = Literal["positive", "negative", "neutral"]
SourceType = Literal["live", "estimated", "user_provided", "calculated"]
Confidence = Literal["high", "medium", "low"]


class GroundLeg(BaseModel):
    from_label: str
    to_label: str
    from_kind: Literal["airport", "hotel", "venue", "station", "origin"]
    to_kind: Literal["airport", "hotel", "venue", "station", "origin"]
    depart_at: datetime
    arrive_at: datetime
    duration_minutes: int
    typical_max_minutes: int | None = None
    distance_km: float
    mode: str
    estimated: bool
    cost: float
    day: Literal["before", "mission"]


class TimelineEvent(BaseModel):
    time: datetime
    kind: Literal["depart", "land", "exit", "transfer", "hotel", "leave", "arrive", "deadline", "board", "change"]
    title: str
    detail: str | None = None
    duration_to_next_minutes: int | None = None
    mode_to_next: str | None = None
    distance_to_next_km: float | None = None


class MainLeg(BaseModel):
    """Mode-independent description of the long-distance part of a journey."""

    mode: Mode
    provider: str | None = None
    title: str
    references: list[str] = Field(default_factory=list)  # flight numbers / train numbers
    departure_label: str
    arrival_label: str
    departure_time: datetime
    arrival_time: datetime
    duration_minutes: int
    stops: int = 0
    transfers: int = 0
    distance_km: float | None = None
    schedule_source: SourceType
    note: str | None = None
    data_source: str | None = None   # human label, e.g. "Google Flights" or "Google Maps transit"
    fare_label: str = "Fare"         # "Estimated fare" when no live fare exists


class CostItem(BaseModel):
    key: Literal["ticket", "ground", "hotel", "food", "other"]
    label: str
    amount: float
    source: SourceType
    detail: str | None = None


class CostBreakdown(BaseModel):
    ticket: float | None
    hotel: float | None
    ground: float
    food: float = 0
    total: float | None
    currency: str
    ground_estimated: bool = True
    hotel_nights: int = 0
    hotel_per_night: float | None = None
    ticket_price_known: bool = True
    ticket_source: SourceType = "live"
    items: list[CostItem] = Field(default_factory=list)
    budget: float | None = None
    budget_remaining: float | None = None  # negative = over budget


class ArrivalInfo(BaseModel):
    venue_arrival: datetime
    deadline: datetime
    buffer_minutes: int
    required_buffer_minutes: int
    leave_hotel_at: datetime | None = None
    effective_buffer_minutes: int


class ScoreFactor(BaseModel):
    key: str
    label: str
    impact: Impact
    detail: str | None = None


class ScoreBreakdown(BaseModel):
    overall: int
    arrival: int
    budget: int
    ground: int
    location: int | None
    duration: int
    review: int | None
    convenience: int
    value: int = 0  # cost/time/reliability balance, used for "Best value"
    weights: dict[str, float]
    priority: str = "balanced"
    factors: list[ScoreFactor] = Field(default_factory=list)


class RiskFactor(BaseModel):
    key: str
    severity: Literal["low", "medium", "high"]
    points: int
    title: str
    detail: str
    recommendation: str | None = None


class RiskAssessment(BaseModel):
    level: RiskLevel
    score: int
    factors: list[RiskFactor]
    strengths: list[str]
    recommendations: list[str]


class ConstraintCheck(BaseModel):
    feasible: bool
    within_budget: bool
    buffer_ok: bool
    ground_ok: bool
    rating_ok: bool
    all_ok: bool


class AccessibilityNote(BaseModel):
    need: str
    status: Literal["available", "requested", "unavailable"]
    detail: str


class BookingLink(BaseModel):
    label: str        # "IRCTC", "Google Flights", "Hotel website"
    url: str
    kind: Literal["seller", "search", "hotel"]  # seller = a ticket seller Google listed for this exact route


class BookingStep(BaseModel):
    """One thing to book for this journey, in the order it should be booked (scarcest first)."""
    key: Literal["flight", "train", "bus", "hotel", "cab", "transit"]
    title: str
    detail: str
    when: str | None = None       # "Book now — sleeper berths on this route sell out early"
    links: list[BookingLink] = Field(default_factory=list)


class Itinerary(BaseModel):
    id: str
    mode: Mode = "flight"
    strategy: Strategy
    main: MainLeg
    flight: NormalizedFlight | None = None
    transit: NormalizedTransit | None = None
    hotel: NormalizedHotel | None = None
    hotel_check_in: date | None = None
    hotel_check_out: date | None = None
    legs: list[GroundLeg]
    timeline: list[TimelineEvent]
    cost: CostBreakdown
    arrival: ArrivalInfo
    ground_minutes_mission_day: int
    ground_minutes_before: int
    total_travel_minutes: int  # time actually travelling (main leg + transfers)
    door_to_venue_minutes: int  # elapsed from departure to venue arrival (includes any overnight)
    confidence: Confidence = "high"
    practicality: Literal["high", "low"] = "high"  # LOW: e.g. a flight that needs a long airport transfer
    scores: ScoreBreakdown | None = None
    risk: RiskAssessment | None = None
    constraints: ConstraintCheck | None = None
    tags: list[str] = Field(default_factory=list)
    data_quality: list[str] = Field(default_factory=list)
    accessibility: list[AccessibilityNote] = Field(default_factory=list)
    booking: list[BookingStep] = Field(default_factory=list)


class Suggestion(BaseModel):
    kind: str
    title: str
    detail: str
    unlocks: str | None = None  # e.g. "Flight becomes available"
    patch: dict[str, object] = Field(default_factory=dict)  # form fields to change if the user accepts


class ReviewSignal(BaseModel):
    aspect: str
    mentions: int
    positive: int = 0
    negative: int = 0
    source: str


class ReviewQuote(BaseModel):
    text: str
    rating: float | None = None
    date: str | None = None
    aspect: str | None = None
    sentiment: Impact = "neutral"


class ReviewInsights(BaseModel):
    hotel_id: str
    hotel_name: str
    strengths: list[ReviewSignal]
    concerns: list[ReviewSignal]
    quotes: list[ReviewQuote]
    topics: list[dict[str, object]] = Field(default_factory=list)
    review_count: int
    rating: float | None = None
    sources: list[str]


class PlaceGroup(BaseModel):
    category: str
    label: str
    reason: str
    items: list[NormalizedPlace]


class Explanation(BaseModel):
    text: str
    source: Literal["ai", "rules"]
    model: str | None = None
    note: str | None = None


class ApiCall(BaseModel):
    api: str
    purpose: str
    cached: bool
    ok: bool
    ms: int
    error: str | None = None


class DataSources(BaseModel):
    """Request-level transparency. `calls`, `live_calls` and `cache_hits` are developer diagnostics and are
    stripped from API responses unless DEBUG_MODE=true."""

    mode: Literal["live", "demo"]
    calls: list[ApiCall] | None = None
    live_calls: int | None = None
    cache_hits: int | None = None
    fetched_at: datetime


class MethodNote(BaseModel):
    """One line of the user-facing "How we decided" panel."""

    key: str
    label: str
    kind: Literal["live", "calculated", "estimated", "demo"]
    detail: str


class RouteNotice(BaseModel):
    kind: str  # airport_fallback | short_distance | flight_skipped | modes_added | low_practicality | origin_transfer
    message: str


class RoutePlan(BaseModel):
    """RouteIntelligenceService output: which hubs exist and which travel modes make sense."""

    distance_km: float
    road_km: float
    road_minutes: int
    origin_airport: NearbyHub | None = None
    destination_airport: NearbyHub | None = None  # transfer measured to the venue
    origin_has_airport: bool = False
    destination_has_airport: bool = False
    flight: Literal["searched", "skipped", "not_requested"] = "not_requested"
    flight_practicality: Literal["high", "low"] | None = None
    flight_reason: str | None = None
    ground_search: bool = True
    ground_reason: str | None = None
    modes_requested: list[str] = Field(default_factory=list)
    modes_evaluated: list[str] = Field(default_factory=list)
    notices: list[RouteNotice] = Field(default_factory=list)
    railway_stations: list[str] = Field(default_factory=list)  # discovered from live transit results
    bus_points: list[str] = Field(default_factory=list)


class VenueInfo(BaseModel):
    name: str
    address: str | None = None
    location: GeoPoint
    resolved: bool  # False when we fell back to the city centre


class MissionSummary(BaseModel):
    origin: ResolvedLocation
    destination: ResolvedLocation
    origin_airport: Airport | None = None       # airport used for flights (may be a nearby one)
    destination_airport: Airport | None = None
    venue: VenueInfo
    mission_type: str
    travel_date: date
    arrival_deadline: str
    travelers: int
    budget: float
    currency: str
    min_buffer_minutes: int
    max_ground_minutes: int
    hotel_required: bool
    min_hotel_rating: float
    max_stops: int
    preferences: list[str]
    priority: str = "balanced"
    modes: list[str] = Field(default_factory=list)
    stay_nights: int = 1
    food_per_day: float = 0
    accessibility: list[str] = Field(default_factory=list)


class FunnelStats(BaseModel):
    flights_found: int = 0
    flights_feasible: int = 0
    flights_shortlisted: int = 0
    transit_found: int = 0
    fares_matched: int = 0  # train/bus fares taken from Google Search transport options
    hotels_found: int = 0
    hotels_shortlisted: int = 0
    routes_calculated: int = 0
    itineraries_scored: int = 0


class ModeSummary(BaseModel):
    mode: Mode
    available: bool
    best_id: str | None = None
    options: int = 0
    reason: str | None = None  # why unavailable, or what the data covers
    confidence: Confidence | None = None
    schedule_source: str | None = None
    fare_source: str | None = None


class Tradeoff(BaseModel):
    cheapest_id: str
    fastest_id: str
    extra_cost: float
    time_saved_minutes: int
    sentence: str


class OptionDelta(BaseModel):
    """Per-itinerary comparison against the cheapest and fastest journeys (for Time vs Money)."""

    money_saved_vs_fastest: float | None = None
    time_saved_vs_cheapest_minutes: int | None = None


class WeatherOutlook(BaseModel):
    date: date
    summary: str | None = None
    high: float | None = None
    low: float | None = None
    unit: str = "°C"
    precipitation: float | None = None   # percent
    kind: str | None = None              # fog | storm | heavy_rain | snow | rain — a travel-relevant condition
    label: str | None = None
    location: str | None = None
    source: str = "Google weather (via Google Search)"


class DisruptionAlert(BaseModel):
    title: str
    url: str
    source: str | None = None
    published_at: datetime
    word: str                            # the disruption word that matched, e.g. "bandh"


class TravelConditions(BaseModel):
    weather: WeatherOutlook | None = None
    weather_note: str | None = None      # why there's no forecast ("published about a week ahead")
    alerts: list[DisruptionAlert] = Field(default_factory=list)
    checked_at: datetime


class ReturnOption(BaseModel):
    id: str
    mode: Mode
    title: str
    departure_label: str
    arrival_label: str
    leave_venue_at: datetime             # when to leave the venue to make this departure
    departure_time: datetime
    arrival_time: datetime
    duration_minutes: int
    fare: float | None = None            # whole group
    fare_source: SourceType = "estimated"
    note: str | None = None
    tags: list[str] = Field(default_factory=list)  # earliest_home | cheapest
    links: list[BookingLink] = Field(default_factory=list)


class ReturnPlan(BaseModel):
    date: date
    leave_after: str                     # "14:30" — when the traveller is free
    options: list[ReturnOption] = Field(default_factory=list)
    message: str | None = None           # e.g. why nothing was found
    round_trip_total: float | None = None  # recommended outbound total + cheapest return fare


class MissionResult(BaseModel):
    mission_id: str
    status: Literal["complete", "partial", "no_options"]
    mode: Literal["live", "demo"]
    mission: MissionSummary
    categories: dict[str, str]
    itineraries: list[Itinerary]
    modes: list[ModeSummary] = Field(default_factory=list)
    tradeoff: Tradeoff | None = None
    deltas: dict[str, OptionDelta] = Field(default_factory=dict)
    suggestions: list[Suggestion]
    review_insights: dict[str, ReviewInsights]
    places: list[PlaceGroup]
    explanation: Explanation | None
    funnel: FunnelStats
    data_sources: DataSources
    warnings: list[str]                      # friendly, user-safe messages only
    headline: str
    route: RoutePlan | None = None
    methodology: list[MethodNote] = Field(default_factory=list)
    conditions: TravelConditions | None = None
    return_plan: ReturnPlan | None = None
    replan_of: str | None = None             # the mission this one re-planned ("I'm running late")
    replanned_at: datetime | None = None
    diagnostics: dict[str, object] | None = None  # DEBUG_MODE only: raw provider errors, timings
