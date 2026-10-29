import { ArrowRight, Moon, Sunrise } from "lucide-react";
import type { Itinerary, MissionResult } from "../../types/api";
import { cx, formatClock, formatDayLabel, formatMinutes, formatMoney } from "../../utils/format";
import { MODE_META } from "../../utils/mission";
import { RiskBadge } from "../ui/Badge";
import { DeadlineRunway } from "./DeadlineRunway";
import { journeyTitle } from "./RecommendationCard";

const STRATEGY = {
  same_day: { label: "Same day", icon: Sunrise, note: "Travel on the morning of your mission" },
  night_before: { label: "The day before", icon: Moon, note: "Arrive early, stay near the venue" },
} as const;

/** The engine's best-scored journey for a strategy — the same ordering as the Mission Score, nothing re-ranked. */
function best(result: MissionResult, strategy: Itinerary["strategy"]): Itinerary | undefined {
  return result.itineraries.filter((i) => i.strategy === strategy).sort((a, b) => b.scores.overall - a.scores.overall)[0];
}

function tradeoff(sameDay: Itinerary, before: Itinerary): string | null {
  const a = sameDay.cost.total;
  const b = before.cost.total;
  const buffer = before.arrival.buffer_minutes - sameDay.arrival.buffer_minutes;
  if (a === null || b === null) return null;
  const money = b - a;
  const cost = money === 0 ? "costs the same" : money > 0 ? `costs ${formatMoney(money, before.cost.currency)} more` : `saves ${formatMoney(-money, before.cost.currency)}`;
  const time = buffer === 0 ? "with the same buffer" : buffer > 0 ? `and gives you ${formatMinutes(buffer)} more buffer` : `but leaves ${formatMinutes(-buffer)} less buffer`;
  return `Arriving the day before ${cost} ${time}.`;
}

/** Same-morning vs arrive-the-day-before, side by side — shown when the engine produced both. */
export function StrategyCompare({ result, selectedId, onSelect }: {
  result: MissionResult; selectedId: string; onSelect: (id: string) => void;
}) {
  const sameDay = best(result, "same_day");
  const before = best(result, "night_before");
  if (!sameDay || !before) return null;
  const sentence = tradeoff(sameDay, before);
  const required = result.mission.min_buffer_minutes;

  return (
    <div className="space-y-4">
      {sentence && <p className="text-[15px] text-fg tnum">{sentence}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {[sameDay, before].map((it) => {
          const meta = STRATEGY[it.strategy];
          const Icon = meta.icon;
          const ModeIcon = MODE_META[it.mode].icon;
          const selected = it.id === selectedId;
          const start = it.timeline[0]?.time ?? it.main.departure_time;
          return (
            <article key={it.id} className={cx("card card-lift flex flex-col p-5 sm:p-6", selected && "border-teal-ink/50 ring-2 ring-teal/20")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="telemetry flex items-center gap-1.5 text-teal-ink"><Icon className="size-3.5" aria-hidden />{meta.label}</p>
                  <h4 className="mt-1.5 flex items-center gap-2 truncate text-[16px] font-semibold text-ink">
                    <ModeIcon className="size-4 shrink-0 text-muted" aria-hidden /><span className="truncate">{journeyTitle(it)}</span>
                  </h4>
                  <p className="mt-0.5 text-[13px] text-muted">{meta.note}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="mono text-[22px] font-semibold leading-none text-ink">{it.scores.overall}</p>
                  <p className="mt-1 text-[11px] text-muted">Mission Score</p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-line py-4 text-[13px] tnum">
                <div>
                  <dt className="text-muted">Leave</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{formatClock(start)}</dd>
                  <dd className="text-[11.5px] text-subtle">{formatDayLabel(start, result.mission.travel_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted">All-in</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{formatMoney(it.cost.total, it.cost.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Risk</dt>
                  <dd className="mt-1"><RiskBadge level={it.risk.level} compact /></dd>
                </div>
              </dl>

              <div className="mt-4">
                <DeadlineRunway itinerary={it} requiredMinutes={required} tone="light" compact />
              </div>

              <div className="mt-auto pt-3">
                <button type="button" onClick={() => onSelect(it.id)} aria-pressed={selected}
                  className={cx("inline-flex items-center gap-1.5 text-[13.5px] font-semibold",
                    selected ? "text-muted" : "text-teal-ink hover:text-ink")}>
                  {selected ? "Showing this journey" : <>View this journey <ArrowRight className="size-3.5" aria-hidden /></>}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
