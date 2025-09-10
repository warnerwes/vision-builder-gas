const BACKUP_FOLDER_NAME = 'RTU_DB_BACKUPS';

function backupNow(){
  const folder = getOrCreateFolder_(BACKUP_FOLDER_NAME);
  const tabs = Object.values(SHEET_IDS);
  const payload = {};
  tabs.forEach(t => payload[t] = readRows_(t));
  const blob = Utilities.newBlob(JSON.stringify(payload,null,2), 'application/json', 'rtu_backup_' + new Date().toISOString() + '.json');
  folder.createFile(blob);
  SpreadsheetApp.getUi().alert('Backup written to Drive folder: ' + BACKUP_FOLDER_NAME);
}

function restoreFromFilePrompt(){
  SpreadsheetApp.getUi().alert('Open Drive folder '+BACKUP_FOLDER_NAME+', pick a backup JSON, then run restoreFromFile(fileId).');
}

function restoreFromFile(fileId){
  const file = DriveApp.getFileById(fileId);
  const data = JSON.parse(file.getBlob().getDataAsString());
  Object.entries(data).forEach(([tab, rows]) => {
    if (!sheet_(tab)) return;
    const sh = sheet_(tab);
    const range = sh.getDataRange(); if (range) sh.clearContents();
    // write header
    const headers = rows[0] ? Object.keys(rows[0]) : ['id'];
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    // write rows
    if (rows.length){
      const matrix = rows.map(r => headers.map(h => r[h] ?? ''));
      sh.getRange(2,1,rows.length,headers.length).setValues(matrix);
    }
  });
}

function getOrCreateFolder_(name){
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

// Optional: time-driven trigger to backup nightly at ~2am
function scheduleNightlyBackup(){
  ScriptApp.newTrigger('backupNow').timeBased().atHour(2).everyDays(1).create();
}
