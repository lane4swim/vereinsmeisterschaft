/* ================= DATA FILE =================
   Reading and checking the uploaded data file, shared by the control
   window (index.html) and the display window (display.html). */

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
  if (!Number.isInteger(data.lanes) || data.lanes < 1)
    throw new Error('Eintrag "lanes" (Anzahl der Bahnen) fehlt oder ist keine positive Zahl');
  let athletes = athleteMap(data.athletes);
  if (typeof data.startlist != "object" || data.startlist === null)
    throw new Error('Eintrag "startlist" fehlt');
  let [firstLane, lastLane] = laneRange(data.lanes);
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
    for (const heat in competition.heats) {
      let seen = new Set();
      for (const lane in competition.heats[heat]) {
        let where = `Wettkampf ${key}, Lauf ${heat}, Bahn ${lane}`;
        if (!/^\d+$/.test(lane) || Number(lane) < firstLane || Number(lane) > lastLane)
          throw new Error(`Wettkampf ${key}, Lauf ${heat}: "${lane}" ist keine Bahn `
            + `(erlaubt: ${firstLane}–${lastLane})`);
        let id = athleteId(competition.heats[heat][lane]);
        if (id === null)
          continue; // empty lane
        if (!athletes.has(id))
          throw new Error(`${where}: Athlet "${id}" steht nicht in "athletes"`);
        if (seen.has(id))
          throw new Error(`${where}: Athlet "${id}" ist in diesem Lauf mehrfach eingetragen`);
        seen.add(id);
        let time = competition.heats[heat][lane].time;
        if (!hasNoTime(time) && !(typeof time == "number" && Number.isFinite(time) && time > 0))
          throw new Error(`${where}: Meldezeit ${JSON.stringify(time)} ist keine Zahl in Sekunden `
            + '(z. B. 85.4 für 1:25,40)');
      }
    }
  }
}
// The athletes by id. Every athlete needs a unique id and a name; the
// birthday may be a full date ("1970-05-12" or "12.05.1970") or just the year.
function athleteMap(list) {
  if (!Array.isArray(list))
    throw new Error('Eintrag "athletes" (Liste der Athleten) fehlt');
  let athletes = new Map();
  list.forEach((athlete, i) => {
    let id = athlete?.id;
    if ((typeof id != "string" && typeof id != "number") || String(id).trim() == "")
      throw new Error(`Athlet Nr. ${i + 1} in "athletes" hat keine id`);
    id = String(id).trim();
    if (athletes.has(id))
      throw new Error(`Die id "${id}" ist in "athletes" mehrfach vergeben`);
    if (typeof athlete.name != "string" || athlete.name.trim() == "")
      throw new Error(`Athlet "${id}" hat keinen Namen`);
    let year = birthYear(athlete.birthday);
    if (year === null)
      throw new Error(`Athlet "${id}": Geburtsdatum "${athlete.birthday}" nicht erkannt `
        + '(erwartet z. B. "1970-05-12", "12.05.1970" oder "1970")');
    athletes.set(id, {
      name: athlete.name,
      born: year,
      club: typeof athlete.club == "string" ? athlete.club : "",
    });
  });
  return athletes;
}
// The year of birth ("Jahrgang") shown on the display; "" if not given.
function birthYear(birthday) {
  if (birthday === undefined || birthday === null || birthday === "")
    return "";
  let text = String(birthday).trim();
  let match = text.match(/^(\d{4})(-\d{1,2}-\d{1,2})?$/) || text.match(/^\d{1,2}\.\d{1,2}\.(\d{4})$/);
  return match ? match[1] : null;
}
// No entry time: missing, null, "" or 0. The display shows a grey dash.
function hasNoTime(time) {
  return time === undefined || time === null || time === "" || time === 0;
}
// Entry time in seconds as shown on the display: 85.4 -> "1:25,40",
// 28.5 -> "0:28,50", rounded to hundredths.
function formatTime(seconds) {
  // toFixed removes float noise first (1.005 * 100 is 100.49999…)
  let hundredths = Math.round(Number((seconds * 100).toFixed(6)));
  let minutes = Math.floor(hundredths / 6000);
  let rest = hundredths % 6000;
  let secs = String(Math.floor(rest / 100)).padStart(2, "0");
  let fraction = String(rest % 100).padStart(2, "0");
  return `${minutes}:${secs},${fraction}`;
}
// The athlete id a lane refers to, or null for an empty lane
// (lane missing, {} or "athlete": "" / null).
function athleteId(entry) {
  let id = entry?.athlete;
  if ((typeof id != "string" && typeof id != "number") || String(id).trim() == "")
    return null;
  return String(id).trim();
}
// Pools with fewer than 10 lanes number them from 1, larger pools from 0
// (a 10-lane pool has lanes 0-9).
function laneRange(lanes) {
  return lanes < 10 ? [1, lanes] : [0, lanes - 1];
}
// All heats of the start list in running order, so the current position is a
// single index and "next"/"previous" never have to deal with competitions.
function buildHeatList(data) {
  let athletes = athleteMap(data.athletes);
  let list = [];
  for (const competitionId of Object.keys(data.startlist)) {
    let competition = data.startlist[competitionId];
    let heatIds = Object.keys(competition.heats);
    heatIds.forEach((heatId, i) => list.push({
      competitionId,
      competitionName: competition.name,
      heatId,
      heatIndex: i,
      heatCount: heatIds.length,
      swimmers: swimmersOf(competition.heats[heatId], athletes),
    }));
  }
  return list;
}
// The swimmers of one heat by lane number, with the athlete's details looked
// up by id. Empty lanes are left out.
function swimmersOf(field, athletes) {
  let swimmers = {};
  for (const lane in field) {
    let id = athleteId(field[lane]);
    if (id === null)
      continue;
    let time = field[lane].time;
    swimmers[Number(lane)] = { ...athletes.get(id), time: hasNoTime(time) ? "" : formatTime(time) };
  }
  return swimmers;
}
