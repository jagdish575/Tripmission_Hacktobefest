/** Pure layout maths for RouteBoard — kept out of the lazily loaded three.js chunk so pages can show the readouts. */
import type { GeoPoint } from "../types/api";
import { haversineKm, projectToBoard, separate, type Projected } from "./geo";

export type StopKind = "origin" | "hub" | "hotel" | "venue" | "destination";
export type LegKind = "air" | "ground";

export interface BoardStop { id: string; label: string; sub?: string; point: GeoPoint; kind: StopKind }
export interface BoardLeg { from: number; to: number; kind: LegKind }

export const BOARD_W = 4.4;
export const BOARD_D = 2.8;

export interface BoardLayout {
  positions: Projected[];
  /** Places that would sit on top of each other were nudged apart to stay readable. */
  spread: boolean;
  /** The board was turned so the journey runs left to right (distances and angles between places are unchanged). */
  turned: boolean;
  /** km represented by one grid square, or null with fewer than two places. */
  cellKm: number | null;
  cellSize: number;
}

/** A round number of km for one grid square, given how many km one board unit represents. */
function niceKm(kmPerUnit: number): number {
  const raw = kmPerUnit * 0.5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

/**
 * Turns projected positions so the line from the first to the last stop runs along +x: the board is wide and the
 * camera looks along it, so a north–south trip would otherwise collapse into one foreshortened line.
 */
function turnLeftToRight(flat: Projected[]): boolean {
  if (flat.length < 2) return false;
  const a = flat[0];
  const b = flat[flat.length - 1];
  const angle = Math.atan2(b.z - a.z, b.x - a.x);
  if (Math.abs(angle) < 0.2) return false;
  const [c, s] = [Math.cos(-angle), Math.sin(-angle)];
  for (let i = 0; i < flat.length; i++) flat[i] = { x: flat[i].x * c - flat[i].z * s, z: flat[i].x * s + flat[i].z * c };
  // re-fit into the board after turning
  const xs = flat.map((p) => p.x);
  const zs = flat.map((p) => p.z);
  const [cx, cz] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const k = Math.min(BOARD_W * 0.64 / Math.max(Math.max(...xs) - Math.min(...xs), 1e-6),
    BOARD_D * 0.64 / Math.max(Math.max(...zs) - Math.min(...zs), 1e-6));
  for (let i = 0; i < flat.length; i++) flat[i] = { x: (flat[i].x - cx) * k, z: (flat[i].z - cz) * k };
  return true;
}

export function layoutBoard(stops: BoardStop[]): BoardLayout {
  const flat = projectToBoard(stops.map((s) => s.point), BOARD_W, BOARD_D);
  const turned = turnLeftToRight(flat);
  let kmPerUnit: number | null = null;
  let best = 0;
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const d = Math.hypot(flat[j].x - flat[i].x, flat[j].z - flat[i].z);
      if (d > best) {
        best = d;
        kmPerUnit = haversineKm(stops[i].point, stops[j].point) / d;
      }
    }
  }
  const spread = separate(flat, 0.28);
  const cellKm = kmPerUnit && best > 0.05 ? niceKm(kmPerUnit) : null;
  return { positions: flat, spread, turned, cellKm, cellSize: cellKm && kmPerUnit ? cellKm / kmPerUnit : 0.25 };
}
