/* ================= CONTROL WINDOW =================
   The operator's window (index.html). It holds the data and the current
   position and tells the display window (display.html) what to show. */
let data = null;
let heatList = [];      // all heats in running order, see buildHeatList()
// "welcome": the welcome screen is shown and `index` is the heat that
// follows it (heatList.length after the last heat); "heat": heat `index`
// is shown.
let position = { view: "welcome", index: 0 };

// whether the TV table has a club column; remembered for the next start
let showClub = loadSetting("showClub") == "true";

let displayWindow = null;
let displayStatus = null;
let lastSeen = 0;

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

  onClick("openDisplay", openDisplay);
  onClick("back", retreat);
  onClick("forward", advance);
  onClick("welcomeBreak", welcomeBreak);
  let clubBox = document.getElementById("showClub");
  clubBox.checked = showClub;
  clubBox.addEventListener("change", () => {
    showClub = clubBox.checked;
    saveSetting("showClub", showClub);
    clubBox.blur();
    update();
  });
  document.addEventListener("keydown", event => {
    if (handleKey(event.key, event))
      event.preventDefault();
  });
  window.addEventListener("message", receive);
  // closing or reloading this window would lose the current position
  window.addEventListener("beforeunload", event => {
    if (data)
      event.preventDefault();
  });
  setInterval(updateStatus, 1000);
}
// Buttons give the focus back right away, so that space and Enter from the
// keyboard or clicker are not also taken as a click on the last button.
function onClick(id, action) {
  document.getElementById(id).addEventListener("click", event => {
    event.currentTarget.blur();
    action();
  });
}

/* ================= DATA UPLOAD =================  */
function readDataFile(file, input) {
  if (!file)
    return;
  let reader = new FileReader();
  reader.onload = () => {
    try {
      start(parseDataFile(reader.result));
    } catch (e) {
      showUploadError(`Die Datei konnte nicht gelesen werden: ${e.message}`);
      input.value = "";
    }
  };
  reader.onerror = () => showUploadError("Die Datei konnte nicht gelesen werden.");
  reader.readAsText(file, "utf-8");
}
function showUploadError(message) {
  document.getElementById("uploadError").textContent = message;
}
function start(newData) {
  data = newData;
  heatList = buildHeatList(data);
  position = { view: "welcome", index: 0 };
  showUploadError("");
  document.title = `Regie – ${data.competition}`;
  document.getElementById("eventName").textContent = data.competition;
  buildHeatListView();
  document.body.classList.add("loaded");
  update();
  updateStatus();
}

/* ================= NAVIGATION =================  */
function advance() {
  let next = nextPosition();
  if (!next)
    return;
  position = next;
  update();
}
function retreat() {
  if (position.view == "welcome") {
    // back to the heat that was shown before the welcome screen
    if (position.index == 0)
      return;
    position = { view: "heat", index: position.index - 1 };
  } else if (position.index == 0) {
    position.view = "welcome";
  } else {
    position.index--;
  }
  update();
}
// Show the welcome screen (e.g. during a break); "Weiter" then continues
// with the heat after the one that was shown.
function welcomeBreak() {
  if (position.view == "welcome")
    return;
  position = { view: "welcome", index: position.index + 1 };
  update();
}
function jumpTo(index) {
  position = { view: "heat", index };
  update();
}
// What "Weiter" would show next: after the last heat the welcome screen,
// after that nothing (null).
function nextPosition() {
  if (position.view == "heat")
    return position.index < heatList.length - 1
      ? { view: "heat", index: position.index + 1 }
      : { view: "welcome", index: heatList.length };
  if (position.index < heatList.length)
    return { view: "heat", index: position.index };
  return null;
}

// Arrow keys, Page Up/Down and space are also what presentation clickers send.
const advanceKeys = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"];
const retreatKeys = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"];
function handleKey(key, event) {
  if (!data || event?.ctrlKey || event?.altKey || event?.metaKey)
    return false;
  if (advanceKeys.includes(key))
    advance();
  else if (retreatKeys.includes(key))
    retreat();
  else if (key == "b" || key == "B")
    welcomeBreak();
  else
    return false;
  return true;
}

/* ================= CONTROL WINDOW VIEW =================  */
function update() {
  sendState();
  renderPreview(document.getElementById("nowView"), position);
  renderPreview(document.getElementById("nextView"), nextPosition());
  let atWelcome = position.view == "welcome";
  document.getElementById("back").disabled = atWelcome && position.index == 0;
  document.getElementById("forward").disabled = !nextPosition();
  document.getElementById("welcomeBreak").disabled = atWelcome;
  let resume = heatList[atWelcome ? position.index : position.index + 1];
  document.getElementById("welcomeResume").textContent = resume
    ? `danach weiter mit WK ${resume.competitionId} · Lauf ${resume.heatId}`
    : "Ende der Startliste";
  // mark the shown heat, or the heat that follows the welcome screen
  document.querySelectorAll("#heatList .heat").forEach(button => {
    let index = Number(button.dataset.index);
    button.classList.toggle("current", !atWelcome && index == position.index);
    button.classList.toggle("resume", atWelcome && index == position.index);
  });
  document.querySelector("#heatList .current, #heatList .resume")
    ?.scrollIntoView({ block: "nearest" });
}
function heatTitle(heat) {
  return `Wettkampf ${heat.competitionId} – ${heat.competitionName}`;
}
function renderPreview(element, pos) {
  element.innerHTML = "";
  if (!pos) {
    element.innerHTML = `<p class="end">Ende der Startliste</p>`;
    return;
  }
  if (pos.view == "welcome") {
    element.innerHTML = `<div class="welcomePreview"><img src="img/logo.jpg" alt="">`
      + `<div class="title"></div><div class="sub"></div></div>`;
    element.querySelector(".title").textContent = data.competition;
    element.querySelector(".sub").textContent = pos.index < heatList.length
      ? "Begrüßung" : "Begrüßung · Ende der Startliste";
    return;
  }
  let heat = heatList[pos.index];
  let title = document.createElement("div");
  title.className = "title";
  title.textContent = heatTitle(heat);
  let sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = `Lauf ${heat.heatId}/${heat.heatCount}`;
  let table = document.createElement("table");
  let [first, last] = laneRange(data.lanes);
  for (let lane = first; lane <= last; ++lane) {
    let swimmer = heat.swimmers[lane];
    let row = table.insertRow();
    row.classList.toggle("empty", !swimmer);
    let texts = [lane, swimmer?.name ?? "–", swimmer?.born ?? "", swimmer?.time ?? ""];
    if (showClub)
      texts.splice(2, 0, swimmer?.club ?? "");
    for (const text of texts)
      row.insertCell().textContent = text;
  }
  element.append(title, sub, table);
}
// All heats grouped by competition; a click on a heat shows it right away,
// a click on the competition shows its first heat.
function buildHeatListView() {
  let list = document.getElementById("heatList");
  list.innerHTML = "";
  let group = null;
  heatList.forEach((heat, index) => {
    if (heat.heatIndex == 0) {
      group = document.createElement("div");
      group.className = "competition";
      let title = document.createElement("button");
      title.className = "title";
      title.textContent = heatTitle(heat);
      title.addEventListener("click", event => {
        event.currentTarget.blur();
        jumpTo(index);
      });
      group.appendChild(title);
      list.appendChild(group);
    }
    let button = document.createElement("button");
    button.className = "heat";
    button.dataset.index = index;
    button.textContent = `Lauf ${heat.heatId}`;
    button.addEventListener("click", event => {
      event.currentTarget.blur();
      jumpTo(index);
    });
    group.appendChild(button);
  });
}

/* ================= DISPLAY WINDOW =================  */
async function openDisplay() {
  if (displayWindow && !displayWindow.closed) {
    displayWindow.focus();
    return;
  }
  let features = "popup,width=1280,height=720";
  // Chrome and Edge can place the window on the second screen (the TV)
  // right away; the browser asks once for permission to see the screens.
  if ("getScreenDetails" in window) {
    try {
      let details = await window.getScreenDetails();
      let tv = details.screens.find(screen => screen !== details.currentScreen);
      if (tv)
        features = `popup,left=${tv.availLeft},top=${tv.availTop},`
          + `width=${tv.availWidth},height=${tv.availHeight}`;
    } catch (e) {
      // permission refused: open a normal window that is moved by hand
    }
  }
  displayWindow = window.open("display.html", "vm-display", features);
  if (!displayWindow)
    showNotice("Das Anzeigefenster wurde vom Browser blockiert. "
      + "Bitte Pop-ups für diese Seite erlauben und erneut klicken.");
  updateStatus();
}
function sendState() {
  if (!data || !displayWindow || displayWindow.closed)
    return;
  let next = null;
  if (position.view == "heat") {
    let current = heatList[position.index];
    let following = heatList.slice(position.index + 1)
      .find(heat => heat.competitionId != current.competitionId);
    if (following)
      next = heatTitle(following);
  }
  displayWindow.postMessage({
    app: "vm",
    type: "state",
    event: data.competition,
    lanes: data.lanes,
    showClub,
    view: position.view,
    heat: position.view == "heat" ? heatList[position.index] : null,
    next,
  }, "*");
}
function receive(event) {
  let message = event.data;
  if (message?.app != "vm" || !event.source)
    return;
  if (message.type == "status") {
    // A display window that was reloaded, or that was opened before this
    // window was reloaded, reports in here and gets the current state.
    let reconnected = message.first || event.source !== displayWindow
      || Date.now() - lastSeen > 3000;
    displayWindow = event.source;
    displayStatus = message;
    lastSeen = Date.now();
    if (reconnected)
      sendState();
    if (message.error)
      showNotice(message.error);
    updateStatus();
  } else if (message.type == "key" && event.source === displayWindow) {
    handleKey(message.key);
  }
}
function updateStatus() {
  let open = displayWindow && !displayWindow.closed;
  let connected = open && Date.now() - lastSeen < 3000;
  setPill("stDisplay", !open ? ["off", "Anzeige: nicht geöffnet"]
    : connected ? ["ok", "Anzeige: verbunden"] : ["bad", "Anzeige: keine Verbindung"]);
  setPill("stFullscreen", !connected ? ["off", "Vollbild: –"]
    : displayStatus.fullscreen ? ["ok", "Vollbild: an"]
    : ["warn", "Vollbild: aus – auf der Anzeige klicken oder F"]);
  let wake = {
    active: ["ok", "Standby-Sperre: aktiv"],
    off: ["warn", "Standby-Sperre: aus (nur im Vollbild)"],
    unsupported: ["bad", "Standby-Sperre: vom Browser nicht unterstützt"],
    error: ["bad", "Standby-Sperre: fehlgeschlagen"],
  };
  setPill("stWakeLock", connected ? wake[displayStatus.wakeLock] ?? wake.off : ["off", "Standby-Sperre: –"]);
  document.getElementById("openDisplay").textContent =
    open ? "Anzeige in den Vordergrund" : "Anzeige öffnen";
}
function setPill(id, [state, text]) {
  let pill = document.getElementById(id);
  pill.className = `pill ${state}`;
  pill.textContent = text;
}

let noticeTimer = null;
function showNotice(message) {
  let notice = document.getElementById("notice");
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.hidden = true, 8000);
}

// Settings are kept in the browser; this may fail (e.g. private windows),
// in which case the default is used.
function loadSetting(name) {
  try {
    return localStorage.getItem(`vm-${name}`);
  } catch (e) {
    return null;
  }
}
function saveSetting(name, value) {
  try {
    localStorage.setItem(`vm-${name}`, value);
  } catch (e) {
    // not remembered, but still in effect for this session
  }
}
