export function defaultOrtWasmPaths(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/ort/`;
  }
  return "/ort/";
}
