import { publicAssetUrl } from "./publicAssetUrl";

export function defaultOrtWasmPaths(): string {
  const base = publicAssetUrl("ort/");
  return base.endsWith("/") ? base : `${base}/`;
}
