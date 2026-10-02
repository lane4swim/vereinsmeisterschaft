/* ================= DATA FILE =================
   Reading and checking the uploaded data file, shared by the control
   window (index.html) and the display window (display.html). */

// Program version, shared by both windows. Change it with every update of
// the program: a display window that was opened with an older version then
// notices the difference and reloads itself (see display.js).
const APP_VERSION = "2026-10-02.2";

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
    // optional planned start times per heat, e.g. "starts": { "1": "11:00" }
    for (const heat in competition.starts ?? {}) {
      if (!(heat in competition.heats))
        throw new Error(`Wettkampf ${key}: Startzeit für Lauf ${heat}, den es nicht gibt`);
      if (!/^\d{1,2}:\d{2}$/.test(competition.starts[heat]))
        throw new Error(`Wettkampf ${key}, Lauf ${heat}: Startzeit "${competition.starts[heat]}" `
          + 'nicht erkannt (erwartet z. B. "11:04")');
    }
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
  validateScreens(data);
}
// Optional additional screens between the heats (title and text), e.g.
// { "after": { "competition": "8", "heat": "5" }, "title": "Siegerehrung",
// "text": "Wettkämpfe 1–8" }. Without "after" the screen comes before the
// first heat. A screen may have a list, shown like a heat: entries
// { "label": "1.", "athlete": "17", "time": 85.4 } (an athlete by id) or
// { "label": "1.", "name": "Mustermann, Max", "born": "2012", "club": "…",
// "time": "1:25,40" }; "headers" can rename the columns, e.g. { "label":
// "Rang", "time": "Endzeit" } (see LIST_HEADERS for the defaults).
function validateScreens(data) {
  if (data.screens === undefined)
    return;
  if (!Array.isArray(data.screens))
    throw new Error('Eintrag "screens" muss eine Liste sein');
  data.screens.forEach((screen, i) => {
    let which = `Bildschirm Nr. ${i + 1} in "screens"`;
    if (typeof screen?.title != "string" || screen.title.trim() == "")
      throw new Error(`${which} hat keinen Titel ("title")`);
    if (screen.text !== undefined && typeof screen.text != "string")
      throw new Error(`${which}: "text" muss ein Text sein`);
    if (screen.labelHeader !== undefined && typeof screen.labelHeader != "string")
      throw new Error(`${which}: "labelHeader" muss ein Text sein`);
    if (screen.headers !== undefined) {
      if (typeof screen.headers != "object" || screen.headers === null || Array.isArray(screen.headers))
        throw new Error(`${which}: "headers" muss ein Objekt sein, z. B. { "label": "Rang" }`);
      for (const key in screen.headers) {
        if (!(key in LIST_HEADERS))
          throw new Error(`${which}: unbekannte Spalte "${key}" in "headers" `
            + `(möglich: ${Object.keys(LIST_HEADERS).join(", ")})`);
        if (typeof screen.headers[key] != "string")
          throw new Error(`${which}: Spaltenkopf "${key}" muss ein Text sein`);
      }
    }
    if (screen.list !== undefined) {
      if (!Array.isArray(screen.list))
        throw new Error(`${which}: "list" muss eine Liste sein`);
      let athletes = athleteMap(data.athletes);
      screen.list.forEach((entry, j) => {
        let where = `${which}, Listeneintrag ${j + 1}`;
        if (entry?.athlete !== undefined && entry.athlete !== null && entry.athlete !== "") {
          if (!athletes.has(String(entry.athlete).trim()))
            throw new Error(`${where}: Athlet "${entry.athlete}" steht nicht in "athletes"`);
        } else if (typeof entry?.name != "string" || entry.name.trim() == "") {
          throw new Error(`${where} hat keinen Namen ("name" oder "athlete")`);
        }
        let time = entry.time;
        if (!hasNoTime(time) && typeof time != "string"
            && !(typeof time == "number" && Number.isFinite(time) && time > 0))
          throw new Error(`${where}: Zeit ${JSON.stringify(time)} nicht erkannt`);
      });
    }
    if (screen.after === undefined || screen.after === null)
      return;
    let competition = data.startlist[String(screen.after.competition)];
    if (!competition || !(String(screen.after.heat) in competition.heats))
      throw new Error(`${which} steht nach Wettkampf ${screen.after.competition}, `
        + `Lauf ${screen.after.heat}, den es nicht gibt`);
  });
}
// The running order: all heats (see buildHeatList), each followed by the
// screens placed after it; screens without "after" come first.
// Heats: { kind: "heat", ... }, screens: { kind: "screen", title, text }.
function buildProgram(data) {
  let athletes = athleteMap(data.athletes);
  let screens = (data.screens ?? []).map(screen => ({
    ...makeScreen(screen, athletes),
    after: screen.after ? `${screen.after.competition}/${screen.after.heat}` : "",
  }));
  let program = screens.filter(screen => screen.after == "");
  for (const heat of buildHeatList(data)) {
    program.push({ kind: "heat", ...heat });
    program.push(...screens.filter(screen =>
      screen.after == `${heat.competitionId}/${heat.heatId}`));
  }
  return program;
}
// Column headers of a list on a screen, unless the screen renames them
const LIST_HEADERS = { label: "Platz", name: "Name", club: "Verein", born: "Jahrgang", time: "Zeit" };
// A screen of the running order: { kind: "screen", title, text, list (as in
// the data file), headers (only the renamed columns), rows (the list as
// shown, see listRows) }. The former "labelHeader" is read as headers.label.
function makeScreen(screen, athletes) {
  let list = screen.list ?? [];
  let headers = {};
  let given = { ...(screen.labelHeader ? { label: screen.labelHeader } : {}), ...screen.headers };
  for (const key in LIST_HEADERS) {
    let text = (given[key] ?? "").trim();
    if (text != "" && text != LIST_HEADERS[key])
      headers[key] = text;
  }
  return {
    kind: "screen",
    title: screen.title.trim(),
    text: (screen.text ?? "").trim(),
    list,
    headers,
    rows: listRows(list, athletes),
  };
}
// all column headers of a screen's list, defaults filled in
function listHeaders(screen) {
  return { ...LIST_HEADERS, ...screen.headers };
}
// The entries of a list as shown: label, name ("Nachname, Vorname"), name in
// spoken order, club, year of birth and time ("1:25,40", or "" for none)
function listRows(list, athletes) {
  return list.map(entry => {
    let id = athleteId(entry);
    let athlete = id !== null ? athletes.get(id) : null;
    let text = value => value === undefined || value === null ? "" : String(value).trim();
    let name = athlete?.name ?? text(entry.name);
    return {
      label: text(entry.label),
      name,
      // "Mustermann, Max" is read out as "Max Mustermann"
      spokenName: athlete?.spokenName ?? name.replace(/^([^,]+),\s*(.+)$/, "$2 $1"),
      club: text(entry.club) || athlete?.club || "",
      born: text(entry.born) || athlete?.born || "",
      time: hasNoTime(entry.time) ? "" : typeof entry.time == "number" ? formatTime(entry.time) : text(entry.time),
    };
  });
}
// The "screens" entry for the data file from the running order: each screen
// placed after the heat before it.
function screensOf(program) {
  let screens = [];
  let lastHeat = null;
  for (const item of program) {
    if (item.kind == "heat")
      lastHeat = item;
    else
      screens.push({
        ...(lastHeat ? { after: { competition: lastHeat.competitionId, heat: lastHeat.heatId } } : {}),
        title: item.title,
        ...(item.text ? { text: item.text } : {}),
        ...(item.list.length ? { list: item.list } : {}),
        ...(Object.keys(item.headers).length ? { headers: item.headers } : {}),
      });
  }
  return screens;
}
// The athletes by id. Every athlete needs a unique id and a last name
// ("lastName", usually with "firstName"); the display shows "Nachname,
// Vorname". Entries that are not a person (e.g. a relay team) may give a
// "name" instead, which is shown as it is. The birthday may be a full date
// ("1970-05-12" or "12.05.1970") or just the year.
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
    let name = displayName(athlete);
    if (name == "")
      throw new Error(`Athlet "${id}" hat keinen Namen ("lastName" und "firstName")`);
    let year = birthYear(athlete.birthday);
    if (year === null)
      throw new Error(`Athlet "${id}": Geburtsdatum "${athlete.birthday}" nicht erkannt `
        + '(erwartet z. B. "1970-05-12", "12.05.1970" oder "1970")');
    athletes.set(id, {
      name,
      spokenName: spokenName(athlete),
      born: year,
      club: typeof athlete.club == "string" ? athlete.club : "",
    });
  });
  return athletes;
}
// "Mustermann, Max" from lastName and firstName, or "name" as it is
function displayName(athlete) {
  let text = value => typeof value == "string" ? value.trim() : "";
  let [last, first] = [text(athlete.lastName), text(athlete.firstName)];
  if (last != "")
    return first != "" ? `${last}, ${first}` : last;
  return text(athlete.name);
}
// "Max Mustermann", the order in which the announcer reads the name
function spokenName(athlete) {
  let text = value => typeof value == "string" ? value.trim() : "";
  let [last, first] = [text(athlete.lastName), text(athlete.firstName)];
  if (last != "")
    return `${first} ${last}`.trim();
  return text(athlete.name);
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
      plannedStart: competition.starts?.[heatId] ?? "",
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
