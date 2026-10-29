import { motion } from "framer-motion";
import { useMemo } from "react";
import { ease } from "../../animations/motion";
import type { Itinerary } from "../../types/api";
import { cx, formatClock, formatMinutes } from "../../utils/format";
import { buildRunway, clockAt, type SegmentKind } from "../../utils/journey";

const FILL: Record<"dark" | "light", Record<SegmentKind, string>> = {
  dark: {
    travel: "bg-gradient-to-r from-sky/90 to-teal-bright/90",
    wait: "bg-white/25",
    overnight: "bg-night-3 bg-[repeating-linear-gradient(90deg,transparent_0_6px,rgb(255_255_255_/_0.08)_6px_7px)]",
    buffer: "bg-green/80",
    late: "bg-red",
  },
  light: {
    travel: "bg-gradient-to-r from-night-2 to-teal-ink",
    wait: "bg-line-strong",
    overnight: "bg-paper-2 bg-[repeating-linear-gradient(90deg,transparent_0_6px,rgb(15_23_42_/_0.08)_6px_7px)]",
    buffer: "bg-green",
    late: "bg-red",
  },
};

const DOT: Record<SegmentKind, string> = {
  travel: "bg-teal", wait: "bg-subtle", overnight: "bg-night-3", buffer: "bg-green", late: "bg-red",
};

/**
 * Door-to-venue runway: every stage of the journey on one bar, ending at the reporting deadline. Shows the arrival,
 * the buffer (green when it meets the requirement, amber when thin, red when late), where the required buffer
 * starts, and how far traffic ranges and delay flags could push the arrival. All values come from the itinerary.
 */
export function DeadlineRunway({ itinerary: it, requiredMinutes, tone = "dark", compact = false }: {
  itinerary: Itinerary; requiredMinutes: number; tone?: "dark" | "light"; compact?: boolean;
}) {
  const runway = useMemo(() => buildRunway(it, requiredMinutes), [it, requiredMinutes]);
  if (!runway) return null;
  const { segments, arrive, deadline, at, bufferMinutes, worstArrive } = runway;
  const dark = tone === "dark";
  const late = bufferMinutes < 0;
  const thin = !late && bufferMinutes < requiredMinutes;
  const fills = FILL[tone];
  const arrivePos = at(arrive) * 100;
  const deadlinePos = at(deadline) * 100;
  const requiredFrom = deadline - requiredMinutes * 60000;
  const requiredPos = at(requiredFrom) * 100;
  const worstPos = worstArrive ? at(worstArrive) * 100 : null;
  const worstLate = worstArrive !== null && worstArrive > deadline;
  const muted = dark ? "text-white/55" : "text-muted";
  const strong = dark ? "text-white" : "text-ink";

  const summary = `${clockAt(runway.start)} departure, at the venue ${formatClock(it.arrival.venue_arrival)}, ` +
    `report by ${formatClock(it.arrival.deadline)}: ${late ? `${-bufferMinutes} minutes late` : `${bufferMinutes} minutes of buffer, ${requiredMinutes} required`}.`;

  return (
    <figure aria-label={`Door to venue: ${summary}`} className="min-w-0">
      {!compact && (
        <div className={cx("flex items-baseline justify-between gap-3", muted)}>
          <span className="telemetry">Door to venue</span>
          <span className="telemetry">Report by <b className={cx("font-semibold", late ? "text-red" : "text-amber")}>{formatClock(it.arrival.deadline)}</b></span>
        </div>
      )}

      <div className={cx("relative", compact ? "mt-1" : "mt-3", "pb-9")}>
        <motion.div className={cx("flex h-3.5 w-full origin-left overflow-hidden rounded-full", dark ? "bg-white/[0.06]" : "bg-paper-2")}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.9, ease }}>
          {segments.map((s, i) => (
            <span key={i} title={`${s.label} · ${formatMinutes(s.minutes)}${s.extraReason ? ` · ${s.extraReason}` : ""}`}
              style={{ width: `${s.weight * 100}%` }}
              className={cx("h-full border-r last:border-r-0", dark ? "border-night" : "border-surface",
                s.kind === "buffer" && thin ? "bg-amber" : fills[s.kind])} />
          ))}
        </motion.div>

        {/* what the typical maximum of every leg would do to the arrival */}
        {worstPos !== null && worstPos > arrivePos && (
          <span aria-hidden title="If every leg runs to its typical maximum"
            className={cx("hatch absolute top-0 h-3.5 rounded-r-full", worstLate ? "text-red/70" : "text-amber/80")}
            style={{ left: `${arrivePos}%`, width: `${Math.max(0.8, Math.min(100, worstPos) - arrivePos)}%` }} />
        )}

        {/* required buffer starts here */}
        {!late && requiredMinutes > 0 && (
          <span aria-hidden className={cx("absolute -top-1 h-5.5 w-px", dark ? "bg-white/50" : "bg-ink/40")}
            style={{ left: `${requiredPos}%` }} />
        )}
        {/* the deadline */}
        <span aria-hidden className="absolute -top-1.5 h-6.5 w-0.5 rounded-full bg-amber" style={{ left: `calc(${deadlinePos}% - 1px)` }} />
        {/* arrival marker + label */}
        <span aria-hidden className={cx("absolute top-0 size-3.5 -translate-x-1/2 rounded-full border-2",
          dark ? "border-night bg-white" : "border-surface bg-ink")} style={{ left: `${arrivePos}%` }} />
        <span className={cx("absolute top-5 -translate-x-1/2 whitespace-nowrap text-[12px] tnum", strong)}
          style={{ left: `${Math.min(Math.max(arrivePos, 12), 88)}%` }}>
          At venue <b>{formatClock(it.arrival.venue_arrival)}</b>
        </span>
      </div>

      <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] tnum", muted)}>
        <span className={cx("font-semibold", late ? "text-red" : thin ? (dark ? "text-amber" : "text-amber-ink") : dark ? "text-green" : "text-green-ink")}>
          {late ? `${formatMinutes(-bufferMinutes)} late` : `${formatMinutes(bufferMinutes)} buffer`}
          <span className={cx("font-normal", muted)}> · {requiredMinutes} min required</span>
        </span>
        {worstArrive !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cx("hatch inline-block h-2.5 w-4 rounded-sm", worstLate ? "text-red/70" : "text-amber/80")} />
            Typical maximums: at venue {clockAt(worstArrive)}{worstLate ? " — after the deadline" : ""}
          </span>
        )}
      </div>

      {!compact && (
        <ol className={cx("mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[12px]", muted)} aria-label="Stages">
          {segments.map((s, i) => (
            <li key={i} className="inline-flex items-center gap-1.5 tnum">
              <span aria-hidden className={cx("size-2 rounded-full", s.kind === "buffer" && thin ? "bg-amber" : DOT[s.kind])} />
              <span className={strong}>{s.label}</span> {formatMinutes(s.minutes)}
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
