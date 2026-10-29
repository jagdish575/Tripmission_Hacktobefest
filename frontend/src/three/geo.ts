import type { GeoPoint } from "../types/api";

const RAD = Math.PI / 180;

/** Point on a sphere of radius `r` (three.js axes: +y north, India faces +z after `faceRotation`). */
export function latLngToXYZ(lat: number, lng: number, r = 1): [number, number, number] {
  const phi = (90 - lat) * RAD;
  const theta = (lng + 180) * RAD;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

/** Rotations (x for the outer group, y for the inner one) that bring `lat,lng` to face a camera on +z. */
export function faceRotation(lat: number, lng: number): { x: number; y: number } {
  const [px, py, pz] = latLngToXYZ(lat, lng);
  const y = Math.atan2(-px, pz);
  const zAfter = -px * Math.sin(y) + pz * Math.cos(y);
  return { x: Math.atan2(py, zAfter), y };
}

/** Great-circle distance in km. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Projected { x: number; z: number }

/**
 * Fits real coordinates onto a flat board (equirectangular, longitudes scaled by cos(mid-latitude) so shapes and
 * relative distances stay true). Returns board positions in [-w/2, w/2] × [-d/2, d/2]; north is -z.
 */
export function projectToBoard(points: GeoPoint[], width: number, depth: number, margin = 0.18): Projected[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ x: 0, z: 0 }];
  const midLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos(midLat * RAD);
  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const usable = Math.min(width * (1 - margin * 2) / Math.max(maxX - minX, 1e-6),
    depth * (1 - margin * 2) / Math.max(maxY - minY, 1e-6));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((_, i) => ({ x: (xs[i] - cx) * usable, z: -(ys[i] - cy) * usable }));
}

/**
 * Nudges points that land on top of each other (a hotel 2 km from a venue on a 900 km board) apart, so each pin
 * stays visible. Returns whether anything moved, so the caption can say positions near the venue are spread out.
 */
export function separate(points: Projected[], minGap: number): boolean {
  let moved = false;
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dz = points[j].z - points[i].z;
        const d = Math.hypot(dx, dz);
        if (d >= minGap) continue;
        moved = true;
        const [ux, uz] = d < 1e-6 ? [Math.cos(j * 2.4), Math.sin(j * 2.4)] : [dx / d, dz / d];
        const push = (minGap - d) / 2;
        points[i] = { x: points[i].x - ux * push, z: points[i].z - uz * push };
        points[j] = { x: points[j].x + ux * push, z: points[j].z + uz * push };
      }
    }
  }
  return moved;
}

export function formatCoord(p: GeoPoint): string {
  return `${Math.abs(p.lat).toFixed(2)}°${p.lat >= 0 ? "N" : "S"} ${Math.abs(p.lng).toFixed(2)}°${p.lng >= 0 ? "E" : "W"}`;
}
