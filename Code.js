/** Code.gs — Web App + minimal API (menu unchanged)
 *  Notes:
 *  - Menu items "Backup Now" and "Restore..." require Backup.gs.
 *  - Admin panel requires Admin.gs (ensureAdminSheets_()).
 *  - Deploy: Deploy > New deployment > Web app; Execute as: Me; Access: specific emails / domain.
 */


const DB_SHEET_NAME = 'RTU_DB'; // informational
// === add to SHEET_IDS ===
const SHEET_IDS = {
  Users:'Users', Classes:'Classes', Enrollments:'Enrollments',
  Values:'Values', Missions:'Missions', ClassMission:'ClassMission',
  ValueSelections:'ValueSelections', MissionSelections:'MissionSelections',
  Teams:'Teams', TeamMembers:'TeamMembers',
  VisionTexts:'VisionTexts' // <— NEW
};

// Create sheet if missing (headers once)
function ensureVisionSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_IDS.VisionTexts);
  if (!sh) {
    sh = ss.insertSheet(SHEET_IDS.VisionTexts);
    sh.getRange(1,1,1,5).setValues([['id','userId','classId','text','updatedAt']]);
    sh.setFrozenRows(1);
  }
}

function openClassroomImport() {
  const html = HtmlService.createHtmlOutputFromFile('AdminImport')
    .setWidth(520).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import from Google Classroom');
}


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RoboTeamUp')
    .addItem('Open Student Web App (link)', 'showWebAppLink')
    .addItem('Import from Classroom…', 'openClassroomImport')   // NEW: tiny modal
    .addSeparator()
    .addItem('Build human-friendly VIEW sheets', 'buildViews')  // NEW: readable joins
    .addItem('Generate missing IDs (all tabs)', 'fillMissingIdsAll') // NEW: IDs
    .addSeparator()
    .addItem('Admin: Backup Now', 'backupNow')
    .addItem('Admin: Restore from File', 'restoreFromFilePrompt')
    .addToUi();
}



function openAdmin() {
  ensureAdminSheets_(); // defined in Admin.gs
  const html = HtmlService.createHtmlOutputFromFile('Admin')
    .setTitle('RoboTeamUp — Admin')
    .setWidth(1000).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'RoboTeamUp — Admin');
}

function showWebAppLink() {
  const url = ScriptApp.getService().getUrl(); // works after first web app deploy
  SpreadsheetApp.getUi().alert('Student Web App URL:\n' + (url || 'Deploy the web app first.'));
}

// ---- Web App entry ----
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Ui')
    .setTitle('RoboTeamUp')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---- Minimal API used by Ui.html ----
// Returns: { me, classes, classIds, values, allowedMissions, peerNames }
// Get bootstrap data for the current student — GLOBAL values, per-class missions, PLUS saved selections
function api_bootstrap(_opts) {
  const me = getMe_(); // throws if not registered

  const enroll = readRows_(SHEET_IDS.Enrollments).filter(e => e.userId === me.id);
  const classIds = enroll.map(e => e.classId);

  // classes (for names/types)
  const classes = readRows_(SHEET_IDS.Classes).filter(c => classIds.includes(c.id));

  // GLOBAL values (same for all classes)
  const values = readRows_(SHEET_IDS.Values)
    .filter(v => v.active === true || String(v.active).toUpperCase() === 'TRUE');

  // missions mapped per class
  const cm = readRows_(SHEET_IDS.ClassMission).filter(x => classIds.includes(x.classId));
  const missions = readRows_(SHEET_IDS.Missions)
    .filter(m => m.active === true || String(m.active).toUpperCase() === 'TRUE');
  const allowedMissions = cm.map(x => ({ classId: x.classId, ...(missions.find(m => m.id === x.missionId) || {}) }));

  // peers (names + grade only)
  const users = readRows_(SHEET_IDS.Users);
  const peerEnroll = readRows_(SHEET_IDS.Enrollments).filter(e => classIds.includes(e.classId));
  const peerNames = peerEnroll
    .map(e => ({ classId: e.classId, user: users.find(u => u.id === e.userId) }))
    .filter(x => x.user)
    .map(x => ({ classId: x.classId, displayName: x.user.displayName, userId: x.user.id, gradeLevel: x.user.gradeLevel || '' }));

  // ---- saved selections for THIS student ----
  const myValueSelections = readRows_(SHEET_IDS.ValueSelections)
    .filter(s => s.userId === me.id && classIds.includes(s.classId))
    .map(s => ({ classId: s.classId, valueId: s.valueId, coinWeight: Number(s.coinWeight || 0) }));

  const myMissionSelections = readRows_(SHEET_IDS.MissionSelections)
    .filter(s => s.userId === me.id && classIds.includes(s.classId))
    .map(s => ({ classId: s.classId, missionId: s.missionId }));

  // Ui.html expects these keys:
  return { me, classes, classIds, values, allowedMissions, peerNames, myValueSelections, myMissionSelections };
}


// ---- Identity helpers ----
function getMe_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('No identity. Share the web app with specific emails or your Workspace domain.');
  }
  const users = readRows_(SHEET_IDS.Users);
  const me = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!me) throw new Error('User not registered in Users sheet: ' + email);
  return me;
}

// ---- Tiny sheet helpers (read-only for this file) ----
function sheet_(name) {
  if (!name) throw new Error('Missing sheet name (got undefined). Check SHEET_IDS usage.');
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function readRows_(name) {
  const sh = sheet_(name);
  if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return [];
  const values = sh.getDataRange().getValues();
  if (!values.length) return [];
  const [header, ...rows] = values;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return rows
    .filter(r => r.some(cell => String(cell).trim().length))
    .map(r => {
      const obj = {};
      for (const k in idx) obj[k] = r[idx[k]];
      return obj;
    });
}

const OPENAI_MODEL = 'gpt-5-mini';
const OPENAI_URL   = 'https://api.openai.com/v1/responses';

function extractOpenAIText_(json) {
  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text.trim();
  const outs = Array.isArray(json?.output) ? json.output : [];
  for (const msg of outs) {
    const parts = Array.isArray(msg?.content) ? msg.content : [];
    for (const part of parts) {
      if ((part.type === 'output_text' || part.type === 'summary_text') && typeof part.text === 'string') {
        const t = part.text.trim();
        if (t) return t;
      }
    }
  }
  // legacy fallback
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  return '';
}

function callOpenAIPlain_(inputStr, tokenBudget = 160) {
  const body = {
    model: OPENAI_MODEL,
    input: inputStr,                 // ← single string, simplest valid shape
    text: { verbosity: "low" },      // concise
    reasoning: { effort: "minimal" },// fast, few reasoning tokens
    max_output_tokens: tokenBudget,  // 160 is plenty for 55 words
    store: false                     // student privacy; flip to true if you want
  };

  const resp = UrlFetchApp.fetch(OPENAI_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + getOpenAIKey_() }
  });

  const status = resp.getResponseCode();
  const raw = resp.getContentText();

  if (status !== 200) {
    throw new Error(`OpenAI error ${status}: ${raw.slice(0, 600)}`);
  }

  const data = JSON.parse(raw);
  if (data?.status === 'incomplete' && data?.incomplete_details?.reason === 'max_output_tokens') {
    // Very unlikely with the strict word limit, but just in case:
    // retry once with a slightly higher cap
    return callOpenAIPlain_(inputStr, 220);
  }

  const text = extractOpenAIText_(data);
  if (!text) throw new Error('OpenAI returned no text. Debug: ' + raw.slice(0, 800));
  return text.trim();
}


function getOpenAIKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) throw new Error('OpenAI key missing. Set Script property OPENAI_API_KEY.');
  return key;
}

function buildVisionPrompt_(safeName, values, mission) {
  const valuesList =
    values.length
      ? values.map(v => `${v.label} (${v.coins})`).join(', ')
      : 'none provided';

  const missionLine =
    (mission?.label || mission?.name || 'Unspecified') +
    (mission?.description ? ` — ${String(mission.description).slice(0,160)}` : '');

  return `
You are a professional writing coach for middle/high-school students.

TASK:
Write a “Just-Cause personal vision statement” for ${safeName}.
The statement should be values-driven, inspiring, and broad enough to guide life beyond school or robotics.
The vision must be written so that if it is lived out, the mission will naturally also be fulfilled.

INPUT:
- Student values (weighted, highest first): ${valuesList}
- Mission (for context only — do not restate directly; instead ensure the vision is broad enough to encompass it): ${missionLine}

OUTPUT REQUIREMENTS (STRICT):
- 1–2 sentences, 25–40 words.
- First person (“I …”).
- Rooted in values and long-term purpose (why).
- Broad and life-applicable (not just robotics).
- Inspirational and others-focused.
- Use strong, everyday language (e.g., “I want to build…,” “I will live with…,” “I believe in…”).
- Avoid vague or abstract openings like “I imagine…” or “I dream of…”.
- Focus on one or two values expressed simply (not long lists).
- Keep the impact personal and relatable (friends, family, classmates, neighbors, teammates).
- Do not include tasks, habits, or checklists.
- Keep language simple, humble, and positive.

Examples (style only):
- “A world where every student is encouraged to discover their gifts, supported in their struggles, and celebrated not for perfection but for growth.”
- “A generation that grows up with courage to do what is right, humility to keep learning, and perseverance to keep building when the world feels broken.”
- “Families and teams that live with integrity, where love, fairness, and forgiveness create belonging and strength that last beyond any single achievement.”
- “I believe in kindness and perseverance, and I will live with these values so that the people around me feel supported, grow in courage, and use their gifts to strengthen families and communities.”
- “I want to build a life of trust and creativity where friends, teammates, and neighbors are encouraged to learn, work together, and make lasting good in the world.”
- “I value service and respect, and I will use them to bring hope and strength to others so that together we create places of belonging and growth.”

Return only the final 1–2 sentences. No headings or explanations.



`.trim();
}

function api_generateVision(payload) {
  const me = getMe_();
  if (!payload || !payload.classId) throw new Error('classId required.');

  const enrolled = readRows_(SHEET_IDS.Enrollments)
    .some(e => e.classId === payload.classId && e.userId === me.id);
  if (!enrolled) throw new Error('Not enrolled in this class.');

  const safeName = (() => {
    const n = String(me.displayName || '').trim();
    if (!n) return 'Student';
    const parts = n.split(/\s+/);
    const first = parts[0] || 'Student';
    const lastI = (parts[1] || '').charAt(0);
    return lastI ? `${first} ${lastI}.` : first;
  })();

  const values = (payload.selectedValues || [])
    .map(v => ({ id: v.id, label: v.label || v.name || v.id, coins: Number(v.coins || 0) }))
    .sort((a,b) => b.coins - a.coins);

  const mission = payload.mission || {};

  const inputPrompt = buildVisionPrompt_(safeName, values, mission);
  const text = callOpenAIPlain_(inputPrompt, 160); // concise cap

  return { text };
}


