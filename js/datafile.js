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
  if (typeof data.startlist != "object" || data.startlist === null)
    throw new Error('Eintrag "startlist" fehlt');
  if (!Number.isInteger(data.lanes) || data.lanes < 1)
    throw new Error('Eintrag "lanes" (Anzahl der Bahnen) fehlt oder ist keine positive Zahl');
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
    for (const heat in competition.heats)
      for (const lane in competition.heats[heat])
        if (!/^\d+$/.test(lane) || Number(lane) < firstLane || Number(lane) > lastLane)
          throw new Error(`Wettkampf ${key}, Lauf ${heat}: "${lane}" ist keine Bahn `
            + `(erlaubt: ${firstLane}–${lastLane})`);
  }
}
// Pools with fewer than 10 lanes number them from 1, larger pools from 0
// (a 10-lane pool has lanes 0-9).
function laneRange(lanes) {
  return lanes < 10 ? [1, lanes] : [0, lanes - 1];
}
// All heats of the start list in running order, so the current position is a
// single index and "next"/"previous" never have to deal with competitions.
function buildHeatList(startlist) {
  let list = [];
  for (const competitionId of Object.keys(startlist)) {
    let competition = startlist[competitionId];
    let heatIds = Object.keys(competition.heats);
    heatIds.forEach((heatId, i) => list.push({
      competitionId,
      competitionName: competition.name,
      heatId,
      heatIndex: i,
      heatCount: heatIds.length,
      swimmers: swimmersOf(competition.heats[heatId]),
    }));
  }
  return list;
}
// The swimmers of one heat by lane number. A lane listed without a swimmer
// name (e.g. {} or "name": "") counts as empty and is left out.
function swimmersOf(field) {
  let swimmers = {};
  for (const key in field) {
    let swimmer = field[key];
    if (typeof swimmer?.name != "string" || swimmer.name.trim() == "")
      continue;
    swimmers[Number(key)] = {
      name: swimmer.name,
      born: swimmer.born ?? "",
      time: swimmer.time ?? "",
    };
  }
  return swimmers;
}
