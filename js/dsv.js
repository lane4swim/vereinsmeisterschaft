/* ================= DSV7 FILES =================
   Reading a DSV7 "Vereinsmeldeliste" (e.g. exported by EasyWk) into the
   data model of data/sample.json. Such a file holds the competitions, the
   athletes and their entry times, but no heats and lanes: those are seeded
   here (see seedHeats). Used by the control window only. */

// Is this text a DSV file (rather than JSON)?
function isDsvFile(text) {
  return /^\s*FORMAT\s*:/m.test(stripDsvComments(text));
}

// The DSV data as { competition, lanes, athletes, startlist }, checked
// afterwards by validateData() like a JSON file.
function parseDsv(text, lanes) {
  let elements = readDsvElements(text);
  let format = elements.find(e => e.name == "FORMAT");
  if (!format)
    throw new Error("DSV-Datei ohne FORMAT-Zeile");
  if (format.fields[1] != "7")
    throw new Error(`DSV-Format ${format.fields[1]} wird nicht unterstützt (nur DSV7)`);
  if (!elements.some(e => e.name == "DATEIENDE"))
    throw new Error("DSV-Datei ist unvollständig (DATEIENDE fehlt)");

  let event = elements.find(e => e.name == "VERANSTALTUNG");
  let competitions = new Map();   // Wettkampfnummer -> { name, individual }
  let athletes = [];
  let entries = new Map();        // Wettkampfnummer -> [{ athlete, time, order }]
  let club = "";
  for (const element of elements) {
    let f = element.fields;
    let where = `Zeile ${element.line}`;
    if (element.name == "WETTKAMPF") {
      need(element, 8);
      competitions.set(f[0], { name: competitionName(f), individual: f[3] == "1" });
    } else if (element.name == "VEREIN") {
      club = f[0];
    } else if (element.name == "PNMELDUNG") {
      need(element, 5);
      athletes.push({ id: f[2], name: personName(f[0]), birthday: f[4], club });
    } else if (element.name == "STARTPN") {
      need(element, 3);
      if (!competitions.has(f[1]))
        throw new Error(`${where}: Wettkampf ${f[1]} ist nicht definiert`);
      let time = dsvTime(f[2]);
      if (time === undefined)
        throw new Error(`${where}: Meldezeit "${f[2]}" nicht erkannt (erwartet HH:MM:SS,hh)`);
      if (!entries.has(f[1]))
        entries.set(f[1], []);
      entries.get(f[1]).push({ athlete: f[0], time, order: entries.get(f[1]).length });
    }
  }

  let startlist = {};
  let numbers = [...competitions.keys()].sort((a, b) => Number(a) - Number(b));
  for (const number of numbers) {
    // relays (and competitions without entries) have nothing to show
    if (!competitions.get(number).individual || !entries.has(number))
      continue;
    startlist[number] = {
      name: competitions.get(number).name,
      heats: seedHeats(entries.get(number), lanes),
    };
  }
  return {
    competition: event?.fields[0] || "Veranstaltung",
    lanes,
    athletes,
    startlist,
  };
}

// Elements with their fields, e.g. "WETTKAMPF: 1;E;1;1;100;B;GL;M;;;" ->
// { name: "WETTKAMPF", fields: ["1", "E", ...], line: 10 }.
function readDsvElements(text) {
  let elements = [];
  stripDsvComments(text).split(/\r?\n/).forEach((line, i) => {
    line = line.trim();
    if (line == "")
      return;
    let colon = line.indexOf(":");
    if (colon < 0) {
      elements.push({ name: line, fields: [], line: i + 1 });
      return;
    }
    let fields = line.slice(colon + 1).split(";").map(field => field.trim());
    if (fields.at(-1) == "")
      fields.pop(); // every element ends with ";"
    elements.push({ name: line.slice(0, colon).trim(), fields, line: i + 1 });
  });
  return elements;
}
// Comments "(* ... *)" may stand on their own line or after an element;
// line breaks inside them are kept so that line numbers stay right.
function stripDsvComments(text) {
  return text.replace(/\(\*[\s\S]*?\*\)/g, comment => comment.replace(/[^\n]/g, ""));
}
function need(element, count) {
  if (element.fields.length < count)
    throw new Error(`Zeile ${element.line}: ${element.name} hat ${element.fields.length} `
      + `statt mindestens ${count} Angaben`);
}

// "100;B;GL;M" -> "100 m Brust männlich"
const DSV_STROKES = { F: "Freistil", R: "Rücken", B: "Brust", S: "Schmetterling", L: "Lagen" };
const DSV_EXERCISES = { BE: "Beine", AR: "Arme", ST: "Start", WE: "Wende", GB: "Gleitübung" };
const DSV_GENDERS = { M: "männlich", W: "weiblich", X: "mixed", D: "divers" };
function competitionName(f) {
  let [distance, stroke, exercise, gender] = [f[4], f[5], f[6], f[7]];
  let parts = [`${distance} m`, DSV_STROKES[stroke] ?? "", DSV_EXERCISES[exercise] ?? "",
    DSV_GENDERS[gender] ?? ""];
  if (f[1] == "V")
    parts.push("Vorlauf");
  else if (f[1] == "Z")
    parts.push("Zwischenlauf");
  else if (f[1] == "F")
    parts.push("Finale");
  return parts.filter(part => part != "").join(" ");
}
// "Aehling, Bea" -> "Bea Aehling"
function personName(name) {
  let comma = name.indexOf(",");
  if (comma < 0)
    return name;
  return `${name.slice(comma + 1).trim()} ${name.slice(0, comma).trim()}`;
}
// "00:01:20,33" -> 80.33; "00:00:00,00" -> null (no entry time);
// undefined if the time cannot be read.
function dsvTime(text) {
  let match = text.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{2})$/);
  if (!match)
    return undefined;
  let [hours, minutes, seconds, hundredths] = match.slice(1).map(Number);
  let total = hours * 3600 + minutes * 60 + seconds + hundredths / 100;
  return total > 0 ? Number(total.toFixed(2)) : null;
}

/* ================= SEEDING =================
   Heats and lanes as usual in swimming:
   - the fastest entry times swim in the last heat, the slowest (and those
     without entry time) in the first heats
   - full heats from the back; the first heat takes the rest, but gets at
     least 3 swimmers (taken from the following heat) if there are enough
   - within a heat the fastest swims in the middle lane, then alternately
     right and left of it (4 lanes: 2, 3, 1, 4; 8 lanes: 4, 5, 3, 6, 2, 7, 1, 8) */
function seedHeats(entries, lanes) {
  let sorted = [...entries].sort((a, b) =>
    (a.time ?? Infinity) - (b.time ?? Infinity) || a.order - b.order);
  let sizes = heatSizes(sorted.length, lanes);
  let order = laneOrder(lanes);
  let heats = {};
  let next = 0;
  // the last heat gets the fastest swimmers
  for (let heat = sizes.length; heat >= 1; --heat) {
    let field = {};
    sorted.slice(next, next + sizes[heat - 1]).forEach((entry, i) => {
      field[order[i]] = { athlete: entry.athlete, ...(entry.time ? { time: entry.time } : {}) };
    });
    next += sizes[heat - 1];
    heats[heat] = field;
  }
  return heats;
}
// Swimmers per heat, first heat first: 9 swimmers on 4 lanes -> [3, 2, 4]
function heatSizes(count, lanes) {
  let heats = Math.ceil(count / lanes);
  let sizes = Array(heats).fill(lanes);
  sizes[0] = count - lanes * (heats - 1);
  if (heats > 1 && sizes[0] < 3) {
    let missing = Math.min(3, lanes) - sizes[0];
    sizes[0] += missing;
    sizes[1] -= missing;
  }
  return sizes;
}
// Lane numbers from the middle outwards
function laneOrder(lanes) {
  let [first, last] = laneRange(lanes);
  let middle = first + Math.floor((last - first) / 2);
  let order = [middle];
  for (let step = 1; order.length < lanes; ++step) {
    if (middle + step <= last)
      order.push(middle + step);
    if (middle - step >= first && order.length < lanes)
      order.push(middle - step);
  }
  return order;
}
