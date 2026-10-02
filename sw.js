/* ================= OFFLINE OPERATION =================
   Service worker: stores all files of the control window and the display
   window on the first visit and serves them from there, so both keep
   working without an internet connection (also after a reload).

   The cache is named after APP_VERSION (js/datafile.js). A new version
   changes that file, the browser then installs this worker again, which
   stores the new files and removes the old ones.
   Only works when the pages come from a web server (https:// or
   localhost), not when index.html is opened as a file. */
importScripts("js/datafile.js");

const CACHE = `vm-${APP_VERSION}`;
const FILES = [
  "./",
  "index.html",
  "display.html",
  "css/control.css",
  "css/display.css",
  "js/datafile.js",
  "js/startlist-csv.js",
  "js/control.js",
  "js/display.js",
  "js/offline.js",
  "img/logo.jpg",
  "data/sample.json",
];
// files that may change without a new program version: fetched fresh when
// online, the stored copy is only used offline
const NETWORK_FIRST = ["data/sample.json"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES.map(file => new Request(file, { cache: "reload" }))))
      .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("vm-") && key != CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  let request = event.request;
  if (request.method != "GET" || new URL(request.url).origin != location.origin)
    return;
  let networkFirst = NETWORK_FIRST.some(file => request.url.endsWith(file));
  event.respondWith(networkFirst ? fromNetwork(request) : fromCache(request));
});

async function fromCache(request) {
  let cached = await caches.match(request, { ignoreSearch: true });
  return cached ?? fetch(request);
}
async function fromNetwork(request) {
  try {
    let response = await fetch(request);
    if (response.ok)
      (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch (e) {
    let cached = await caches.match(request, { ignoreSearch: true });
    if (cached)
      return cached;
    throw e;
  }
}
