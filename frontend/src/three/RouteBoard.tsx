/**
 * A tilted "map board" in 3D: real coordinates projected onto a flat board, pins on stems, flight legs as arcs
 * and ground legs as flat lines with dashes flowing in the direction of travel. Shared by the plan-page preview
 * and the results journey overview. The dashes and the travelling dot show direction only — not live position.
 */
import { Grid, Line } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { BOARD_D, BOARD_W, type BoardLayout, type BoardLeg, type BoardStop, type LegKind, type StopKind } from "./boardLayout";
import { maxDpr } from "./support";

type LabelRefs = RefObject<(HTMLDivElement | null)[]>;

const STOP_COLOR: Record<StopKind, string> = {
  origin: "#f8fafc", hub: "#7dd3fc", hotel: "#93c5fd", destination: "#55f1d1", venue: "#55f1d1",
};

function legPoints(a: THREE.Vector3, b: THREE.Vector3, kind: LegKind): THREE.Vector3[] {
  if (kind === "ground") return [a.clone().setY(0.012), b.clone().setY(0.012)];
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = 0.18 + a.distanceTo(b) * 0.32;
  return new THREE.QuadraticBezierCurve3(a.clone().setY(0.02), mid, b.clone().setY(0.02)).getPoints(40);
}

function FlowingLine({ points, kind, reduced }: { points: THREE.Vector3[]; kind: LegKind; reduced: boolean }) {
  const ref = useRef<{ material: { dashOffset: number } } | null>(null);
  useFrame((_, dt) => {
    if (!reduced && ref.current) ref.current.material.dashOffset -= dt * 0.35;
  });
  return (
    <>
      <Line points={points} color={kind === "air" ? "#55f1d1" : "#8292a8"} lineWidth={1} transparent opacity={0.35} />
      <Line ref={ref as never} points={points} color={kind === "air" ? "#8ff8e3" : "#f2f0e8"} lineWidth={2.2} dashed
        dashSize={0.07} gapSize={0.07} />
    </>
  );
}

function Traveller({ path, reduced }: { path: THREE.Vector3[]; reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => (path.length > 1 ? new THREE.CatmullRomCurve3(path, false, "catmullrom", 0) : null), [path]);
  useFrame(({ clock }) => {
    if (!ref.current || !curve) return;
    ref.current.visible = !reduced;
    const t = (clock.elapsedTime / 6) % 1;
    ref.current.position.copy(curve.getPointAt(t));
  });
  if (!curve) return null;
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.035, 16, 16]} />
      <meshBasicMaterial color="#f8fafc" toneMapped={false} />
    </mesh>
  );
}

function Pin({ stop, position, height }: { stop: BoardStop; position: THREE.Vector3; height: number }) {
  const color = STOP_COLOR[stop.kind];
  const big = stop.kind === "venue" || stop.kind === "origin";
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current || stop.kind !== "venue") return;
    const p = (clock.elapsedTime * 0.6) % 1;
    ring.current.scale.setScalar(1 + p * 1.8);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - p);
  });
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <circleGeometry args={[big ? 0.07 : 0.05, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} toneMapped={false} />
      </mesh>
      {stop.kind === "venue" && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
          <ringGeometry args={[0.07, 0.085, 40]} />
          <meshBasicMaterial color={color} transparent toneMapped={false} />
        </mesh>
      )}
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, height, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh position={[0, height, 0]}>
        <sphereGeometry args={[big ? 0.045 : 0.034, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function Rig({ reduced }: { reduced: boolean }) {
  useFrame(({ camera, pointer }, dt) => {
    const k = 1 - Math.exp(-dt * 2.5);
    const tx = reduced ? 0 : pointer.x * 0.35;
    const ty = reduced ? 3.1 : 3.1 + pointer.y * 0.18;
    camera.position.x += (tx - camera.position.x) * k;
    camera.position.y += (ty - camera.position.y) * k;
    camera.lookAt(0, 0, -0.25);
  });
  return null;
}

/**
 * Keeps the DOM labels over the canvas on their pins (plain elements, positioned once per frame). Labels of places
 * a few km apart would sit on top of each other at country scale, so a label that overlaps one already placed is
 * lifted until it clears it; the pin's stem still marks the exact spot.
 */
function LabelTracker({ anchors, labels }: { anchors: THREE.Vector3[]; labels: LabelRefs }) {
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    anchors.forEach((a, i) => {
      const el = labels.current?.[i];
      if (!el) return;
      tmp.copy(a).project(camera);
      const x = ((tmp.x + 1) / 2) * size.width;
      let y = ((1 - tmp.y) / 2) * size.height;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      for (let guard = 0; guard < placed.length + 1; guard++) {
        const hit = placed.find((p) => x - w / 2 < p.r && x + w / 2 > p.l && y - h < p.b && y > p.t);
        if (!hit) break;
        y = hit.t - 2;
      }
      placed.push({ l: x - w / 2, r: x + w / 2, t: y - h, b: y });
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  });
  return null;
}

function Board({ stops, legs, layout, reduced, labels }: {
  stops: BoardStop[]; legs: BoardLeg[]; layout: BoardLayout; reduced: boolean; labels: LabelRefs;
}) {
  const positions = useMemo(() => layout.positions.map((p) => new THREE.Vector3(p.x, 0, p.z)), [layout]);
  const legLines = useMemo(() => legs.map((l) => ({ ...l, points: legPoints(positions[l.from], positions[l.to], l.kind) })),
    [legs, positions]);
  const path = useMemo(() => legLines.flatMap((l, i) => (i === 0 ? l.points : l.points.slice(1))), [legLines]);
  // staggered stems, so labels of nearby places stack instead of overlapping
  const heights = stops.map((_, i) => 0.2 + (i % 3) * 0.14);
  const anchors = useMemo(() => positions.map((p, i) => p.clone().setY(0.2 + (i % 3) * 0.14 + 0.06)), [positions]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <planeGeometry args={[BOARD_W + 0.6, BOARD_D + 0.6]} />
        <meshStandardMaterial color="#09172b" roughness={0.95} />
      </mesh>
      <Grid args={[BOARD_W + 0.6, BOARD_D + 0.6]} cellSize={layout.cellSize / 2} sectionSize={layout.cellSize}
        cellColor="#102c52" sectionColor="#1d4a7a" cellThickness={0.6} sectionThickness={1} fadeDistance={9} fadeStrength={1.2}
        position={[0, 0.001, 0]} />
      {legLines.map((l, i) => <FlowingLine key={i} points={l.points} kind={l.kind} reduced={reduced} />)}
      <Traveller path={path} reduced={reduced} />
      {stops.map((s, i) => <Pin key={s.id} stop={s} position={positions[i]} height={heights[i]} />)}
      <LabelTracker anchors={anchors} labels={labels} />
    </>
  );
}

export function RouteBoardCanvas({ stops, legs, layout, active, reduced }: {
  stops: BoardStop[]; legs: BoardLeg[]; layout: BoardLayout; active: boolean; reduced: boolean;
}) {
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  return (
    <>
      <Canvas dpr={[1, maxDpr()]} camera={{ position: [0, 3.1, 3.2], fov: 34, near: 0.1, far: 30 }}
        frameloop={active ? (reduced ? "demand" : "always") : "never"} gl={{ antialias: true, alpha: true }}
        className="!absolute inset-0">
        <fog attach="fog" args={["#050b18", 5.5, 10]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[-2, 4, 3]} intensity={1.1} />
        <Board stops={stops} legs={legs} layout={layout} reduced={reduced} labels={labels} />
        <Rig reduced={reduced} />
      </Canvas>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {stops.map((s, i) => (
          <div key={s.id} ref={(el) => { labels.current[i] = el; }} className="board-label" data-kind={s.kind}>
            <span className="board-label-name">{s.label}</span>
            {s.sub && <span className="board-label-sub">{s.sub}</span>}
          </div>
        ))}
      </div>
    </>
  );
}

export default RouteBoardCanvas;
