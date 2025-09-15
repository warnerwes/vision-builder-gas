/** Vision Builder — quick sheet bootstrap + seed (copy-paste ready)
 *  How to use:
 *  1) Open your Google Sheet → Extensions → Apps Script
 *  2) Paste this file, save, Run → setupAndSeedVB()
 *  3) Re-run safely anytime; set RESET=true to wipe/recreate tabs.
 */

// 1) See what headers you actually have.
function dbg_headers() {
  ["Users", "Classes", "Enrollments"].forEach((n) => {
    try {
      const sh = SpreadsheetApp.getActive().getSheetByName(n);
      const hdr = sh && sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      Logger.log(`${n} headers: ${JSON.stringify(hdr)}`);
    } catch (e) {
      Logger.log(`${n} error: ${e}`);
    }
  });
}

// 2) Show your identity + whether Enrollments exists for you.
function dbg_my_enrollments() {
  const me = getMe_();
  const enr = readRows_("Enrollments").filter((e) => e.userId === me.id);
  Logger.log(`Me: ${JSON.stringify(me)}`);
  Logger.log(`Enrollments for me: ${enr.length} → ${JSON.stringify(enr)}`);
}

/** Run once to add a 'classroomCourseId' column to Classes (if missing). */
function migrateAddClassroomColumn() {
  const sh = SpreadsheetApp.getActive().getSheetByName("Classes");
  if (!sh) {
    throw new Error("Classes sheet missing.");
  }
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (headers.includes("classroomCourseId")) {
    SpreadsheetApp.getUi().alert("classroomCourseId already exists.");
    return;
  }
  sh.insertColumnAfter(sh.getLastColumn());
  sh.getRange(1, sh.getLastColumn(), 1, 1).setValues([["classroomCourseId"]]);
  SpreadsheetApp.getUi().alert("Added classroomCourseId column to Classes.");
}

/** Tests Google Classroom API access by listing a few active courses. */
function testClassroomAccess() {
  try {
    // Requires Advanced Service: Classroom API (v1)
    // and scope: https://www.googleapis.com/auth/classroom.courses.readonly
    const res = Classroom.Courses.list({
      pageSize: 10,
      courseStates: ["ACTIVE"],
    });
    const courses = res.courses || [];
    Logger.log(
      "✅ Classroom API reachable. Active courses: %s",
      courses.length
    );
    courses.forEach((c) => Logger.log("- %s (%s)", c.name, c.id));
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    Logger.log("❌ Classroom API call failed: %s", msg);
    if (msg.includes("insufficientPermissions") || msg.includes("403")) {
      Logger.log(
        "Hint: Enable the Classroom API and add the classroom.courses.readonly scope. Domain admin may need to approve."
      );
    } else if (msg.includes("401")) {
      Logger.log(
        "Hint: Re-authorize the script (Run ▶ then Accept), or verify the signed-in account."
      );
    }
    throw err; // surfaces the error in the IDE
  }
}

const RESET = true; // set false to keep existing rows

const SHEETS = {
  Users: "Users",
  Classes: "Classes",
  Enrollments: "Enrollments",
  Values: "Values",
  ClassAllowedValue: "ClassAllowedValue",
  Missions: "Missions",
  ClassMission: "ClassMission",
  ValueSelections: "ValueSelections",
  MissionSelections: "MissionSelections",
  Teams: "Teams",
  TeamMembers: "TeamMembers",
};

function setupAndSeedVB() {
  const ss = SpreadsheetApp.getActive();

  // 1) Create tabs with headers
  makeSheet(ss, SHEETS.Users, [
    "id",
    "email",
    "displayName",
    "role",
    "under13",
  ]);
  makeSheet(ss, SHEETS.Classes, ["id", "name", "type"]);
  makeSheet(ss, SHEETS.Enrollments, ["id", "userId", "classId", "roleInClass"]);
  makeSheet(ss, SHEETS.Values, ["id", "slug", "label", "active"]);
  makeSheet(ss, SHEETS.ClassAllowedValue, ["id", "classId", "valueId"]);
  makeSheet(ss, SHEETS.Missions, ["id", "slug", "label", "active"]);
  makeSheet(ss, SHEETS.ClassMission, ["id", "classId", "missionId"]);
  makeSheet(ss, SHEETS.ValueSelections, [
    "id",
    "userId",
    "classId",
    "valueId",
    "coinWeight",
  ]);
  makeSheet(ss, SHEETS.MissionSelections, [
    "id",
    "userId",
    "classId",
    "missionId",
  ]);
  makeSheet(ss, SHEETS.Teams, ["id", "classId", "name", "missionId"]);
  makeSheet(ss, SHEETS.TeamMembers, ["id", "teamId", "userId", "role"]);

  // 2) Seed core data
  const ids = {}; // quick registry

  // Users (teacher + 4 students; change emails as needed)
  const users = [
    row(ids, "user_wes", SHEETS.Users, {
      email: "wesley.warner@pacificcoastacademy.org",
      displayName: "Mr. Warner",
      role: "TEACHER",
      under13: false,
    }),
    row(ids, "user_alex", SHEETS.Users, {
      email: "alex@student.org",
      displayName: "Alex",
      role: "STUDENT",
      under13: false,
    }),
    row(ids, "user_bri", SHEETS.Users, {
      email: "bri@student.org",
      displayName: "Bri",
      role: "STUDENT",
      under13: true,
    }),
    row(ids, "user_chen", SHEETS.Users, {
      email: "chen@student.org",
      displayName: "Chen",
      role: "STUDENT",
      under13: false,
    }),
    row(ids, "user_dev", SHEETS.Users, {
      email: "dev@student.org",
      displayName: "Dev",
      role: "STUDENT",
      under13: false,
    }),
  ];

  // Classes
  const classes = [
    row(ids, "class_go", SHEETS.Classes, { name: "VEX GO", type: "VEX_GO" }),
    row(ids, "class_iq_comp", SHEETS.Classes, {
      name: "VEX IQ Competitive",
      type: "VEX_IQ_COMP",
    }),
    row(ids, "class_launchpad", SHEETS.Classes, {
      name: "VEX IQ Launchpad",
      type: "VEX_IQ_LAUNCHPAD",
    }),
    row(ids, "class_coding", SHEETS.Classes, {
      name: "Coding Class",
      type: "CODING",
    }),
  ];

  // Enrollments (teacher in all; students split among classes)
  const enrollments = [
    // Teacher
    row(ids, "en_wes_go", SHEETS.Enrollments, {
      userId: ids.user_wes,
      classId: ids.class_go,
      roleInClass: "TEACHER",
    }),
    row(ids, "en_wes_iq", SHEETS.Enrollments, {
      userId: ids.user_wes,
      classId: ids.class_iq_comp,
      roleInClass: "TEACHER",
    }),
    row(ids, "en_wes_launch", SHEETS.Enrollments, {
      userId: ids.user_wes,
      classId: ids.class_launchpad,
      roleInClass: "TEACHER",
    }),
    row(ids, "en_wes_coding", SHEETS.Enrollments, {
      userId: ids.user_wes,
      classId: ids.class_coding,
      roleInClass: "TEACHER",
    }),
    // Students
    row(ids, "en_alex_iq", SHEETS.Enrollments, {
      userId: ids.user_alex,
      classId: ids.class_iq_comp,
      roleInClass: "STUDENT",
    }),
    row(ids, "en_bri_launch", SHEETS.Enrollments, {
      userId: ids.user_bri,
      classId: ids.class_launchpad,
      roleInClass: "STUDENT",
    }),
    row(ids, "en_chen_go", SHEETS.Enrollments, {
      userId: ids.user_chen,
      classId: ids.class_go,
      roleInClass: "STUDENT",
    }),
    row(ids, "en_dev_coding", SHEETS.Enrollments, {
      userId: ids.user_dev,
      classId: ids.class_coding,
      roleInClass: "STUDENT",
    }),
  ];

  // Values (8)
  const valueList = [
    { slug: "trust", label: "Trust" },
    { slug: "courage", label: "Courage" },
    { slug: "honor", label: "Honor" },
    { slug: "kindness", label: "Kindness" },
    { slug: "perseverance", label: "Perseverance" },
    { slug: "respect", label: "Respect" },
    { slug: "empathy", label: "Empathy" },
    { slug: "service", label: "Service" },
  ].map((v) =>
    row(ids, `val_${v.slug}`, SHEETS.Values, {
      slug: v.slug,
      label: v.label,
      active: true,
    })
  );

  // Allow ALL values for all classes (you can prune later)
  Object.values({
    VEX_GO: ids.class_go,
    VEX_IQ_COMP: ids.class_iq_comp,
    VEX_IQ_LAUNCHPAD: ids.class_launchpad,
    CODING: ids.class_coding,
  }).forEach((classId) => {
    valueList.forEach((v) =>
      row(ids, uid(), SHEETS.ClassAllowedValue, { classId, valueId: v.id })
    );
  });

  // Missions (Robotics 5 + Coding 5)
  const missions = [
    // Robotics
    { slug: "all_the_way", label: "All the Way (Worlds Focus)" },
    { slug: "states", label: "State Championship" },
    { slug: "regional", label: "Regional/Local Competitor" },
    { slug: "in_house", label: "In-House League/Scrimmage" },
    { slug: "learn_explore", label: "Learn & Explore" },
    // Coding (broad set)
    { slug: "arcade_classics", label: "Arcade Classics" },
    { slug: "action_platformer", label: "Action Platformer" },
    { slug: "puzzle_logic", label: "Puzzle & Logic" },
    { slug: "adventure_story", label: "Adventure / Story" },
    { slug: "sim_builder", label: "Simulation / Builder" },
  ].map((m) =>
    row(ids, `mis_${m.slug}`, SHEETS.Missions, {
      slug: m.slug,
      label: m.label,
      active: true,
    })
  );

  // Helper: find mission by slug
  const mBySlug = (slug) => missions.find((m) => m.slug === slug) || {};
  // Class → allowed missions
  const classMissionMap = [
    // VEX GO → learn/explore
    { classId: ids.class_go, slugs: ["learn_explore"] },
    // VEX IQ Competitive → all five robotics missions
    {
      classId: ids.class_iq_comp,
      slugs: ["all_the_way", "states", "regional", "in_house", "learn_explore"],
    },
    // VEX IQ Launchpad → in_house, learn/explore
    { classId: ids.class_launchpad, slugs: ["in_house", "learn_explore"] },
    // CODING → five coding missions
    {
      classId: ids.class_coding,
      slugs: [
        "arcade_classics",
        "action_platformer",
        "puzzle_logic",
        "adventure_story",
        "sim_builder",
      ],
    },
  ];
  classMissionMap.forEach((entry) => {
    entry.slugs.forEach((slug) => {
      const mission = mBySlug(slug);
      row(ids, uid(), SHEETS.ClassMission, {
        classId: entry.classId,
        missionId: mission.id,
      });
    });
  });

  // ValueSelections (each student: 3 values, ≤5 coins total)
  const pick = (slug) => valueList.find((v) => v.slug === slug);

  // Chen (VEX GO)
  seedValuePicks(ids.user_chen, ids.class_go, [
    { v: pick("kindness"), c: 2 },
    { v: pick("respect"), c: 2 },
    { v: pick("trust"), c: 1 },
  ]);

  // Alex (VEX IQ Competitive)
  seedValuePicks(ids.user_alex, ids.class_iq_comp, [
    { v: pick("perseverance"), c: 3 },
    { v: pick("honor"), c: 1 },
    { v: pick("service"), c: 1 },
  ]);

  // Bri (VEX IQ Launchpad)
  seedValuePicks(ids.user_bri, ids.class_launchpad, [
    { v: pick("empathy"), c: 2 },
    { v: pick("kindness"), c: 2 },
    { v: pick("trust"), c: 1 },
  ]);

  // Dev (Coding)
  seedValuePicks(ids.user_dev, ids.class_coding, [
    { v: pick("courage"), c: 2 },
    { v: pick("trust"), c: 2 },
    { v: pick("respect"), c: 1 },
  ]);

  // MissionSelections
  // Chen (GO) → learn/explore
  row(ids, uid(), SHEETS.MissionSelections, {
    userId: ids.user_chen,
    classId: ids.class_go,
    missionId: mBySlug("learn_explore").id,
  });
  // Alex (IQ) → states
  row(ids, uid(), SHEETS.MissionSelections, {
    userId: ids.user_alex,
    classId: ids.class_iq_comp,
    missionId: mBySlug("states").id,
  });
  // Bri (Launchpad) → in_house
  row(ids, uid(), SHEETS.MissionSelections, {
    userId: ids.user_bri,
    classId: ids.class_launchpad,
    missionId: mBySlug("in_house").id,
  });
  // Dev (Coding) → action_platformer
  row(ids, uid(), SHEETS.MissionSelections, {
    userId: ids.user_dev,
    classId: ids.class_coding,
    missionId: mBySlug("action_platformer").id,
  });

  // Teams (example: create one team per class and add members)
  const t_go = row(ids, "team_go", SHEETS.Teams, {
    classId: ids.class_go,
    name: "GO Gears",
    missionId: mBySlug("learn_explore").id,
  });
  const t_iq = row(ids, "team_iq", SHEETS.Teams, {
    classId: ids.class_iq_comp,
    name: "IQ Knights",
    missionId: mBySlug("states").id,
  });
  const t_lp = row(ids, "team_lp", SHEETS.Teams, {
    classId: ids.class_launchpad,
    name: "Launch Stars",
    missionId: mBySlug("in_house").id,
  });
  const t_cod = row(ids, "team_cod", SHEETS.Teams, {
    classId: ids.class_coding,
    name: "Code Crafters",
    missionId: mBySlug("action_platformer").id,
  });

  // Members (teacher optional; mostly students)
  row(ids, uid(), SHEETS.TeamMembers, {
    teamId: t_go.id,
    userId: ids.user_chen,
    role: "MEMBER",
  });
  row(ids, uid(), SHEETS.TeamMembers, {
    teamId: t_iq.id,
    userId: ids.user_alex,
    role: "MEMBER",
  });
  row(ids, uid(), SHEETS.TeamMembers, {
    teamId: t_lp.id,
    userId: ids.user_bri,
    role: "MEMBER",
  });
  row(ids, uid(), SHEETS.TeamMembers, {
    teamId: t_cod.id,
    userId: ids.user_dev,
    role: "MEMBER",
  });

  SpreadsheetApp.getUi().alert(
    "Vision Builder: tabs created and test data seeded ✅"
  );
}

/* ---------- helpers ---------- */

function makeSheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  } else if (RESET) {
    sh.clear();
  }
  // Ensure header row
  if (sh.getLastRow() === 0) {
    sh.insertRows(1);
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function row(ids, key, sheetName, obj) {
  // allocate id if not supplied
  const id = obj.id || uid();
  obj = { id, ...obj };

  // write append
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = headers.map((h) => normalizeBoolean(obj[h]));
  sh.appendRow(row);

  // save registry for linking
  if (key) {
    ids[key] = id;
    // also expose important props like slug/label for quick lookups
    if (obj.slug) {
      ids[`${key}_slug`] = obj.slug;
    }
  }
  // return the written object (plus id)
  const out = { ...obj };
  // capture a few commonly accessed props
  if (obj.slug) {
    out.slug = obj.slug;
  }
  if (obj.label) {
    out.label = obj.label;
  }
  return out;
}

function seedValuePicks(userId, classId, picks /* [{v, c}] */) {
  // guard: at most 3 picks, total coins ≤ 5
  if (picks.length > 3) {
    throw new Error("Seed error: more than 3 values.");
  }
  const total = picks.reduce((s, p) => s + Number(p.c || 0), 0);
  if (total > 5) {
    throw new Error("Seed error: more than 5 coins.");
  }

  picks.forEach((p) => {
    row({}, uid(), SHEETS.ValueSelections, {
      userId,
      classId,
      valueId: p.v.id,
      coinWeight: Number(p.c || 0),
    });
  });
}

function normalizeBoolean(v) {
  if (v === true) {
    return true;
  }
  if (v === false) {
    return false;
  }
  if (String(v).toLowerCase() === "true") {
    return true;
  }
  if (String(v).toLowerCase() === "false") {
    return false;
  }
  return v;
}

function uid() {
  return Utilities.getUuid();
}
