import { Boxes, Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useId, useMemo, useState, type KeyboardEvent } from "react";
import { BoardFallback } from "../../three/BoardFallback";
import { layoutBoard, type BoardLeg, type BoardStop } from "../../three/boardLayout";
import { SceneFrame } from "../../three/SceneFrame";
import type { GeoPoint, Itinerary, MissionSummary } from "../../types/api";
import { cx, formatClock } from "../../utils/format";
import { Skeleton } from "../ui/States";

const RouteBoardCanvas = lazy(() => import("../../three/RouteBoard"));
const JourneyMap = lazy(() => import("./JourneyMap"));

function airportPoint(mission: MissionSummary, code: string): GeoPoint | null {
  for (const place of [mission.origin, mission.destination]) {
    const a = place.airports.find((x) => x.code === code);
    if (a) return a.location;
    const hub = place.nearby_airports.find((x) => x.code === code && x.location);
    if (hub?.location) return hub.location;
  }
  for (const a of [mission.origin_airport, mission.destination_airport]) if (a?.code === code) return a.location;
  return null;
}

/** The places on this journey that have real coordinates, in travel order. Stations without coordinates are left out. */
export function journeyStops(it: Itinerary, mission: MissionSummary): { stops: BoardStop[]; legs: BoardLeg[] } {
  const stops: BoardStop[] = [
    { id: "origin", label: mission.origin.city, sub: `Leave ${formatClock(it.timeline[0]?.time ?? it.main.departure_time)}`, point: mission.origin.location, kind: "origin" },
  ];
  const air: [number, number] | null = (() => {
    if (!it.flight) return null;
    const dep = airportPoint(mission, it.flight.departure_airport);
    const arr = airportPoint(mission, it.flight.arrival_airport);
    if (!dep || !arr) return null;
    stops.push({ id: "dep", label: it.flight.departure_airport, sub: `Takes off ${formatClock(it.main.departure_time)}`, point: dep, kind: "hub" });
    stops.push({ id: "arr", label: it.flight.arrival_airport, sub: `Lands ${formatClock(it.main.arrival_time)}`, point: arr, kind: "hub" });
    return [stops.length - 2, stops.length - 1];
  })();
  if (it.hotel?.location) {
    const checkIn = formatClock(it.hotel_check_in); // "—" when only a date is known
    stops.push({ id: "hotel", label: it.hotel.name, sub: checkIn !== "—" ? `Check in ${checkIn}` : it.strategy === "night_before" ? "Night before" : "Hotel",
      point: it.hotel.location, kind: "hotel" });
  }
  stops.push({ id: "venue", label: mission.venue.name, sub: `At venue ${formatClock(it.arrival.venue_arrival)}`,
    point: mission.venue.location, kind: "venue" });
  const legs: BoardLeg[] = stops.slice(1).map((_, i) => ({
    from: i, to: i + 1, kind: air && air[0] === i && air[1] === i + 1 ? "air" : "ground",
  }));
  return { stops, legs };
}

const TABS = [
  { id: "overview", label: "Journey overview", icon: Boxes },
  { id: "map", label: "Venue area map", icon: MapIcon },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Results: the whole trip on a 3D board (real coordinates), with the precise OpenStreetMap view one tab away. */
export function JourneyOverview({ itinerary, mission }: { itinerary: Itinerary; mission: MissionSummary }) {
  const [tab, setTab] = useState<Tab>("overview");
  const id = useId();
  const { stops, legs } = useMemo(() => journeyStops(itinerary, mission), [itinerary, mission]);
  const layout = useMemo(() => layoutBoard(stops), [stops]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "overview" ? "map" : "overview";
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };
  const unplaced = itinerary.mode === "train" || itinerary.mode === "bus" || itinerary.mode === "transit";

  return (
    <section aria-label="Route" className="overflow-hidden rounded-md border border-line bg-surface">
      <div role="tablist" aria-label="Route view" className="flex gap-1 border-b border-line bg-paper px-2 pt-2">
        {TABS.map(({ id: t, label, icon: Icon }) => (
          <button key={t} id={`${id}-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls={`${id}-panel`}
            tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)} onKeyDown={onKey}
            className={cx("-mb-px inline-flex items-center gap-1.5 rounded-t-sm border px-3 py-2 text-[13px] font-medium transition-colors",
              tab === t ? "border-line border-b-surface bg-surface text-ink" : "border-transparent text-muted hover:text-ink")}>
            <Icon className="size-3.5" aria-hidden />{label}
          </button>
        ))}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        {tab === "overview" ? (
          <figure>
            <div className="relative h-[300px] bg-night sm:h-[340px]">
              <SceneFrame className="size-full" fallback={<BoardFallback stops={stops} legs={legs} layout={layout} />}
                label={`Journey overview: ${stops.map((s) => `${s.label}${s.sub ? ` (${s.sub})` : ""}`).join(", then ")}`}>
                {({ active, reduced }) => (
                  <RouteBoardCanvas stops={stops} legs={legs} layout={layout} active={active} reduced={reduced} />
                )}
              </SceneFrame>
              {layout.cellKm && (
                <span className="telemetry pointer-events-none absolute right-3 top-3 rounded-xs bg-night/70 px-2 py-1 text-white/60">
                  Grid {layout.cellKm.toLocaleString("en-IN")} km
                </span>
              )}
            </div>
            <figcaption className="border-t border-line px-3 py-2 text-[12px] leading-relaxed text-muted">
              Real coordinates for the start{itinerary.flight ? ", airports" : ""}{itinerary.hotel ? ", hotel" : ""} and venue; lines are
              straight, and the moving dot only shows the direction of travel. Timings come from road, rail and flight data.
              {unplaced && " Stations and stops without coordinates are listed in the timeline, not placed here."}
              {layout.turned && " The board is turned so the journey reads left to right."}
              {layout.spread && " Places very close together are spread apart so each stays visible."}
            </figcaption>
          </figure>
        ) : (
          <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
            <div className="[&_figure]:rounded-none [&_figure]:border-0">
              <JourneyMap itinerary={itinerary} mission={mission} />
            </div>
          </Suspense>
        )}
      </div>
    </section>
  );
}
