'use strict';
// The notification engine's pure part: reading the portal pages and noticing what changed. The pages below are invented, written in the portals' own (sloppy) markup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ctx = vm.createContext({});
for (const f of ['deadlines.js', 'attendance.js', 'notify-core.js']) vm.runInContext(fs.readFileSync('extension/' + f, 'utf8'), ctx);
const N = ctx.BahriaNotify;
const plain = o => JSON.parse(JSON.stringify(o));
const pkt = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h - 5, min);
const HOUR = 3600000;

const select = (id, opts) => `<select name="x" id="${id}" class="form-control" onchange="go()"><option value="">Select</option>${opts.map(([v, l, s]) => `<option value="${v}"${s ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
// the portal leaves <td> and <tr> unclosed in places; so does this
const row = cells => `<tr>${cells.map(c => `<td>${c}`).join('')}\n</tr>`;
const assignments = rows => `<table class="table table-hover"><tbody><tr><th>Assign. No.</th><th>Title</th><th>Assignment </br> Remarks</th><th>Added Submission</th><th>Marks Obtained</th><th>Returned</th><th>Action</th><th>Deadline</th></tr>${rows.join('')}</tbody></table>`;
const arow = (no, title, { submitted = false, marks = '', exceeded = false, dl = "<small class='label label-info' title='Actual'>10 November 2026-11:55 pm</small>" } = {}) =>
  row([no + ' ', title + ' ', '<a href="Download.php?k=a"><span></span> Assignment </a>', submitted ? '<a href="Download.php?k=s"> Submission </a>' : '', marks, '---', exceeded ? "<div style='background:red'>Deadline Exceeded</div>" : '<a href="#">Submit</a>', dl]);
const quizzes = rows => `<table class="table"><tbody><tr><th>Quiz No.</th><th>Quiz Title</th><th>Quiz</th><th>Quiz Marks</th><th>Quiz Solution</th></tr>${rows.join('')}</tbody></table>`;
const lectures = rows => `<table class="table"><tbody><tr><th width="5%">Week #</th><th>Lecture Title</th><th>Lecture File(s)</th><th>Video Link(s)</th><th>Other</th><th>Remarks</th></tr>${rows.join('')}</tbody></table>`;

test('reads the semester and course lists, and the side-menu links', () => {
  const html = select('semesterId', [['MjAyNjM=', 'Fall-2026', true], ['MjAyNjI=', 'Spring-2026']]) + select('courseId', [['MTUyMjAw', 'Data Structures'], ['MTUyMjAx', 'Operating Systems']]);
  assert.deepEqual(plain(N.parseCourses(html)), { semesters: [{ value: 'MjAyNjM=', label: 'Fall-2026', selected: true }, { value: 'MjAyNjI=', label: 'Spring-2026', selected: false }], courses: [{ value: 'MTUyMjAw', label: 'Data Structures', selected: false }, { value: 'MTUyMjAx', label: 'Operating Systems', selected: false }] });
  assert.deepEqual(plain(N.parseCourses('<p>no selects</p>')), { semesters: [], courses: [] });
  assert.deepEqual(plain(N.navLinks('<a href="Assignments.php"><i></i><span>Assignments</span></a><a href="#">x</a><a href="Quizzes.php"> Quizzes </a>')), [{ href: 'Assignments.php', text: 'Assignments' }, { href: 'Quizzes.php', text: 'Quizzes' }]);
});

test('reads an assignments table: title, marks, whether it was submitted, and the deadline that counts', () => {
  const html = assignments([
    arow('1', 'CLO 1', { submitted: true, marks: '5.000', exceeded: true, dl: "<small class='label label-warning' title='Extended '>29 September 2026 - 11:55 pm</small><br/><small class='label label-info' title='Actual'>27 September 2026-11:55 pm</small>" }),
    arow('2', 'Trees and Graphs'),
  ]);
  const list = plain(N.parseAssignments(html));
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { no: '1', title: 'CLO 1', marks: 5, submitted: true, closed: true, deadline: pkt(2026, 9, 29, 23, 55) });
  assert.deepEqual(list[1], { no: '2', title: 'Trees and Graphs', marks: null, submitted: false, closed: false, deadline: pkt(2026, 11, 10, 23, 55) });
  assert.equal(N.parseAssignments('<p>nothing</p>'), null);
});

test('reads quizzes and lecture notes', () => {
  assert.deepEqual(plain(N.parseQuizzes(quizzes([row(['1', ' Quiz on loops', '<a href="d">file</a>', '3.000', '<a href="s">sol</a>']), row(['2', ' Quiz on trees', '<a href="d">file</a>', '', ''])]))), [{ no: '1', title: 'Quiz on loops', marks: 3 }, { no: '2', title: 'Quiz on trees', marks: null }]);
  assert.deepEqual(plain(N.parseLectures(lectures([row(['1 ', 'Introduction ', '<small>1.</small> <a href="Download.php?k=x"> Download Lecture </a><br/>', '', '', '']), row(['2 ', 'Sorting ', '', '', '', ''])]))), [{ no: '1', title: 'Introduction', files: 1 }, { no: '2', title: 'Sorting', files: 0 }]);
  assert.equal(N.parseQuizzes('<table><tr><th>Other</th></tr></table>'), null);
});

test('reads the attendance hours from the CMS dashboard script and tells a sign-in page from a signed-in one', () => {
  const script = '<script>renderAttendanceSummaryChart([{"code":"CS 101","title":"Data Structures","present":18.0,"absent":3.0,"total":21.0,"percentage":"85.7"},{"code":"bad"}]);</script>';
  assert.deepEqual(plain(N.parseAttendance(script)), { 'CS 101': { code: 'CS 101', title: 'Data Structures', present: 18, absent: 3, total: 21, pct: 85.7 } });
  assert.equal(N.parseAttendance('<p>none</p>'), null);
  assert.equal(N.signedIn('cms', script, 'https://cms.bahria.edu.pk/Sys/Student/Dashboard.aspx'), true);
  assert.equal(N.signedIn('cms', '<input type="password">', 'https://cms.bahria.edu.pk/Logins/Student/Login.aspx'), false);
  assert.equal(N.signedIn('lms', select('semesterId', [['a', 'b']]), 'https://lms.bahria.edu.pk/Student/Assignments.php'), true);
  assert.equal(N.signedIn('lms', '<form><input type="password"></form>', 'https://lms.bahria.edu.pk/index.php'), false);
  assert.equal(N.signedIn('lms', '', 'x'), false);
});

const course = { oc: 'c1', name: 'Data Structures' };
test('the first look at a course only remembers it, nothing is announced', () => {
  const a = plain(N.parseAssignments(assignments([arow('1', 'A')])));
  assert.deepEqual(plain(N.diffAssignments(course, undefined, a)), []);
  assert.deepEqual(plain(N.diffQuizzes(course, undefined, [{ no: '1', title: 'q', marks: 2 }])), []);
  assert.deepEqual(plain(N.diffLectures(course, undefined, [{ no: '1', title: 'l', files: 1 }])), []);
  assert.deepEqual(plain(N.diffAttendance(undefined, { X: { present: 1, absent: 0, total: 1, pct: 100 } })), []);
});

test('a new assignment, new marks and an extended deadline are announced once', () => {
  const before = plain(N.parseAssignments(assignments([arow('1', 'Loops', { submitted: true })])));
  const after = plain(N.parseAssignments(assignments([arow('1', 'Loops', { submitted: true, marks: '4.500' }), arow('2', 'Trees')])));
  const ev = N.diffAssignments(course, before, after);
  assert.equal(ev.length, 2);
  assert.match(ev[0].title + ev[0].body, /Assignment marks uploaded.*Data Structures.*4\.5/);
  assert.match(ev[1].title + ev[1].body, /New assignment.*Data Structures.*Trees.*due 10 Nov, 11:55 pm/);
  assert.deepEqual(plain(N.diffAssignments(course, after, after)), []);
  const longer = after.map(a => a.no === '2' ? { ...a, deadline: a.deadline + 86400000 } : a);
  assert.match(N.diffAssignments(course, after, longer)[0].title, /Deadline extended/);
});

test('quiz marks appear once, a new unmarked quiz is announced as new', () => {
  const before = [{ no: '1', title: 'Loops', marks: null }];
  const after = [{ no: '1', title: 'Loops', marks: 3 }, { no: '2', title: 'Trees', marks: null }];
  const ev = N.diffQuizzes(course, before, after);
  assert.equal(ev.length, 2);
  assert.match(ev[0].title + ev[0].body, /Quiz marks uploaded.*Quiz 1.*3/);
  assert.match(ev[1].title, /New quiz posted/);
  assert.deepEqual(plain(N.diffQuizzes(course, after, after)), []);
});

test('a new lecture note, or a new file on an old one, is announced', () => {
  const before = [{ no: '1', title: 'Intro', files: 1 }];
  const ev = N.diffLectures(course, before, [{ no: '1', title: 'Intro', files: 2 }, { no: '2', title: 'Sorting', files: 1 }]);
  assert.equal(ev.length, 2);
  assert.match(ev[0].title, /New lecture file/); assert.match(ev[1].title + ev[1].body, /New lecture note.*Week 2: Sorting/);
});

test('attendance: absent and present are told apart, and a risky percentage is flagged', () => {
  const before = { A: { code: 'A', title: 'Data Structures', present: 18, absent: 3, total: 21, pct: 85.7 }, B: { code: 'B', title: 'Networks', present: 10, absent: 4, total: 21, pct: 71.4 } };
  const after = { A: { code: 'A', title: 'Data Structures', present: 19.5, absent: 3, total: 24, pct: 81 }, B: { code: 'B', title: 'Networks', present: 10, absent: 6, total: 24, pct: 70 }, C: { code: 'C', title: 'New', present: 1, absent: 0, total: 1, pct: 100 } };
  const ev = N.diffAttendance(before, after);
  assert.equal(ev.length, 2);
  assert.match(ev[0].title + ev[0].body, /Present marked.*Data Structures.*Marked present for 1\.5 hrs/);
  assert.match(ev[1].title + ev[1].body, /Absent marked.*Networks.*Marked absent for 2 hrs.*At or below 75%/);
  assert.deepEqual(plain(N.diffAttendance(after, after)), []);
});

test('deadline reminders: 2 days, 24 hours, 7 hours, each once, each only if chosen', () => {
  const deadline = pkt(2026, 11, 10, 23, 55);
  const open = [{ oc: 'c1', course: 'Data Structures', key: '2|Trees', title: 'Trees', deadline, submitted: false }];
  const all = { due2d: true, due24h: true, due7h: true };
  const sent = {};
  const run = (hoursLeft, prefs) => { const r = N.dueReminders(open, deadline - hoursLeft * HOUR, prefs, sent); r.mark.forEach(id => { sent[id] = 1; }); return r.events; };
  assert.equal(run(60, all).length, 0, 'more than 2 days away: nothing yet');
  const e1 = run(47, all); assert.equal(e1.length, 1); assert.match(e1[0].title, /2 days.*Data Structures/); assert.match(e1[0].body, /10 Nov, 11:55 pm/);
  assert.equal(run(46, all).length, 0, 'not twice');
  const e2 = run(23.5, all); assert.equal(e2.length, 1); assert.match(e2[0].title, /24 hours|about 2[34] hours/);
  const e3 = run(6.5, all); assert.equal(e3.length, 1); assert.match(e3[0].title, /about [67] hours/);
  assert.equal(run(6, all).length, 0);
  assert.equal(run(1, all).length, 0, 'the 7 hour reminder was the last one');
  // only the 7 hour box ticked: nothing at 2 days or 24 hours
  const only7 = { due2d: false, due24h: false, due7h: true }, s2 = {};
  const go = h => { const r = N.dueReminders(open, deadline - h * HOUR, only7, s2); r.mark.forEach(id => { s2[id] = 1; }); return r.events; };
  assert.equal(go(40).length, 0); assert.equal(go(20).length, 0); assert.equal(go(6).length, 1);
  // first seen late: one reminder for where it is now, not three
  const s3 = {}, late = N.dueReminders(open, deadline - 5 * HOUR, all, s3);
  assert.equal(late.events.length, 1); assert.equal(late.mark.length, 3);
  // submitted and past deadlines are never announced
  assert.equal(N.dueReminders([{ ...open[0], submitted: true }], deadline - 5 * HOUR, all, {}).events.length, 0);
  assert.equal(N.dueReminders(open, deadline + 1, all, {}).events.length, 0);
  assert.equal(N.dueReminders(undefined, deadline, all, {}).events.length, 0);
});
