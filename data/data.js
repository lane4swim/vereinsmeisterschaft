/* ================= BEGIN DATA SECTION =================  */
const json = {
  "competition": "Vereinsmeisterschaften 2025",
  "lanes": 4,
  /* entry times ("time" in the heats) are given in seconds, e.g. 85.4 = 1:25,40 */
  /* every athlete once, with a unique id; the heats refer to this id.
     The display shows "lastName, firstName". */
  "athletes": [
    { "id": "1", "lastName": "Mustermann", "firstName": "Max", "birthday": "1970-05-12", "club": "WSV Schermbeck" },
    { "id": "2", "lastName": "Musterfrau", "firstName": "Erika", "birthday": "1985", "club": "WSV Schermbeck" }
  ],
  "startlist": {
    "1": {
      "name": "100 m Brust männlich",
      /* optional: planned start time per heat, shown in the control window */
      "starts": { "1": "11:00" },
      "heats": {
        "1": {
          "1": { "athlete": "1", "time": 85.4 }
        }
      }
    },
    "2": {
      "name": "100 m Brust weiblich",
      "heats": {
        "1": {
          "2": { "athlete": "2", "time": 91.1 }
        }
      }
    }
  },
  /* optional: screens with title and text between the heats, shown with
     "Weiter"; without "after" a screen comes before the first heat.
     The control window can add and change them and save everything. */
  "screens": [
    { "after": { "competition": "1", "heat": "1" }, "title": "Pause", "text": "Weiter um 12:30 Uhr" }
  ]
};
/* ================= END DATA SECTION =================  */
