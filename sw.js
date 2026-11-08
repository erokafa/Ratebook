// RateBook servis çalışanı: uygulamanın kabuğunu ve kütüphaneleri saklar, veriye (Supabase) hiç dokunmaz.
// Sayfa saklanan kopyadan anında açılır; internet hızlıysa (1,5 sn içinde) güncel sürüm gelir.
const CACHE = 'ratebook-shell-v3';
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
// Sadece bu iki kütüphane saklanır (Tailwind ve Supabase istemcisi); diğer her şey olduğu gibi geçer
const LIBS = ['https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@'];

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
  if (req.method !== 'GET') return;

  // Kütüphaneler: önce saklanan, arkada yenile (her açılışta internetten beklemesin)
  if (LIBS.some(l => req.url.startsWith(l))) {
    e.respondWith(
      caches.open(CACHE).then(cache => cache.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      }))
    );
    return;
  }

  // Geri kalan dış istekler (Supabase vb.) olduğu gibi geçer
  if (url.origin !== self.location.origin) return;

  // Sayfa açılışı: saklanan kopya varsa en fazla 1,5 sn internet beklenir, yoksa kopya açılır
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match('./');
      const net = fetch(req).then(res => { if (res.ok) cache.put('./', res.clone()); return res; });
      if (!hit) return net.catch(() => Response.error());
      return Promise.race([net.catch(() => hit), new Promise(r => setTimeout(() => r(hit), 1500))]);
    })());
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

// ---- Bildirimler (Web Push) ----
// Gelen bildirimde mesaj metni yoktur; sadece sunucunun gönderdiği kısa uyarı gösterilir.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil((async () => {
    // Site şu an ekranda açıksa bildirim gösterme (uygulama kendi sayacını zaten gösterir)
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible')) return;
    await self.registration.showNotification(String(d.title || 'RateBook').slice(0, 80), {
      body: String(d.body || 'Yeni mesajın var').slice(0, 160),
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: String(d.tag || 'chat'),
      renotify: true
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) {
      const w = wins[0];
      await w.focus();
      w.postMessage({ type: 'open-chat' });
    } else {
      await self.clients.openWindow('./#chat');
    }
  })());
});