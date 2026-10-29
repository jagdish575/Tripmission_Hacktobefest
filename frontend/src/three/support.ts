/** Capability checks shared by every 3D scene. Each scene has a static fallback, so these only decide which one shows. */

let webgl: boolean | null = null;

export function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webgl = Boolean(ctx);
    (ctx as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Phones, low-memory machines and Data Saver get fewer dots, no clouds and a lower pixel ratio. */
export function isLowPower(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return Boolean(nav.connection?.saveData)
    || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4)
    || (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4)
    || window.matchMedia?.("(max-width: 640px)").matches === true;
}

export function maxDpr(): number {
  return isLowPower() ? 1.25 : 1.75;
}
