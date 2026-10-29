/**
 * The TripMission Earth — one scene, two roles: the landing hero (illustrative routes, selectable) and the plan
 * page's route preview (the traveller's own places, when we know their coordinates).
 *
 * The surface is a custom shader over a texture drawn from Natural Earth data (land, coastline, borders): a real
 * day/night terminator, a teal coastline that glows on the night side, ocean specular and a fine graticule.
 * Routes are great-circle arcs between real coordinates. Labels are plain DOM over the canvas, positioned per frame.
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, use, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { earthTexture } from "./earthTexture";
import { faceRotation, latLngToXYZ } from "./geo";
import type { GlobeArc, GlobeCity } from "./globeRoutes";
import { isLowPower, maxDpr } from "./support";

const TEAL = new THREE.Color("#55f1d1");
const SUN = new THREE.Vector3(-0.55, 0.42, 0.72).normalize(); // upper left, so the terminator falls across the right limb
const Z = new THREE.Vector3(0, 0, 1);

/* ------------------------------------------------------------------ geometry helpers */

function midpoint(a: GlobeCity, b: GlobeCity): { lat: number; lng: number } {
  const v = new THREE.Vector3(...latLngToXYZ(a.lat, a.lng)).add(new THREE.Vector3(...latLngToXYZ(b.lat, b.lng))).normalize();
  return { lat: Math.asin(v.y) * (180 / Math.PI), lng: Math.atan2(v.z, -v.x) * (180 / Math.PI) - 180 };
}

function arcCurve(a: GlobeCity, b: GlobeCity): { curve: THREE.CatmullRomCurve3; omega: number } {
  const va = new THREE.Vector3(...latLngToXYZ(a.lat, a.lng));
  const vb = new THREE.Vector3(...latLngToXYZ(b.lat, b.lng));
  const omega = Math.max(va.angleTo(vb), 1e-4);
  const lift = 0.012 + omega * 0.28;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const s = Math.sin(omega);
    const p = va.clone().multiplyScalar(Math.sin((1 - t) * omega) / s).add(vb.clone().multiplyScalar(Math.sin(t * omega) / s));
    pts.push(p.multiplyScalar(1.002 + lift * Math.sin(Math.PI * t)));
  }
  return { curve: new THREE.CatmullRomCurve3(pts), omega };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/* ------------------------------------------------------------------ surface */

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const earthFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform vec3 uTeal;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;

  float gridLine(float v, float step) {
    float d = abs(fract(v / step + 0.5) - 0.5) * step;
    return 1.0 - smoothstep(0.0, fwidth(v) * 1.2, d);
  }

  void main() {
    vec3 m = texture2D(uMap, vUv).rgb;
    float land = m.r, coast = m.g, border = m.b;
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewW);
    float ndl = dot(N, uSun);
    float day = smoothstep(-0.18, 0.42, ndl);

    // deep ocean, a touch lighter where the sun is
    vec3 ocean = mix(vec3(0.012, 0.035, 0.075), vec3(0.035, 0.09, 0.17), day);
    // land: atmospheric slate-blue, warmer in daylight
    vec3 ground = mix(vec3(0.035, 0.07, 0.12), vec3(0.19, 0.27, 0.34), day);
    vec3 col = mix(ocean, ground, smoothstep(0.35, 0.65, land));

    // the coastline: a fine teal line, brightest on the night side like an instrument readout
    col += uTeal * coast * mix(0.85, 0.32, day);
    col += vec3(0.62, 0.7, 0.8) * border * mix(0.10, 0.16, day);

    // graticule every 15 degrees — barely there
    float lat = (vUv.y - 0.5) * 180.0;
    float lng = (vUv.x - 0.5) * 360.0;
    float grid = max(gridLine(lat, 15.0), gridLine(lng, 15.0));
    col += vec3(0.45, 0.6, 0.75) * grid * 0.045;

    // sun glint on water
    vec3 H = normalize(uSun + V);
    float spec = pow(max(dot(N, H), 0.0), 110.0) * (1.0 - land) * day;
    col += vec3(0.55, 0.72, 0.9) * spec * 0.3;

    // limb: atmosphere scattering at grazing angles
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += mix(vec3(0.12, 0.32, 0.6), uTeal, 0.35) * fres * (0.25 + 0.5 * day);

    gl_FragColor = vec4(col, 1.0);
  }`;

const haloFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSun;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    float rim = pow(clamp(1.0 - abs(dot(normalize(vNormalW), normalize(vViewW))), 0.0, 1.0), 2.6);
    float lit = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(normalize(vNormalW), uSun));
    gl_FragColor = vec4(uColor * rim * lit, rim * lit);
  }`;

function Surface({ low }: { low: boolean }) {
  const map = use(earthTexture(low));
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: earthVertex, fragmentShader: earthFragment,
    uniforms: { uMap: { value: map }, uSun: { value: SUN }, uTeal: { value: TEAL } },
  }), [map]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh material={material}><sphereGeometry args={[1, low ? 72 : 112, low ? 48 : 80]} /></mesh>;
}

/** The atmosphere: lit on the day side, fading across the terminator. Shown at once, before the surface loads. */
function Halo() {
  const halo = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: earthVertex, fragmentShader: haloFragment,
    uniforms: { uColor: { value: new THREE.Color("#3f9ee8") }, uSun: { value: SUN } },
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }), []);
  useEffect(() => () => halo.dispose(), [halo]);
  return <mesh material={halo} scale={1.085}><sphereGeometry args={[1, 64, 48]} /></mesh>;
}

/** Soft value-noise clouds, wrapped at the antimeridian, drawn once. */
function cloudCanvas(): HTMLCanvasElement {
  const W = 512, H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x: number, y: number, period: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
    const a = hash(x0, yi), b = hash(x1, yi), cc = hash(x0, yi + 1), d = hash(x1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (cc + (d - cc) * u) * v;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0, amp = 0.5;
      for (let o = 0; o < 5; o++) { const f = 6 * 2 ** o; n += noise((x / W) * f, (y / H) * f * 0.5, f) * amp; amp *= 0.5; }
      const a = Math.max(0, Math.min(1, (n - 0.55) / 0.2)) * (1 - Math.abs(y / H - 0.5) * 1.2);
      const k = (y * W + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function Clouds({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(cloudCanvas()); t.colorSpace = THREE.SRGBColorSpace; return t; }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => { if (!reduced && ref.current) ref.current.rotation.y += dt * 0.004; });
  return (
    <mesh ref={ref} scale={1.012}>
      <sphereGeometry args={[1, 64, 48]} />
      <meshLambertMaterial map={tex} transparent opacity={0.11} depthWrite={false} />
    </mesh>
  );
}

/** A sparse, fixed starfield — depth behind the globe, not decoration. */
function Stars({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = 9 + rnd() * 4;
      const s = Math.sqrt(1 - u * u);
      p.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t) - 4], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry}>
      <pointsMaterial color="#c9d6ea" size={0.022} sizeAttenuation transparent opacity={0.55} depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------------------ routes, markers, labels */

const SEGMENTS = 48;
const RADIAL = 6;

export interface LabelSlots {
  cities: RefObject<(HTMLElement | null)[]>;
}

function Routes({ routes, cities, activeIndex, hovered, onCity, onHover, labels, reduced }: {
  routes: GlobeArc[]; cities: GlobeCity[]; activeIndex: number; hovered: number | null;
  onCity?: (name: string) => void; onHover: (i: number | null) => void; labels: LabelSlots; reduced: boolean;
}) {
  const arcs = useMemo(() => routes.map((r) => arcCurve(r.from, r.to)), [routes]);
  const tubes = useMemo(() => arcs.map((a) => new THREE.TubeGeometry(a.curve, SEGMENTS, 0.0028, RADIAL, false)), [arcs]);
  const dim = useMemo(() => new THREE.MeshBasicMaterial({ color: "#55f1d1", transparent: true, opacity: 0.16, toneMapped: false, depthWrite: false }), []);
  const lit = useMemo(() => new THREE.MeshBasicMaterial({ color: "#8ff8e3", toneMapped: false }), []);
  const comet = useMemo(() => new THREE.SphereGeometry(0.0085, 12, 12), []);
  const dot = useMemo(() => new THREE.CircleGeometry(0.0075, 20), []);
  const ring = useMemo(() => new THREE.RingGeometry(0.011, 0.0135, 40), []);
  const hit = useMemo(() => new THREE.SphereGeometry(0.035, 8, 8), []);
  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f2f0e8", toneMapped: false }), []);
  const hitMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);
  const ringMats = useMemo(() => cities.map(() => new THREE.MeshBasicMaterial({ color: "#55f1d1", transparent: true, toneMapped: false, side: THREE.DoubleSide })), [cities]);
  const points = useMemo(() => cities.map((c) => new THREE.Vector3(...latLngToXYZ(c.lat, c.lng, 1.003))), [cities]);
  const group = useRef<THREE.Group>(null);
  const activeTube = useRef<THREE.Mesh>(null);
  const cometRef = useRef<THREE.Mesh>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const drawStart = useRef<number | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const toCam = useMemo(() => new THREE.Vector3(), []);
  const { gl } = useThree();

  useEffect(() => { drawStart.current = null; }, [activeIndex, routes]);
  useEffect(() => () => {
    tubes.forEach((t) => t.dispose());
    ringMats.forEach((m) => m.dispose());
    [dim, lit, comet, dot, ring, hit, dotMat, hitMat].forEach((x) => x.dispose());
  }, [tubes, ringMats, dim, lit, comet, dot, ring, hit, dotMat, hitMat]);

  const route = routes[activeIndex];
  const onRoute = (name: string) => Boolean(route) && (route.from.name === name || route.to.name === name);

  useFrame(({ clock, camera, size }) => {
    const now = clock.elapsedTime;
    if (drawStart.current === null) drawStart.current = now;
    const t = reduced ? 10 : now - drawStart.current;
    const draw = easeInOut(Math.min(1, t / 1.6));
    const tube = activeTube.current;
    if (tube && tubes[activeIndex]) {
      tube.visible = true;
      tube.geometry = tubes[activeIndex];
      tube.geometry.setDrawRange(0, Math.max(1, Math.floor(draw * SEGMENTS)) * RADIAL * 6);
    } else if (tube) tube.visible = false;
    if (cometRef.current) {
      const arc = arcs[activeIndex];
      const travel = (t % 5.5) / 5.5; // one quiet pass along the route, then again
      cometRef.current.visible = Boolean(arc) && !reduced && draw >= 1;
      if (arc) cometRef.current.position.copy(arc.curve.getPointAt(easeInOut(travel)));
    }
    rings.current.forEach((r, i) => {
      if (!r) return;
      const on = onRoute(cities[i].name) || hovered === i;
      const phase = reduced ? 0.4 : (now * 0.55 + i * 0.13) % 1;
      r.scale.setScalar(on ? 1 + phase * 1.4 : 1);
      ringMats[i].opacity = on ? 0.85 * (1 - phase) : 0;
    });
    // labels: plain DOM, placed on their cities; hidden when the city turns away from the camera
    const g = group.current;
    if (!g) return;
    points.forEach((p, i) => {
      const el = labels.cities.current?.[i];
      if (!el) return;
      tmp.copy(p).applyMatrix4(g.matrixWorld);
      const front = toCam.copy(camera.position).sub(tmp).dot(tmp) > 0.08;
      tmp.project(camera);
      const x = ((tmp.x + 1) / 2) * size.width;
      el.style.transform = `translate(${x}px, ${((1 - tmp.y) / 2) * size.height}px)`;
      el.dataset.back = String(!front);
      el.dataset.flip = String(x > size.width - 240); // an annotation near the right edge opens to the left
    });
  });

  const pointer = (i: number | null) => () => {
    onHover(i);
    gl.domElement.style.cursor = i !== null && onCity ? "pointer" : "";
  };

  return (
    <group ref={group}>
      {tubes.map((g, i) => <mesh key={i} geometry={g} material={dim} />)}
      <mesh ref={activeTube} geometry={tubes[0]} material={lit} />
      <mesh ref={cometRef} geometry={comet} material={lit} />
      {cities.map((c, i) => {
        const p = points[i];
        return (
          <group key={c.name} position={p} quaternion={new THREE.Quaternion().setFromUnitVectors(Z, p.clone().normalize())}>
            <mesh geometry={dot} material={dotMat} />
            <mesh ref={(m) => { rings.current[i] = m; }} geometry={ring} material={ringMats[i]} />
            {onCity && (
              <mesh geometry={hit} material={hitMat}
                onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onCity(c.name); }}
                onPointerOver={pointer(i)} onPointerOut={pointer(null)} />
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ rig */

function Rig({ children, focus, distance, progress, reduced, pointerParallax }: {
  children: React.ReactNode; focus: { lat: number; lng: number; dest?: { lat: number; lng: number } };
  distance: number; progress?: RefObject<number>; reduced: boolean; pointerParallax: boolean;
}) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const start = faceRotation(focus.lat, focus.lng);

  useEffect(() => {
    if (reduced || !pointerParallax) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, pointerParallax]);

  useFrame(({ camera, clock }, dt) => {
    const k = reduced ? 1 : 1 - Math.exp(-dt * 1.8); // slow, deliberate easing
    const p = progress?.current ?? 0;
    // scrolling moves the point of interest from the route's middle towards its destination
    const target = focus.dest && p > 0
      ? { lat: focus.lat + (focus.dest.lat - focus.lat) * p, lng: focus.lng + (focus.dest.lng - focus.lng) * p }
      : focus;
    const rot = faceRotation(target.lat, target.lng);
    const drift = reduced ? 0 : Math.sin(clock.elapsedTime * 0.05) * 0.03;
    if (inner.current) {
      const want = rot.y + drift + pointer.current.x * 0.06;
      inner.current.rotation.y += wrap(want - inner.current.rotation.y) * k;
    }
    if (outer.current) {
      const want = rot.x + pointer.current.y * 0.04;
      outer.current.rotation.x += (want - outer.current.rotation.x) * k;
    }
    const z = distance - p * distance * 0.28;
    camera.position.x += (pointer.current.x * 0.08 - camera.position.x) * k;
    camera.position.y += (-pointer.current.y * 0.05 - camera.position.y) * k;
    camera.position.z += (z - camera.position.z) * k;
    camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={outer} rotation={[start.x, 0, 0]}>
      <group ref={inner} rotation={[0, start.y, 0]}>{children}</group>
    </group>
  );
}

/* ------------------------------------------------------------------ public component */

export interface GlobeProps {
  routes: GlobeArc[];
  activeIndex: number;
  /** Extra places to mark (e.g. a single resolved location on the plan page). */
  places?: GlobeCity[];
  /** Clicking a city marker. Omit to make markers non-interactive. */
  onCity?: (name: string) => void;
  active: boolean;
  reduced: boolean;
  progress?: RefObject<number>;
  variant?: "hero" | "preview";
  /** Rich label for the active route's destination — the scene's own annotation. */
  callout?: React.ReactNode;
}

export default function Globe({ routes, activeIndex, places = [], onCity, active, reduced, progress, variant = "hero", callout }: GlobeProps) {
  const [low] = useState(isLowPower);
  const [hovered, setHovered] = useState<number | null>(null);
  const labelRefs = useRef<(HTMLElement | null)[]>([]);
  const cities = useMemo(() => [...new Map([...routes.flatMap((r) => [r.from, r.to]), ...places].map((c) => [c.name, c])).values()], [routes, places]);
  const route = routes[activeIndex];

  const { focus, distance } = useMemo(() => {
    if (route) {
      const mid = midpoint(route.from, route.to);
      const { omega } = arcCurve(route.from, route.to);
      const d = variant === "hero" ? 4.15 : Math.min(3.4, Math.max(2.3, 2.1 + omega * 3));
      return { focus: { ...mid, dest: variant === "hero" ? route.to : undefined }, distance: d };
    }
    const c = cities[0] ?? { lat: 21.5, lng: 79 };
    return { focus: { lat: c.lat, lng: c.lng }, distance: variant === "hero" ? 4.15 : 2.6 };
  }, [route, cities, variant]);

  const preview = variant === "preview";
  return (
    <>
      <Canvas dpr={[1, maxDpr()]} camera={{ position: [0, 0, distance], fov: 34, near: 0.1, far: 40 }}
        frameloop={active ? (reduced ? "demand" : "always") : "never"}
        gl={{ antialias: !low, alpha: true, powerPreference: "high-performance" }} className="!absolute inset-0"
        onPointerMissed={() => setHovered(null)}>
        {!preview && <Stars count={low ? 260 : 520} />}
        <directionalLight position={SUN.clone().multiplyScalar(5)} intensity={1.1} />
        <ambientLight intensity={0.25} />
        <Rig focus={focus} distance={distance} progress={progress} reduced={reduced} pointerParallax={!preview}>
          {/* the surface waits for its geography; routes and markers appear straight away */}
          <Halo />
          <Suspense fallback={<mesh><sphereGeometry args={[1, 48, 32]} /><meshBasicMaterial color="#09172b" /></mesh>}>
            <Surface low={low} />
          </Suspense>
          {!low && !preview && <Clouds reduced={reduced} />}
          <Routes routes={routes} cities={cities} activeIndex={activeIndex} hovered={hovered} onCity={onCity}
            onHover={setHovered} labels={{ cities: labelRefs }} reduced={reduced} />
        </Rig>
      </Canvas>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {cities.map((c, i) => {
          const isDest = route?.to.name === c.name;
          const on = preview || hovered === i || (route ? route.from.name === c.name || isDest : false);
          return (
            <div key={c.name} ref={(el) => { labelRefs.current[i] = el; }} data-on={on}
              className={isDest && callout ? "globe-callout" : "globe-label"}>
              {isDest && callout ? callout : <span>{c.name}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
