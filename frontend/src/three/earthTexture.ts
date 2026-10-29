/**
 * The Earth's surface texture, drawn at runtime from Natural Earth data (world-atlas) — nothing downloaded beyond the
 * vector data, and every mark on it is real geography:
 *   R = land, G = coastline, B = country borders.
 * The globe shader turns these channels into ocean, land, a fine coastline and faint borders.
 */
import * as THREE from "three";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

type Ring = number[][];

async function loadTopology(low: boolean) {
  const [landMod, countriesMod] = await Promise.all([
    low ? import("world-atlas/land-110m.json") : import("world-atlas/land-50m.json"),
    import("world-atlas/countries-110m.json"),
  ]);
  return {
    land: landMod.default as unknown as Topology<{ land: GeometryCollection }>,
    countries: countriesMod.default as unknown as Topology<{ countries: GeometryCollection }>,
  };
}

function trace(ctx: CanvasRenderingContext2D, rings: Ring[], w: number, h: number) {
  for (const ring of rings) {
    ring.forEach(([lng, lat], i) => {
      const x = ((lng + 180) / 360) * w;
      const y = ((90 - lat) / 180) * h;
      // a segment that jumps across the antimeridian would streak across the map: lift the pen instead
      if (i === 0 || Math.abs(lng - ring[i - 1][0]) > 180) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
  }
}

function ringsOf(geometry: GeoJSON.Geometry | null): Ring[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates as Ring[]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Ring[][];
  return [];
}

function linesOf(geometry: GeoJSON.Geometry): Ring[] {
  if (geometry.type === "LineString") return [geometry.coordinates as Ring];
  if (geometry.type === "MultiLineString") return geometry.coordinates as Ring[];
  return [];
}

function draw(width: number, data: Awaited<ReturnType<typeof loadTopology>>): HTMLCanvasElement {
  const w = width;
  const h = width / 2;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const polys = feature(data.land, data.land.objects.land).features.flatMap((f) => ringsOf(f.geometry));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  // each layer is drawn in its own channel and added on top — no pixel read-back needed
  ctx.globalCompositeOperation = "lighter";

  ctx.fillStyle = "#ff0000"; // R: land
  ctx.beginPath();
  for (const p of polys) trace(ctx, p, w, h);
  ctx.fill("evenodd");

  ctx.strokeStyle = "#00ff00"; // G: coastline
  ctx.lineWidth = Math.max(1, w / 1400);
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const p of polys) trace(ctx, p, w, h);
  ctx.stroke();

  ctx.strokeStyle = "#0000ff"; // B: country borders
  ctx.lineWidth = Math.max(0.6, w / 2600);
  ctx.beginPath();
  trace(ctx, linesOf(mesh(data.countries, data.countries.objects.countries, (a, b) => a !== b)), w, h);
  ctx.stroke();
  return canvas;
}

const cache = new Map<string, Promise<THREE.CanvasTexture>>();

/** One texture per quality level, shared by every globe on the page. */
export function earthTexture(low: boolean): Promise<THREE.CanvasTexture> {
  const key = low ? "low" : "high";
  let p = cache.get(key);
  if (!p) {
    p = loadTopology(low).then((data) => {
      const tex = new THREE.CanvasTexture(draw(low ? 2048 : 3072, data));
      tex.anisotropy = 4;
      tex.colorSpace = THREE.NoColorSpace; // data channels, not colours
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      return tex;
    });
    cache.set(key, p);
  }
  return p;
}
