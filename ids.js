/** IDs.gs — quick ID lookup + helper sheet + highlight */

function openIdLookup() {
  const html = HtmlService.createHtmlOutputFromFile('Ids')
    .setTitle('RoboTeamUp — ID Lookup').setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

function api_ids_bootstrap() {
  // Return compact lists for sidebar
  const classes = safeRows_(SHEET_IDS.Classes).map(c => ({
    id: c.id, name: c.name || '(unnamed)', type: c.type || '', classroomCourseId: c.classroomCourseId || ''
  }));

  const users = safeRows_(SHEET_IDS.Users).map(u => ({
    id: u.id, name: u.displayName || '(no name)', email: u.email || '', role: u.role || '', grade: u.gradeLevel || ''
  }));

  const missions = safeRows_(SHEET_IDS.Missions).map(m => ({
    id: m.id, name: m.label || m.name || '(no label)', active: String(m.active || '')
  }));

  const teams = safeRows_(SHEET_IDS.Teams).map(t => ({
    id: t.id, name: t.name || '(no name)', classId: t.classId || ''
  }));

  // quick map for class name lookup
  const classNameById = Object.fromEntries(classes.map(c => [c.id, c.name]));
  return { classes, users, missions, teams, classNameById };
}

// Create/refresh a single sheet listing Name ↔ ID for common entities
function buildIdLookupSheet() {
  const ss = SpreadsheetApp.getActive();
  const sheetName = 'ID_Lookup';
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName); else sh.clear();

  const { classes, users, missions, teams, classNameById } = api_ids_bootstrap();

  let r = 1;
  r = writeSection_(sh, r, 'Users', ['Name','Email','Role','Grade','ID'],
    users.map(u => [u.name, u.email, u.role, u.grade, u.id]));

  r += 2;
  r = writeSection_(sh, r, 'Classes', ['Name','Type','GoogleClassroomId','ID'],
    classes.map(c => [c.name, c.type, c.classroomCourseId, c.id]));

  r += 2;
  r = writeSection_(sh, r, 'Missions', ['Name','Active','ID'],
    missions.map(m => [m.name, m.active, m.id]));

  r += 2;
  r = writeSection_(sh, r, 'Teams', ['Team Name','Class Name','ID'],
    teams.map(t => [t.name, (classNameById[t.classId] || t.classId || ''), t.id]));

  sh.setFrozenRows(1);
  autoSize_(sh);
  SpreadsheetApp.getUi().alert('ID_Lookup sheet refreshed.');
}

// Highlight the "id" column on every known tab (soft yellow)
function highlightIdColumns() {
  const color = '#FFF3CD';
  Object.values(SHEET_IDS).forEach(name => {
    const sh = SpreadsheetApp.getActive().getSheetByName(name);
    if (!sh) return;
    const headers = getHeaders_(sh);
    const j = headers.indexOf('id');
    if (j < 0) return;
    const col = j + 1;
    if (sh.getLastRow() >= 1) sh.getRange(1, col, sh.getLastRow(), 1).setBackground(color);
    sh.getRange(1, col).setFontWeight('bold');
    sh.setColumnWidth(col, 220);
  });
  SpreadsheetApp.getUi().alert('Highlighted id columns.');
}

// Remove background color on "id" columns only
function clearIdHighlights() {
  Object.values(SHEET_IDS).forEach(name => {
    const sh = SpreadsheetApp.getActive().getSheetByName(name);
    if (!sh) return;
    const headers = getHeaders_(sh);
    const j = headers.indexOf('id');
    if (j < 0) return;
    const col = j + 1;
    if (sh.getLastRow() >= 1) sh.getRange(1, col, sh.getLastRow(), 1).setBackground(null);
    sh.getRange(1, col).setFontWeight('bold'); // keep header bold if you like
  });
  SpreadsheetApp.getUi().alert('Cleared id highlights.');
}

/* ---------- small helpers ---------- */

function safeRows_(name) {
  try { return readRows_(name); } catch (_e) { return []; }
}

function writeSection_(sh, startRow, title, headers, rows) {
  sh.getRange(startRow, 1, 1, 1).setValue(title).setFontWeight('bold').setFontSize(12);
  sh.getRange(startRow+1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
    .setBackground('#f1f3f4');
  if (rows.length) sh.getRange(startRow+2, 1, rows.length, headers.length).setValues(rows);
  return startRow + 1 + 1 + Math.max(1, rows.length);
}

function autoSize_(sh) {
  const lc = sh.getLastColumn();
  for (let c=1; c<=lc; c++) sh.autoResizeColumn(c);
}
