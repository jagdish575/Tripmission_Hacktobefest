import { motion } from "framer-motion";
import { prefersReducedMotion } from "../../animations/motion";
import { cx } from "../../utils/format";

/** How much of the safety margin a journey leaves: a bar that grows in — green when comfortable, amber when
 * below the traveller's minimum, red when late. Full width = twice the minimum buffer. */
export function BufferBar({ buffer, required, className }: { buffer: number; required: number; className?: string }) {
  const tone = buffer < 0 ? "bg-red" : buffer < required ? "bg-amber" : "bg-green";
  const share = buffer < 0 ? 1 : Math.min(1, buffer / Math.max(1, required * 2));
  const reduced = prefersReducedMotion();
  return (
    <div className={cx("relative h-1.5 overflow-hidden rounded-full bg-line/70", className)} aria-hidden>
      {/* the traveller's minimum, as a tick at the half-way mark */}
      <span className="absolute inset-y-0 left-1/2 z-10 w-px bg-surface" />
      <motion.span className={cx("absolute inset-y-0 left-0 rounded-full", tone)}
        initial={{ width: reduced ? `${share * 100}%` : "0%" }} whileInView={{ width: `${share * 100}%` }}
        viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} />
    </div>
  );
}
