const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

/** Reject SPA fallthrough and other non-asset responses that still return HTTP 200. */
export function isLikelyStaticAssetResponse(
  response: Response,
  url: string,
): boolean {
  const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (type && HTML_CONTENT_TYPES.includes(type)) {
    return false;
  }

  const path = url.split("?")[0]?.toLowerCase() ?? "";
  const lengthHeader = response.headers.get("content-length");
  const length = lengthHeader ? Number.parseInt(lengthHeader, 10) : NaN;

  if (path.endsWith(".onnx") && Number.isFinite(length) && length > 0 && length < 4096) {
    return false;
  }
  if (path.endsWith(".task") && Number.isFinite(length) && length > 0 && length < 4096) {
    return false;
  }
  if (path.endsWith(".wasm") && Number.isFinite(length) && length > 0 && length < 1024) {
    return false;
  }

  return response.ok || response.status === 206 || response.status === 416;
}
