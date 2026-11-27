// 포고 일정표 서비스워커 — 페이지는 네트워크 우선(항상 최신), 이미지는 캐시 우선. 오프라인이면 마지막 저장본.
const VERSION = "20261127145111";
const CACHE = "pogo-" + VERSION;
const CORE = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("pogo-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "hits.sh") return;                       // 방문자 집계는 캐시 안 함
  const isPage = req.mode === "navigate" || (url.origin === location.origin && url.pathname.endsWith("/"));
  if (isPage) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put("./", cp)); return r; })
      .catch(() => caches.match("./")));
    return;
  }
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  })));
});
