import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ease, prefersReducedMotion } from "../../animations/motion";
import { usePlanMission } from "../../hooks/useMission";
import { GlobeFallback } from "../../three/GlobeFallback";
import { GLOBE_ROUTES, ROUTE_SECONDS } from "../../three/globeRoutes";
import { SceneFrame } from "../../three/SceneFrame";
import { cx } from "../../utils/format";
import { Button } from "../ui/Button";

const Globe = lazy(() => import("../../three/Globe"));

const READOUT = [
  { k: "Door to venue", v: "Every transfer timed to your reporting time" },
  { k: "Every mode", v: "Flight, train, bus and road, costed all-in" },
  { k: "Risk", v: "Buffers, connections, weather and news" },
] as const;

/**
 * The landing hero: editorial headline and the Earth in one composition. The globe shows illustrative routes between
 * real cities — selectable from the scene or the route index. On wide screens a short pinned scroll turns the globe
 * towards the active destination and hands over to the complete-journey idea (GSAP; skipped with reduced motion).
 */
export function GlobeHero() {
  const plan = usePlanMission();
  const hero = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(false);
  const route = GLOBE_ROUTES[index];

  // the hero moves through the example routes on its own until the visitor chooses one
  useEffect(() => {
    if (picked || prefersReducedMotion()) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % GLOBE_ROUTES.length), ROUTE_SECONDS * 1000);
    return () => clearInterval(t);
  }, [picked]);

  const choose = useCallback((i: number) => { setPicked(true); setIndex(i); }, []);
  const onCity = useCallback((name: string) => {
    setPicked(true);
    setIndex((current) => {
      const n = GLOBE_ROUTES.length;
      for (let k = 1; k <= n; k++) {
        const j = (current + k) % n;
        if (GLOBE_ROUTES[j].from.name === name || GLOBE_ROUTES[j].to.name === name) return j;
      }
      return current;
    });
  }, []);

  useEffect(() => {
    if (prefersReducedMotion() || !hero.current) return;
    let revert: (() => void) | undefined;
    let cancelled = false;
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      const el = hero.current;
      if (cancelled || !el) return;
      gsap.registerPlugin(ScrollTrigger);
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        // a short, scrubbed sequence: the globe turns to the destination, the copy gives way to the journey idea
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: el, start: "top top", end: "+=70%", pin: true, scrub: 0.8, anticipatePin: 1,
            onUpdate: (s) => { progress.current = s.progress; },
          },
        });
        tl.to(q("[data-hero-copy]"), { opacity: 0, y: -48, duration: 0.5 }, 0)
          .fromTo(q("[data-hero-next]"), { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.45 }, 0.45);
      });
      mm.add("(max-width: 1023px)", () => {
        ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom top", scrub: true,
          onUpdate: (s) => { progress.current = s.progress * 0.6; } });
      });
      revert = () => mm.revert();
    });
    return () => { cancelled = true; revert?.(); };
  }, []);

  const callout = (
    <div className="pointer-events-none">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-bright">Illustrative route</p>
      <p className="display mt-1 text-[22px] leading-none text-ivory">{route.from.name} <span className="text-ivory/40">→</span> {route.to.name}</p>
      <p className="mt-1.5 text-[12px] text-slate">{route.mission} · {route.how}</p>
    </div>
  );

  return (
    <section ref={hero} aria-labelledby="hero-title" className="bg-midnight relative isolate overflow-hidden text-ivory">
      <div className="container-page relative grid items-center gap-4 pb-14 pt-10 sm:pt-14 lg:min-h-[calc(100svh-64px)] lg:grid-cols-12 lg:pb-10 lg:pt-0">
        <div data-hero-copy className="relative z-10 lg:col-span-6">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
            className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate">
            <span aria-hidden className="h-px w-8 bg-teal-bright" />Door-to-venue travel decisions
          </motion.p>
          <motion.h1 id="hero-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease }}
            className="display mt-7 text-[58px] leading-[0.9] !text-ivory sm:text-[84px] lg:text-[84px] xl:text-[104px] 2xl:text-[124px]">
            Every journey.
            <span className="mt-1 block whitespace-nowrap pl-[0.5em] italic text-teal-bright">Accounted for.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15, ease }}
            className="mt-8 max-w-[30rem] text-[17.5px] leading-relaxed text-ivory/75 sm:text-[19px]">
            Know how to get there, what it will cost, and whether you'll make it on time.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25, ease }}
            className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Button size="lg" variant="accent" onClick={plan}>Plan a mission <ArrowRight className="size-4" aria-hidden /></Button>
            <Link to="/#how-it-works" className="group inline-flex items-center gap-2 text-[15px] font-medium text-ivory/80 hover:text-ivory">
              See how it works
              <span aria-hidden className="h-px w-6 bg-ivory/40 transition-all duration-300 group-hover:w-10 group-hover:bg-teal-bright" />
            </Link>
          </motion.div>
          <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-14 grid max-w-[34rem] gap-5 sm:grid-cols-3">
            {READOUT.map(({ k, v }) => (
              <div key={k} className="border-t border-ivory/15 pt-3">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ivory">{k}</dt>
                <dd className="mt-1.5 text-[13px] leading-snug text-slate">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <div className="relative lg:col-span-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.4 }}
            className="relative mx-auto aspect-square w-full max-w-[min(94vw,880px)] lg:-mr-[6vw] lg:w-[calc(100%+6vw)]">
            <SceneFrame className="size-full" fallback={<GlobeFallback />}
              label={`Globe with illustrative example routes between real cities. Showing ${route.from.name} to ${route.to.name}: ${route.mission}.`}>
              {({ active, reduced }) => (
                <Globe routes={GLOBE_ROUTES} activeIndex={index} onCity={onCity} active={active} reduced={reduced}
                  progress={progress} variant="hero" callout={callout} />
              )}
            </SceneFrame>
          </motion.div>

          {/* the route index: the same selection as clicking a city on the globe, for keyboard and touch */}
          <nav aria-label="Illustrative routes" className="relative z-10 mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-2 lg:absolute lg:bottom-6 lg:left-0 lg:mt-0">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate">Example routes</span>
            {GLOBE_ROUTES.map((r, i) => (
              <button key={r.from.name + r.to.name} type="button" onClick={() => choose(i)} aria-pressed={i === index}
                title={`${r.from.name} → ${r.to.name} · ${r.mission}`}
                className={cx("mono relative pb-1 text-[12px] transition-colors",
                  i === index ? "text-ivory after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-teal-bright" : "text-ivory/40 hover:text-ivory/80")}>
                {String(i + 1).padStart(2, "0")}
                <span className="sr-only">: {r.from.name} to {r.to.name}, {r.mission}</span>
              </button>
            ))}
            <span className="text-[11.5px] text-slate">Illustrative — not live data</span>
          </nav>
        </div>

        {/* revealed as the hero scrolls on wide screens; ordinary text everywhere else */}
        <p data-hero-next className="display pointer-events-none max-w-[26ch] text-[30px] leading-[1.08] text-ivory sm:text-[38px] lg:col-span-12 lg:text-[54px] lg:motion-safe:absolute lg:motion-safe:bottom-[22%] lg:motion-safe:left-14 lg:motion-safe:opacity-0">
          From the door to the venue — <span className="italic text-teal-bright">every stage, every minute, every rupee.</span>
        </p>
      </div>
    </section>
  );
}
