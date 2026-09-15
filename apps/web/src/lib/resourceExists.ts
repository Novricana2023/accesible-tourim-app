async function existsInCaches(url: string): Promise<boolean> {
  if (typeof caches === "undefined") {
    return false;
  }
  try {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const hit = await cache.match(url);
      if (hit?.ok) {
        return true;
      }
    }
  } catch {
    /* network-only check below */
  }
  return false;
}

/** Fetch from network when online; otherwise return a matching cache entry if present. */
export async function fetchCachedFirst(url: string): Promise<Response | null> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
  } catch {
    /* fall through to caches */
  }
  if (typeof caches === "undefined") {
    return null;
  }
  try {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const hit = await cache.match(url);
      if (hit?.ok) {
        return hit;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Existence check that avoids downloading large model files.
 * Checks Cache API (app model cache + service worker caches) first when offline.
 * Prefers HEAD, then a 1-byte Range GET, then a GET whose body is cancelled
 * as soon as headers arrive.
 */
export async function resourceExists(url: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    if (await existsInCaches(url)) {
      return true;
    }
  }

  try {    const head = await fetch(url, { method: "HEAD" });
    if (head.ok) {
      return true;
    }
  } catch {
    /* try a ranged GET */
  }

  try {
    const ranged = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
    await ranged.body?.cancel().catch(() => undefined);
    if (ranged.ok || ranged.status === 206) {
      return true;
    }
    if (ranged.status === 416) {
      return true;
    }
  } catch {
    /* try a cancelled GET */
  }

  try {
    const get = await fetch(url, { method: "GET" });
    await get.body?.cancel().catch(() => undefined);
    return get.ok;
  } catch {
    return false;
  }
}
