const CACHE_VERSION = "xiaobai-amax-pwa-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const MAX_RUNTIME_ENTRIES = 100;
const appBaseUrl = new URL("./", self.location.href);
const appShellUrl = appBaseUrl.href;

function isCacheableAsset(url) {
  return (
    url.pathname.includes("/assets/")
    || url.pathname.includes("/exercises-dataset/")
    || /\.(?:css|js|json|svg|png|jpe?g|gif|webp|woff2?)$/i.test(url.pathname)
  );
}

async function limitRuntimeCache(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(keys.length - MAX_RUNTIME_ENTRIES, 0)).map((key) => cache.delete(key)));
}

async function cacheResponse(cacheName, request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  if (cacheName === RUNTIME_CACHE) await limitRuntimeCache(cache);
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.add(new Request(appShellUrl, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("xiaobai-amax-pwa-") && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse(APP_SHELL_CACHE, appShellUrl, response))
        .catch(async () => (await caches.match(request)) || (await caches.match(appShellUrl))),
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => cacheResponse(RUNTIME_CACHE, request, response));
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    }),
  );
});
