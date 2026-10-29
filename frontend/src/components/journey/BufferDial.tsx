import { motion } from "framer-motion";
import { useMemo } from "react";
import { ease } from "../../animations/motion";
import type { Itinerary } from "../../types/api";
import { cx, formatClock } from "../../utils/format";
import { buildRunway } from "../../utils/journey";

const R = 78;
const C = Math.PI * R; // half-circle length

/** Point on the dial's arc for a fraction 0 (left) … 1 (right). */
function at(f: number, r = R): [number, number] {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, f)));
  return [100 + r * Math.cos(a), 96 - r * Math.sin(a)];
}

/**
 * The deadline instrument: a half-dial of minutes to spare. The filled arc is the arrival buffer (teal when it meets
 * the requirement, amber when thin, red when late), the tick is the required buffer, and the hatched mark is what
 * the buffer becomes if every leg runs to its typical maximum. All values come from the itinerary.
 */
export function BufferDial({ itinerary: it, requiredMinutes, tone = "dark", className }: {
  itinerary: Itinerary; requiredMinutes: number; tone?: "dark" | "light"; className?: string;
}) {
  const runway = useMemo(() => buildRunway(it, requiredMinutes), [it, requiredMinutes]);
  const buffer = it.arrival.buffer_minutes;
  const spare = Math.abs(buffer);
  const worstBuffer = runway?.worstArrive ? Math.round((runway.deadline - runway.worstArrive) / 60000) : null;
  const scale = Math.max(requiredMinutes * 2, buffer * 1.25, 60);
  const late = buffer < 0;
  const thin = !late && buffer < requiredMinutes;
  const fill = late ? 1 : buffer / scale;
  const dark = tone === "dark";
  const colour = late ? "#ef4444" : thin ? "#ffb454" : dark ? "#55f1d1" : "#0a6b5b";
  const [rx1, ry1] = at(requiredMinutes / scale, R - 9);
  const [rx2, ry2] = at(requiredMinutes / scale, R + 9);
  const worst = worstBuffer !== null ? at(Math.max(0, worstBuffer) / scale) : null;

  return (
    <figure className={cx("relative", className)}
      aria-label={late ? `${-buffer} minutes late for a ${formatClock(it.arrival.deadline)} reporting time`
        : `${buffer} minutes of buffer before ${formatClock(it.arrival.deadline)}; ${requiredMinutes} required`}>
      <div className="relative">
      <svg viewBox="0 0 200 104" className="w-full" aria-hidden>
        <path d={`M ${100 - R} 96 A ${R} ${R} 0 0 1 ${100 + R} 96`} fill="none"
          stroke={dark ? "rgb(242 240 232 / 0.1)" : "rgb(5 11 24 / 0.08)"} strokeWidth="6" strokeLinecap="round" />
        <motion.path d={`M ${100 - R} 96 A ${R} ${R} 0 0 1 ${100 + R} 96`} fill="none" stroke={colour} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - Math.max(0.015, fill)) }} transition={{ duration: 1.1, ease, delay: 0.2 }} />
        {!late && <line x1={rx1} y1={ry1} x2={rx2} y2={ry2} stroke={dark ? "#f2f0e8" : "#050b18"} strokeWidth="1.5" />}
        {worst && worstBuffer !== null && worstBuffer < buffer && (
          <circle cx={worst[0]} cy={worst[1]} r="4.5" fill="none" stroke={worstBuffer < 0 ? "#ef4444" : "#ffb454"}
            strokeWidth="1.5" strokeDasharray="2 1.5" />
        )}
      </svg>
        <p className={cx("display absolute inset-x-0 bottom-1 text-center text-[42px] leading-none tnum", late ? "text-red" : dark ? "text-ivory" : "text-ink")}>
          {spare}<span className="ml-1 text-[18px]">min</span>
        </p>
      </div>
      <p className={cx("mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em]", dark ? "text-slate" : "text-muted")}>
        {late ? "late" : "to spare"} · {requiredMinutes} min required
      </p>
      {worstBuffer !== null && worstBuffer < buffer && (
        <figcaption className={cx("mt-3 text-center text-[12px]", dark ? "text-slate" : "text-muted")}>
          <span className={worstBuffer < 0 ? "text-red" : dark ? "text-amber" : "text-amber-ink"}>◌</span>{" "}
          If every leg runs to its typical maximum: {worstBuffer < 0 ? `${-worstBuffer} min late` : `${worstBuffer} min to spare`}
        </figcaption>
      )}
    </figure>
  );
}
