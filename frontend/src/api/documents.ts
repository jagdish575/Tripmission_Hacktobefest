import type { ScanResult } from "../types/api";
import { request } from "./client";

/** Read an admit card / interview letter / appointment slip (Cloudinary OCR) into mission fields. */
export function scanDocument(file: File): Promise<ScanResult> {
  const body = new FormData();
  body.append("file", file);
  return request<ScanResult>("/documents/scan", { method: "POST", body });
}
