import { faceRotation, latLngToXYZ } from "./geo";
import { GLOBE_FOCUS, GLOBE_ROUTES } from "./globeRoutes";

const R = 180;
const ROT = faceRotation(GLOBE_FOCUS.lat, GLOBE_FOCUS.lng);

/** Orthographic projection with the same rotation the 3D globe uses, so the static version shows the same places. */
function project(lat: number, lng: number, lift = 1): [number, number, boolean] {
  const [x0, y0, z0] = latLngToXYZ(lat, lng, lift);
  const x1 = x0 * Math.cos(ROT.y) + z0 * Math.sin(ROT.y);
  const z1 = -x0 * Math.sin(ROT.y) + z0 * Math.cos(ROT.y);
  const y2 = y0 * Math.cos(ROT.x) - z1 * Math.sin(ROT.x);
  const z2 = y0 * Math.sin(ROT.x) + z1 * Math.cos(ROT.x);
  return [x1 * R, -y2 * R, z2 > 0];
}

function graticule(): string[] {
  const paths: string[] = [];
  for (let lat = -60; lat <= 60; lat += 20) {
    const pts: string[] = [];
    for (let lng = -180; lng <= 180; lng += 4) {
      const [x, y, front] = project(lat, lng);
      if (front) pts.push(`${pts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    paths.push(pts.join(" "));
  }
  for (let lng = -180; lng < 180; lng += 20) {
    const pts: string[] = [];
    for (let lat = -88; lat <= 88; lat += 4) {
      const [x, y, front] = project(lat, lng);
      if (front) pts.push(`${pts.length ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    paths.push(pts.join(" "));
  }
  return paths;
}

const GRID = graticule();

function arc(a: { lat: number; lng: number }, b: { lat: number; lng: number }): string {
  const pts: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const lift = 1 + Math.sin(Math.PI * t) * 0.06;
    const [x, y] = project(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t, lift);
    pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

/** Static globe for no-WebGL, reduced data, and while the 3D scene loads. Same framing as the 3D version. */
export function GlobeFallback() {
  return (
    <svg viewBox="-230 -230 460 460" className="size-full" aria-hidden>
      <defs>
        <radialGradient id="gf-sea" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#102c52" />
          <stop offset="100%" stopColor="#050b18" />
        </radialGradient>
        <radialGradient id="gf-halo" r="50%">
          <stop offset="78%" stopColor="#3f9ee8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3f9ee8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r={R * 1.18} fill="url(#gf-halo)" />
      <circle r={R} fill="url(#gf-sea)" stroke="#55f1d1" strokeOpacity="0.35" />
      {GRID.map((d, i) => <path key={i} d={d} fill="none" stroke="#94a3b8" strokeOpacity="0.14" strokeWidth="0.8" />)}
      {GLOBE_ROUTES.map((r) => (
        <path key={r.from.name + r.to.name} d={arc(r.from, r.to)} fill="none" stroke="#55f1d1" strokeOpacity="0.75"
          strokeWidth="1.4" strokeLinecap="round" />
      ))}
      {[...new Map(GLOBE_ROUTES.flatMap((r) => [r.from, r.to]).map((c) => [c.name, c])).values()].map((c) => {
        const [x, y] = project(c.lat, c.lng);
        return <circle key={c.name} cx={x} cy={y} r="2.6" fill="#f8fafc" />;
      })}
    </svg>
  );
}
