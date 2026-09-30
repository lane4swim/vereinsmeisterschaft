/* ================= CSV START LISTS =================
   Reading a start list exported by EasyWk as CSV ("Meldeergebnis.csv":
   one line per start, separated by ";", heats and lanes already set) into
   the data model of data/sample.json. Used by the control window only. */

const CSV_COLUMNS = ["Wk", "WkName", "Lauf", "Bahn", "Nachname", "Vorname", "Jahrgang",
  "Verein", "Meldezeit"];

// Is this text such a CSV start list (rather than JSON)?
function isCsvStartlist(text) {
  let header = splitCsvLine(text.split(/\r?\n/, 1)[0]);
  return ["Wk", "Lauf", "Bahn"].every(column => header.includes(column));
}

// The start list as { competition, lanes, athletes, startlist }, checked
// afterwards by validateData() like a JSON file. The event name is not in
// the file and comes from the start screen.
function parseCsvStartlist(text, eventName) {
  let lines = text.split(/\r?\n/);
  let header = splitCsvLine(lines[0]);
  let missing = CSV_COLUMNS.filter(column => !header.includes(column));
  if (missing.length)
    throw new Error(`in der CSV-Datei fehlen die Spalten ${missing.join(", ")}`);

  let athletes = new Map();   // id -> athlete
  let startlist = {};
  let year = "";
  let lanes = [];
  lines.slice(1).forEach((line, i) => {
    if (line.trim() == "")
      return;
    let where = `Zeile ${i + 2}`;
    let values = splitCsvLine(line);
    let row = Object.fromEntries(header.map((column, c) => [column, (values[c] ?? "").trim()]));
    if (!/^\d+$/.test(row.Lauf) || !/^\d+$/.test(row.Bahn))
      throw new Error(`${where}: Lauf "${row.Lauf}" oder Bahn "${row.Bahn}" ist keine Zahl`);
    let time = csvTime(row.Meldezeit);
    if (time === undefined)
      throw new Error(`${where}: Meldezeit "${row.Meldezeit}" nicht erkannt (erwartet mm:ss,hh)`);

    // relays have no person name; then the club stands in the lane
    let name = `${row.Vorname} ${row.Nachname}`.trim() || row.Verein;
    let id = row.InternePersonenId || `${name}|${row.Jahrgang}|${row.Verein}`;
    if (!athletes.has(id))
      athletes.set(id, { id, name, birthday: row.Jahrgang, club: row.Verein });

    let competition = startlist[row.Wk] ??= { name: competitionTitle(row), heats: {} };
    let heat = competition.heats[Number(row.Lauf)] ??= {};
    // planned start time of the heat, shown in the control window
    if (/^\d{1,2}:\d{2}$/.test(row.Uhrzeit ?? ""))
      (competition.starts ??= {})[Number(row.Lauf)] ??= row.Uhrzeit;
    let lane = Number(row.Bahn);
    if (heat[lane])
      throw new Error(`${where}: Wettkampf ${row.Wk}, Lauf ${row.Lauf}, Bahn ${lane} ist doppelt belegt`);
    heat[lane] = { athlete: id, ...(time ? { time } : {}) };
    lanes.push(lane);
    year ||= row.Datum?.match(/\d{4}$/)?.[0] ?? "";
  });
  if (!lanes.length)
    throw new Error("die CSV-Datei enthält keine Starts");

  return {
    competition: eventName || `Vereinsmeisterschaften ${year}`.trim(),
    lanes: laneCount(lanes),
    athletes: [...athletes.values()],
    startlist,
  };
}

// Fields of one line; fields in "..." may contain ";" and doubled quotes.
function splitCsvLine(line) {
  let fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; ++i) {
    let c = line[i];
    if (quoted) {
      if (c == '"' && line[i + 1] == '"')
        field += line[++i];
      else if (c == '"')
        quoted = false;
      else
        field += c;
    } else if (c == '"') {
      quoted = true;
    } else if (c == ";") {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}
// "100m Brust männlich", with the kind of race unless it is a final
// ("Entscheidung"), e.g. "100m Brust männlich – Vorlauf"
function competitionTitle(row) {
  let kind = row.WkTyp ?? "";
  return kind == "" || kind == "Entscheidung" ? row.WkName : `${row.WkName} – ${kind}`;
}
// "01:44,74" -> 104.74, also "0:01:44,74"; "00:00,00" -> null (no entry
// time); undefined if the time cannot be read
function csvTime(text) {
  if (text == "")
    return null;
  let match = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,2})$/);
  if (!match)
    return undefined;
  let [hours, minutes, seconds] = [match[1] ?? 0, match[2], match[3]].map(Number);
  let total = hours * 3600 + minutes * 60 + seconds + Number(`0.${match[4]}`);
  return total > 0 ? Number(total.toFixed(2)) : null;
}
// Number of lanes from the lanes used: lane 0 means a pool with lanes 0-9
// (see laneRange), otherwise the highest lane number.
function laneCount(lanes) {
  let highest = Math.max(...lanes);
  return Math.min(...lanes) == 0 ? Math.max(10, highest + 1) : highest;
}
