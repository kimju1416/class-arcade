// 슈퍼스타 카트 서비스 워커 — 그림·소리·three 라이브러리는 기기에 저장해 두고(cache-first),
// 게임 코드(html/js/css)는 늘 서버에서 먼저 받는다(network-first, 끊기면 저장본).
// 그림·소리를 바꾸면 VERSION을 올린다.
const VERSION = 'kart-media-2';
const MEDIA = /\/(kart\/(tex|chars|audio|items)\/|fps\/three\.(core|module)\.js|fps\/addons\/)/;
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION && k.startsWith('kart-')) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (MEDIA.test(u.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    })());
  } else if (u.pathname.startsWith('/kart/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
