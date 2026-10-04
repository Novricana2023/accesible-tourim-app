import { publicAssetUrl } from "./publicAssetUrl";

const CACHE_NAME = "mara-models-v1";

async function openCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") {
    return null;
  }
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/**
 * Loads model bytes through the Cache API when present, then HTTP cache.
 * Does not invent payloads: a missing or failed fetch throws.
 */
export async function fetchModelBytes(url: string): Promise<ArrayBuffer> {
  const resolved =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : publicAssetUrl(url);
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(resolved);
      if (hit?.ok) {
        return hit.arrayBuffer();
      }
    } catch {
      /* continue to network */
    }
  }

  const response = await fetch(resolved);
  if (!response.ok) {
    throw new Error(`Model request failed (${response.status}) for ${resolved}.`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 512) {
    throw new Error(
      `Model file looks too small (${bytes.byteLength} bytes) for ${resolved}. Check deploy includes npm run models.`,
    );
  }
  const path = resolved.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".onnx")) {
    const head = new TextDecoder()
      .decode(bytes.slice(0, Math.min(128, bytes.byteLength)))
      .trimStart()
      .toLowerCase();
    if (head.startsWith("<") || head.includes("<!doctype html")) {
      throw new Error(
        `Model URL returned HTML instead of ONNX for ${resolved}. Redeploy with build:production (npm run models).`,
      );
    }
  }

  if (cache) {
    try {
      await cache.put(resolved, new Response(bytes.slice(0), { headers: response.headers }));
    } catch {
      /* quota or opaque response — still return the body */
    }
  }

  return bytes;
}
