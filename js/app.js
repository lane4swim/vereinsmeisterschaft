let competitions = Object.keys(json);
let heats = Object.keys(json["1"]["heats"]);
let oldCompetition = 0;
let currentCompetition = 0;
let currentHeat = 0;
function init() {
  loadCompetitions();
  updateCompetitions();
  loadCurrent();
}

function loadCompetitions() {
  let list = document.getElementById("list");
  list.innerHTML = "";
  let i = 0;
  for (const key of competitions.slice(0, 6)) {
    let name = json[key]["name"];
    let li = document.createElement("li");
    li.innerHTML = `Wettkampf ${key} - ${name}`;
    li.id = `competition${i}`;
    i ++;
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
  let field = json[competition]["heats"][heat];
  for (const key in field) {
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
