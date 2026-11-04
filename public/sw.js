// Artha service worker — lets the installed app open without internet.
// Pages: open instantly from the saved copy, and refresh that copy in the background
// (network is only waited on the very first visit to a page).
// Build assets (/_next/static, icons): cache first — their names change on every deploy.
// Supabase / other origins are never cached (your data sync always goes to the network).
const CACHE = "artha-v4"; // bump to refresh cached icons/pages
const SHELL = ["/", "/transactions", "/plan", "/lending", "/settings", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // In-app page switches (tapping the bottom bar) fetch a small "page data" file.
  // Serve the saved copy instantly and refresh it in the background, so a slow
  // mobile connection never makes a tab switch wait. (All Artha pages are static.)
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    const prefetch = req.headers.get("Next-Router-Prefetch") === "1";
    const key = new Request(`${url.origin}/__rsc${prefetch ? "-prefetch" : ""}${url.pathname}`);
    const network = fetch(req)
      .then((res) => {
        if (res.ok && (res.headers.get("content-type") || "").includes("text/x-component")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => null);
    event.respondWith(
      caches.match(key).then((hit) => {
        if (hit) {
          event.waitUntil(network);
          return hit;
        }
        return network.then((res) => res || Response.error());
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    const key = url.pathname;
    const network = fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => null);
    event.respondWith(
      caches.match(key).then((hit) => {
        if (hit) {
          event.waitUntil(network); // refresh in the background
          return hit;
        }
        return network.then((res) => res || caches.match("/") || Response.error());
      })
    );
  }
});
