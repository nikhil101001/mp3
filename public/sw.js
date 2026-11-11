// Service worker: makes the app open and navigate with no connection.
//
// The music itself is not handled here. Imported songs live in the app's own
// storage and Audius streams always need the network. This only keeps the
// app's pages, code and icons available offline.
//
// Bump VERSION to throw away everything cached by older versions.

const VERSION = "v1";
const PAGES = `mp3-pages-${VERSION}`; // HTML for each screen
const DATA = `mp3-data-${VERSION}`; // Next.js route data (RSC payloads)
const STATIC = `mp3-static-${VERSION}`; // hashed JS, CSS, fonts, icons

const ROUTES = [
  "/",
  "/albums",
  "/album",
  "/artists",
  "/artist",
  "/playlists",
  "/playlist",
  "/search",
  "/settings",
];
const ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];
const NAVIGATION_TIMEOUT_MS = 4000;

// On install, save every screen and the code each one needs, so screens that
// were never opened still work offline.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const assets = await caches.open(STATIC);
      const needed = new Set(ASSETS);
      await Promise.all(
        ROUTES.map(async (route) => {
          const response = await fetch(route, { cache: "no-cache" });
          if (!response.ok) return;
          const html = await response.clone().text();
          for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) {
            needed.add(match[0]);
          }
          await pages.put(route, response);
        }),
      );
      await Promise.all(
        [...needed].map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) await assets.put(url, response);
          } catch {
            // One missing file should not block the install.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, DATA, STATIC]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("mp3-") && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Network first; fall back to the cache when offline or too slow. */
async function networkFirst(request, cacheName, fallback, timeoutMs) {
  const cache = await caches.open(cacheName);
  const fromNetwork = fetch(request).then((response) => {
    if (response.ok) void cache.put(request, response.clone());
    return response;
  });
  try {
    if (!timeoutMs) return await fromNetwork;
    const cached = await fallback(cache);
    if (!cached) return await fromNetwork;
    // With a saved copy in hand, don't keep the listener waiting on a
    // connection that is technically up but going nowhere.
    return await Promise.race([
      fromNetwork,
      new Promise((resolve) => setTimeout(() => resolve(cached), timeoutMs)),
    ]);
  } catch (error) {
    const cached = await fallback(cache);
    if (cached) return cached;
    throw error;
  } finally {
    fromNetwork.catch(() => {});
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Audius, covers and streams are left to the browser.
  if (url.origin !== self.location.origin) return;
  // Test tracks and anything range-requested must not go through a cache.
  if (request.headers.has("range") || url.pathname.startsWith("/spike/")) return;

  // Hashed build files never change, so a saved copy is always right.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  // Opening or reloading a screen. Detail screens such as /album?id=… share
  // one saved page, because the page reads the id itself.
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(
        request,
        PAGES,
        async (cache) =>
          (await cache.match(request)) ??
          (await cache.match(url.pathname)) ??
          (await cache.match("/")),
        NAVIGATION_TIMEOUT_MS,
      ),
    );
    return;
  }

  // Route data that Next.js fetches when moving between screens.
  if (request.headers.has("rsc") || url.searchParams.has("_rsc")) {
    event.respondWith(
      networkFirst(request, DATA, (cache) => cache.match(request)),
    );
    return;
  }

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      networkFirst(request, STATIC, (cache) => cache.match(request)),
    );
  }
});
