/* Service Worker — يجعل اللعبة قابلة للتثبيت وتعمل أوفلاين بعد أول فتح */
const CACHE = "snake2048-v48";
const ASSETS = ["./", "./index.html", "./style.css", "./game.js", "./lang.js", "./particles.js", "./sound.js", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // لا نخزّن مكتبة PeerJS الخارجية (تُجلب عند توفّر الإنترنت)
  if (req.url.includes("peerjs")) return;
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
