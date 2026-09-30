let json = null;
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
  let keys = Object.keys(data);
  if (keys.length == 0)
    throw new Error("keine Wettkämpfe enthalten");
  for (const key of keys) {
    let competition = data[key];
    if (typeof competition?.name != "string")
      throw new Error(`Wettkampf ${key} hat keinen Namen`);
    if (typeof competition.heats != "object" || competition.heats === null
        || Object.keys(competition.heats).length == 0)
      throw new Error(`Wettkampf ${key} hat keine Läufe`);
  }
}
function showUploadError(message) {
  document.getElementById("uploadError").textContent = message;
}
function startCompetition(data) {
  json = data;
  competitions = Object.keys(json);
  currentCompetition = 0;
  currentHeat = 0;
  showUploadError("");
  loadCompetitions();
  updateCompetitions();
  loadCurrent();
  document.body.classList.add("loaded");
}

/* ================= DISPLAY =================  */
function loadCompetitions() {
  let list = document.getElementById("list");
  list.innerHTML = "";
  for (let i = 0; i < 6; ++i) {
    let li = document.createElement("li");
    li.id = `competition${i}`;
    list.appendChild(li);
  }
  document.getElementById("competition0").classList.add("selected");
}
function updateCompetitions() {
  for (let i = 0; i < 6; ++i) {
    if (currentCompetition + i >= competitions.length) {
      document.getElementById(`competition${i}`).innerHTML = "";
    } else {
      let key = competitions[i + currentCompetition];
      let name = json[key]["name"];
      document.getElementById(`competition${i}`).innerHTML = `Wettkampf ${key} - ${name}`;
    }
  }

}
function loadCurrent() {
  let competition = competitions[currentCompetition];
  heats = Object.keys(json[competition]["heats"]);
  let heat = heats[currentHeat];
  document.getElementById("competition").innerHTML = json[competition]["name"];
  document.getElementById("competitionId").innerHTML = competition;
  document.getElementById("heat").innerHTML = heat;
  // clear all lanes so empty lanes don't keep the previous heat's swimmers
  for (let lane = 1; document.getElementById(`name${lane}`); ++lane) {
    document.getElementById(`name${lane}`).innerHTML = "";
    document.getElementById(`born${lane}`).innerHTML = "";
    document.getElementById(`time${lane}`).innerHTML = "";
  }
  let field = json[competition]["heats"][heat];
  for (const key in field) {
    if (!document.getElementById(`name${key}`))
      continue; // lane not shown in the table
    document.getElementById(`name${key}`).innerHTML = field[key]["name"];
    document.getElementById(`born${key}`).innerHTML = field[key]["born"];
    document.getElementById(`time${key}`).innerHTML = field[key]["time"];
  }
}
function advance() {
  if (currentHeat == heats.length - 1) {
    if (currentCompetition == competitions.length - 1) {
      return; // Alternativ: Wettkampf beendet
    }
    // advance competition
    currentCompetition++;
    currentHeat = 0;
    updateCompetitions();
  }
  else
    currentHeat++;
  loadCurrent();
}
function retreat() {
  if (currentHeat == 0) {
    if (currentCompetition == 0)
      return;
    currentCompetition--;
    let competition = competitions[currentCompetition];
    heats = Object.keys(json[competition]["heats"]);
    currentHeat = heats.length - 1;
    updateCompetitions();
  }
  else
    currentHeat--;
  loadCurrent();
}
