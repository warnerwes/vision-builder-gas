/** One-click UUID filler + simple name lookup functions for formulas. */

// Fill missing IDs on a given sheet (column header must be exactly "id")
function fillMissingIdsForSheet(sheetName) {
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) {throw new Error(`No sheet: ${sheetName}`);}
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = headers.indexOf('id') + 1;
  if (col <= 0) {throw new Error(`No "id" column on ${sheetName}`);}

  const last = sh.getLastRow();
  if (last < 2) {return 0;}

  const rng = sh.getRange(2, col, last - 1, 1);
  const vals = rng.getValues();
  let wrote = 0;
  for (let i = 0; i < vals.length; i++) {
    if (!String(vals[i][0]).trim()) { vals[i][0] = Utilities.getUuid(); wrote++; }
  }
  if (wrote) {rng.setValues(vals);}
  return wrote;
}

// Convenience: fill all common tabs
function fillMissingIdsAll() {
  const names = Object.values(SHEET_IDS);
  let total = 0;
  names.forEach(n => { try { total += fillMissingIdsForSheet(n) || 0; } catch (_e) {} });
  SpreadsheetApp.getUi().alert(`Generated ${total} missing id(s).`);
}

/* ----- Custom functions for sheet formulas ----- */
function CLASSNAME(id){ return _lookupName_(SHEET_IDS.Classes, id, ['name']); }
function MISSIONNAME(id){ return _lookupName_(SHEET_IDS.Missions, id, ['label','name']); }
function USERNAME(id){ return _lookupName_(SHEET_IDS.Users, id, ['displayName','email']); }

function _lookupName_(sheetName, id, nameFields) {
  if (!id) {return '';}
  const rows = readRows_(sheetName);
  const r = rows.find(x => String(x.id) === String(id));
  if (!r) {return '';}
  for (const f of nameFields) {if (r[f]) {return String(r[f]);}}
  return '';
}
