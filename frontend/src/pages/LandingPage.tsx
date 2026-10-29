import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { GlobeHero } from "../components/landing/GlobeHero";
import { MissionStory } from "../components/landing/MissionStory";
import { CityArrival } from "../components/landing/Vehicles";
import { DataSourcesStrip, GapSection, HowItWorks, HowWeDecide } from "../components/landing/Sections";
import { HeroMissionBar } from "../components/mission/HeroMissionBar";
import { Button } from "../components/ui/Button";
import { usePlanMission } from "../hooks/useMission";

const ease = [0.22, 1, 0.36, 1] as const;

export function LandingPage() {
  const plan = usePlanMission();
  useEffect(() => {
    document.title = "TripMission — every journey, accounted for";
  }, []);

  return (
    <>
      <GlobeHero />
      <MissionStory />

      <section aria-labelledby="start-title" className="container-page py-20 sm:py-24">
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow flex items-center gap-3"><span aria-hidden className="h-px w-6 bg-teal" />Start a mission</p>
          <h2 id="start-title" className="display mt-3 text-[34px] leading-[1.02] sm:text-[46px]">
            Where do you need to be, <span className="italic text-teal-ink">and by when?</span>
          </h2>
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease }}>
          <HeroMissionBar />
        </motion.div>
      </section>

      <GapSection />
      <HowItWorks />
      <HowWeDecide />
      <DataSourcesStrip />

      <section className="container-page py-16 sm:py-20">
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.98 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, ease }}
          className="bg-sunset relative isolate overflow-hidden rounded-xl px-6 pb-60 pt-16 text-ivory shadow-[var(--shadow-lift)] sm:px-12">
          <div className="relative z-10 flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <h2 className="display text-[40px] leading-none !text-ivory sm:text-[60px]">Have somewhere <span className="italic text-teal-bright">to be?</span></h2>
              <p className="mt-3 text-[16px] text-slate">It takes about a minute to set up a mission.</p>
            </div>
            <Button size="lg" variant="accent" onClick={plan}>Plan a mission <ArrowRight className="size-4" aria-hidden /></Button>
          </div>

          <CityArrival />
        </motion.div>
      </section>
    </>
  );
}
