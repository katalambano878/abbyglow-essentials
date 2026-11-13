// AbbyGlow Essentials Service Worker v4.0 — drop cached pages that still show old prompts
const CACHE_VERSION = 'sl-v4.0';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

// Do not pre-cache HTML pages. A saved shop page was still showing removed prompts.
const OFFLINE_URL = '/offline';

// Pages that are useless as a cached shell (they need live data or carry
// personal/payment state) — never stored, never served offline.
const PRIVATE_PAGE_PREFIXES = ['/account', '/checkout', '/pay/', '/order-success', '/order-tracking', '/auth/', '/returns', '/support/'];

// Cache size limits
const DYNAMIC_CACHE_LIMIT = 50;
const IMAGE_CACHE_LIMIT = 100;
const API_CACHE_LIMIT = 30;

// Trim cache to limit
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  }
}

// Install: pre-cache static assets. The offline page is cached on its own so a
// single failing shell URL cannot leave us without an offline fallback.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      await cache.add(OFFLINE_URL).catch((err) => console.warn('[SW] Offline page failed to cache:', err));
    }).then(() => self.skipWaiting())
  );
});

// Install already calls skipWaiting(). This message remains for the update button.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v2.0...');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMAGE_CACHE && key !== API_CACHE)
            .map((key) => {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: smart caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, ws, and other non-http
  if (!url.protocol.startsWith('http')) return;

  // Only same-origin requests and a short list of CDNs are handled; everything
  // else goes straight to the network.
  const sameOrigin = url.origin === self.location.origin;

  // Never touch auth, data APIs, uploads or signed storage: the Cache API matches
  // by URL, so caching these would persist personal/admin data on disk and serve
  // it to the next visitor on this browser.
  if (sameOrigin && (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/storage/v1/object/sign/') ||
    (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/storefront/products') && !url.pathname.startsWith('/api/storefront/categories'))
  )) {
    return;
  }

  // Admin: Network only; on failure show "Admin requires internet" (never generic /offline)
  if (url.pathname.startsWith('/admin') && (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => {
          const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin – Connection required</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;}.box{text-align:center;max-width:24rem;padding:2rem;}h1{font-size:1.5rem;color:#1e293b;margin-bottom:0.5rem;}p{color:#64748b;margin-bottom:1.5rem;}a{display:inline-block;background:#2563eb;color:#fff;padding:0.75rem 1.5rem;border-radius:0.5rem;text-decoration:none;font-weight:600;}a:hover{background:#1d4ed8;}</style></head><body><div class="box"><h1>Connection required</h1><p>Admin needs an internet connection. Check your network and try again.</p><a href="/admin">Try again</a></div></body></html>';
          return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })
    );
    return;
  }
  if (url.pathname.startsWith('/admin')) return;

  // Strategy: Images - stale-while-revalidate (served instantly, refreshed in
  // the background so a re-uploaded product photo shows up on the next view)
  if (
    request.destination === 'image' ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|avif|svg|ico)$/) ||
    (sameOrigin && url.pathname.startsWith('/storage/v1/object/public/')) ||
    (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/'))
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const network = fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
              trimCache(IMAGE_CACHE, IMAGE_CACHE_LIMIT);
            }
            return response;
          });
          if (cached) {
            network.catch(() => { });
            return cached;
          }
          return network.catch(() => {
            // Return a placeholder for failed images
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#f3f4f6" width="200" height="200"/><text fill="#9ca3af" font-family="sans-serif" font-size="14" text-anchor="middle" x="100" y="105">Image unavailable</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          });
        });
      })
    );
    return;
  }

  // Strategy: public catalog API - Network First with cache fallback (short TTL)
  if (sameOrigin && (url.pathname.startsWith('/api/storefront/products') || url.pathname.startsWith('/api/storefront/categories'))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, responseClone);
              trimCache(API_CACHE, API_CACHE_LIMIT);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || new Response(JSON.stringify({ error: 'Offline' }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Strategy: Static assets (JS, CSS, fonts) - Cache First
  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.match(/\.(js|css|woff|woff2|ttf|eot)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Strategy: Pages - Network First with cache fallback (public pages only)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    if (!sameOrigin) return;
    const isPrivatePage = PRIVATE_PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !isPrivatePage && !url.search) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
              trimCache(DYNAMIC_CACHE, DYNAMIC_CACHE_LIMIT);
            });
          }
          return response;
        })
        .catch(() => {
          if (isPrivatePage) return caches.match(OFFLINE_URL);
          return caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL));
        })
    );
    return;
  }

  // Everything else (Next data, manifest, etc.): network only.
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { body: event.data.text() };
  }
  const options = {
    body: data.body || 'New update from AbbyGlow Essentials',
    icon: '/icon-192.png',
    badge: '/favicon.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'AbbyGlow Essentials',
      options
    )
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});

// Periodic background sync (for updates)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-content') {
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.add(OFFLINE_URL).catch(() => { });
      })
    );
  }
});
