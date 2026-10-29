import { CloudFog, CloudLightning, CloudRain, CloudSun, ExternalLink, Newspaper, Snowflake, type LucideIcon } from "lucide-react";
import type { TravelConditions } from "../../types/api";
import { formatDate } from "../../utils/format";

const WEATHER_ICONS: Record<string, LucideIcon> = {
  fog: CloudFog, storm: CloudLightning, heavy_rain: CloudRain, rain: CloudRain, snow: Snowflake,
};

/** Weather on the mission day and recent disruption headlines at the destination. */
export function TravelConditionsPanel({ conditions, city }: { conditions: TravelConditions | null | undefined; city: string }) {
  if (!conditions) return null;
  const w = conditions.weather;
  const Icon = (w?.kind && WEATHER_ICONS[w.kind]) || CloudSun;
  const warn = Boolean(w?.kind && w.kind !== "rain");
  return (
    <section aria-labelledby="conditions-title" className="card p-5 sm:p-6">
      <h3 id="conditions-title" className="text-[17px] font-semibold tracking-[-0.01em]">Conditions in {city}</h3>

      {w ? (
        <div className="mt-4 flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-sm ${warn ? "bg-amber-wash text-amber-ink" : "bg-paper text-muted"}`}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-[14.5px] font-semibold text-ink tnum">
              {formatDate(w.date, { weekday: "short", day: "numeric", month: "short" })} · {w.summary ?? "Forecast"}
              {w.high !== null && w.low !== null && <span className="font-normal text-muted"> · {Math.round(w.low)}–{Math.round(w.high)}{w.unit}</span>}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {w.precipitation !== null ? `${Math.round(w.precipitation)}% chance of rain · ` : ""}{w.source}
            </p>
            {warn && <p className="mt-1 text-[13px] text-amber-ink">{w.label} can slow flights and roads — it's included in the risk score.</p>}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13.5px] text-muted">{conditions.weather_note ?? "No forecast available."}</p>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <Newspaper className="size-4 text-muted" aria-hidden />Recent disruption reports
        </p>
        {conditions.alerts.length ? (
          <ul className="mt-2 space-y-2">
            {conditions.alerts.map((a) => (
              <li key={a.url}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="group block rounded-sm bg-paper px-3 py-2 hover:bg-amber-wash">
                  <span className="text-[13.5px] font-medium text-ink group-hover:underline">{a.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
                    {a.source ?? "News"} · {formatDate(a.published_at)}<ExternalLink className="size-3" aria-hidden />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-muted">No strikes, closures or weather alerts reported for {city} in the last few days.</p>
        )}
        <p className="mt-3 text-[12px] text-subtle">From Google News headlines only — we don't guess beyond what's reported.</p>
      </div>
    </section>
  );
}
