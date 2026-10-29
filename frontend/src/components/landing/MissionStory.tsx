import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../animations/motion";
import { formatMoney } from "../../utils/format";
import { journeyStages } from "../../utils/journey";
import { DEMO_JOURNEY, DEMO_MISSION } from "../journey/demoJourney";
import { JourneyInstrument } from "../journey/JourneyInstrument";

const STOPS = journeyStages(DEMO_JOURNEY).nodes.length;

/**
 * "Every stage, accounted for": the complete-journey instrument walking through a worked example. On wide screens
 * the section pins and scrolling lights one stop after another (GSAP ScrollTrigger); everywhere, every stop can be
 * opened by click, tap or arrow keys. With reduced motion the whole journey is shown at once.
 */
export function MissionStory() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(() => (prefersReducedMotion() ? STOPS - 1 : 0));
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion() || !root.current) return;
    let revert: (() => void) | undefined;
    let cancelled = false;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      const el = root.current;
      if (cancelled || !el) return;
      gsap.registerPlugin(ScrollTrigger);
      const mm = gsap.matchMedia();
      const follow = (p: number) => setActive(Math.min(STOPS - 1, Math.floor(p * STOPS)));
      mm.add("(min-width: 1024px)", () => {
        setScrolling(true);
        ScrollTrigger.create({ trigger: el, start: "top top", end: `+=${STOPS * 22}%`, pin: true, anticipatePin: 1,
          onUpdate: (s) => follow(s.progress) });
        return () => setScrolling(false);
      });
      mm.add("(max-width: 1023px)", () => {
        ScrollTrigger.create({ trigger: el, start: "top 70%", end: "bottom 60%", onUpdate: (s) => follow(s.progress) });
      });
      revert = () => mm.revert();
    });
    return () => { cancelled = true; revert?.(); };
  }, []);

  return (
    <section ref={root} id="every-stage" aria-labelledby="story-title"
      className="relative isolate overflow-hidden bg-night text-ivory lg:min-h-svh">
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_60%_at_15%_0%,rgb(16_44_82_/_0.85),transparent_70%)]" />
      <div className="container-page flex flex-col justify-center py-20 sm:py-24 lg:min-h-svh">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate">
              <span aria-hidden className="h-px w-8 bg-teal-bright" />The complete journey
            </p>
            <h2 id="story-title" className="display mt-5 text-[44px] leading-[0.95] !text-ivory sm:text-[64px] lg:text-[80px]">
              Every stage, <span className="italic text-teal-bright">accounted for.</span>
            </h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-slate lg:col-span-4 lg:col-start-9">
            Not airport to airport — door to venue. Every transfer, wait and night away is a stage with its own minutes,
            and the buffer before your reporting time is the number that decides.
          </p>
        </div>

        <div className="mt-14 sm:mt-16">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[12.5px]">
            <p className="text-ivory/85">
              {DEMO_MISSION.origin} → {DEMO_MISSION.venue}, {DEMO_MISSION.city} · interview at <span className="mono">10:00</span>
              <span className="text-slate"> · {formatMoney(DEMO_MISSION.total)} all-in</span>
            </p>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-amber">Demonstration · demo dataset</p>
          </div>
          <JourneyInstrument itinerary={DEMO_JOURNEY} requiredMinutes={DEMO_MISSION.required} travelDate={DEMO_MISSION.date}
            active={active} onActive={setActive} progressive />
          {scrolling && <p className="mt-6 text-[12px] text-slate">Scroll to move through the journey — or pick any stop.</p>}
        </div>
      </div>
    </section>
  );
}
