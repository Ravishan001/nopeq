// NopeQ service worker: shows push notifications for owners
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = { title: "NopeQ", body: "", url: "/dashboard" };
  try { d = { ...d, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    tag: d.tag,
    renotify: !!d.tag,
    icon: d.icon || "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    timestamp: Date.now(),
    vibrate: [80, 40, 80],
    data: { url: d.url },
    actions: d.actionLabel ? [{ action: "open", title: d.actionLabel }] : [],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if (c.url.startsWith(self.location.origin)) { await c.focus(); return c.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
