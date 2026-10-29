import { useQuery } from "@tanstack/react-query";
import { lazy, useEffect, useMemo, useState } from "react";
import { searchAirports } from "../../api/missions";
import { formatCoord, haversineKm } from "../../three/geo";
import { GlobeFallback } from "../../three/GlobeFallback";
import type { GlobeArc, GlobeCity } from "../../three/globeRoutes";
import { SceneFrame } from "../../three/SceneFrame";
import type { Airport } from "../../types/api";

const Globe = lazy(() => import("../../three/Globe"));

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Where a typed place is, from the airport reference data: only an exact city/code match (or the single result of
 * an alias like "Bangalore"). Anything else stays unplaced — the preview never guesses a position.
 */
function usePlace(text: string) {
  const q = useDebounced(text.trim(), 450);
  return useQuery({
    queryKey: ["place-point", q.toLowerCase()],
    enabled: q.length >= 3,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<Airport | null> => {
      const { results } = await searchAirports(q);
      const key = q.toLowerCase();
      return results.find((a) => a.city.toLowerCase() === key || a.code.toLowerCase() === key)
        ?? (results.length === 1 ? results[0] : null);
    },
  });
}

const city = (a: Airport): GlobeCity => ({ name: a.city, lat: a.location.lat, lng: a.location.lng });

/**
 * Plan page: the TripMission Earth turning to the traveller's own start and destination, joined by a great-circle
 * line — clearly a straight-line preview; the real road, rail or flight route is worked out when they plan.
 */
export function RoutePreview({ origin, destination }: { origin: string; destination: string }) {
  const from = usePlace(origin);
  const to = usePlace(destination);
  const a = origin.trim().length >= 3 ? from.data ?? null : null;
  const b = destination.trim().length >= 3 ? to.data ?? null : null;
  const same = a && b && a.code === b.code;

  const { routes, places } = useMemo(() => {
    const r: GlobeArc[] = a && b && !same ? [{ from: city(a), to: city(b) }] : [];
    const p: GlobeCity[] = [a, b].filter((x): x is Airport => Boolean(x)).map(city);
    return { routes: r, places: p };
  }, [a, b, same]);
  const km = a && b && !same ? Math.round(haversineKm(a.location, b.location)) : null;
  const unplaced = [
    origin.trim().length >= 3 && from.isFetched && !a ? origin.trim() : null,
    destination.trim().length >= 3 && to.isFetched && !b ? destination.trim() : null,
  ].filter(Boolean) as string[];

  return (
    <figure aria-label="Route preview">
      {/* a lens onto the same Earth as the landing page, turned to the traveller's own places */}
      <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-full shadow-[0_0_0_1px_rgb(85_241_209_/_0.18),0_0_60px_-10px_rgb(63_158_232_/_0.5)]">
        <SceneFrame className="size-full" fallback={<GlobeFallback />}
          label={places.length ? `Preview globe showing ${places.map((p) => p.name).join(" and ")}` : "Preview globe"}>
          {({ active, reduced }) => (
            <Globe routes={routes} activeIndex={0} places={places} active={active} reduced={reduced} variant="preview" />
          )}
        </SceneFrame>
      </div>
      <figcaption className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-slate">
        {km !== null ? (
          <p className="flex items-baseline justify-between gap-3 border-t border-ivory/10 pt-3">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em]">Straight line</span>
            <span className="mono text-[13px] text-ivory">≈ {km.toLocaleString("en-IN")} km</span>
          </p>
        ) : (
          <p className="border-t border-ivory/10 pt-3">
            {places.length ? "Add the other end to see the line between them." : "Enter where you start and where you need to be."}
          </p>
        )}
        {places.length > 0 && (
          <p className="mono flex flex-wrap gap-x-3 text-[11px]">{places.map((p) => <span key={p.name}>{p.name} {formatCoord(p)}</span>)}</p>
        )}
        {unplaced.length > 0 && (
          <p>{unplaced.join(" and ")} {unplaced.length > 1 ? "aren't" : "isn't"} in our airport list yet — placed when you plan. Towns without an airport are fine.</p>
        )}
        <p>A preview between airport positions, not your route: roads, trains and flights are worked out when you plan.</p>
      </figcaption>
    </figure>
  );
}
