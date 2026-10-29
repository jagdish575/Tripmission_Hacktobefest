import { ExternalLink, Home } from "lucide-react";
import type { ReturnPlan } from "../../types/api";
import { formatClock, formatDate, formatMinutes, formatMoney } from "../../utils/format";
import { MODE_META, SOURCE_META } from "../../utils/mission";

const TAGS: Record<string, string> = { earliest_home: "Home earliest", cheapest: "Cheapest" };

/** Getting home after the mission: options that leave the venue after the traveller is free. */
export function ReturnPanel({ plan, currency }: { plan: ReturnPlan | null | undefined; currency: string }) {
  if (!plan) return null;
  return (
    <section aria-labelledby="return-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="return-title" className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
          <Home className="size-4 text-muted" aria-hidden />Getting home
        </h3>
        <p className="text-[13px] text-muted tnum">
          {formatDate(plan.date, { weekday: "short", day: "numeric", month: "short" })} · leaving after {plan.leave_after}
        </p>
      </div>
      {plan.round_trip_total !== null && (
        <p className="mt-2 text-[13.5px] text-fg tnum">
          Round trip with the cheapest way home: <span className="font-semibold">{formatMoney(plan.round_trip_total, currency)}</span>
        </p>
      )}

      {plan.options.length > 0 ? (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {plan.options.map((o) => {
            const Icon = MODE_META[o.mode].icon;
            return (
              <li key={o.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
                    <Icon className="size-4 text-muted" aria-hidden />{o.title}
                    {o.tags.map((t) => TAGS[t] && (
                      <span key={t} className="rounded-sm bg-green-wash px-1.5 py-0.5 text-[11px] font-semibold text-green-ink">{TAGS[t]}</span>
                    ))}
                  </p>
                  <p className="mt-0.5 text-[13px] text-fg tnum">
                    Leave venue {formatClock(o.leave_venue_at)} · departs {formatClock(o.departure_time)} · home ~{formatClock(o.arrival_time)}
                    {o.arrival_time.slice(0, 10) !== plan.date && " (+1 day)"} · {formatMinutes(o.duration_minutes)}
                  </p>
                  {o.note && <p className="mt-0.5 text-[12px] text-muted">{o.note}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-[14px] font-semibold tnum" title={SOURCE_META[o.fare_source].hint}>
                    {formatMoney(o.fare, currency)}
                    <span className="ml-1 text-[11px] font-medium text-muted">{SOURCE_META[o.fare_source].label}</span>
                  </span>
                  {o.links.slice(0, 2).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-sm border border-line-strong px-2.5 text-[12.5px] font-semibold hover:bg-paper">
                      {l.label}<ExternalLink className="size-3" aria-hidden />
                    </a>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {plan.message && <p className="mt-3 text-[13px] text-muted">{plan.message}</p>}
    </section>
  );
}
