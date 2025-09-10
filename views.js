/** Create/refresh readable views that translate IDs to names. */

function buildViews() {
  buildView_ClassMission();
  buildView_Enrollments();
  SpreadsheetApp.getUi().alert('Views rebuilt.');
}

function buildView_ClassMission() {
  const ss = SpreadsheetApp.getActive();
  const name = 'VIEW_ClassMission';
  let sh = ss.getSheetByName(name); if (!sh) {sh = ss.insertSheet(name);} else {sh.clear();}

  const classes = readRows_(SHEET_IDS.Classes);
  const missions = readRows_(SHEET_IDS.Missions);
  const cm = readRows_(SHEET_IDS.ClassMission);

  const className = Object.fromEntries(classes.map(c => [c.id, c.name || c.id]));
  const missionName = Object.fromEntries(missions.map(m => [m.id, (m.label || m.name || m.id)]));

  const header = ['id','classId','className','missionId','missionName'];
  const rows = cm.map(r => [r.id, r.classId, className[r.classId] || '', r.missionId, missionName[r.missionId] || '']);

  if (!rows.length) {rows.push(['','','','','']);}
  sh.getRange(1,1,1,header.length).setValues([header]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange(2,1,rows.length,header.length).setValues(rows);
  sh.setFrozenRows(1);
  autosize_(sh);
}

function buildView_Enrollments() {
  const ss = SpreadsheetApp.getActive();
  const name = 'VIEW_Enrollments';
  let sh = ss.getSheetByName(name); if (!sh) {sh = ss.insertSheet(name);} else {sh.clear();}

  const users = readRows_(SHEET_IDS.Users);
  const classes = readRows_(SHEET_IDS.Classes);
  const enroll = readRows_(SHEET_IDS.Enrollments);

  const uname = Object.fromEntries(users.map(u => [u.id, u.displayName || u.email || u.id]));
  const ugrade = Object.fromEntries(users.map(u => [u.id, u.gradeLevel || '']));
  const cname = Object.fromEntries(classes.map(c => [c.id, c.name || c.id]));

  const header = ['id','userId','userName','grade','classId','className','roleInClass'];
  const rows = enroll.map(r => [r.id, r.userId, uname[r.userId] || '', ugrade[r.userId] || '', r.classId, cname[r.classId] || '', r.roleInClass || '']);

  if (!rows.length) {rows.push(['','','','','','','']);}
  sh.getRange(1,1,1,header.length).setValues([header]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange(2,1,rows.length,header.length).setValues(rows);
  sh.setFrozenRows(1);
  autosize_(sh);
}

function autosize_(sh){ const lc = sh.getLastColumn(); for (let c = 1; c <= lc; c++) {sh.autoResizeColumn(c);} }
