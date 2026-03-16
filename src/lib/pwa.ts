export async function clearPwaCacheAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("_app_reload", Date.now().toString());
    window.location.replace(nextUrl.toString());
  }
}
