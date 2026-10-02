/* ================= DISPLAY WINDOW =================
   Shows what the control window (index.html) sends. It keeps no state of
   its own, so it can be closed and reopened at any time. */
let lanes = 0;
let control = window.opener;

function init() {
  window.addEventListener("message", receive);
  document.addEventListener("keydown", handleKey);
  document.addEventListener("click", enterFullscreen);
  document.addEventListener("fullscreenchange", () => { updateWakeLock(); sendStatus(); });
  document.addEventListener("visibilitychange", updateWakeLock);
  document.addEventListener("mousemove", showCursor);
  window.addEventListener("resize", fitAllText);
  if (!control) {
    document.getElementById("waitingText").textContent =
      "Diese Anzeige wird über die Regie (index.html) geöffnet und gesteuert.";
    return;
  }
  // Say hello regularly: the control window uses it to show the connection
  // status, and finds this window again after it has been reloaded itself.
  sendStatus();
  setInterval(sendStatus, 1000);
  showCursor();
}

/* ================= MESSAGES =================  */
function send(message) {
  if (control && !control.closed)
    control.postMessage({ app: "vm", ...message }, "*");
}
let reported = false;
function sendStatus(error) {
  send({
    type: "status",
    first: !reported, // freshly (re)loaded: the control window sends what to show
    version: APP_VERSION,
    fullscreen: !!document.fullscreenElement,
    wakeLock: wakeLock ? "active" : wakeLockProblem ?? "off",
    error,
  });
  reported = true;
}
function receive(event) {
  let message = event.data;
  if (event.source !== control || message?.app != "vm" || message.type != "state")
    return;
  if (message.version != APP_VERSION && reloadForUpdate(message.version))
    return;
  show(message);
}
// This window stays open while the control window is reloaded, e.g. after
// a program update, and would keep running the old program. It reloads
// itself once to pick up the version of the control window. If that does
// not help (e.g. old files from the browser cache), it keeps running and
// the control window shows a warning.
function reloadForUpdate(version) {
  let key = "vm-reloaded-for-version";
  try {
    if (sessionStorage.getItem(key) == version)
      return false;
    sessionStorage.setItem(key, version);
  } catch (e) {
    return false; // without storage a reload could repeat endlessly
  }
  location.reload();
  return true;
}

/* ================= RENDERING =================  */
function show(state) {
  document.title = `Anzeige – ${state.event}`;
  document.getElementById("welcomeName").textContent = state.event;
  lanes = state.lanes;
  document.querySelector("main").classList.toggle("withClub", !!state.showClub);
  // a screen with a list uses the layout of a heat
  let list = state.view == "screen" && state.screen.rows?.length > 0;
  document.body.className = list ? "heat list" : state.view;
  document.getElementById("welcomeNext").hidden = !state.upcoming;
  document.getElementById("welcomeNextHeat").textContent = state.upcoming ?? "";
  if (state.view == "heat")
    showHeat(state.heat, state.next);
  if (list)
    showList(state.screen);
  else if (state.view == "screen") {
    document.getElementById("screenTitle").textContent = state.screen.title;
    document.getElementById("screenText").textContent = state.screen.text;
  }
  fitAllText();
  showCursor();
}
// A heat: one table row per lane of the pool, so the layout is the same
// for all heats; lanes without a swimmer show a greyed out dash.
function showHeat(heat, next) {
  document.getElementById("heatTitle").textContent =
    `Wettkampf ${heat.competitionId} – ${heat.competitionName}`;
  document.getElementById("heatBox").hidden = false;
  document.getElementById("heat").textContent = heat.heatId;
  document.getElementById("heatCount").textContent = heat.heatCount;
  let [first, last] = laneRange(lanes);
  let rows = [];
  for (let lane = first; lane <= last; ++lane) {
    let swimmer = heat.swimmers[lane];
    rows.push(swimmer ? { label: lane, ...swimmer } : { label: lane, empty: true });
  }
  showRows(rows, { label: "Bahn", name: "Name", club: "Verein", born: "Jahrgang", time: "Meldezeit" });
  showFooter(next ? "Als Nächstes: " : "", next ?? "");
}
// A screen with a list: same layout as a heat, with the screen title in the
// header and its text (if any) in the bottom line instead of "Als Nächstes".
function showList(screen) {
  document.getElementById("heatTitle").textContent = screen.title;
  document.getElementById("heatBox").hidden = true;
  showRows(screen.rows, screen.headers);
  showFooter("", screen.text.replace(/\s*\n\s*/g, " · "));
}
// rows of the table; headers: { label, name, club, born, time }
function showRows(rows, headers) {
  for (const key in headers)
    document.getElementById(`${key}Header`).textContent = headers[key];
  let body = document.getElementById("lanes").tBodies[0];
  body.querySelectorAll("tr.laneRow").forEach(row => row.remove());
  for (const entry of rows) {
    let row = body.insertRow();
    row.className = "laneRow";
    row.classList.toggle("empty", !!entry.empty);
    let cells = [["lane", entry.label], ["name", entry.empty ? "–" : entry.name],
      ["club", entry.club], ["", entry.born],
      ["", entry.empty ? "" : entry.time || "–"]];
    for (const [className, text] of cells) {
      let cell = row.insertCell();
      cell.className = className;
      cell.textContent = text ?? "";
    }
    // an athlete without entry time gets a greyed out dash
    row.lastChild.classList.toggle("missing", !entry.empty && !entry.time);
  }
  document.querySelector("main").style.setProperty("--lanes", Math.max(rows.length, 1));
}
function showFooter(label, text) {
  document.getElementById("next").hidden = !text;
  document.getElementById("nextLabel").textContent = label;
  document.getElementById("nextCompetition").textContent = text;
}
// Shrink text that does not fit its box (long names, long competition
// names) instead of cutting it off. Names, clubs and the title that would
// get too small on one line are put on two lines instead; anything else
// ends in "…" if it still does not fit at half size.
function fitText(element) {
  element.style.fontSize = "";
  element.classList.remove("twoLines");
  let base = parseFloat(getComputedStyle(element).fontSize);
  let size = shrink(element, base, base * 0.7, () => element.scrollWidth > element.clientWidth);
  if (element.scrollWidth <= element.clientWidth)
    return;
  if (!element.matches("td.name, td.club, header h1, #screenTitle")) {
    shrink(element, size, base * 0.5, () => element.scrollWidth > element.clientWidth);
    return;
  }
  element.classList.add("twoLines");
  let text = document.createRange();
  text.selectNodeContents(element);
  let tooBig = () => element.scrollWidth > element.clientWidth
    || text.getBoundingClientRect().height > 2.5 * parseFloat(element.style.fontSize);
  shrink(element, base * 0.7, base * 0.35, tooBig);
}
function shrink(element, size, min, tooBig) {
  element.style.fontSize = `${size}px`;
  while (tooBig() && size > min) {
    size *= 0.95;
    element.style.fontSize = `${size}px`;
  }
  return size;
}
function fitAllText() {
  document.querySelectorAll("header h1, td, #next, #welcomeName, #welcomeNextHeat, #screenTitle")
    .forEach(fitText);
  fitBlock(document.getElementById("screenText"));
}
// Text with several lines on a screen: shrink it until it fits in the
// height left below logo and title (and no line is wider than the screen).
function fitBlock(element) {
  element.style.fontSize = "";
  if (!document.body.classList.contains("screen"))
    return;
  let size = parseFloat(getComputedStyle(element).fontSize);
  let min = size * 0.3;
  while ((element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth)
         && size > min) {
    size *= 0.92;
    element.style.fontSize = `${size}px`;
  }
}

/* ================= KEYS =================  */
// F switches fullscreen here; all other keys are handled by the control
// window, so the clicker also works while this window has the focus.
function handleKey(event) {
  if (event.ctrlKey || event.altKey || event.metaKey)
    return;
  if (event.key == "f" || event.key == "F") {
    toggleFullscreen();
    event.preventDefault();
  } else if (control) {
    send({ type: "key", key: event.key });
    if (event.key.startsWith("Arrow") || event.key.startsWith("Page")
        || [" ", "Enter", "Backspace"].includes(event.key))
      event.preventDefault();
  }
}

/* ================= FULLSCREEN AND WAKE LOCK =================  */
function toggleFullscreen() {
  if (document.fullscreenElement)
    document.exitFullscreen();
  else
    enterFullscreen();
}
function enterFullscreen() {
  if (!document.fullscreenElement)
    document.documentElement.requestFullscreen()
      .catch(e => sendStatus(`Vollbild nicht möglich: ${e.message}`));
}

// While in fullscreen, keep the screen from going to sleep. The browser
// drops the lock when the window is hidden, so it is re-requested on return.
let wakeLock = null;
let wakeLockPending = false;
let wakeLockProblem = null;
async function updateWakeLock() {
  let wanted = document.fullscreenElement && document.visibilityState == "visible";
  if (wanted && !wakeLock && !wakeLockPending) {
    if (!("wakeLock" in navigator)) {
      wakeLockProblem = "unsupported";
      return sendStatus();
    }
    wakeLockPending = true;
    try {
      let lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => {
        if (wakeLock === lock)
          wakeLock = null;
        sendStatus();
      });
      wakeLock = lock;
      wakeLockProblem = null;
      wakeLockPending = false;
      updateWakeLock(); // fullscreen may have been left in the meantime
    } catch (e) {
      wakeLockPending = false;
      wakeLockProblem = "error";
      sendStatus(`Bildschirm-Standby konnte nicht verhindert werden: ${e.message}`);
    }
  } else if (!wanted && wakeLock) {
    let lock = wakeLock;
    wakeLock = null;
    lock.release();
  }
  sendStatus();
}

// hide the mouse pointer (and the fullscreen hint) until the mouse is moved
let cursorTimer = null;
function showCursor() {
  document.documentElement.classList.remove("idle");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.documentElement.classList.add("idle"), 3000);
}
