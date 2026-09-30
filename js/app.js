let json = null; // the start list: competitions with their heats
let competitions = [];
let heats = [];
let oldCompetition = 0;
let currentCompetition = 0;
let currentHeat = 0;
function init() {
  let input = document.getElementById("dataFile");
  input.addEventListener("change", () => readDataFile(input.files[0], input));
  let dropZone = document.getElementById("dropZone");
  dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
    readDataFile(event.dataTransfer.files[0], input);
  });
  // a file dropped next to the drop zone must not replace the page
  document.addEventListener("dragover", event => event.preventDefault());
  document.addEventListener("drop", event => event.preventDefault());

  document.addEventListener("keydown", handleKey);
  document.addEventListener("fullscreenchange", updateWakeLock);
  document.addEventListener("visibilitychange", updateWakeLock);
  document.addEventListener("mousemove", showCursor);
  window.addEventListener("resize", () => {
    if (json)
      fitAllText();
  });
}

/* ================= DATA UPLOAD =================  */
function readDataFile(file, input) {
  if (!file)
    return;
  let reader = new FileReader();
  reader.onload = () => {
    try {
      startCompetition(parseDataFile(reader.result));
    } catch (e) {
      showUploadError(`Die Datei konnte nicht gelesen werden: ${e.message}`);
      input.value = "";
    }
  };
  reader.onerror = () => showUploadError("Die Datei konnte nicht gelesen werden.");
  reader.readAsText(file, "utf-8");
}
// Accepts the format of data/data.js (`const json = {...};` with comments
// and trailing commas) as well as plain JSON. The file is parsed, not executed.
function parseDataFile(text) {
  let stripped = "";
  let quote = null;
  for (let i = 0; i < text.length; ++i) {
    let c = text[i];
    if (quote) {
      stripped += c;
      if (c == "\\")
        stripped += text[++i] ?? "";
      else if (c == quote)
        quote = null;
    } else if (c == '"') {
      quote = c;
      stripped += c;
    } else if (c == "/" && text[i + 1] == "*") {
      let end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c == "/" && text[i + 1] == "/") {
      let end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end - 1;
    } else {
      stripped += c;
    }
  }
  let start = stripped.indexOf("{");
  let end = stripped.lastIndexOf("}");
  if (start < 0 || end < start)
    throw new Error("keine Wettkampfdaten gefunden");
  let data = JSON.parse(stripped.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1"));
  validateData(data);
  return data;
}
function validateData(data) {
  if (typeof data.competition != "string" || data.competition.trim() == "")
    throw new Error('Eintrag "competition" (Name der Veranstaltung) fehlt');
  if (typeof data.startlist != "object" || data.startlist === null)
    throw new Error('Eintrag "startlist" fehlt');
  let keys = Object.keys(data.startlist);
  if (keys.length == 0)
    throw new Error("keine Wettkämpfe in der Startliste");
  for (const key of keys) {
    let competition = data.startlist[key];
    if (typeof competition?.name != "string")
      throw new Error(`Wettkampf ${key} hat keinen Namen`);
    if (typeof competition.heats != "object" || competition.heats === null
        || Object.keys(competition.heats).length == 0)
      throw new Error(`Wettkampf ${key} hat keine Läufe`);
    for (const heat in competition.heats)
      for (const lane in competition.heats[heat])
        if (!/^\d+$/.test(lane))
          throw new Error(`Wettkampf ${key}, Lauf ${heat}: "${lane}" ist keine Bahnnummer`);
  }
}
function showUploadError(message) {
  document.getElementById("uploadError").textContent = message;
}
function startCompetition(data) {
  json = data.startlist;
  competitions = Object.keys(json);
  currentCompetition = 0;
  currentHeat = 0;
  showUploadError("");
  buildLanes();
  document.getElementById("welcomeName").textContent = data.competition;
  document.title = data.competition;
  document.body.classList.add("loaded");
  showWelcome(true);
}

// The table shows every lane from the lowest to the highest lane number used
// anywhere in the start list, so the layout stays the same for all heats
// (e.g. lanes 1-4, 1-8, or 0-9).
function buildLanes() {
  let numbers = [];
  for (const competition of Object.values(json))
    for (const field of Object.values(competition.heats))
      numbers.push(...Object.keys(field).map(Number));
  let first = Math.min(...numbers);
  let last = Math.max(...numbers);
  let table = document.getElementById("lanes");
  table.querySelectorAll("tr.laneRow").forEach(row => row.remove());
  for (let lane = first; lane <= last; ++lane) {
    let row = document.createElement("tr");
    row.className = "laneRow";
    row.innerHTML = `<td class="lane">${lane}</td><td class="name" id="name${lane}"></td>`
      + `<td id="born${lane}"></td><td id="time${lane}"></td>`;
    table.tBodies[0].appendChild(row);
  }
  table.style.setProperty("--lanes", last - first + 1);
}

/* ================= WELCOME SCREEN =================  */
function showWelcome(show) {
  document.body.classList.toggle("welcome", show);
  if (show)
    fitText(document.getElementById("welcomeName"));
  else
    loadCurrent();
}

/* ================= DISPLAY =================  */
function loadCurrent() {
  let competition = competitions[currentCompetition];
  heats = Object.keys(json[competition]["heats"]);
  let heat = heats[currentHeat];
  document.getElementById("competition").innerHTML = json[competition]["name"];
  document.getElementById("competitionId").innerHTML = competition;
  document.getElementById("heat").innerHTML = heat;
  document.getElementById("heatCount").innerHTML = heats.length;
  // clear all lanes so empty lanes don't keep the previous heat's swimmers
  document.querySelectorAll("tr.laneRow td:not(.lane)").forEach(cell => cell.innerHTML = "");
  let field = json[competition]["heats"][heat];
  for (const key in field) {
    document.getElementById(`name${Number(key)}`).innerHTML = field[key]["name"];
    document.getElementById(`born${Number(key)}`).innerHTML = field[key]["born"];
    document.getElementById(`time${Number(key)}`).innerHTML = field[key]["time"];
  }
  updateNext();
  fitAllText();
}
function updateNext() {
  let next = competitions[currentCompetition + 1];
  document.getElementById("next").hidden = next === undefined;
  document.getElementById("nextCompetition").innerHTML =
    next === undefined ? "" : `Wettkampf ${next} – ${json[next]["name"]}`;
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
function advance() {
  if (document.body.classList.contains("welcome"))
    return showWelcome(false); // start with the first heat of the first competition
  if (currentHeat == heats.length - 1) {
    if (currentCompetition == competitions.length - 1) {
      return; // Alternativ: Wettkampf beendet
    }
    // advance competition
    currentCompetition++;
    currentHeat = 0;
  }
  else
    currentHeat++;
  loadCurrent();
}
function retreat() {
  if (document.body.classList.contains("welcome"))
    return;
  if (currentHeat == 0) {
    if (currentCompetition == 0)
      return showWelcome(true);
    currentCompetition--;
    let competition = competitions[currentCompetition];
    heats = Object.keys(json[competition]["heats"]);
    currentHeat = heats.length - 1;
  }
  else
    currentHeat--;
  loadCurrent();
}

/* ================= OPERATOR CONTROLS =================  */
// Arrow keys, Page Up/Down and space are also what presentation clickers send.
const advanceKeys = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"];
const retreatKeys = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"];
function handleKey(event) {
  if (!json || event.ctrlKey || event.altKey || event.metaKey)
    return;
  if (advanceKeys.includes(event.key))
    advance();
  else if (retreatKeys.includes(event.key))
    retreat();
  else if (event.key == "f" || event.key == "F")
    toggleFullscreen();
  else
    return;
  event.preventDefault();
}
function toggleFullscreen() {
  if (document.fullscreenElement)
    document.exitFullscreen();
  else
    document.documentElement.requestFullscreen()
      .catch(e => showNotice(`Vollbild nicht möglich: ${e.message}`));
}

// While in fullscreen, keep the screen from going to sleep. The browser
// drops the lock when the tab is hidden, so it is re-requested on return.
let wakeLock = null;
let wakeLockPending = false;
async function updateWakeLock() {
  let wanted = document.fullscreenElement && document.visibilityState == "visible";
  if (wanted && !wakeLock && !wakeLockPending) {
    if (!("wakeLock" in navigator)) {
      showNotice("Dieser Browser kann den Bildschirm-Standby nicht verhindern.");
      return;
    }
    wakeLockPending = true;
    try {
      let lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
      wakeLock = lock;
      wakeLockPending = false;
      updateWakeLock(); // fullscreen may have been left in the meantime
    } catch (e) {
      wakeLockPending = false;
      showNotice(`Bildschirm-Standby konnte nicht verhindert werden: ${e.message}`);
    }
  } else if (!wanted && wakeLock) {
    let lock = wakeLock;
    wakeLock = null;
    lock.release();
  }
}

let noticeTimer = null;
function showNotice(message) {
  let notice = document.getElementById("notice");
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.hidden = true, 6000);
}

// hide the mouse pointer on the display until it is moved
let cursorTimer = null;
function showCursor() {
  document.body.classList.remove("hideCursor");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add("hideCursor"), 2000);
}
