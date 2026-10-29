import { motion, useMotionValueEvent, useScroll, useSpring, useTransform, type Variants } from "framer-motion";
import { useRef, useState } from "react";
import { cx } from "../../utils/format";
import { SectionHeading } from "../ui/Controls";
import { TrainArt } from "./Vehicles";

const view = { initial: "hidden", whileInView: "show", viewport: { once: true, margin: "-80px" } } as const;
const rise: Variants = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } };
const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

/* --------------------------------------------------------------- the gap */
const TOOLS = [
  { name: "Flight & train search", answers: "Which flights and trains exist, and the fare.", misses: "Which one actually gets me there on time?" },
  { name: "Hotel search", answers: "Which hotels are available tonight.", misses: "Is it close to where I need to be?" },
  { name: "Maps", answers: "How long one drive takes.", misses: "Does it fit inside my buffer?" },
];

/** What existing tools answer, set as a ruled table — and the one question none of them asks. */
export function GapSection() {
  return (
    <section className="container-page grid gap-12 py-24 sm:py-32 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <SectionHeading eyebrow="The problem"
          title={<>Travel search tells you what exists. <span className="italic text-teal-ink">Not whether it works.</span></>}
          description="For an interview, an exam or a hospital appointment, a missed connection isn't an inconvenience — it's the whole trip. Today you stitch three tools together in your head." />
      </div>
      <motion.div {...view} variants={list} className="lg:col-span-7" role="table" aria-label="What travel tools answer">
        <div role="row" className="hidden grid-cols-[1.1fr_1.3fr_1.3fr] gap-6 pb-3 sm:grid">
          {["Tool", "Answers", "Never asks"].map((h) => <span key={h} role="columnheader" className="eyebrow">{h}</span>)}
        </div>
        {TOOLS.map((t) => (
          <motion.div key={t.name} variants={rise} role="row"
            className="grid gap-1 border-t border-line-strong py-5 sm:grid-cols-[1.1fr_1.3fr_1.3fr] sm:gap-6">
            <span role="cell" className="text-[15px] font-semibold text-ink">{t.name}</span>
            <span role="cell" className="text-[14.5px] text-fg">{t.answers}</span>
            <span role="cell" className="text-[14.5px] text-muted">{t.misses}</span>
          </motion.div>
        ))}
        <motion.div variants={rise} role="row"
          className="grid gap-2 border-y-2 border-ink py-6 sm:grid-cols-[1.1fr_2.6fr] sm:gap-6">
          <span role="cell" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span aria-hidden className="size-2 rounded-full bg-teal" />TripMission
          </span>
          <span role="cell" className="display text-[24px] leading-snug text-ink sm:text-[28px]">
            Flight, train or bus — which <em>whole</em> journey gets me there on time, within budget, and what could go wrong?
          </span>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* --------------------------------------------------------------- how it works */
const STEPS = [
  { title: "Tell us your mission", body: "Where you need to be, by when, and what you can spend." },
  { title: "We search live data", body: "Flights, train and bus schedules, hotels near your venue and real driving times." },
  { title: "We evaluate every journey", body: "Every mode is costed all-in — ticket, hotel, transfers, food — and timed door to venue." },
  { title: "We calculate risk", body: "Thin buffers, tight layovers, delay-prone flights, long transfers, budget overruns." },
  { title: "We recommend one", body: "With the numbers, the trade-offs, and exactly when to leave." },
];

// sleepers between two rails
const RAIL_X = "repeating-linear-gradient(90deg, #cbc5b5 0 2px, transparent 2px 12px)";
const RAIL_Y = "repeating-linear-gradient(180deg, #cbc5b5 0 2px, transparent 2px 12px)";
const TRAIN = 120; // px, TrainArt length
const GAP = 24;    // px, md:gap-6 between step columns

/** The train is driven by scrolling: it rolls along the track and each step lights up as it arrives. */
export function HowItWorks() {
  const steps = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: steps, offset: ["start 85%", "end 45%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  const [reached, setReached] = useState(1);
  useMotionValueEvent(scrollYProgress, "change", (v) =>
    setReached(Math.min(STEPS.length, Math.floor(v * (STEPS.length - 1) + 1.05))));
  // nose of the train on step n's marker (columns are 20% wide plus their share of the gaps; marker centre at 18px)
  const last = (STEPS.length - 1) / STEPS.length;
  const left = useTransform(progress, (v) => `calc(${v * last * 100}% + ${v * last * GAP + 18 - TRAIN}px)`);
  const top = useTransform(progress, (v) => `calc(${v * 100}% - ${v * TRAIN}px)`);

  return (
    <section id="how-it-works" className="scroll-mt-20 bg-surface">
      <div className="container-page py-24 sm:py-32">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <SectionHeading className="lg:col-span-7" eyebrow="How it works" title="From a deadline to a journey you can trust" />
          <p className="max-w-md text-[15px] leading-relaxed text-muted lg:col-span-4 lg:col-start-9">
            Five steps, every time. The same inputs always produce the same answer.
          </p>
        </div>

        {/* desktop: horizontal track above the steps */}
        <div aria-hidden className="relative mt-16 hidden h-9 overflow-hidden md:block">
          <span className="absolute inset-x-0 bottom-0 h-2 border-y-[1.5px] border-line-strong" style={{ backgroundImage: RAIL_X }} />
          <motion.div className="absolute bottom-[5px]" style={{ left }}>
            <TrainArt className="h-7 w-[120px]" />
          </motion.div>
        </div>

        <motion.ol ref={steps} {...view} variants={list} className="relative mt-12 grid gap-8 md:mt-6 md:grid-cols-5 md:gap-6">
          {/* phones: vertical track beside the stacked steps; the train passes behind the markers */}
          <span aria-hidden className="absolute bottom-0 left-[13px] top-0 w-2.5 border-x-[1.5px] border-line-strong md:hidden"
            style={{ backgroundImage: RAIL_Y }} />
          <motion.div aria-hidden className="absolute left-[4px] md:hidden" style={{ top }}>
            <TrainArt vertical className="h-[120px] w-7" />
          </motion.div>
          {STEPS.map((s, i) => {
            const on = i < reached;
            return (
              <motion.li key={s.title} variants={rise} className="relative flex gap-4 md:block">
                <span className={cx("mono relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-[12px] ring-4 ring-surface transition-colors duration-500",
                  on ? "bg-ink text-teal-bright" : "border border-line-strong bg-surface text-muted")}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="md:mt-5">
                  <p className={cx("text-[16px] font-semibold transition-colors duration-500", on ? "text-ink" : "text-muted")}>{s.title}</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- how we decide */
export const TIME_CRITICAL_WEIGHTS = [
  { label: "Arrival reliability", w: 30, note: "Buffer after delay exposure, connections and traffic" },
  { label: "Budget", w: 20, note: "Total trip cost — fit to budget and vs the cheapest" },
  { label: "Ground travel", w: 15, note: "Taxi or local transit on the day vs your limit" },
  { label: "Location & stay", w: 10, note: "Hotel distance to the venue and guest rating" },
  { label: "Travel time", w: 10, note: "Time travelling vs the quickest option" },
  { label: "Convenience", w: 10, note: "Changes, night travel, walking, very early starts" },
  { label: "Review confidence", w: 5, note: "Volume and share of positive mentions" },
];

export function HowWeDecide() {
  return (
    <section className="container-page grid gap-14 py-24 sm:py-32 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <SectionHeading eyebrow="How we decide" title={<>A scoring engine, <span className="italic text-teal-ink">not a chatbot.</span></>} />
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted">
          <p>Every recommendation comes from deterministic maths on live search results and your constraints. The same inputs always produce the same answer.</p>
          <p>AI is only used to put the result into words. It receives the engine's numbers, and its text is rejected if it contains a single number that isn't in that data.</p>
          <p>Each result has a short “How we decided” note: what is live, what is calculated and what is estimated.</p>
        </div>
      </div>
      <div className="lg:col-span-6 lg:col-start-7">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3">
          <p className="text-[14px] font-semibold text-ink">Mission Score weights</p>
          <p className="text-[12px] text-muted">Balanced priority (default)</p>
        </div>
        <motion.ul {...view} variants={list}>
          {TIME_CRITICAL_WEIGHTS.map((w) => (
            <motion.li key={w.label} variants={rise} className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 border-b border-line py-3.5">
              <span className="text-[14.5px] font-medium text-ink">{w.label}</span>
              <span className="mono text-[13px] text-ink">{w.w}%</span>
              <span className="col-span-2 mt-2 h-[3px] bg-paper-2">
                <motion.span className="block h-full bg-ink" initial={{ width: 0 }} whileInView={{ width: `${(w.w / 30) * 100}%` }}
                  viewport={{ once: true }} transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} />
              </span>
              <span className="col-span-2 mt-1.5 text-[12.5px] text-muted">{w.note}</span>
            </motion.li>
          ))}
        </motion.ul>
        <p className="mt-5 text-[12.5px] text-muted">
          “What matters most?” switches the profile: Save money puts 45% on cost, Save time 40% on travel time, Avoid risk 40% on arrival reliability.
        </p>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- data sources */
const SOURCES = [
  { name: "Google Flights", body: "Schedules, prices, layovers — and the “often delayed by 30+ min” flag." },
  { name: "Google Hotels", body: "Rates, ratings, coordinates and per-aspect review mentions." },
  { name: "Google Maps", body: "Pins your exact venue and every shortlisted hotel." },
  { name: "Maps Directions", body: "Driving times with traffic ranges, plus live train and bus schedules from Google Maps transit." },
  { name: "Google Local", body: "Cafés, pharmacies and more — chosen for your kind of mission." },
  { name: "Maps Reviews", body: "Recent guest reviews, read for concrete signals like noise." },
];

export function DataSourcesStrip() {
  return (
    <section className="bg-surface">
      <div className="container-page grid gap-12 py-24 sm:py-32 lg:grid-cols-12">
        <SectionHeading className="lg:col-span-4" eyebrow="Live data via SerpApi" title="Six live sources. One decision."
          description="Only promising candidates get the expensive lookups: flights and transit routes are filtered first, then hotels, directions and reviews are fetched for the best few." />
        <motion.ol {...view} variants={list} className="grid gap-x-10 sm:grid-cols-2 lg:col-span-7 lg:col-start-6">
          {SOURCES.map(({ name, body }, i) => (
            <motion.li key={name} variants={rise} className="grid grid-cols-[2.25rem_1fr] border-t border-line-strong py-5">
              <span className="mono pt-0.5 text-[12px] text-teal-ink">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-[15.5px] font-semibold text-ink">{name}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">{body}</p>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
