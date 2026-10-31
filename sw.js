// RateBook servis çalışanı: uygulamanın kabuğunu saklar, veriye (Supabase) hiç dokunmaz.
// Sayfa her zaman önce internetten gelir, yenilikler hemen görünür; internet yoksa son kopya açılır.
const CACHE = 'ratebook-shell-v1';
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Sadece kendi sitemizin GET istekleri; Supabase ve CDN istekleri olduğu gibi geçer
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Sayfa açılışı: önce internet, olmazsa saklanan kopya
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return res; })
        .catch(() => caches.match('./').then(r => r || caches.match(req)))
    );
    return;
  }

  // Simgeler ve diğer dosyalar: önce saklanan, arkada yenile
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
