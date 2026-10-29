import { motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { prefersReducedMotion } from "../../animations/motion";
import type { Itinerary, MissionSummary } from "../../types/api";
import { cx, formatMinutes } from "../../utils/format";
import { missionMeta } from "../../utils/mission";

const BURST_COLOURS = ["#ffb454", "#2fd9b9", "#1f62b8", "#55f1d1", "#f2f0e8"];

/** Seen-once-per-mission flag, so the celebration doesn't replay on every visit. */
function firstVisit(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    /* storage unavailable — celebrate anyway */
  }
  return true;
}

/** "You'll make it" — the one-line answer to the question the traveller came with. */
export function Verdict({ missionId, itinerary: it, mission }: {
  missionId: string; itinerary: Itinerary; mission: MissionSummary;
}) {
  const buffer = it.arrival.buffer_minutes;
  const comfortable = buffer >= mission.min_buffer_minutes && it.risk.level !== "HIGH";
  const reduced = prefersReducedMotion();
  const celebrate = useMemo(() => comfortable && !reduced && firstVisit(`tm:verdict:${missionId}`), [comfortable, reduced, missionId]);
  const noun = missionMeta(mission.mission_type).noun;

  if (buffer < 0) return null;
  return (
    <motion.div className="relative inline-flex" initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 24, delay: 0.15 }}>
      <span className={cx("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold",
        comfortable ? "border-green/30 bg-green-wash text-green-ink" : "border-amber/40 bg-amber-wash text-amber-ink")}>
        {comfortable ? (
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <circle cx="12" cy="12" r="11" fill="currentColor" opacity="0.15" />
            <motion.path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
              strokeLinejoin="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.45, ease: "easeOut" }} />
          </svg>
        ) : <TriangleAlert className="size-4" aria-hidden />}
        {comfortable
          ? `You'll make it — at the venue ${formatMinutes(buffer)} before your ${noun}`
          : `Tight — only ${formatMinutes(buffer)} to spare. Check what could go wrong below.`}
      </span>
      {celebrate && (
        <span aria-hidden className="pointer-events-none absolute left-5 top-1/2">
          {Array.from({ length: 16 }, (_, i) => {
            const angle = (i / 16) * Math.PI * 2;
            const distance = 38 + (i % 3) * 14;
            return (
              <motion.span key={i} className="absolute block size-1.5 rounded-full"
                style={{ background: BURST_COLOURS[i % BURST_COLOURS.length] }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.9, delay: 0.55, ease: [0.22, 1, 0.36, 1] }} />
            );
          })}
        </span>
      )}
    </motion.div>
  );
}
