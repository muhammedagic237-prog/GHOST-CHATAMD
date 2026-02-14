/* Service Worker for Offline Caching & Notifications */
const CACHE_NAME = 'ghost-chat-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './firebase-config.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});

// Push Notification Handler (Placeholder)
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.text() : 'Encrypted Message';
    event.waitUntil(
        self.registration.showNotification('GHOST CHAT', {
            body: data,
            icon: 'icon-192.png',
            badge: 'icon-192.png'
        })
    );
});
