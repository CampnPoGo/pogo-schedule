// 포고 일정표 서비스워커 — 페이지는 네트워크 우선(항상 최신), 이미지는 캐시 우선. 오프라인이면 마지막 저장본.
const VERSION = "20261127184231";
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
  const isPage = req.mode === "navigate" || (url.origin === location.origin && (url.pathname.endsWith("/") || url.pathname.endsWith(".html")));
  if (isPage) {
    const key = url.origin + url.pathname;            // 페이지별로 따로 저장 (일정표 / 레이드 방)
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); } return r; })
      .catch(() => caches.match(key).then(h => h || caches.match("./"))));
    return;
  }
  if (url.pathname.endsWith(".json")) { e.respondWith(fetch(req).catch(() => caches.match(req))); return; }
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  })));
});

// ── 푸시 알림: 서버는 빈 push만 보내고, 내용은 /recent에서 가져와 표시 ──
const PUSH_API = "";
async function shownIds() { const c = await caches.open("pogo-push-state"); const r = await c.match("shown"); return r ? r.json() : []; }
async function saveShown(ids) { const c = await caches.open("pogo-push-state"); await c.put("shown", new Response(JSON.stringify(ids.slice(-50)))); }
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let items = [];
    try { items = (await (await fetch(PUSH_API + "/recent", { cache: "no-store" })).json()).items || []; } catch (_) {}
    const shown = await shownIds();
    let topics = null; try { const r = await (await caches.open("pogo-push-state")).match("topics"); if (r) topics = await r.json(); } catch (_) {}
    const fresh = items.filter(i => !shown.includes(i.id) && (!topics || topics.includes(i.topic)));
    if (!fresh.length) {   // 내용을 못 가져와도 알림은 꼭 하나 띄워야 함(브라우저 정책)
      return self.registration.showNotification("포고 일정표", { body: "새 일정 알림이 있어요", icon: "icon-192.png", badge: "icon-192.png", tag: "pogo-generic", data: { url: "./" } });
    }
    for (const i of fresh) await self.registration.showNotification(i.title, { body: i.body, icon: "icon-192.png", badge: "icon-192.png", tag: i.id, data: { url: i.url } });
    await saveShown(shown.concat(fresh.map(i => i.id)));
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope)) { w.navigate(target); return w.focus(); }
    return clients.openWindow(target);
  }));
});
