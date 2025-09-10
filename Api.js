/**
 * Server API – ALWAYS filter by class membership on the server.
 */

// Get bootstrap data for the current student — GLOBAL values, per-class missions
// Replace api_bootstrap with this version
function api_bootstrap() {
  const me = getMe_();

  const enroll = readRows_(SHEET_IDS.Enrollments).filter(e => e.userId === me.id);
  const classIds = enroll.map(e => e.classId);
  const classes = readRows_(SHEET_IDS.Classes).filter(c => classIds.includes(c.id));

  const values = readRows_(SHEET_IDS.Values)
    .filter(v => v.active === true || String(v.active).toUpperCase() === 'TRUE');

  const cm = readRows_(SHEET_IDS.ClassMission).filter(x => classIds.includes(x.classId));
  const missions = readRows_(SHEET_IDS.Missions)
    .filter(m => m.active === true || String(m.active).toUpperCase() === 'TRUE');
  const allowedMissions = cm.map(x => ({ classId: x.classId, ...(missions.find(m => m.id === x.missionId) || {}) }));

  const users = readRows_(SHEET_IDS.Users);
  const peerEnroll = readRows_(SHEET_IDS.Enrollments).filter(e => classIds.includes(e.classId));
  const peerNames = peerEnroll
    .map(e => ({ classId: e.classId, user: users.find(u => u.id === e.userId) }))
    .filter(x => x.user)
    .map(x => ({ classId: x.classId, displayName: x.user.displayName, userId: x.user.id, gradeLevel: x.user.gradeLevel || '' }));

  // saved picks
  const myValueSelections = readRows_(SHEET_IDS.ValueSelections)
    .filter(s => s.userId === me.id && classIds.includes(s.classId))
    .map(s => ({ classId: s.classId, valueId: s.valueId, coinWeight: Number(s.coinWeight||0) }));

  const myMissionSelections = readRows_(SHEET_IDS.MissionSelections)
    .filter(s => s.userId === me.id && classIds.includes(s.classId))
    .map(s => ({ classId: s.classId, missionId: s.missionId }));

  // saved vision
  ensureVisionSheet_();
  const myVisionTexts = readRows_(SHEET_IDS.VisionTexts)
    .filter(v => v.userId === me.id && classIds.includes(v.classId))
    .map(v => ({ classId: v.classId, text: v.text || '' }));

  return { me, classes, classIds, values, allowedMissions, peerNames, myValueSelections, myMissionSelections, myVisionTexts };
}

function api_saveVision(payload){
  ensureVisionSheet_();
  const email = getCurrentUserEmail();
  if (!email) throw new Error('No identity.');
  const me = readRows_(SHEET_IDS.Users).find(u => (u.email||'').toLowerCase()===email.toLowerCase());
  if (!me) throw new Error('User not registered.');

  const { classId, text } = payload || {};
  if (!classId) throw new Error('classId required.');

  // must be enrolled
  const ok = readRows_(SHEET_IDS.Enrollments).some(e => e.classId===classId && e.userId===me.id);
  if (!ok) throw new Error('Not enrolled in this class.');

  updateOrInsert_(SHEET_IDS.VisionTexts, ['userId','classId'], {
    id: uid_(), userId: me.id, classId, text: String(text||''), updatedAt: new Date().toISOString()
  });
  return { ok:true };
}


// Replace api_upsertValueSelection with this batch version
function api_upsertValueSelection(payload){
  const email = getCurrentUserEmail();
  if (!email) throw new Error('No identity.');
  const users = readRows_(SHEET_IDS.Users);
  const me = users.find(u => (u.email||'').toLowerCase() === email.toLowerCase());
  if (!me) throw new Error('User not registered.');

  const { classId, selections } = payload || {};
  if (!classId || !Array.isArray(selections)) throw new Error('Bad payload.');

  // must be enrolled
  const inClass = readRows_(SHEET_IDS.Enrollments).some(e => e.classId===classId && e.userId===me.id);
  if (!inClass) throw new Error('Not enrolled in this class.');

  // active GLOBAL values set
  const values = readRows_(SHEET_IDS.Values)
    .filter(v => v.active === true || String(v.active).toUpperCase() === 'TRUE');
  const allowed = new Set(values.map(v => v.id));

  // validate + clamp
  const seen = new Set(); let sum = 0;
  const cleaned = selections.map(s => {
    const valueId = String(s.valueId||'').trim();
    const coinWeight = Math.max(0, Math.min(5, Number(s.coinWeight||0)));
    if (!valueId || !allowed.has(valueId)) throw new Error('Unknown value.');
    if (seen.has(valueId)) throw new Error('Duplicate value.');
    seen.add(valueId); sum += coinWeight;
    return { id: uid_(), userId: me.id, classId, valueId, coinWeight };
  });
  if (cleaned.length > 3) throw new Error('Pick at most 3 values.');
  if (sum > 5) throw new Error('Total coins must be ≤ 5.');

  // delete any previous selections that are NOT in the new set
  const keep = new Set(cleaned.map(x => x.valueId));
  deleteRowsWhere_(SHEET_IDS.ValueSelections, r =>
    r.userId === me.id && r.classId === classId && !keep.has(r.valueId)
  );

  // upsert current (batch)
  updateOrInsertMany_(SHEET_IDS.ValueSelections, ['userId','classId','valueId'], cleaned);
  return { ok:true };
}



// Upsert mission
function api_selectMission(payload){
  const email = getCurrentUserEmail();
  if (!email) throw new Error('No identity.');

  const users = readRows_(SHEET_IDS.Users);
  const me = users.find(u => (u.email||'').toLowerCase() === email.toLowerCase());
  if (!me) throw new Error('User not registered.');

  const { classId, missionId } = payload || {};
  if (!classId || !missionId) throw new Error('Bad payload.');

  const inClass = readRows_(SHEET_IDS.Enrollments).some(e => e.classId === classId && e.userId === me.id);
  if (!inClass) throw new Error('Not enrolled in this class.');

  // Ensure mission is allowed for this class
  const allowed = readRows_(SHEET_IDS.ClassMission)
    .some(x => x.classId === classId && x.missionId === missionId);
  if (!allowed) throw new Error('Mission not allowed for this class.');

  updateOrInsert_(SHEET_IDS.MissionSelections, ['userId','classId'], {
    id: uid_(), userId: me.id, classId, missionId
  });
  return { ok: true };
}

// Teacher: suggest teams by values (cosine) — GLOBAL values (no ClassAllowedValue)
function api_suggestTeamsByValues(classId) {
  const me = getMe_();
  if (!me || (me.role !== 'TEACHER' && me.role !== 'ADMIN')) throw new Error('Teacher only.');
  if (!classId) throw new Error('classId required.');

  // enrollments in this class
  const enroll = readRows_(SHEET_IDS.Enrollments).filter(e => e.classId === classId);
  if (!enroll.length) return { classId, teams: [], note: 'No enrollments.' };

  const users = readRows_(SHEET_IDS.Users);

  // GLOBAL active values define the vector space
  const vals = readRows_(SHEET_IDS.Values)
    .filter(v => v.active === true || String(v.active).toUpperCase() === 'TRUE');
  if (!vals.length) return { classId, teams: [], note: 'No active values configured.' };

  // student selections for this class
  const sel = readRows_(SHEET_IDS.ValueSelections).filter(s => s.classId === classId);

  // build per-student vectors
  const valueIndex = Object.fromEntries(vals.map((v, i) => [v.id, i]));
  const vectors = enroll.map(e => {
    const u = users.find(x => x.id === e.userId) || { displayName: 'Unknown' };
    const vec = new Array(vals.length).fill(0);
    sel.filter(s => s.userId === e.userId).forEach(s => {
      const idx = valueIndex[s.valueId];
      if (idx != null) vec[idx] = Number(s.coinWeight || 0);
    });
    return { userId: e.userId, displayName: u.displayName, vec };
  });

  // cosine similarity
  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i] || 0, bi = b[i] || 0;
      dot += ai * bi; na += ai * ai; nb += bi * bi;
    }
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  // greedy grouping into teams of 3–4 (seed + top matches)
  const MIN = 3, MAX = 4;
  const pool = [...vectors];
  const teams = [];
  while (pool.length) {
    const seed = pool.shift();
    const scored = pool.map(x => ({ x, s: cosine(seed.vec, x.vec) }))
                       .sort((a, b) => b.s - a.s);
    // Try to fill to MAX; if not enough, take as many as possible (>= MIN when possible)
    const takeCount = Math.min(MAX - 1, scored.length);
    const take = scored.slice(0, takeCount).map(y => y.x);
    teams.push([seed, ...take].map(p => ({ userId: p.userId, displayName: p.displayName })));
    // remove taken
    take.forEach(t => {
      const i = pool.findIndex(z => z.userId === t.userId);
      if (i >= 0) pool.splice(i, 1);
    });
  }

  return { classId, teams };
}


