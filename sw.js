'use strict';

const CACHE_NAME = 'watercheck-v2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/KkuBulLim.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key.startsWith('watercheck-')).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedThenRefresh(request, navigation = false) {
  const cache = await caches.open(CACHE_NAME);
  const cacheTarget = navigation ? './index.html' : request;
  const cached = await cache.match(cacheTarget, { ignoreSearch: true });
  const refreshRequest = navigation ? new Request('./index.html', { cache: 'no-cache' }) : request;
  const refresh = fetch(refreshRequest).then(response => {
    if (response.ok) cache.put(cacheTarget, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    void refresh;
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(cachedThenRefresh(event.request, true));
    return;
  }
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin) event.respondWith(cachedThenRefresh(event.request));
});
