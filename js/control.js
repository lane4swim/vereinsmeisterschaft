/* ================= CONTROL WINDOW =================
   The operator's window (index.html). It holds the data and the current
   position and tells the display window (display.html) what to show. */
let data = null;
// The running order: heats ({ kind: "heat" }) and additional screens
// ({ kind: "screen", title, text }), see buildProgram().
let program = [];
// "welcome": the welcome screen is shown and `index` is the entry that
// follows it (program.length after the last one); "item": entry `index`
// is shown.
let position = { view: "welcome", index: 0 };
// A spontaneous screen ({ title, text }) shown on top of the running order
// until it is hidden again; null if there is none.
let message = null;
// screens were changed since the data was loaded or saved
let unsaved = false;

// whether the TV table has a club column; remembered for the next start
let showClub = loadSetting("showClub") == "true";
// large view of the current heat for the announcer; remembered as well
let announcerMode = loadSetting("announcerMode") == "true";

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

  document.getElementById("csvEventName").value = loadSetting("csvEventName") ?? "";
  onClick("loadSample", loadSample);
  onClick("openDisplay", openDisplay);
  onClick("save", saveDataFile);
  onClick("back", retreat);
  onClick("forward", advance);
  onClick("welcomeBreak", welcomeBreak);
  onClick("hideMessage", hideMessage);
  onClick("screenShow", showMessage);
  onClick("screenInsert", insertScreen);
  onClick("screenChange", changeScreen);
  document.getElementById("screenSelect").addEventListener("change", chooseScreen);
  onClick("screenEarlier", () => moveScreen(-1));
  onClick("screenLater", () => moveScreen(1));
  onClick("screenDelete", deleteScreen);
  let announcerBox = document.getElementById("announcerMode");
  announcerBox.checked = announcerMode;
  announcerBox.addEventListener("change", () => {
    setAnnouncerMode(announcerBox.checked);
    announcerBox.blur();
  });
  let clubBox = document.getElementById("showClub");
  clubBox.checked = showClub;
  clubBox.addEventListener("change", () => {
    showClub = clubBox.checked;
    saveSetting("showClub", showClub);
    clubBox.blur();
    update();
  });
  document.addEventListener("keydown", event => {
    // typing a screen text must not move through the running order
    if (event.target.closest?.("input, textarea"))
      return;
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
  updateClock();
  setInterval(updateClock, 1000);
}
// current time to the minute, e.g. "14:05"
function updateClock() {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  updateSchedule();
}
// Planned start of the heat on the display (or, on the welcome screen and
// additional screens, of the heat that follows) compared with the clock:
// how far the event is ahead of or behind the plan. Differences of more than
// 3 hours (e.g. when testing on another day) are not shown as a deviation.
function updateSchedule() {
  let element = document.getElementById("schedule");
  let showsHeat = position.view == "item" && program[position.index]?.kind == "heat" && !message;
  let heat = data && nextHeat(position.index);
  if (!heat?.plannedStart) {
    element.hidden = true;
    return;
  }
  let [hours, minutes] = heat.plannedStart.split(":").map(Number);
  let now = new Date();
  let delay = now.getHours() * 60 + now.getMinutes() - (hours * 60 + minutes);
  let state = "", text = "";
  if (Math.abs(delay) <= 180) {
    if (delay > 1)
      [state, text] = ["warn", `${delay} Min. hinter Plan`];
    else if (delay < -1)
      [state, text] = ["ok", `${-delay} Min. vor Plan`];
    else
      [state, text] = ["ok", "im Zeitplan"];
  }
  let label = showsHeat ? "Lauf geplant" : "nächster Lauf geplant";
  element.innerHTML = `<div><span class="label"></span> <b></b></div><span class="pill"></span>`;
  element.querySelector(".label").textContent = label;
  element.querySelector("b").textContent = heat.plannedStart;
  let pill = element.querySelector(".pill");
  pill.textContent = text;
  pill.className = `pill ${state}`;
  pill.hidden = !text;
  element.hidden = false;
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
      let text = decodeText(reader.result);
      if (isCsvStartlist(text)) {
        // start list exported by EasyWk, see startlist-csv.js
        let eventName = document.getElementById("csvEventName").value.trim();
        saveSetting("csvEventName", eventName);
        let data = parseCsvStartlist(text, eventName);
        validateData(data);
        start(data);
      } else {
        start(parseDataFile(text));
      }
    } catch (e) {
      showUploadError(`Die Datei konnte nicht gelesen werden: ${e.message}`);
      input.value = "";
    }
  };
  reader.onerror = () => showUploadError("Die Datei konnte nicht gelesen werden.");
  reader.readAsArrayBuffer(file);
}
// UTF-8, or Windows-1252 as used by EasyWk's CSV export (umlauts would
// break otherwise)
function decodeText(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch (e) {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}
// Demonstration with the sample data in data/sample.json. Browsers only
// allow reading it when the page comes from a web server, not from a file
// opened directly (file://); then the file has to be dropped in by hand.
async function loadSample() {
  try {
    let response = await fetch("data/sample.json", { cache: "no-store" });
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`);
    start(parseDataFile(await response.text()), true);
  } catch (e) {
    showUploadError(location.protocol == "file:"
      ? "Die Beispieldaten können nicht automatisch geladen werden, wenn die Seite als Datei "
        + "geöffnet ist. Bitte die Datei data/sample.json hierher ziehen oder oben auswählen."
      : `Die Beispieldaten konnten nicht geladen werden: ${e.message}`);
  }
}
function showUploadError(message) {
  document.getElementById("uploadError").textContent = message;
}
function start(newData, isSample = false) {
  data = newData;
  document.getElementById("demoBadge").hidden = !isSample;
  program = buildProgram(data);
  position = { view: "welcome", index: 0 };
  message = null;
  setUnsaved(false);
  showUploadError("");
  document.title = `Regie – ${data.competition}`;
  document.getElementById("eventName").textContent = data.competition;
  buildProgramView();
  document.body.classList.add("loaded");
  update();
  updateStatus();
}

/* ================= SAVING =================  */
// The start list with all additional screens as a JSON file (a download),
// which can be loaded again like any data file.
function saveDataFile() {
  data.screens = screensOf(program);
  if (data.screens.length == 0)
    delete data.screens;
  let blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  let link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  let name = data.competition.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  link.download = `${name || "startliste"}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  setUnsaved(false);
}
function setUnsaved(value) {
  unsaved = value;
  document.getElementById("unsaved").hidden = !value;
}

/* ================= NAVIGATION =================  */
// While a spontaneous screen is shown, "Weiter" and "Zurück" only hide it
// and return to the running order where it was.
function advance() {
  if (message)
    return hideMessage();
  let next = nextPosition();
  if (!next)
    return;
  position = next;
  update();
}
function retreat() {
  if (message)
    return hideMessage();
  if (position.view == "welcome") {
    // back to the entry that was shown before the welcome screen
    if (position.index == 0)
      return;
    position = { view: "item", index: position.index - 1 };
  } else if (position.index == 0) {
    position.view = "welcome";
  } else {
    position.index--;
  }
  update();
}
// Show the welcome screen (e.g. during a break); "Weiter" then continues
// with the entry after the one that was shown.
function welcomeBreak() {
  message = null;
  if (position.view == "item")
    position = { view: "welcome", index: position.index + 1 };
  update();
}
function jumpTo(index) {
  message = null;
  position = { view: "item", index };
  update();
}
// What "Weiter" would show next: after the last entry the welcome screen,
// after that nothing (null).
function nextPosition() {
  if (position.view == "item")
    return position.index < program.length - 1
      ? { view: "item", index: position.index + 1 }
      : { view: "welcome", index: program.length };
  if (position.index < program.length)
    return { view: "item", index: position.index };
  return null;
}
// The first heat at or after entry `index` of the running order
function nextHeat(index) {
  return program.slice(index).find(item => item.kind == "heat");
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
  else if (key == "s" || key == "S")
    setAnnouncerMode(!announcerMode);
  else if (key == "Escape" && message)
    hideMessage();
  else
    return false;
  return true;
}

/* ================= ADDITIONAL SCREENS =================  */
// The editor works on one screen of the running order, chosen in
// "Bearbeiten" (by default the screen on the display), or on a new one.
// New screens are inserted after the entry chosen in "Einfügen nach".
let editIndex = null;          // index in `program` of the edited screen
let editFollowsDisplay = true; // editIndex follows the screen on the display

// The screen described by the editor fields, or null (with a notice) if it
// has no title. List lines: "Platz; Name; Jahrgang; Zeit; Verein".
function screenFields() {
  let value = id => document.getElementById(id).value.trim();
  let title = value("screenTitle");
  if (title == "") {
    showNotice("Bitte einen Titel für den Bildschirm eingeben.");
    document.getElementById("screenTitle").focus();
    return null;
  }
  let list = value("screenList").split("\n").filter(line => line.trim() != "").map(line => {
    let [label, name, born, time, club] = line.split(/[;\t]/).map(part => part.trim());
    let entry = { label, name, born, time, club };
    for (const key in entry)
      if (!entry[key])
        delete entry[key];
    return entry;
  });
  let nameless = list.findIndex(entry => !entry.name);
  if (nameless >= 0) {
    showNotice(`Listenzeile ${nameless + 1} hat keinen Namen (Platz; Name; Jahrgang; Zeit; Verein).`);
    return null;
  }
  return makeScreen({ title, text: value("screenText"), list, labelHeader: value("screenLabelHeader") },
    athleteMap(data.athletes));
}
// the editor fields for a screen (empty for a new one)
function fillScreenFields(screen) {
  document.getElementById("screenTitle").value = screen?.title ?? "";
  document.getElementById("screenText").value = screen?.text ?? "";
  document.getElementById("screenLabelHeader").value = screen?.labelHeader ?? "";
  document.getElementById("screenList").value = (screen?.rows ?? []).map(row =>
    [row.label, row.name, row.born, row.time, row.club].join("; ").replace(/(; )+$/, "")).join("\n");
}
// spontaneous screen, not part of the running order
function showMessage() {
  let screen = screenFields();
  if (!screen)
    return;
  message = screen;
  update();
}
function hideMessage() {
  message = null;
  // the fields held the spontaneous screen; show the edited screen again
  fillScreenFields(program[editIndex]);
  update();
}
// new screen in the running order after the entry chosen in "Einfügen nach"
function insertScreen() {
  let screen = screenFields();
  if (!screen)
    return;
  let choice = document.getElementById("screenAfter").value;
  let at = choice == "current" ? (position.view == "item" ? position.index + 1 : position.index)
    : Number(choice) + 1;
  program.splice(at, 0, screen);
  // the display keeps showing the same entry
  if (at < position.index || (at == position.index && position.view == "item"))
    position.index++;
  editIndex = at;
  editFollowsDisplay = false;
  programChanged();
  showNotice(`Bildschirm „${screen.title}“ eingefügt.`);
}
function changeScreen() {
  let screen = editIndex !== null && screenFields();
  if (!screen)
    return;
  program[editIndex] = screen;
  programChanged();
}
// one entry earlier or later; the display keeps showing the same entry
function moveScreen(step) {
  let from = editIndex, to = editIndex + step;
  if (from === null || to < 0 || to >= program.length)
    return;
  [program[from], program[to]] = [program[to], program[from]];
  if (position.index == from)
    position.index = to;
  else if (position.index == to)
    position.index = from;
  editIndex = to;
  programChanged();
}
function deleteScreen() {
  let screen = program[editIndex];
  if (editIndex === null || !confirm(`Bildschirm „${screen.title}“ löschen?`))
    return;
  program.splice(editIndex, 1);
  if (position.index > editIndex)
    position.index--;
  else if (position.index == editIndex && position.view == "item" && position.index >= program.length)
    position = { view: "welcome", index: program.length };
  editIndex = null;
  editFollowsDisplay = true;
  programChanged();
}
function programChanged() {
  setUnsaved(true);
  buildProgramView();
  update();
}
// choosing a screen to edit (or "new") in "Bearbeiten"
function chooseScreen() {
  let choice = document.getElementById("screenSelect").value;
  editIndex = choice == "new" ? null : Number(choice);
  editFollowsDisplay = false;
  fillScreenFields(program[editIndex]);
  updateEditor();
}
function updateEditor() {
  // follow the screen on the display unless another one was chosen
  let shown = position.view == "item" && program[position.index]?.kind == "screen" ? position.index : null;
  if (editFollowsDisplay && editIndex !== shown && !message) {
    editIndex = shown;
    fillScreenFields(program[editIndex]);
  }
  if (program[editIndex]?.kind != "screen")
    editIndex = null;
  let select = document.getElementById("screenSelect");
  let after = document.getElementById("screenAfter");
  let afterChoice = after.value || "current";
  select.innerHTML = "";
  after.innerHTML = "";
  select.add(new Option("– neuer Bildschirm –", "new"));
  after.add(new Option("dem aktuellen Eintrag auf der Anzeige", "current"));
  program.forEach((item, index) => {
    if (item.kind == "screen")
      select.add(new Option(`Bildschirm „${item.title}“${index == shown ? " (auf der Anzeige)" : ""}`, index));
    after.add(new Option(`${shortTitle(item)}${index == shown || (item.kind == "heat"
      && position.view == "item" && index == position.index) ? " (auf der Anzeige)" : ""}`, index));
  });
  select.value = editIndex === null ? "new" : editIndex;
  after.value = afterChoice < program.length || afterChoice == "current" ? afterChoice : "current";
  let editing = editIndex !== null;
  for (const id of ["screenChange", "screenEarlier", "screenLater", "screenDelete"])
    document.getElementById(id).hidden = !editing;
  if (editing)
    document.getElementById("screenChange").textContent = `Bildschirm „${program[editIndex].title}“ ändern`;
  document.getElementById("screenEarlier").disabled = !editing || editIndex == 0;
  document.getElementById("screenLater").disabled = !editing || editIndex == program.length - 1;
  document.getElementById("messageBar").hidden = !message;
  if (message)
    document.getElementById("messageTitle").textContent = message.title;
}

/* ================= CONTROL WINDOW VIEW =================  */
function update() {
  updateSchedule();
  sendState();
  renderAnnouncer();
  renderPreview(document.getElementById("nowView"), message ? { view: "message" } : position);
  renderPreview(document.getElementById("nextView"), message ? position : nextPosition());
  document.getElementById("nowTitle").textContent =
    message ? "Jetzt auf der Anzeige: sofort angezeigter Text" : "Jetzt auf der Anzeige";
  document.getElementById("nextTitle").textContent =
    message ? "Danach wieder (Weiter)" : "Als Nächstes";
  let atWelcome = position.view == "welcome";
  document.getElementById("back").disabled = !message && atWelcome && position.index == 0;
  document.getElementById("forward").disabled = !message && !nextPosition();
  document.getElementById("welcomeBreak").disabled = !message && atWelcome;
  let resume = program[atWelcome ? position.index : position.index + 1];
  document.getElementById("welcomeResume").textContent = resume
    ? `danach weiter mit ${shortTitle(resume)}` : "Ende der Startliste";
  // mark the shown entry, or the entry that follows the welcome screen
  document.querySelectorAll("#heatList [data-index]").forEach(button => {
    let index = Number(button.dataset.index);
    button.classList.toggle("current", !atWelcome && index == position.index);
    button.classList.toggle("resume", atWelcome && index == position.index);
  });
  scrollHeatList(document.querySelector("#heatList .current, #heatList .resume"));
  updateEditor();
}
// "WK 2 · Lauf 3" or "Bildschirm „Siegerehrung“"
function shortTitle(item) {
  return item.kind == "heat" ? `WK ${item.competitionId} · Lauf ${item.heatId}`
    : `Bildschirm „${item.title}“`;
}
// Scroll only the heat list (not the page, which scrollIntoView would also
// do) so that the marked entry is visible.
function scrollHeatList(button) {
  if (!button)
    return;
  let list = document.getElementById("heatList");
  let top = button.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  let margin = 40;
  if (top - margin < list.scrollTop)
    list.scrollTop = top - margin;
  else if (top + button.offsetHeight + margin > list.scrollTop + list.clientHeight)
    list.scrollTop = top + button.offsetHeight + margin - list.clientHeight;
}
function setAnnouncerMode(on) {
  announcerMode = on;
  saveSetting("announcerMode", on);
  document.getElementById("announcerMode").checked = on;
  renderAnnouncer();
}
// The current heat in large print for the announcer: names in the order
// they are read out ("Max Mustermann"), with club, year of birth and entry
// time. On the welcome screen and on additional screens, what the display
// shows is named and the heat that follows is shown.
function renderAnnouncer() {
  let element = document.getElementById("announcer");
  element.hidden = !announcerMode;
  document.getElementById("panels").hidden = announcerMode;
  if (!announcerMode || !data)
    return;
  element.innerHTML = "";
  let item = position.view == "item" && !message ? program[position.index] : null;
  let heading = document.createElement("h2");
  element.append(heading);
  if (message || item?.kind == "screen") {
    let screen = message ?? item;
    heading.textContent = message ? "Auf der Anzeige: sofort angezeigter Text" : "Auf der Anzeige: Bildschirm";
    element.append(textBlock("title", screen.title), textBlock("screenText", screen.text));
    if (screen.rows.length) {
      let table = document.createElement("table");
      let head = table.createTHead().insertRow();
      for (const text of [screen.labelHeader || "Platz", "Name", "Verein", "Jg.", "Zeit"])
        head.appendChild(document.createElement("th")).textContent = text;
      let body = table.createTBody();
      for (const entry of screen.rows) {
        let row = body.insertRow();
        for (const text of [entry.label, entry.spokenName, entry.club, entry.born, entry.time || "–"])
          row.insertCell().textContent = text;
        row.lastChild.classList.toggle("missing", !entry.time);
      }
      element.append(table);
      // with a list there is no room for the next heat; just name it
      let following = nextHeat(position.view == "item" && !message ? position.index + 1 : position.index);
      element.append(textBlock("after", following ? `Als nächster Lauf: ${longTitle(following)}`
        : "Danach: Ende der Startliste"));
      return;
    }
  }
  // the heat on the display, or the one that comes next (after a spontaneous
  // screen: the heat it covers)
  let heat = item?.kind == "heat" ? item
    : nextHeat(position.view == "item" && !message ? position.index + 1 : position.index);
  if (!item?.kind || item.kind == "screen" || message) {
    if (!heat) {
      if (!message && item?.kind != "screen")
        heading.textContent = "Begrüßung auf der Anzeige · Ende der Startliste";
      return;
    }
    if (!message && item?.kind != "screen")
      heading.textContent = position.index == 0 ? "Begrüßung auf der Anzeige · es beginnt mit"
        : "Begrüßung auf der Anzeige · als Nächstes";
    else
      element.append(textBlock("following", "Als nächster Lauf:"));
  } else {
    heading.textContent = "Aktueller Lauf";
  }
  element.append(textBlock("title", heatTitle(heat)),
    textBlock("sub", `Lauf ${heat.heatId} von ${heat.heatCount}`
      + (heat.plannedStart ? ` · geplant ${heat.plannedStart} Uhr` : "")));
  let table = document.createElement("table");
  let head = table.createTHead().insertRow();
  for (const text of ["Bahn", "Name", "Verein", "Jg.", "Meldezeit"])
    head.appendChild(document.createElement("th")).textContent = text;
  let body = table.createTBody();
  let [first, last] = laneRange(data.lanes);
  for (let lane = first; lane <= last; ++lane) {
    let swimmer = heat.swimmers[lane];
    let row = body.insertRow();
    row.classList.toggle("empty", !swimmer);
    let texts = swimmer
      ? [lane, swimmer.spokenName, swimmer.club, swimmer.born, swimmer.time || "–"]
      : [lane, "frei", "", "", ""];
    for (const text of texts)
      row.insertCell().textContent = text;
    row.lastChild.classList.toggle("missing", !!swimmer && !swimmer.time);
  }
  element.append(table);
  // what comes after the current heat, as a short line
  if (item?.kind == "heat" && !message) {
    let after = program[position.index + 1];
    element.append(textBlock("after", after ? `Danach: ${longTitle(after)}` : "Danach: Ende der Startliste"));
  }
}
function textBlock(className, text) {
  let element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  return element;
}
function heatTitle(heat) {
  return `Wettkampf ${heat.competitionId} – ${heat.competitionName}`;
}
// "Wettkampf 2 – 100m Brust weiblich · Lauf 3" or "Bildschirm „Pause“"
function longTitle(item) {
  return item.kind == "heat" ? `${heatTitle(item)} · Lauf ${item.heatId}` : `Bildschirm „${item.title}“`;
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
    let hint = upcomingHint(pos);
    element.querySelector(".sub").textContent = pos.index >= program.length
      ? "Begrüßung · Ende der Startliste"
      : hint ? `Begrüßung · mit Hinweis auf ${hint}` : "Begrüßung";
    return;
  }
  let item = pos.view == "message" ? message : program[pos.index];
  if (pos.view == "message" || item.kind == "screen") {
    element.append(textBlock("title", item.title), textBlock("screenText", item.text),
      textBlock("sub", pos.view == "message" ? "sofort angezeigt, nicht im Ablauf" : "Bildschirm im Ablauf"));
    if (item.rows.length) {
      let table = document.createElement("table");
      for (const entry of item.rows) {
        let texts = [entry.label, entry.name, entry.born, entry.time || "–"];
        if (showClub)
          texts.splice(2, 0, entry.club);
        let row = table.insertRow();
        for (const text of texts)
          row.insertCell().textContent = text;
        row.lastChild.classList.toggle("missing", !entry.time);
      }
      element.append(table);
    }
    return;
  }
  let heat = item;
  let table = document.createElement("table");
  let [first, last] = laneRange(data.lanes);
  for (let lane = first; lane <= last; ++lane) {
    let swimmer = heat.swimmers[lane];
    let row = table.insertRow();
    row.classList.toggle("empty", !swimmer);
    let texts = [lane, swimmer?.name ?? "–", swimmer?.born ?? "", swimmer ? swimmer.time || "–" : ""];
    if (showClub)
      texts.splice(2, 0, swimmer?.club ?? "");
    for (const text of texts)
      row.insertCell().textContent = text;
    // an athlete without entry time gets a greyed out dash
    row.lastChild.classList.toggle("missing", !!swimmer && !swimmer.time);
  }
  element.append(textBlock("title", heatTitle(heat)),
    textBlock("sub", `Lauf ${heat.heatId}/${heat.heatCount}`
      + (heat.plannedStart ? ` · geplant ${heat.plannedStart} Uhr` : "")), table);
}
// The running order grouped by competition; a click on a heat or screen
// shows it right away, a click on a competition shows its first heat.
// Screens appear between the heats.
function buildProgramView() {
  let list = document.getElementById("heatList");
  list.innerHTML = "";
  let group = null;
  let newGroup = () => {
    group = document.createElement("div");
    group.className = "competition";
    list.appendChild(group);
  };
  program.forEach((item, index) => {
    let jump = event => {
      event.currentTarget.blur();
      jumpTo(index);
    };
    if (item.kind == "screen") {
      if (!group)
        newGroup();
      let button = document.createElement("button");
      button.className = "screen";
      button.dataset.index = index;
      button.textContent = `▸ ${item.title}`;
      button.addEventListener("click", jump);
      group.appendChild(button);
      return;
    }
    if (item.heatIndex == 0) {
      newGroup();
      let title = document.createElement("button");
      title.className = "title";
      title.textContent = heatTitle(item);
      title.addEventListener("click", jump);
      group.appendChild(title);
    }
    let button = document.createElement("button");
    button.className = "heat";
    button.dataset.index = index;
    button.textContent = `Lauf ${item.heatId}`;
    if (item.plannedStart) {
      let time = document.createElement("small");
      time.textContent = item.plannedStart;
      button.append(time);
    }
    button.addEventListener("click", jump);
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
// On a welcome screen in the middle of the event (a break), the heat that
// follows, e.g. "Wettkampf 11 – 50m Freistil männlich · Lauf 1"; nothing
// before the first and after the last heat.
function upcomingHint(pos = position) {
  if (pos.view != "welcome" || pos.index == 0)
    return null;
  let heat = nextHeat(pos.index);
  return heat ? `${heatTitle(heat)} · Lauf ${heat.heatId}` : null;
}
function sendState() {
  if (!data || !displayWindow || displayWindow.closed)
    return;
  let item = position.view == "item" ? program[position.index] : null;
  let screen = message ?? (item?.kind == "screen" ? item : null);
  let view = screen ? "screen" : item ? "heat" : "welcome";
  let next = null;
  if (view == "heat") {
    let following = program.slice(position.index + 1)
      .find(other => other.kind == "heat" && other.competitionId != item.competitionId);
    if (following)
      next = heatTitle(following);
  }
  displayWindow.postMessage({
    app: "vm",
    type: "state",
    upcoming: view == "welcome" ? upcomingHint() : null,
    version: APP_VERSION,
    event: data.competition,
    lanes: data.lanes,
    showClub,
    view,
    heat: view == "heat" ? item : null,
    screen: screen ? { title: screen.title, text: screen.text, rows: screen.rows,
      labelHeader: screen.labelHeader } : null,
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
    : !connected ? ["bad", "Anzeige: keine Verbindung"]
    : displayStatus.version != APP_VERSION ? ["bad", "Anzeige: alte Programmversion – bitte neu laden"]
    : ["ok", "Anzeige: verbunden"]);
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
