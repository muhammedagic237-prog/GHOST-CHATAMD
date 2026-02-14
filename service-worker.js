const CACHE_NAME = 'ghost-chat-v3';
const ASSETS = [
    './',
    './index.html',
    './style.css?v=3.0',
    './script.js?v=3.0',
    './firebase-config.js',
    './manifest.json'
];

// Install: Cache Files
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force update immediately
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
    );
});

// Activate: Clear Old Caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Take control of uncontrolled clients
});

// Fetch: Network First, then Cache (Better for active dev)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
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
