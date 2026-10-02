/* ================= OFFLINE OPERATION =================
   Registers the service worker (sw.js) that keeps all files available
   without an internet connection. Pages opened as a file (file://) work
   offline anyway; service workers are not available there. */
const offlineReady = (async () => {
  if (!("serviceWorker" in navigator) || location.protocol == "file:")
    return false;
  try {
    await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    return true;
  } catch (e) {
    console.warn("Offline-Betrieb nicht verfügbar:", e);
    return false;
  }
})();
