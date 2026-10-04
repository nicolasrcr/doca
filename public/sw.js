// Doca offline: guarda uma cópia do que o app já abriu e usa quando a internet cai.
// Estratégia "rede primeiro": com internet, sempre vem a versão nova (um upload novo nunca fica preso no cache).
const CACHE = "doca-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return; // Supabase e outros serviços nunca passam pelo cache
  e.respondWith(
    fetch(r)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(r.mode === "navigate" ? "/" : r, copia));
        }
        return res;
      })
      .catch(() =>
        caches.match(r.mode === "navigate" ? "/" : r).then((m) => m || (r.mode === "navigate" ? caches.match("/index.html") : undefined) || Response.error())
      )
  );
});
