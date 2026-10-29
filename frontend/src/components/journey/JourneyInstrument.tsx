import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { Itinerary } from "../../types/api";
import { cx, formatClock, formatDayLabel, formatKm, formatMinutes, formatMoney } from "../../utils/format";
import { journeyStages, type StageLink } from "../../utils/journey";
import { BufferDial } from "./BufferDial";

const BASE = 176;  // baseline (viewBox units) where the stops sit
const APEX = 38;   // height the main leg climbs to
const H = 240;

/** Horizontal weight of a link: real minutes, with stays compressed and short stages kept visible. */
const weight = (l: StageLink) => (l.kind === "overnight" ? 140 : Math.max(l.minutes, 22));

function linkPath(x1: number, x2: number, kind: StageLink["kind"]): string {
  if (kind === "main") {
    const span = x2 - x1;
    return `M ${x1} ${BASE} C ${x1 + span * 0.25} ${APEX}, ${x2 - span * 0.25} ${APEX}, ${x2} ${BASE}`;
  }
  if (kind === "overnight") return `M ${x1} ${BASE} Q ${(x1 + x2) / 2} ${BASE + 26} ${x2} ${BASE}`;
  return `M ${x1} ${BASE} L ${x2} ${BASE}`;
}

/**
 * The complete journey as one suspended line: ground transfers run along the baseline, the main leg arcs above it,
 * stays dip below. Every stop and gap is the itinerary's own timeline. The active stop is lit and its details —
 * time, the next stage, distance, cost and risk notes where the data has them — are shown in the readout.
 * Beside it, the deadline instrument. `progressive` reveals the line up to the active stop (the landing story).
 */
export function JourneyInstrument({ itinerary: it, requiredMinutes, travelDate, active: controlled, onActive, progressive = false,
  currency = "INR", className }: {
  itinerary: Itinerary; requiredMinutes: number; travelDate: string; active?: number; onActive?: (i: number) => void;
  progressive?: boolean; currency?: string; className?: string;
}) {
  const { nodes, links } = useMemo(() => journeyStages(it), [it]);
  const [own, setOwn] = useState(nodes.length - 1);
  const active = Math.min(controlled ?? own, nodes.length - 1);
  const select = (i: number) => (onActive ? onActive(i) : setOwn(i));

  const xs = useMemo(() => {
    const total = links.reduce((s, l) => s + weight(l), 0) || 1;
    let acc = 0;
    return nodes.map((_, i) => {
      if (i > 0) acc += weight(links[i - 1]);
      return 30 + (acc / total) * 940;
    });
  }, [nodes, links]);

  if (nodes.length < 2) return null;
  const node = nodes[active];
  const next = links[active];
  const prev = active > 0 ? links[active - 1] : null;
  const isArrival = node.kind === "arrive";
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = Math.min(nodes.length - 1, Math.max(0, i + d));
    select(j);
    (e.currentTarget.parentElement?.parentElement?.querySelectorAll<HTMLButtonElement>("[data-stop]")[j])?.focus();
  };

  return (
    <div className={cx("grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_220px]", className)}>
      <div className="min-w-0">
        <div className="relative" style={{ height: H }}>
          <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {links.map((l, i) => {
              const shown = !progressive || i < active;
              const lit = i === active || i === active - 1;
              return (
                <path key={i} d={linkPath(xs[i], xs[i + 1], l.kind)} fill="none" pathLength={1} vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  stroke={l.kind === "main" ? "#55f1d1" : l.kind === "overnight" ? "#6fa8ff" : "#f2f0e8"}
                  strokeWidth={l.kind === "main" ? 2 : l.kind === "wait" ? 1 : 1.5}
                  strokeDasharray={l.kind === "overnight" || l.kind === "wait" ? "0.012 0.012" : "1"}
                  strokeDashoffset={shown || l.kind === "overnight" || l.kind === "wait" ? 0 : 1}
                  opacity={shown ? (lit ? 1 : progressive ? 0.38 : 0.7) : 0.08}
                  style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), opacity 0.5s ease" }} />
              );
            })}
          </svg>

          {/* the main leg's name rides the top of its arc; a stay is named under its dip */}
          {links.map((l, i) => (l.kind === "main" || l.kind === "overnight") && (
            <p key={`l${i}`} aria-hidden className={cx("absolute -translate-x-1/2 whitespace-nowrap text-center transition-opacity duration-500",
              progressive && i >= active ? "opacity-0" : "opacity-100")}
              style={{ left: `${(xs[i] + xs[i + 1]) / 20}%`, top: l.kind === "main" ? APEX - 4 : BASE + 22 }}>
              <span className={cx("block text-[12.5px]", l.kind === "main" ? "font-medium text-ivory" : "text-sky")}>{l.label}</span>
              <span className="mono block text-[11px] text-slate">{formatMinutes(l.minutes)}</span>
            </p>
          ))}

          <ol aria-label="Journey stages" className="contents">
            {nodes.map((n, i) => {
              const on = i === active;
              const passed = i < active;
              const first = i === 0;
              const last = i === nodes.length - 1;
              return (
                <li key={i} className="absolute -translate-x-1/2" style={{ left: `${xs[i] / 10}%`, top: BASE - 9 }}>
                  <button type="button" data-stop aria-pressed={on} onClick={() => select(i)} onFocus={() => select(i)}
                    onKeyDown={(e) => onKey(e, i)} aria-label={`${formatClock(n.time)} — ${n.title}`}
                    className="group grid size-[18px] place-items-center rounded-full outline-offset-4">
                    <span className={cx("block rounded-full transition-all duration-500",
                      on ? "size-3.5 bg-teal-bright shadow-[0_0_0_6px_rgb(85_241_209_/_0.16),0_0_24px_rgb(85_241_209_/_0.7)]"
                        : last ? "size-3 bg-ivory ring-2 ring-teal-bright/60"
                        : passed ? "size-2.5 bg-ivory" : "size-2 bg-ivory/45 group-hover:bg-ivory")} />
                  </button>
                  <span aria-hidden className={cx("mono absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-[11px] transition-colors",
                    // phones: the lit stop's time, plus the ends when they won't collide with it
                    on ? "text-teal-bright" : "text-slate", !(on || ((first || last) && Math.abs(i - active) > 1)) && "hidden md:block")}>
                    {formatClock(n.time)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* the readout for the lit stop */}
        <div aria-live="polite" className="mt-4 min-h-[124px] border-t border-ivory/10 pt-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={active} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }} className="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="display text-[44px] leading-none text-ivory tnum">{formatClock(node.time)}</p>
                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">{formatDayLabel(node.time, travelDate)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[17px] font-medium leading-snug text-ivory">{node.title}</p>
                {node.detail && <p className="mt-1 text-[13.5px] leading-relaxed text-slate">{node.detail}</p>}
                {prev && !isArrival && <p className="mt-1 text-[12.5px] text-slate">After {prev.label.toLowerCase()} · {formatMinutes(prev.minutes)}</p>}
              </div>
              <div className="min-w-0 text-[13.5px]">
                {isArrival ? (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Then</p>
                    <p className="mt-1 text-ivory">Report by <span className="mono">{formatClock(it.arrival.deadline)}</span></p>
                    <p className={cx("mt-0.5", it.arrival.buffer_minutes < 0 ? "text-red" : it.arrival.buffer_minutes < requiredMinutes ? "text-amber" : "text-teal-bright")}>
                      {it.arrival.buffer_minutes < 0 ? `${formatMinutes(-it.arrival.buffer_minutes)} late` : `${formatMinutes(it.arrival.buffer_minutes)} to spare`}
                    </p>
                  </>
                ) : next && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">Next</p>
                    <p className="mt-1 text-ivory">{next.label} <span className="mono text-slate">· {formatMinutes(next.minutes)}{next.distanceKm !== null ? ` · ${formatKm(next.distanceKm)}` : ""}</span></p>
                    {next.cost !== null && (
                      <p className="mt-0.5 text-slate tnum">{formatMoney(next.cost, currency)}{next.costEstimated ? " · estimated" : ""}</p>
                    )}
                    {next.extraReason && <p className="mt-0.5 text-amber">{next.extraReason}</p>}
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-4 lg:border-l lg:border-ivory/10 lg:pl-10">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate lg:text-left">Deadline</p>
        <BufferDial itinerary={it} requiredMinutes={requiredMinutes} className="mx-auto w-full max-w-[220px]" />
        <p className="text-center text-[12.5px] text-slate tnum lg:text-left">
          At the venue <span className="mono text-ivory">{formatClock(it.arrival.venue_arrival)}</span> · report by{" "}
          <span className="mono text-ivory">{formatClock(it.arrival.deadline)}</span>
        </p>
      </div>
    </div>
  );
}
