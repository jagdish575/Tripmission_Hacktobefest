import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import { useEffect } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { pageTransition } from "../animations/motion";
import { Footer } from "../components/layout/Footer";
import { Navbar } from "../components/layout/Navbar";

export function AppLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <motion.div aria-hidden style={{ scaleX: progress }}
        className="bg-brand fixed inset-x-0 top-0 z-50 h-[3px] origin-left" />
      <Navbar />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="main"
          key={location.pathname}
          variants={pageTransition}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex-1"
        >
          {outlet}
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
