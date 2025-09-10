// DB.gs (hardened + indexed batch upserts + delete helpers)

/** Get a sheet by name, or throw a clear error. */
function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

/** Header fetch with sanity checks (headers trimmed & stringified). */
function getHeaders_(sh) {
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return [];
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
  return hdr.map(h => String(h).trim());
}

/** Read all rows as array of objects keyed by header. Empty -> [] */
function readRows_(name) {
  const sh = sheet_(name);
  const rng = sh.getDataRange();
  if (!rng) return [];
  const values = rng.getValues();
  if (!values.length) return [];
  const [headerRaw, ...rows] = values;
  const header = (headerRaw || []).map(h => String(h).trim());
  if (!header.length) return [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return rows
    .filter(r => r && r.some(cell => String(cell).trim().length))
    .map(r => {
      const obj = {};
      for (const k in idx) obj[k] = r[idx[k]];
      return obj;
    });
}

/** Append a row mapped to headers. Missing/undefined fields -> '' */
function writeRow_(name, obj) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000); // up to 5s
  try {
    const sh = sheet_(name);
    const headers = getHeaders_(sh);
    if (!headers.length) throw new Error('No headers in sheet: ' + name);
    const row = headers.map(h => (Object.prototype.hasOwnProperty.call(obj, h) && obj[h] != null) ? obj[h] : '');
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Upsert by keyCols (all must match).
 * Updates whole row in one setValues call.
 * Undefined fields are preserved (keep current) unless explicitly set (use '' to clear).
 */
function updateOrInsert_(name, keyCols, obj) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const sh = sheet_(name);
    const data = sh.getDataRange().getValues();
    if (data.length === 0) throw new Error('No header row in sheet: ' + name);

    const [headerRaw, ...rows] = data;
    const headers = (headerRaw || []).map(h => String(h).trim());
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

    // find matching row
    const match = rows.findIndex(r =>
      keyCols.every(k => String(r[idx[k]] ?? '') === String(obj[k] ?? ''))
    );

    if (match >= 0) {
      // update existing row
      const rIndex = match + 2; // 1-based + header
      const current = rows[match];
      const next = headers.map(h =>
        Object.prototype.hasOwnProperty.call(obj, h)
          ? (obj[h] != null ? obj[h] : '') // write '' if explicitly provided null/undefined
          : current[idx[h]]
      );
      sh.getRange(rIndex, 1, 1, headers.length).setValues([next]);
    } else {
      // insert new row mapped to headers
      const row = headers.map(h =>
        Object.prototype.hasOwnProperty.call(obj, h) && obj[h] != null ? obj[h] : ''
      );
      sh.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Batch upsert for efficiency.
 * Builds an index on the existing sheet rows for O(n + m).
 */
function updateOrInsertMany_(name, keyCols, objects) {
  if (!objects || !objects.length) return 0;
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const sh = sheet_(name);
    const data = sh.getDataRange().getValues();
    if (data.length === 0) throw new Error('No header row in sheet: ' + name);

    const [headerRaw, ...rows] = data;
    const headers = (headerRaw || []).map(h => String(h).trim());
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

    // Build an index on existing rows keyed by keyCols tuple
    const keyOf = (row) => keyCols.map(k => String(row[idx[k]] ?? '')).join('\u0001');
    const index = new Map(); // key -> {rIndex, current[]}
    rows.forEach((r, i) => index.set(keyOf(r), { rIndex: i + 2, current: r }));

    const updates = []; // {rIndex, values[]}
    const inserts = [];

    objects.forEach(obj => {
      const key = keyCols.map(k => String(obj[k] ?? '')).join('\u0001');
      const hit = index.get(key);
      if (hit) {
        const next = headers.map(h =>
          Object.prototype.hasOwnProperty.call(obj, h)
            ? (obj[h] != null ? obj[h] : '')
            : hit.current[idx[h]]
        );
        updates.push({ rIndex: hit.rIndex, next });
      } else {
        inserts.push(headers.map(h =>
          Object.prototype.hasOwnProperty.call(obj, h) && obj[h] != null ? obj[h] : ''
        ));
      }
    });

    // Apply updates (one range per row; could be batched further if needed)
    updates.forEach(u => sh.getRange(u.rIndex, 1, 1, headers.length).setValues([u.next]));

    // Apply inserts (batch when >1)
    if (inserts.length === 1) {
      sh.appendRow(inserts[0]);
    } else if (inserts.length > 1) {
      const last = sh.getLastRow() || 1;
      sh.insertRowsAfter(last, inserts.length);
      sh.getRange(last + 1, 1, inserts.length, headers.length).setValues(inserts);
    }

    return updates.length + inserts.length;
  } finally {
    lock.releaseLock();
  }
}

/** Delete a single row by id column. Returns true if deleted. */
function deleteRowById_(name, id) {
  const sh = sheet_(name);
  const data = sh.getDataRange().getValues();
  if (data.length === 0) return false;
  const [headerRaw, ...rows] = data;
  const headers = (headerRaw || []).map(h => String(h).trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const r = rows.findIndex(r => String(r[idx.id]) === String(id));
  if (r < 0) return false;
  sh.deleteRow(r + 2);
  return true;
}

/** Delete all rows for which predicateFn(rowObj) is true. Returns count. */
function deleteRowsWhere_(name, predicateFn) {
  const sh = sheet_(name);
  const data = sh.getDataRange().getValues();
  if (data.length === 0) return 0;
  const [headerRaw, ...rows] = data;
  const headers = (headerRaw || []).map(h => String(h).trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  let deleted = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const obj = {};
    for (const k in idx) obj[k] = rows[i][idx[k]];
    if (predicateFn(obj)) {
      sh.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}

/** UUID helper */
function uid_() { return Utilities.getUuid(); }
