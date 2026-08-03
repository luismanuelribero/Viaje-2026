/* VIAJE 2026 — service worker v1.0-10
   Estrategia: la página se sirve red-primero (para que las actualizaciones lleguen
   apenas subas una versión nueva) con caída a caché (para que el juego abra sin
   internet: ferry, avión, montaña). Los assets, caché-primero.
   Endurecido: solo mismo origen, solo respuestas OK, con límite de tamaño. */
const CACHE = "viaje2026-v1-0-19";
const CORE = ["./", "./index.html", "./icon-180.png", "./icon-512.png", "./manifest.webmanifest"];
const MAX_ENTRIES = 40;

/* solo guardamos lo que es realmente nuestro y estático */
function cacheable(req, res) {
  if (!res || !res.ok || res.type === "opaque") return false;
  if (res.status !== 200) return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return false;   // nada de terceros
  if (url.search) return false;                             // nada con query
  return /\.(html|css|js|png|svg|webmanifest|woff2?)$/i.test(url.pathname) || url.pathname.endsWith("/");
}

/* evita que la caché crezca sin control */
async function trim(cacheName, max) {
  try {
    const c = await caches.open(cacheName);
    const keys = await c.keys();
    if (keys.length <= max) return;
    for (const k of keys.slice(0, keys.length - max)) {
      if (!CORE.some((p) => k.url.endsWith(p.replace("./", "")))) await c.delete(k);
    }
  } catch (_) {}
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;  // dejamos pasar lo externo

  /* la página: red primero, caché de respaldo */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(req, res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match("./index.html")
            .then((r) => r || caches.match("./"))
            .then((r) => r || new Response(
              "<h1>Sin conexión</h1><p>Abrí el juego una vez con internet para que quede guardado.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            ))
        )
    );
    return;
  }

  /* assets: caché primero, red de respaldo */
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (cacheable(req, res)) {
            const copy = res.clone();
            caches.open(CACHE)
              .then((c) => c.put(req, copy))
              .then(() => trim(CACHE, MAX_ENTRIES))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => new Response("", { status: 504, statusText: "offline" }));
    })
  );
});
