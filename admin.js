/** Admin.gs — server API for Admin Panel (CRUD + feedback + gradeLevel) */

const ADMIN_JOINCODES_SHEET = 'ClassJoinCodes'; // new tab

// ---------- security ----------
function requireTeacher_() {
  const me = getMe_();
  if (!me || (me.role !== 'TEACHER' && me.role !== 'ADMIN')) {
    throw new Error('Teacher/Admin only.');
  }
  return me;
}

// ---------- ensure sheet ----------
function ensureAdminSheets_() {
  if (!sheet_(ADMIN_JOINCODES_SHEET)) {
    makeSheet_(ADMIN_JOINCODES_SHEET, ['id','classId','code','expiresAt','maxUses','uses','active']);
  }
}

// local headered-writer
function makeSheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  sh = sh || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {sh.insertRowBefore(1);}
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function appendRow_(name, obj) {
  const sh = sheet_(name);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = headers.map(h => (h in obj ? obj[h] : ''));
  sh.appendRow(row);
  return obj;
}

function updateRowById_(name, id, patch) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  const idx = Object.fromEntries(header.map((h,i) => [h,i]));
  const r = rows.findIndex(r => String(r[idx.id]) === String(id));
  if (r < 0) {return false;}
  const rowNumber = r + 2;
  Object.keys(patch).forEach(k => {
    if (k in idx) {sh.getRange(rowNumber, idx[k] + 1).setValue(patch[k]);}
  });
  return true;
}

function deleteRowById_(name, id) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  const idx = Object.fromEntries(header.map((h,i) => [h,i]));
  const r = rows.findIndex(r => String(r[idx.id]) === String(id));
  if (r < 0) {return false;}
  sh.deleteRow(r + 2);
  return true;
}

function deleteRowsWhere_(name, predicateFn) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const [header, ...rows] = values;
  if (!rows.length) {return 0;}
  const idx = Object.fromEntries(header.map((h,i) => [h,i]));
  // delete bottom-up
  let deleted = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const rowObj = {};
    for (const k in idx) {rowObj[k] = rows[i][idx[k]];}
    if (predicateFn(rowObj)) {
      sh.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}

// ---------- small lookups ----------
function getUserByEmail_(email) {
  const users = readRows_(SHEET_IDS.Users);
  return users.find(u => (u.email || '').toLowerCase() === String(email).toLowerCase());
}
function getClassById_(classId) {
  const classes = readRows_(SHEET_IDS.Classes);
  return classes.find(c => c.id === classId);
}

// ---------- Admin bootstrap ----------
function api_admin_bootstrap() {
  requireTeacher_();
  ensureAdminSheets_();
  return {
    classes: readRows_(SHEET_IDS.Classes),
    users: readRows_(SHEET_IDS.Users),
    joinCodes: readRows_(ADMIN_JOINCODES_SHEET),
  };
}

// ================= USERS =================

// Add single user (gradeLevel supported)
function api_admin_addUser(payload) {
  requireTeacher_();
  const { email, displayName, role, gradeLevel } = payload || {};
  if (!email || !displayName) {throw new Error('email and displayName required.');}
  if (getUserByEmail_(email)) {throw new Error(`User already exists: ${email}`);}

  const id = uid_();
  appendRow_(SHEET_IDS.Users, {
    id, email, displayName,
    role: role || 'STUDENT',
    gradeLevel: gradeLevel || '',
  });
  return { ok: true, id, message: 'User added.' };
}

// Bulk CSV: email,displayName,gradeLevel,role
function api_admin_bulkAddUsers(lines) {
  requireTeacher_();
  const added = [];
  const skipped = [];
  (lines || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
    const [email, displayName, gradeLevel, role] = line.split(',').map(s => (s || '').trim());
    if (!email || !displayName) { skipped.push({ line, reason:'missing fields' }); return; }
    if (getUserByEmail_(email)) { skipped.push({ line, reason:'exists' }); return; }
    appendRow_(SHEET_IDS.Users,{
      id: uid_(), email, displayName, role: role || 'STUDENT', gradeLevel: gradeLevel || '',
    });
    added.push(email);
  });
  return { ok:true, added, skipped, message: `Added ${added.length}, skipped ${skipped.length}` };
}

// Update user fields by id (email, displayName, gradeLevel, role)
function api_admin_updateUser(payload) {
  requireTeacher_();
  const { id, email, displayName, gradeLevel, role } = payload || {};
  if (!id) {throw new Error('id required.');}
  // If changing email, ensure uniqueness
  if (email) {
    const exists = readRows_(SHEET_IDS.Users).some(u => u.id !== id && (u.email || '').toLowerCase() === email.toLowerCase());
    if (exists) {throw new Error('Email already in use.');}
  }
  const ok = updateRowById_(SHEET_IDS.Users, id, {
    email: email ?? undefined,
    displayName: displayName ?? undefined,
    gradeLevel: gradeLevel ?? undefined,
    role: role ?? undefined,
  });
  if (!ok) {throw new Error('User not found.');}
  return { ok:true, message:'User updated.' };
}

// Delete user by id (cascade enrollments, selections, teamMembers)
function api_admin_deleteUser(id) {
  requireTeacher_();
  if (!id) {throw new Error('id required.');}
  // cascades
  deleteRowsWhere_(SHEET_IDS.Enrollments, r => r.userId === id);
  deleteRowsWhere_(SHEET_IDS.ValueSelections, r => r.userId === id);
  deleteRowsWhere_(SHEET_IDS.MissionSelections, r => r.userId === id);
  deleteRowsWhere_(SHEET_IDS.TeamMembers, r => r.userId === id);
  const ok = deleteRowById_(SHEET_IDS.Users, id);
  if (!ok) {throw new Error('User not found.');}
  return { ok:true, message:'User deleted (with related data).' };
}

// ================= CLASSES =================

// Add class
function api_admin_addClass(payload) {
  requireTeacher_();
  const { name, type } = payload || {};
  if (!name || !type) {throw new Error('name and type required.');}
  const id = uid_();
  appendRow_(SHEET_IDS.Classes, { id, name, type });
  return { ok:true, id, message:'Class added.' };
}

// Update class (name/type) by id
function api_admin_updateClass(payload) {
  requireTeacher_();
  const { id, name, type } = payload || {};
  if (!id) {throw new Error('id required.');}
  const ok = updateRowById_(SHEET_IDS.Classes, id, {
    name: name ?? undefined,
    type: type ?? undefined,
  });
  if (!ok) {throw new Error('Class not found.');}
  return { ok:true, message:'Class updated.' };
}

// Delete class (cascade: enrollments, allowed values/missions, teams/members, selections)
function api_admin_deleteClass(id) {
  requireTeacher_();
  if (!id) {throw new Error('id required.');}

  // delete teams under class (and members)
  const teams = readRows_(SHEET_IDS.Teams).filter(t => t.classId === id);
  teams.forEach(t => deleteRowsWhere_(SHEET_IDS.TeamMembers, r => r.teamId === t.id));
  deleteRowsWhere_(SHEET_IDS.Teams, r => r.classId === id);

  // delete enrollments & selections
  deleteRowsWhere_(SHEET_IDS.Enrollments, r => r.classId === id);
  deleteRowsWhere_(SHEET_IDS.ValueSelections, r => r.classId === id);
  deleteRowsWhere_(SHEET_IDS.MissionSelections, r => r.classId === id);

  // delete class mappings
  deleteRowsWhere_(SHEET_IDS.ClassMission, r => r.classId === id);

  // delete join codes
  ensureAdminSheets_();
  deleteRowsWhere_(ADMIN_JOINCODES_SHEET, r => r.classId === id);

  // finally delete class
  const ok = deleteRowById_(SHEET_IDS.Classes, id);
  if (!ok) {throw new Error('Class not found.');}
  return { ok:true, message:'Class deleted (with related data).' };
}

// ---------- Enroll by email ----------
function api_admin_enrollEmailToClass(payload) {
  requireTeacher_();
  const { email, classId, roleInClass } = payload || {};
  const u = getUserByEmail_(email);
  if (!u) {throw new Error(`No such user: ${email}`);}
  if (!getClassById_(classId)) {throw new Error(`No such class: ${classId}`);}

  // prevent duplicate enrollment
  const existing = readRows_(SHEET_IDS.Enrollments)
    .some(e => e.userId === u.id && e.classId === classId);
  if (!existing) {
    appendRow_(SHEET_IDS.Enrollments, {
      id: uid_(), userId: u.id, classId, roleInClass: roleInClass || 'STUDENT',
    });
  }
  return { ok:true, message:'Enrollment added (or already present).' };
}

// ---------- Join codes ----------
function api_admin_generateJoinCode(payload) {
  requireTeacher_();
  ensureAdminSheets_();
  const { classId, maxUses, daysValid } = payload || {};
  if (!getClassById_(classId)) {throw new Error(`No such class: ${classId}`);}

  const code = makeCode_(6); // e.g. ABC7QX
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, Number(daysValid || 7)));

  appendRow_(ADMIN_JOINCODES_SHEET, {
    id: uid_(),
    classId, code,
    expiresAt: expiresAt.toISOString(),
    maxUses: Math.max(1, Number(maxUses || 20)),
    uses: 0,
    active: true,
  });
  return { ok:true, code, message:'Join code generated.' };
}

function api_admin_listJoinCodes(classId) {
  requireTeacher_();
  ensureAdminSheets_();
  const all = readRows_(ADMIN_JOINCODES_SHEET);
  return classId ? all.filter(c => c.classId === classId) : all;
}

function api_admin_closeJoinCode(id) {
  requireTeacher_();
  ensureAdminSheets_();
  const ok = updateRowById_(ADMIN_JOINCODES_SHEET, id, { active:false });
  if (!ok) {throw new Error('Join code not found.');}
  return { ok:true, message:'Join code closed.' };
}

// Student self-enroll using a code
function api_enrollWithCode(code) {
  const me = getMe_(); // student logged in
  ensureAdminSheets_();
  const codes = readRows_(ADMIN_JOINCODES_SHEET);
  const entry = codes.find(c => String(c.code).toUpperCase() === String(code).toUpperCase());
  if (!entry) {throw new Error('Invalid code.');}
  const active = String(entry.active).toLowerCase() === 'true';
  if (!active) {throw new Error('Code is inactive.');}
  if (new Date(entry.expiresAt) < new Date()) {throw new Error('Code expired.');}
  if (Number(entry.uses || 0) >= Number(entry.maxUses || 0)) {throw new Error('Code at capacity.');}

  // enroll me
  const enrolled = readRows_(SHEET_IDS.Enrollments)
    .some(e => e.userId === me.id && e.classId === entry.classId);
  if (!enrolled) {
    appendRow_(SHEET_IDS.Enrollments, { id: uid_(), userId: me.id, classId: entry.classId, roleInClass:'STUDENT' });
  }

  // increment uses
  updateRowById_(ADMIN_JOINCODES_SHEET, entry.id, { uses: Number(entry.uses || 0) + 1 });
  return { ok:true, classId: entry.classId, message:'Enrolled with code.' };
}

function makeCode_(len) {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/1/I/O
  let s = '';
  for (let i = 0; i < len; i++) {s += alpha.charAt(Math.floor(Math.random() * alpha.length));}
  return s;
}

/** ========== Google Classroom Import ========== **
 * Requires Advanced Google Services: Classroom API enabled.
 */

// List my ACTIVE Classroom courses (as teacher)
function api_gc_listCourses() {
  requireTeacher_();
  const out = [];
  let pageToken = null;
  do {
    const res = Classroom.Courses.list({
      teacherId: 'me',
      courseStates: ['ACTIVE'],
      pageSize: 50,
      pageToken,
    });
    (res.courses || []).forEach(c => out.push({
      id: c.id,
      name: c.name || '',
      section: c.section || '',
      room: c.room || '',
      description: c.descriptionHeading || '',
      enrollmentCode: c.enrollmentCode || '',
    }));
    pageToken = res.nextPageToken;
  } while (pageToken);
  return { ok:true, courses: out };
}

// Preview roster for a single course (emails + names)
function api_gc_previewCourseRoster(courseId) {
  requireTeacher_();
  if (!courseId) {throw new Error('courseId required.');}
  const students = _gc_listStudents_(courseId);
  const teachers = _gc_listTeachers_(courseId);
  return { ok:true, counts:{ students:students.length, teachers:teachers.length }, students, teachers };
}

// FAST import: batch writes for Users and Enrollments, minimal reads.
function api_gc_importCourse(courseId) {
  requireTeacher_();
  if (!courseId) {throw new Error('courseId required.');}

  // 1) Course
  const course = Classroom.Courses.get(courseId);
  if (!course) {throw new Error(`Course not found: ${courseId}`);}
  _ensureClassroomColumn_();

  // 2) Class row (create or find)
  const classes = readRows_(SHEET_IDS.Classes);
  let cls = classes.find(c => String(c.classroomCourseId || '') === String(courseId));
  if (!cls) {
    const id = uid_();
    appendRow_(SHEET_IDS.Classes, {
      id,
      name: course.name || (`Classroom ${course.id}`),
      type: course.section || 'CLASSROOM',
      classroomCourseId: course.id,
    });
    cls = { id, name: course.name, type: course.section || 'CLASSROOM', classroomCourseId: course.id };
  }

  // 3) Roster (one fetch each)
  const students = _gc_listStudents_(courseId); // {email?, name, googleId?}
  const teachers = _gc_listTeachers_(courseId);

  // 4) Index current users ONCE (by email + googleId)
  const usersNow = readRows_(SHEET_IDS.Users);
  const byEmail = new Map(usersNow.map(u => [String(u.email || '').toLowerCase(), u]));
  const byGid   = new Map(usersNow.map(u => [String(u.googleId || ''), u]));

  // 5) Prepare batched inserts/updates
  const toInsertUsers = [];     // new Users rows
  const toInsertEnroll = [];    // new Enrollments rows
  const maybeElevate = [];      // [{id, role:'TEACHER'}]
  let addedUsers = 0, updatedTeachers = 0, addedEnroll = 0, skippedNoIdentifier = 0;

  // Helper to resolve/create a user (returns {id,...})
  function resolveUser(entry, roleDefault) {
    const email = (entry.email || '').toLowerCase();
    const gid = entry.googleId || '';
    let u = (email && byEmail.get(email)) || (gid && byGid.get(gid));
    if (!u) {
      if (!email && !gid) { skippedNoIdentifier++; return null; }
      const id = uid_();
      const userObj = {
        id,
        email: entry.email || '',               // may be blank if hidden
        displayName: entry.name || '',
        role: roleDefault,                      // 'TEACHER' or 'STUDENT'
        gradeLevel: '',
        googleId: gid || '',
      };
      toInsertUsers.push(userObj);
      u = userObj;
      if (email) {byEmail.set(email, u);}
      if (gid) {byGid.set(gid, u);}
      addedUsers++;
    }
    return u;
  }

  // Teachers (ensure role & enrollment)
  teachers.forEach(t => {
    const u = resolveUser(t, 'TEACHER');
    if (!u) {return;}
    if (u.role !== 'TEACHER' && u.role !== 'ADMIN') {
      maybeElevate.push({ id: u.id, patch: { role: 'TEACHER' } });
      updatedTeachers++;
    }
  });

  // Students (ensure role & enrollment)
  students.forEach(s => {
    const u = resolveUser(s, 'STUDENT');
    if (!u) {return;}
  });

  // 6) Batch-insert Users (one write)
  if (toInsertUsers.length) {appendMany_(SHEET_IDS.Users, toInsertUsers);}

  // 7) Rebuild user maps with DB ids (not strictly necessary since we kept ids)
  const usersAfter = usersNow.concat(toInsertUsers);
  const idByEmail = new Map(usersAfter.map(u => [String(u.email || '').toLowerCase(), u.id]));
  const idByGid   = new Map(usersAfter.map(u => [String(u.googleId || ''), u.id]));

  // 8) Existing enrollments for this class (ONE read)
  const enrollNow = readRows_(SHEET_IDS.Enrollments).filter(e => e.classId === cls.id);
  const enrolledSet = new Set(enrollNow.map(e => e.userId)); // quick lookup

  // 9) Collect enrollments to add for teachers
  teachers.forEach(t => {
    const uid = idByEmail.get((t.email || '').toLowerCase()) || idByGid.get(t.googleId || '');
    if (!uid) {return;}
    if (!enrolledSet.has(uid)) {
      toInsertEnroll.push({ id: uid_(), userId: uid, classId: cls.id, roleInClass: 'TEACHER' });
      enrolledSet.add(uid);
      addedEnroll++;
    }
  });

  // 10) Collect enrollments to add for students
  students.forEach(s => {
    const uid = idByEmail.get((s.email || '').toLowerCase()) || idByGid.get(s.googleId || '');
    if (!uid) {return;}
    if (!enrolledSet.has(uid)) {
      toInsertEnroll.push({ id: uid_(), userId: uid, classId: cls.id, roleInClass: 'STUDENT' });
      enrolledSet.add(uid);
      addedEnroll++;
    }
  });

  // 11) Batch-insert Enrollments (one write)
  if (toInsertEnroll.length) {appendMany_(SHEET_IDS.Enrollments, toInsertEnroll);}

  // 12) Apply role elevations (few writes)
  maybeElevate.forEach(upd => updateRowById_(SHEET_IDS.Users, upd.id, upd.patch));

  const report = {
    courseName: cls.name,
    classId: cls.id,
    teacherCount: teachers.length,
    studentCount: students.length,
    addedUsers,
    updatedTeachers,
    addedEnroll,
    skippedNoIdentifier,
  };

  const msg = `Imported “${report.courseName}”: users+${addedUsers}, enroll+${addedEnroll}${
    skippedNoIdentifier ? `, skipped(no id)=${skippedNoIdentifier}` : ''}`;

  return { ok:true, classId: cls.id, message: msg, report };
}


// Sync by our classId (uses saved classroomCourseId)
function api_gc_syncByClassId(classId) {
  requireTeacher_();
  if (!classId) {throw new Error('classId required.');}
  _ensureClassroomColumn_();
  const cls = readRows_(SHEET_IDS.Classes).find(c => c.id === classId);
  if (!cls || !cls.classroomCourseId) {throw new Error('This class is not linked to Classroom.');}
  return api_gc_importCourse(String(cls.classroomCourseId)); // re-use import logic (idempotent upserts)
}

/* ---------- helpers ---------- */
function _ensureClassroomColumn_(){
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_IDS.Classes);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  if (!headers.includes('classroomCourseId')) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn(), 1, 1).setValues([['classroomCourseId']]);
  }
}

function _gc_listStudents_(courseId){
  const out = [];
  let pageToken = null;
  do {
    const res = Classroom.Courses.Students.list(courseId, { pageSize: 100, pageToken });
    (res.students || []).forEach(s => {
      const p = s.profile || {};
      out.push({ email: p.emailAddress || '', name: (p.name && p.name.fullName) || p.id || '' });
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

function _gc_listTeachers_(courseId){
  const out = [];
  let pageToken = null;
  do {
    const res = Classroom.Courses.Teachers.list(courseId, { pageSize: 50, pageToken });
    (res.teachers || []).forEach(t => {
      const p = t.profile || {};
      out.push({ email: p.emailAddress || '', name: (p.name && p.name.fullName) || p.id || '' });
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}


/** Append many rows in ONE write. Maps object keys to headers; missing fields -> ''. */
function appendMany_(name, objects) {
  if (!objects || !objects.length) {return 0;}
  const sh = sheet_(name);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const rows = objects.map(obj => headers.map(h => (h in obj ? obj[h] : '')));
  const last = Math.max(1, sh.getLastRow());
  sh.insertRowsAfter(last, rows.length);
  sh.getRange(last + 1, 1, rows.length, headers.length).setValues(rows);
  return rows.length;
}

