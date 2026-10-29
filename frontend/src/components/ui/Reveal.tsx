import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { ease, prefersReducedMotion } from "../../animations/motion";

/** Fades and rises its content in the first time it scrolls into view. Static with reduced motion. */
export function Reveal({ children, className, delay = 0, as = "div", ...aria }: {
  children: ReactNode; className?: string; delay?: number; as?: "div" | "section"; "aria-labelledby"?: string;
}) {
  if (prefersReducedMotion()) {
    const Tag = as;
    return <Tag className={className} {...aria}>{children}</Tag>;
  }
  const Component = as === "section" ? motion.section : motion.div;
  return (
    <Component className={className} {...aria} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }} transition={{ duration: 0.5, ease, delay }}>
      {children}
    </Component>
  );
}
