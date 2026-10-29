import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "../animations/motion";
import { cx } from "../utils/format";
import { hasWebGL } from "./support";

export interface SceneState {
  /** On screen and the tab is visible — render frames. Off screen the canvas stops drawing entirely. */
  active: boolean;
  reduced: boolean;
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* a lost or refused WebGL context: the static version takes over, nothing else breaks */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useActive<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return [ref, inView && visible];
}

/**
 * Hosts a lazily loaded 3D scene: the static `fallback` shows while three.js downloads, when WebGL is missing,
 * and if the scene throws. Nothing is mounted until the frame first scrolls near the viewport.
 */
export function SceneFrame({ fallback, children, className, label }: {
  fallback: ReactNode; children: (state: SceneState) => ReactNode; className?: string; label?: string;
}) {
  const [ref, active] = useActive<HTMLDivElement>();
  const [seen, setSeen] = useState(false);
  const [supported] = useState(() => typeof window !== "undefined" && hasWebGL());
  const reduced = prefersReducedMotion();
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);

  return (
    <div ref={ref} className={cx("relative", className)} role={label ? "img" : undefined} aria-label={label}>
      {supported && seen ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={fallback}>{children({ active, reduced })}</Suspense>
        </SceneBoundary>
      ) : fallback}
    </div>
  );
}
