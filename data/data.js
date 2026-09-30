/* ================= BEGIN DATA SECTION =================  */
const json = {
  "competition": "Vereinsmeisterschaften 2025",
  "lanes": 4,
  /* every athlete once, with a unique id; the heats refer to this id */
  "athletes": [
    { "id": "1", "name": "Max Mustermann", "birthday": "1970-05-12", "club": "WSV Schermbeck" },
    { "id": "2", "name": "Erika Musterfrau", "birthday": "1985", "club": "WSV Schermbeck" }
  ],
  "startlist": {
    "1": {
      "name": "100 m Brust männlich",
      "heats": {
        "1": {
          "1": { "athlete": "1", "time": "1:25,40" }
        }
      }
    },
    "2": {
      "name": "100 m Brust weiblich",
      "heats": {
        "1": {
          "2": { "athlete": "2", "time": "1:31,10" }
        }
      }
    }
  }
};
/* ================= END DATA SECTION =================  */
