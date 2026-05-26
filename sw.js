const CACHE='citystyle-premium-v13';
const ASSETS=['./','./index.html','./assets/css/style.css','./assets/js/script.js','./manifest.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{})));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
