const CACHE_NAME = 'laiwo-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

// 安装时缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 网络优先策略
self.addEventListener('fetch', (event) => {
  // API 请求不缓存
  if (event.request.url.includes('/functions/') || 
      event.request.url.includes('/__qoder_auth/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 克隆并缓存成功的响应
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败时从缓存读取
        return caches.match(event.request);
      })
  );
});
