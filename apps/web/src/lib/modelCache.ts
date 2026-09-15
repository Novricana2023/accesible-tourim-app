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
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit?.ok) {
        return hit.arrayBuffer();
      }
    } catch {
      /* continue to network */
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Model request failed (${response.status}) for ${url}.`);
  }

  if (cache) {
    try {
      await cache.put(url, response.clone());
    } catch {
      /* quota or opaque response — still return the body */
    }
  }

  return response.arrayBuffer();
}
