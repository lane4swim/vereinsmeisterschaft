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
  show(message);
}

/* ================= RENDERING =================  */
function show(state) {
  document.title = `Anzeige – ${state.event}`;
  document.getElementById("welcomeName").textContent = state.event;
  if (state.lanes != lanes)
    buildLanes(state.lanes);
  document.body.className = state.view;
  if (state.view == "heat")
    showHeat(state.heat, state.next);
  fitAllText();
  showCursor();
}
// One table row per lane of the pool, so the layout is the same for all heats.
function buildLanes(count) {
  lanes = count;
  let [first, last] = laneRange(count);
  let table = document.getElementById("lanes");
  table.querySelectorAll("tr.laneRow").forEach(row => row.remove());
  for (let lane = first; lane <= last; ++lane) {
    let row = document.createElement("tr");
    row.className = "laneRow";
    row.id = `lane${lane}`;
    row.innerHTML = `<td class="lane">${lane}</td><td class="name" id="name${lane}"></td>`
      + `<td id="born${lane}"></td><td id="time${lane}"></td>`;
    table.tBodies[0].appendChild(row);
  }
  table.style.setProperty("--lanes", count);
}
function showHeat(heat, next) {
  document.getElementById("competition").textContent = heat.competitionName;
  document.getElementById("competitionId").textContent = heat.competitionId;
  document.getElementById("heat").textContent = heat.heatId;
  document.getElementById("heatCount").textContent = heat.heatCount;
  // lanes without a swimmer show a greyed out dash
  document.querySelectorAll("tr.laneRow").forEach(row => {
    let lane = row.id.slice(4);
    let swimmer = heat.swimmers[lane];
    row.classList.toggle("empty", !swimmer);
    document.getElementById(`name${lane}`).textContent = swimmer ? swimmer.name : "–";
    document.getElementById(`born${lane}`).textContent = swimmer ? swimmer.born : "";
    document.getElementById(`time${lane}`).textContent = swimmer ? swimmer.time : "";
  });
  document.getElementById("next").hidden = !next;
  document.getElementById("nextCompetition").textContent = next ?? "";
}
// Shrink text that does not fit its box (long names, long competition
// names) instead of wrapping or cutting it off.
function fitText(element) {
  element.style.fontSize = "";
  let size = parseFloat(getComputedStyle(element).fontSize);
  let min = size * 0.5;
  while (element.scrollWidth > element.clientWidth && size > min) {
    size *= 0.95;
    element.style.fontSize = `${size}px`;
  }
}
function fitAllText() {
  document.querySelectorAll("header h1, td, #next, #welcomeName").forEach(fitText);
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
