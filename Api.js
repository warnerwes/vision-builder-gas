/**
 * Server API – ALWAYS filter by class membership on the server.
 */

// Get bootstrap data for the current student — GLOBAL values, per-class missions
// Replace api_bootstrap with this version
function api_bootstrap() {
  const me = getMe_();

  const enroll = readRows_(SHEET_IDS.Enrollments).filter(
    (e) => e.userId === me.id
  );
  const classIds = enroll.map((e) => e.classId);
  const classes = readRows_(SHEET_IDS.Classes).filter((c) =>
    classIds.includes(c.id)
  );

  const values = readRows_(SHEET_IDS.Values).filter(
    (v) => v.active === true || String(v.active).toUpperCase() === "TRUE"
  );

  const cm = readRows_(SHEET_IDS.ClassMission).filter((x) =>
    classIds.includes(x.classId)
  );
  const missions = readRows_(SHEET_IDS.Missions).filter(
    (m) => m.active === true || String(m.active).toUpperCase() === "TRUE"
  );
  const allowedMissions = cm.map((x) => ({
    classId: x.classId,
    ...(missions.find((m) => m.id === x.missionId) || {}),
  }));

  const users = readRows_(SHEET_IDS.Users);
  const peerEnroll = readRows_(SHEET_IDS.Enrollments).filter((e) =>
    classIds.includes(e.classId)
  );
  const peerNames = peerEnroll
    .map((e) => ({
      classId: e.classId,
      user: users.find((u) => u.id === e.userId),
    }))
    .filter((x) => x.user)
    .map((x) => ({
      classId: x.classId,
      displayName: x.user.displayName,
      userId: x.user.id,
      gradeLevel: x.user.gradeLevel || "",
    }));

  // saved picks
  const myValueSelections = readRows_(SHEET_IDS.ValueSelections)
    .filter((s) => s.userId === me.id && classIds.includes(s.classId))
    .map((s) => ({
      classId: s.classId,
      valueId: s.valueId,
      coinWeight: Number(s.coinWeight || 0),
    }));

  const myMissionSelections = readRows_(SHEET_IDS.MissionSelections)
    .filter((s) => s.userId === me.id && classIds.includes(s.classId))
    .map((s) => ({ classId: s.classId, missionId: s.missionId }));

  // saved vision
  ensureVisionSheet_();
  const myVisionTexts = readRows_(SHEET_IDS.VisionTexts)
    .filter((v) => v.userId === me.id && classIds.includes(v.classId))
    .map((v) => ({ classId: v.classId, text: v.text || "" }));

  return {
    me,
    classes,
    classIds,
    values,
    allowedMissions,
    peerNames,
    myValueSelections,
    myMissionSelections,
    myVisionTexts,
  };
}

function api_saveVision(payload) {
  ensureVisionSheet_();
  const email = getCurrentUserEmail();
  if (!email) {
    throw new Error("No identity.");
  }
  const me = readRows_(SHEET_IDS.Users).find(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (!me) {
    throw new Error("User not registered.");
  }

  const { classId, text } = payload || {};
  if (!classId) {
    throw new Error("classId required.");
  }

  // must be enrolled
  const ok = readRows_(SHEET_IDS.Enrollments).some(
    (e) => e.classId === classId && e.userId === me.id
  );
  if (!ok) {
    throw new Error("Not enrolled in this class.");
  }

  updateOrInsert_(SHEET_IDS.VisionTexts, ["userId", "classId"], {
    id: uid_(),
    userId: me.id,
    classId,
    text: String(text || ""),
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

// Replace api_upsertValueSelection with this batch version
function api_upsertValueSelection(payload) {
  const email = getCurrentUserEmail();
  if (!email) {
    throw new Error("No identity.");
  }
  const users = readRows_(SHEET_IDS.Users);
  const me = users.find(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (!me) {
    throw new Error("User not registered.");
  }

  const { classId, selections } = payload || {};
  if (!classId || !Array.isArray(selections)) {
    throw new Error("Bad payload.");
  }

  // must be enrolled
  const inClass = readRows_(SHEET_IDS.Enrollments).some(
    (e) => e.classId === classId && e.userId === me.id
  );
  if (!inClass) {
    throw new Error("Not enrolled in this class.");
  }

  // active GLOBAL values set
  const values = readRows_(SHEET_IDS.Values).filter(
    (v) => v.active === true || String(v.active).toUpperCase() === "TRUE"
  );
  const allowed = new Set(values.map((v) => v.id));

  // validate + clamp
  const seen = new Set();
  let sum = 0;
  const cleaned = selections.map((s) => {
    const valueId = String(s.valueId || "").trim();
    const coinWeight = Math.max(0, Math.min(5, Number(s.coinWeight || 0)));
    if (!valueId || !allowed.has(valueId)) {
      throw new Error("Unknown value.");
    }
    if (seen.has(valueId)) {
      throw new Error("Duplicate value.");
    }
    seen.add(valueId);
    sum += coinWeight;
    return { id: uid_(), userId: me.id, classId, valueId, coinWeight };
  });
  if (cleaned.length > 3) {
    throw new Error("Pick at most 3 values.");
  }
  if (sum > 5) {
    throw new Error("Total coins must be ≤ 5.");
  }

  // delete any previous selections that are NOT in the new set
  const keep = new Set(cleaned.map((x) => x.valueId));
  deleteRowsWhere_(
    SHEET_IDS.ValueSelections,
    (r) => r.userId === me.id && r.classId === classId && !keep.has(r.valueId)
  );

  // upsert current (batch)
  updateOrInsertMany_(
    SHEET_IDS.ValueSelections,
    ["userId", "classId", "valueId"],
    cleaned
  );
  return { ok: true };
}

// Upsert mission
function api_selectMission(payload) {
  const email = getCurrentUserEmail();
  if (!email) {
    throw new Error("No identity.");
  }

  const users = readRows_(SHEET_IDS.Users);
  const me = users.find(
    (u) => (u.email || "").toLowerCase() === email.toLowerCase()
  );
  if (!me) {
    throw new Error("User not registered.");
  }

  const { classId, missionId } = payload || {};
  if (!classId || !missionId) {
    throw new Error("Bad payload.");
  }

  const inClass = readRows_(SHEET_IDS.Enrollments).some(
    (e) => e.classId === classId && e.userId === me.id
  );
  if (!inClass) {
    throw new Error("Not enrolled in this class.");
  }

  // Ensure mission is allowed for this class
  const allowed = readRows_(SHEET_IDS.ClassMission).some(
    (x) => x.classId === classId && x.missionId === missionId
  );
  if (!allowed) {
    throw new Error("Mission not allowed for this class.");
  }

  updateOrInsert_(SHEET_IDS.MissionSelections, ["userId", "classId"], {
    id: uid_(),
    userId: me.id,
    classId,
    missionId,
  });
  return { ok: true };
}

// Teacher: suggest teams by values (cosine) — GLOBAL values (no ClassAllowedValue)
function api_suggestTeamsByValues(classId) {
  const me = getMe_();
  if (!me || (me.role !== "TEACHER" && me.role !== "ADMIN")) {
    throw new Error("Teacher only.");
  }
  if (!classId) {
    throw new Error("classId required.");
  }

  // enrollments in this class
  const enroll = readRows_(SHEET_IDS.Enrollments).filter(
    (e) => e.classId === classId
  );
  if (!enroll.length) {
    return { classId, teams: [], note: "No enrollments." };
  }

  const users = readRows_(SHEET_IDS.Users);

  // GLOBAL active values define the vector space
  const vals = readRows_(SHEET_IDS.Values).filter(
    (v) => v.active === true || String(v.active).toUpperCase() === "TRUE"
  );
  if (!vals.length) {
    return { classId, teams: [], note: "No active values configured." };
  }

  // student selections for this class
  const sel = readRows_(SHEET_IDS.ValueSelections).filter(
    (s) => s.classId === classId
  );

  // build per-student vectors
  const valueIndex = Object.fromEntries(vals.map((v, i) => [v.id, i]));
  const vectors = enroll.map((e) => {
    const u = users.find((x) => x.id === e.userId) || {
      displayName: "Unknown",
    };
    const vec = new Array(vals.length).fill(0);
    sel
      .filter((s) => s.userId === e.userId)
      .forEach((s) => {
        const idx = valueIndex[s.valueId];
        if (idx != null) {
          vec[idx] = Number(s.coinWeight || 0);
        }
      });
    return { userId: e.userId, displayName: u.displayName, vec };
  });

  // cosine similarity
  function cosine(a, b) {
    let dot = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i] || 0,
        bi = b[i] || 0;
      dot += ai * bi;
      na += ai * ai;
      nb += bi * bi;
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  // greedy grouping into teams of 3–4 (seed + top matches)
  const MIN = 3,
    MAX = 4;
  const pool = [...vectors];
  const teams = [];
  while (pool.length) {
    const seed = pool.shift();
    const scored = pool
      .map((x) => ({ x, s: cosine(seed.vec, x.vec) }))
      .sort((a, b) => b.s - a.s);
    // Try to fill to MAX; if not enough, take as many as possible (>= MIN when possible)
    const takeCount = Math.min(MAX - 1, scored.length);
    const take = scored.slice(0, takeCount).map((y) => y.x);
    teams.push(
      [seed, ...take].map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
      }))
    );
    // remove taken
    take.forEach((t) => {
      const i = pool.findIndex((z) => z.userId === t.userId);
      if (i >= 0) {
        pool.splice(i, 1);
      }
    });
  }

  return { classId, teams };
}

// OpenAI integration functions
function extractOpenAIText_(json) {
  if (typeof json?.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  const outs = Array.isArray(json?.output) ? json.output : [];
  for (const msg of outs) {
    const parts = Array.isArray(msg?.content) ? msg.content : [];
    for (const part of parts) {
      if (
        (part.type === "output_text" || part.type === "summary_text") &&
        typeof part.text === "string"
      ) {
        const t = part.text.trim();
        if (t) {
          return t;
        }
      }
    }
  }
  // legacy fallback
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === "string" && c.trim()) {
    return c.trim();
  }
  return "";
}

function callOpenAIPlain_(inputStr, tokenBudget = 160) {
  const body = {
    model: "gpt-5-mini",
    input: inputStr, // ← single string, simplest valid shape
    text: { verbosity: "low" }, // concise
    reasoning: { effort: "minimal" }, // fast, few reasoning tokens
    max_output_tokens: tokenBudget, // 160 is plenty for 55 words
    store: false, // student privacy; flip to true if you want
  };

  const resp = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
    headers: { Authorization: `Bearer ${getOpenAIKey_()}` },
  });

  const status = resp.getResponseCode();
  const raw = resp.getContentText();

  if (status !== 200) {
    throw new Error(`OpenAI error ${status}: ${raw.slice(0, 600)}`);
  }

  const data = JSON.parse(raw);
  if (
    data?.status === "incomplete" &&
    data?.incomplete_details?.reason === "max_output_tokens"
  ) {
    // Very unlikely with the strict word limit, but just in case:
    // retry once with a slightly higher cap
    return callOpenAIPlain_(inputStr, 220);
  }

  const text = extractOpenAIText_(data);
  if (!text) {
    throw new Error(`OpenAI returned no text. Debug: ${raw.slice(0, 800)}`);
  }
  return text.trim();
}

function getOpenAIKey_() {
  const key =
    PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!key) {
    throw new Error(
      "OpenAI API key not configured. Set OPENAI_API_KEY in Script Properties."
    );
  }
  return key;
}

// Get students and their top 3 values for vision combination
function api_getStudentsForVisionCombination(classId) {
  const me = getMe_();
  if (!classId) {
    throw new Error("classId required.");
  }

  // Check if user is enrolled in this class
  const isEnrolled = readRows_(SHEET_IDS.Enrollments).some(
    (e) => e.classId === classId && e.userId === me.id
  );
  if (!isEnrolled) {
    throw new Error("Not enrolled in this class.");
  }

  // Get all students in this class
  const enrollments = readRows_(SHEET_IDS.Enrollments).filter(
    (e) => e.classId === classId && e.roleInClass === "STUDENT"
  );
  if (!enrollments.length) {
    return { classId, students: [], note: "No students in this class." };
  }

  const users = readRows_(SHEET_IDS.Users);
  const values = readRows_(SHEET_IDS.Values).filter(
    (v) => v.active === true || String(v.active).toUpperCase() === "TRUE"
  );

  // Get value selections for all students in this class
  const valueSelections = readRows_(SHEET_IDS.ValueSelections).filter(
    (s) => s.classId === classId
  );

  // Build student data with their top 3 values
  const students = enrollments.map((enrollment) => {
    const user = users.find((u) => u.id === enrollment.userId) || {
      displayName: "Unknown",
    };
    const studentSelections = valueSelections
      .filter((s) => s.userId === enrollment.userId)
      .map((s) => ({
        valueId: s.valueId,
        coinWeight: Number(s.coinWeight || 0),
        value: values.find((v) => v.id === s.valueId) || {
          id: s.valueId,
          label: s.valueId,
        },
      }))
      .sort((a, b) => b.coinWeight - a.coinWeight)
      .slice(0, 3); // Top 3 values

    return {
      userId: enrollment.userId,
      displayName: user.displayName,
      gradeLevel: user.gradeLevel || "",
      topValues: studentSelections,
      hasValues: studentSelections.length > 0,
    };
  });

  return { classId, students };
}

// Generate combined vision from multiple students' top values
function api_generateCombinedVision(payload) {
  const me = getMe_();
  const { classId, studentIds, mission } = payload || {};
  if (!classId || !Array.isArray(studentIds) || studentIds.length < 2) {
    throw new Error("classId and at least 2 studentIds required.");
  }

  // Check if user is enrolled in this class
  const isEnrolled = readRows_(SHEET_IDS.Enrollments).some(
    (e) => e.classId === classId && e.userId === me.id
  );
  if (!isEnrolled) {
    throw new Error("Not enrolled in this class.");
  }

  // Get students and their values
  const studentsData = api_getStudentsForVisionCombination(classId);
  const selectedStudents = studentsData.students.filter((s) =>
    studentIds.includes(s.userId)
  );

  if (selectedStudents.length < 2) {
    throw new Error("At least 2 students with values required.");
  }

  // Combine all top values and calculate combined weights
  const valueMap = new Map();
  selectedStudents.forEach((student) => {
    student.topValues.forEach((value) => {
      const key = value.valueId;
      if (!valueMap.has(key)) {
        valueMap.set(key, {
          id: value.valueId,
          label: value.value.label,
          emoji: value.value.emoji || "",
          totalCoins: 0,
          students: [],
        });
      }
      const entry = valueMap.get(key);
      entry.totalCoins += value.coinWeight;
      entry.students.push(student.displayName);
    });
  });

  // Sort by total coin weight and take top 3
  const combinedValues = Array.from(valueMap.values())
    .sort((a, b) => b.totalCoins - a.totalCoins)
    .slice(0, 3);

  if (combinedValues.length === 0) {
    throw new Error("No values found for selected students.");
  }

  // Build the prompt for combined vision
  const studentNames = selectedStudents.map((s) => s.displayName).join(", ");
  const valuesList = combinedValues
    .map(
      (v) => `${v.label} (${v.totalCoins} coins from ${v.students.join(", ")})`
    )
    .join(", ");

  let missionLine = mission?.label || mission?.name || "Unspecified";
  if (mission?.description) {
    missionLine += ` — ${String(mission.description).slice(0, 160)}`;
  }

  const prompt = `
You are a professional writing coach for middle/high-school students.

TASK:
Write a "Just-Cause personal vision statement" that represents the combined values and aspirations of this group: ${studentNames}.
The statement should be values-driven, inspiring, and broad enough to guide life beyond school or robotics.
The vision must be written so that if it is lived out, the mission will naturally also be fulfilled.

INPUT:
- Group members: ${studentNames}
- Combined values (weighted by group consensus, highest first): ${valuesList}
- Mission (for context only — do not restate directly; instead ensure the vision is broad enough to encompass it): ${missionLine}

OUTPUT REQUIREMENTS (STRICT):
- 1–2 sentences, 25–40 words.
- First person plural ("We …").
- Rooted in shared values and long-term purpose (why).
- Broad and life-applicable (not just robotics).
- Inspirational and others-focused.
- Use strong, everyday language (e.g., "We want to build…," "We will live with…," "We believe in…").
- Avoid vague or abstract openings like "We imagine…" or "We dream of…".
- Focus on one or two values expressed simply (not long lists).
- Keep the impact personal and relatable (friends, family, classmates, teammates).
- Do not include tasks, habits, or checklists.
- Keep language simple, humble, and positive.

Examples (style only):
- "We believe in kindness and perseverance, and we will live with these values so that the people around us feel supported, grow in courage, and use their gifts to strengthen families."
- "We want to build a life of trust and creativity where friends, teammates, and families are encouraged to learn, work together, and make lasting good in the world."
- "We value service and respect, and we will use them to bring hope and strength to others so that together we create places of belonging and growth."

Return only the final 1–2 sentences. No headings or explanations.
`.trim();

  try {
    const text = callOpenAIPlain_(prompt, 160);
    return {
      text,
      students: selectedStudents.map((s) => ({
        userId: s.userId,
        displayName: s.displayName,
      })),
      combinedValues: combinedValues.map((v) => ({
        id: v.id,
        label: v.label,
        totalCoins: v.totalCoins,
        students: v.students,
      })),
    };
  } catch (error) {
    // Fallback vision if AI fails
    const parts = combinedValues
      .map((v) => v.label.toLowerCase())
      .filter(Boolean);
    const missionStr = (
      mission?.label ||
      mission?.name ||
      "our mission"
    ).toLowerCase();
    const fallbackText = `We commit to lead with ${
      parts.join(", ").replace(/, ([^,]*)$/, " and $1") || "our core values"
    }. This year we will pursue ${missionStr} by serving others, practicing consistently, and growing through challenges.`;

    return {
      text: fallbackText,
      students: selectedStudents.map((s) => ({
        userId: s.userId,
        displayName: s.displayName,
      })),
      combinedValues: combinedValues.map((v) => ({
        id: v.id,
        label: v.label,
        totalCoins: v.totalCoins,
        students: v.students,
      })),
    };
  }
}

// === SYNC SETTINGS API ===

// Get sync settings for all classes
function api_getSyncSettings() {
  const me = getMe_();
  if (!me || (me.role !== "TEACHER" && me.role !== "ADMIN")) {
    throw new Error("Teacher only.");
  }

  ensureSyncSettingsSheet_();
  const classes = readRows_(SHEET_IDS.Classes);
  let syncSettings = readRows_(SHEET_IDS.SyncSettings);

  console.log("All classes:", classes);
  console.log("All sync settings:", syncSettings);

  // First, identify classes that need default sync settings
  const classesNeedingDefaults = classes.filter(
    (cls) => !syncSettings.some((s) => s.classId === cls.id)
  );

  // Create default sync settings for classes that need them
  if (classesNeedingDefaults.length > 0) {
    console.log(
      `Creating default sync settings for ${classesNeedingDefaults.length} classes`
    );
    const defaultSyncSettings = classesNeedingDefaults.map((cls) => ({
      id: uid_(),
      classId: cls.id,
      classroomCourseId: cls.classroomCourseId || "",
      className: cls.name,
      syncEnabled: "FALSE", // Default to disabled
      removeMissingStudents: "FALSE",
    }));

    // Insert all default sync settings at once
    updateOrInsertMany_(
      SHEET_IDS.SyncSettings,
      ["classId"],
      defaultSyncSettings
    );

    // Re-read sync settings to get the updated data
    syncSettings = readRows_(SHEET_IDS.SyncSettings);
    console.log("Updated sync settings after creating defaults:", syncSettings);
  }

  // Merge class data with sync settings
  const result = classes.map((cls) => {
    const sync = syncSettings.find((s) => s.classId === cls.id);

    console.log(`Processing class ${cls.name}:`, {
      sync,
      syncEnabled: sync?.syncEnabled,
      removeMissing: sync?.removeMissingStudents,
    });

    // More robust boolean conversion
    const syncEnabled = sync
      ? sync.syncEnabled === "TRUE" ||
        sync.syncEnabled === true ||
        sync.syncEnabled === "true"
      : false;
    const removeMissingStudents = sync
      ? sync.removeMissingStudents === "TRUE" ||
        sync.removeMissingStudents === true ||
        sync.removeMissingStudents === "true"
      : false;

    console.log(`Class ${cls.name} final values:`, {
      syncEnabled,
      removeMissingStudents,
      syncEnabledType: typeof syncEnabled,
      removeMissingType: typeof removeMissingStudents,
    });

    return {
      id: cls.id,
      name: cls.name,
      type: cls.type,
      classroomCourseId: cls.classroomCourseId || "",
      syncEnabled: syncEnabled,
      removeMissingStudents: removeMissingStudents,
    };
  });

  console.log("Final result:", result);
  return { classes: result };
}

// Update sync settings
function api_updateSyncSettings(payload) {
  const me = getMe_();
  if (!me || (me.role !== "TEACHER" && me.role !== "ADMIN")) {
    throw new Error("Teacher only.");
  }

  const { classId, syncEnabled, removeMissingStudents } = payload || {};
  if (!classId) {
    throw new Error("classId required.");
  }

  ensureSyncSettingsSheet_();
  const classes = readRows_(SHEET_IDS.Classes);
  const cls = classes.find((c) => c.id === classId);
  if (!cls) {
    throw new Error("Class not found.");
  }

  // Check if sync settings already exist for this class
  const existingSyncSettings = readRows_(SHEET_IDS.SyncSettings);
  const existingSync = existingSyncSettings.find((s) => s.classId === classId);

  const syncData = {
    classId,
    classroomCourseId: cls.classroomCourseId || "",
    className: cls.name,
    syncEnabled: syncEnabled ? "TRUE" : "FALSE",
    removeMissingStudents: removeMissingStudents ? "TRUE" : "FALSE",
  };

  if (existingSync) {
    // Update existing record, keep the same ID
    updateOrInsert_(SHEET_IDS.SyncSettings, ["classId"], {
      ...syncData,
      id: existingSync.id,
    });
  } else {
    // Create new record with new ID
    updateOrInsert_(SHEET_IDS.SyncSettings, ["classId"], {
      ...syncData,
      id: uid_(),
    });
  }

  return { ok: true };
}

// Sync all enabled classes
function api_syncAllEnabled() {
  const me = getMe_();
  if (!me || (me.role !== "TEACHER" && me.role !== "ADMIN")) {
    throw new Error("Teacher only.");
  }

  ensureSyncSettingsSheet_();
  const allSyncSettings = readRows_(SHEET_IDS.SyncSettings);

  console.log("All sync settings for sync all:", allSyncSettings);

  // Filter for enabled sync settings with robust boolean checking
  const syncSettings = allSyncSettings.filter((s) => {
    const isEnabled =
      s.syncEnabled === "TRUE" ||
      s.syncEnabled === true ||
      s.syncEnabled === "true";
    console.log(
      `Sync setting for ${s.className}: syncEnabled=${s.syncEnabled}, isEnabled=${isEnabled}`
    );
    return isEnabled;
  });

  console.log(
    `Found ${syncSettings.length} enabled sync settings out of ${allSyncSettings.length} total`
  );

  const results = [];
  let totalAdded = 0,
    totalRemoved = 0,
    totalUpdated = 0;

  for (const setting of syncSettings) {
    console.log(`Processing sync for class: ${setting.className}`);

    if (!setting.classroomCourseId) {
      console.log(`Skipping ${setting.className}: No Classroom course linked`);
      results.push({
        className: setting.className,
        status: "skipped",
        message: "No Classroom course linked",
      });
      continue;
    }

    try {
      const removeMissing =
        setting.removeMissingStudents === "TRUE" ||
        setting.removeMissingStudents === true ||
        setting.removeMissingStudents === "true";

      console.log(
        `Syncing ${setting.className} with removeMissing=${removeMissing}`
      );

      const result = api_gc_syncClassWithRemoval(
        setting.classroomCourseId,
        removeMissing
      );

      console.log(`Sync result for ${setting.className}:`, result);

      results.push({
        className: setting.className,
        status: "success",
        message: result.message,
        added: result.added || 0,
        removed: result.removed || 0,
        updated: result.updated || 0,
      });
      totalAdded += result.added || 0;
      totalRemoved += result.removed || 0;
      totalUpdated += result.updated || 0;
    } catch (error) {
      console.log(`Error syncing ${setting.className}:`, error);
      results.push({
        className: setting.className,
        status: "error",
        message: error.message,
      });
    }
  }

  console.log("Sync all completed. Results:", results);

  return {
    ok: true,
    results,
    summary: {
      totalAdded,
      totalRemoved,
      totalUpdated,
      totalClasses: syncSettings.length,
    },
  };
}

// Enhanced sync with removal capability
function api_gc_syncClassWithRemoval(classroomCourseId, removeMissing = false) {
  const me = getMe_();
  if (!me || (me.role !== "TEACHER" && me.role !== "ADMIN")) {
    throw new Error("Teacher only.");
  }

  if (!classroomCourseId) {
    throw new Error("classroomCourseId required.");
  }

  // Get current Classroom roster
  const course = Classroom.Courses.get(classroomCourseId);
  if (!course) {
    throw new Error(`Course not found: ${classroomCourseId}`);
  }

  const students = _gc_listStudents_(classroomCourseId);
  const teachers = _gc_listTeachers_(classroomCourseId);

  // Find the class in our system
  const classes = readRows_(SHEET_IDS.Classes);
  const cls = classes.find((c) => c.classroomCourseId === classroomCourseId);
  if (!cls) {
    throw new Error("Class not found in system. Import first.");
  }

  // Get current enrollments
  const currentEnrollments = readRows_(SHEET_IDS.Enrollments).filter(
    (e) => e.classId === cls.id
  );

  // Create maps for quick lookup
  const currentStudentIds = new Set(
    currentEnrollments
      .filter((e) => e.roleInClass === "STUDENT")
      .map((e) => e.userId)
  );

  const currentTeacherIds = new Set(
    currentEnrollments
      .filter((e) => e.roleInClass === "TEACHER")
      .map((e) => e.userId)
  );

  // Process users (same as original import)
  const usersNow = readRows_(SHEET_IDS.Users);
  const byEmail = new Map(
    usersNow.map((u) => [String(u.email || "").toLowerCase(), u])
  );
  const byGid = new Map(usersNow.map((u) => [String(u.googleId || ""), u]));

  const toInsertUsers = [];
  const toInsertEnroll = [];
  const maybeElevate = [];
  let addedUsers = 0,
    updatedTeachers = 0,
    addedEnroll = 0;

  // Helper function (same as original)
  function resolveUser(entry, roleDefault) {
    const email = (entry.email || "").toLowerCase();
    const gid = entry.googleId || "";
    let u = (email && byEmail.get(email)) || (gid && byGid.get(gid));
    if (!u) {
      if (!email && !gid) return null;
      const id = uid_();
      const userObj = {
        id,
        email: entry.email || "",
        displayName: entry.name || "",
        role: roleDefault,
        gradeLevel: "",
        googleId: gid || "",
      };
      toInsertUsers.push(userObj);
      u = userObj;
      if (email) byEmail.set(email, u);
      if (gid) byGid.set(gid, u);
      addedUsers++;
    }
    return u;
  }

  // Process teachers
  const classroomTeacherIds = new Set();
  teachers.forEach((t) => {
    const u = resolveUser(t, "TEACHER");
    if (!u) return;
    classroomTeacherIds.add(u.id);
    if (u.role !== "TEACHER" && u.role !== "ADMIN") {
      maybeElevate.push({ id: u.id, patch: { role: "TEACHER" } });
      updatedTeachers++;
    }
  });

  // Process students
  const classroomStudentIds = new Set();
  students.forEach((s) => {
    const u = resolveUser(s, "STUDENT");
    if (!u) return;
    classroomStudentIds.add(u.id);
  });

  // Insert new users
  if (toInsertUsers.length) {
    appendMany_(SHEET_IDS.Users, toInsertUsers);
  }

  // Update user maps
  const usersAfter = usersNow.concat(toInsertUsers);
  const idByEmail = new Map(
    usersAfter.map((u) => [String(u.email || "").toLowerCase(), u.id])
  );
  const idByGid = new Map(
    usersAfter.map((u) => [String(u.googleId || ""), u.id])
  );

  // Add missing enrollments
  classroomTeacherIds.forEach((uid) => {
    if (!currentTeacherIds.has(uid)) {
      toInsertEnroll.push({
        id: uid_(),
        userId: uid,
        classId: cls.id,
        roleInClass: "TEACHER",
      });
      addedEnroll++;
    }
  });

  classroomStudentIds.forEach((uid) => {
    if (!currentStudentIds.has(uid)) {
      toInsertEnroll.push({
        id: uid_(),
        userId: uid,
        classId: cls.id,
        roleInClass: "STUDENT",
      });
      addedEnroll++;
    }
  });

  // Insert new enrollments
  if (toInsertEnroll.length) {
    appendMany_(SHEET_IDS.Enrollments, toInsertEnroll);
  }

  // Apply role elevations
  maybeElevate.forEach((upd) =>
    updateRowById_(SHEET_IDS.Users, upd.id, upd.patch)
  );

  // Remove missing students if requested
  let removedEnrollments = 0;
  if (removeMissing) {
    const toRemove = currentEnrollments.filter((e) => {
      if (e.roleInClass === "STUDENT" && !classroomStudentIds.has(e.userId)) {
        return true;
      }
      return false;
    });

    if (toRemove.length > 0) {
      const toRemoveIds = toRemove.map((e) => e.id);
      deleteRowsWhere_(SHEET_IDS.Enrollments, (r) =>
        toRemoveIds.includes(r.id)
      );
      removedEnrollments = toRemove.length;
    }
  }

  return {
    ok: true,
    className: cls.name,
    added: addedUsers + addedEnroll,
    removed: removedEnrollments,
    updated: updatedTeachers,
    message: `Synced "${cls.name}": +${
      addedUsers + addedEnroll
    }, -${removedEnrollments}, ~${updatedTeachers}`,
  };
}

// === CLASSROOM COURSE MANAGEMENT ===

// Helper functions for Google Classroom API
function _gc_listStudents_(courseId) {
  const out = [];
  let pageToken = null;
  do {
    const res = Classroom.Courses.Students.list(courseId, {
      pageSize: 100,
      pageToken,
    });
    (res.students || []).forEach((s) => {
      const p = s.profile || {};
      out.push({
        email: p.emailAddress || "",
        name: (p.name && p.name.fullName) || p.id || "",
        googleId: p.id || "",
      });
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

function _gc_listTeachers_(courseId) {
  const out = [];
  let pageToken = null;
  do {
    const res = Classroom.Courses.Teachers.list(courseId, {
      pageSize: 50,
      pageToken,
    });
    (res.teachers || []).forEach((t) => {
      const p = t.profile || {};
      out.push({
        email: p.emailAddress || "",
        name: (p.name && p.name.fullName) || p.id || "",
        googleId: p.id || "",
      });
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

// Get available Google Classroom courses
function api_getAvailableClassroomCourses() {
  const me = getMe_();
  if (!me || (me.role !== "TEACHER" && me.role !== "ADMIN")) {
    throw new Error("Teacher only.");
  }

  try {
    const courses =
      Classroom.Courses.list({
        courseStates: ["ACTIVE"],
        teacherId: "me",
      }).courses || [];

    // Get existing classes to filter out already imported ones
    const existingClasses = readRows_(SHEET_IDS.Classes);
    const existingClassroomIds = new Set(
      existingClasses.map((c) => c.classroomCourseId).filter((id) => id)
    );

    const availableCourses = courses
      .filter((course) => !existingClassroomIds.has(course.id))
      .map((course) => ({
        id: course.id,
        name: course.name,
        section: course.section || "",
        description: course.descriptionHeading || "",
        room: course.room || "",
        enrollmentCode: course.enrollmentCode || "",
        alreadyAdded: false,
      }));

    const alreadyAddedCourses = courses
      .filter((course) => existingClassroomIds.has(course.id))
      .map((course) => ({
        id: course.id,
        name: course.name,
        section: course.section || "",
        description: course.descriptionHeading || "",
        room: course.room || "",
        enrollmentCode: course.enrollmentCode || "",
        alreadyAdded: true,
      }));

    return {
      courses: availableCourses,
      alreadyAdded: alreadyAddedCourses,
    };
  } catch (error) {
    throw new Error(`Failed to fetch Classroom courses: ${error.message}`);
  }
}

// Add a new class from Google Classroom
function api_addClassFromClassroom(payload) {
  const me = getMe_();
  if (!me || (me.role !== "TEACHER" && me.role !== "ADMIN")) {
    throw new Error("Teacher only.");
  }

  const { classroomCourseId, classType = "REGULAR" } = payload || {};
  if (!classroomCourseId) {
    throw new Error("classroomCourseId required.");
  }

  // Check if class already exists
  const existingClasses = readRows_(SHEET_IDS.Classes);
  if (existingClasses.some((c) => c.classroomCourseId === classroomCourseId)) {
    throw new Error("Class already exists in system.");
  }

  try {
    // Get course details from Classroom
    const course = Classroom.Courses.get(classroomCourseId);
    if (!course) {
      throw new Error("Course not found in Google Classroom.");
    }

    // Create new class
    const classId = uid_();
    const newClass = {
      id: classId,
      name: course.name,
      type: classType,
      classroomCourseId: classroomCourseId,
      description: course.descriptionHeading || "",
      room: course.room || "",
      enrollmentCode: course.enrollmentCode || "",
    };

    // Insert class
    appendMany_(SHEET_IDS.Classes, [newClass]);

    // Create sync settings for the new class
    ensureSyncSettingsSheet_();
    updateOrInsert_(SHEET_IDS.SyncSettings, ["classId"], {
      id: uid_(),
      classId: classId,
      classroomCourseId: classroomCourseId,
      className: course.name,
      syncEnabled: "FALSE", // Default to disabled
      removeMissingStudents: "FALSE",
    });

    return {
      ok: true,
      classId: classId,
      className: course.name,
      message: `Added "${course.name}" to system. Sync is disabled by default.`,
    };
  } catch (error) {
    throw new Error(`Failed to add class: ${error.message}`);
  }
}
