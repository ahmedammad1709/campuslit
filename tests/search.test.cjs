const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() { const ctx = vm.createContext({ URL }); vm.runInContext(fs.readFileSync('extension/search.js', 'utf8'), ctx); return ctx.BahriaSearch; }
const S = load();
const plain = o => JSON.parse(JSON.stringify(o));
const BASE = 'https://cms.bahria.edu.pk/Sys/Student/Dashboard.aspx';
const cms = [
  ['Profile Information', '', '/Sys/Student/Profile.aspx'], ['Registered Courses', 'Course Registration', '/Sys/Student/CourseRegistration/RegisteredCourses.aspx'],
  ['Register Regular Courses', 'Course Registration', '/Sys/Student/CourseRegistration/RegisterRegularCourses.aspx'], ['View Offered Courses', 'Course Registration', '/Sys/Student/CourseRegistration/OfferedCourses.aspx'],
  ['Time Table', 'Courses', '/Sys/Student/CourseRegistration/TimeTable.aspx'], ['Attendance', 'Courses', '/Sys/Student/ClassAttendance/StudentWiseAttendance.aspx'],
  ['Provisional Result', 'Exams', '/Sys/Student/Exams/ExamResult.aspx'], ['Exam Seating Plan', 'Exams', '/Sys/Student/ExamSeatingPlan/ExamSeats.aspx'],
  ['Extra Teaching Sessions', 'Underperforming Students', '/Sys/Student/ExtraTeachingSessions.aspx'], ['Fee Challans', '', '/Sys/Student/FeeManagement/FeeChallans.aspx'],
  ['Academic Documents', '', '/Sys/Student/StudentInformation/AcademicDocuments.aspx'], ['Forms', '', '/Sys/Student/Forms/Forms.aspx'], ['Go To LMS', '', '/Sys/Common/GoToLMS.aspx'],
  ['Virtual Suggestion Box', '', '/Sys/Common/Feedbacks/Feedbacks.aspx'], ['Thesis Dashboard', '', '/Sys/Student/Pgp/Dashboard.aspx']
].map(([label, group, href]) => ({ label, group, href }));
const index = S.build(cms, BASE);
const top = (q, n = 3) => plain(S.rank(index, q).slice(0, n).map(r => r.item.label));

test('builds the list from menu links, in the menu\'s own order, with plain labels', () => {
  assert.equal(index.length, cms.length);
  assert.equal(index[0].label, 'Profile Information'); assert.equal(index[4].href, 'https://cms.bahria.edu.pk/Sys/Student/CourseRegistration/TimeTable.aspx');
  const messy = S.build([{ label: '  Time\n\tTable  ', group: ' Courses ', href: 'a.aspx' }, { label: 'x'.repeat(300), href: 'b.aspx' }, { label: 'Control\u0007\u0000 chars\u2028here', href: 'c.aspx' }], BASE);
  assert.equal(messy[0].label, 'Time Table'); assert.equal(messy[0].group, 'Courses'); assert.equal(messy[0].href, 'https://cms.bahria.edu.pk/Sys/Student/a.aspx', 'relative links are resolved');
  assert.equal(messy[1].label.length, 80); assert.equal(messy[2].label, 'Control chars here');
});

test('only ordinary pages on this site or bahria.edu.pk are searchable', () => {
  const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'mailto:a@b.c', 'ftp://cms.bahria.edu.pk/x', '#sideMenuList_1', '#', '', '   ', 'https://evil.com/x', '//evil.com/x',
    'https://bahria.edu.pk.evil.com/', 'https://evilbahria.edu.pk/', 'https://cms.bahria.edu.pk@evil.com/', 'https://user:pass@cms.bahria.edu.pk/x', 'https:\\\\evil.com', 'blob:https://cms.bahria.edu.pk/x', 'file:///etc/passwd', undefined, null, 5, {}];
  for (const href of bad) assert.deepEqual(plain(S.build([{ label: 'Trap', href }], BASE)), [], String(href));
  for (const href of ['https://lms.bahria.edu.pk/Student/Dashboard.php', 'http://int.bahria.edu.pk', 'https://bahria.edu.pk/', '/Sys/Student/Profile.aspx', 'Profile.aspx', '../Common/GoToLMS.aspx'])
    assert.equal(S.build([{ label: 'Fine', href }], BASE).length, 1, href);
  assert.equal(S.build([{ label: 'Own site', href: 'dashboard.html' }], 'http://127.0.0.1:4173/preview/lms/x.html').length, 1, 'the page\'s own origin is allowed (the settings preview)');
  assert.equal(S.build([{ label: 'Elsewhere', href: 'https://evil.com' }], 'http://127.0.0.1:4173/preview/lms/x.html').length, 0);
});

test('rubbish in the list is dropped, not trusted', () => {
  for (const bad of [undefined, null, 5, 'x', {}, [null, 5, 'x', {}, { label: '', href: 'a.aspx' }, { label: 'No link' }]]) assert.deepEqual(plain(S.build(bad, BASE)), [], JSON.stringify(bad));
  assert.equal(S.build([{ label: 'https://int.bahria.edu.pk', href: 'https://int.bahria.edu.pk' }], BASE).length, 0, 'a link whose text is just an address is not a page name');
  const dup = S.build([{ label: 'A', href: 'a.aspx' }, { label: 'A again', href: 'a.aspx' }, { label: 'A', href: 'b.aspx' }], BASE);
  assert.equal(dup.length, 2, 'the same address once; the same name for different addresses is kept');
  const many = S.build(Array.from({ length: 5000 }, (_, i) => ({ label: 'Page ' + i, href: 'p' + i + '.aspx' })), BASE);
  assert.equal(many.length, S.MAX_ITEMS);
});

test('typing finds the right page first', () => {
  assert.equal(top('att', 1)[0], 'Attendance'); assert.equal(top('time', 1)[0], 'Time Table');
  assert.equal(top('timetable', 1)[0], 'Time Table', 'one word for two');
  assert.equal(top('table time', 1)[0], 'Time Table', 'word order does not matter');
  assert.equal(top('fee', 1)[0], 'Fee Challans'); assert.equal(top('result', 1)[0], 'Provisional Result');
  assert.equal(top('PROVISIONAL', 1)[0], 'Provisional Result', 'capitals do not matter');
  assert.equal(top('  seating   plan ', 1)[0], 'Exam Seating Plan');
  assert.deepEqual(top('reg', 2).sort(), ['Register Regular Courses', 'Registered Courses'], 'both names start with it');
  assert.equal(top('reg', 1)[0], 'Registered Courses');
  assert.equal(top('dashboard', 1)[0], 'Thesis Dashboard');
});

test('words people actually use find the page', () => {
  assert.equal(top('gpa', 1)[0], 'Provisional Result'); assert.equal(top('marks', 1)[0], 'Provisional Result');
  assert.equal(top('schedule', 1)[0], 'Time Table'); assert.equal(top('challan', 1)[0], 'Fee Challans'); assert.equal(top('payment', 1)[0], 'Fee Challans');
  assert.equal(top('transcript', 1)[0], 'Academic Documents'); assert.equal(top('syllabus', 0).length, 0, 'not a CMS page, so nothing');
  assert.equal(top('mail', 3).length, 0, 'the sample CMS list has no email page');
  const lms = S.build([['Dashboard', 'Dashboard.php'], ['Assignments', 'Assignments.php'], ['Quizzes', 'Quizzes.php'], ['Course Outline', 'CourseOutline.php'], ['Lecture Notes', 'LectureNotes.php'], ['Papers', 'Papers.php'], ['FAQs', 'FAQ.php'], ['Announcements', 'Announcements.php']].map(([label, href]) => ({ label, href })), 'https://lms.bahria.edu.pk/Student/Dashboard.php');
  const first = q => S.rank(lms, q)[0].item.label;
  assert.equal(first('homework'), 'Assignments'); assert.equal(first('syllabus'), 'Course Outline'); assert.equal(first('slides'), 'Lecture Notes'); assert.equal(first('past paper'), 'Papers');
  assert.equal(first('help'), 'FAQs'); assert.equal(first('news'), 'Announcements'); assert.equal(first('test'), 'Quizzes'); assert.equal(first('home'), 'Dashboard');
});

test('a group name finds the pages under it, after pages with the word in their own name', () => {
  assert.deepEqual(top('exams', 2), ['Provisional Result', 'Exam Seating Plan']);
  assert.equal(top('courses time', 1)[0], 'Time Table', 'group word plus page word');
  assert.deepEqual(plain(S.rank(index, 'underperforming').map(r => r.item.label)), ['Extra Teaching Sessions']);
});

test('forgiving of typing mistakes and half-remembered names', () => {
  assert.equal(top('atendance', 1)[0], 'Attendance', 'a missing letter'); assert.equal(top('attendnace', 1)[0], 'Attendance', 'two letters swapped');
  assert.equal(top('provisonal', 1)[0], 'Provisional Result'); assert.equal(top('prvres', 1)[0], 'Provisional Result', 'letters in order');
  assert.deepEqual(top('zzzzzz', 3), [], 'no match gives nothing');
  assert.deepEqual(top('att xyz', 3), [], 'every word must match something');
  assert.equal(S.within1('abc', 'abd'), true); assert.equal(S.within1('abc', 'abcd'), true); assert.equal(S.within1('abc', 'ab'), true); assert.equal(S.within1('abc', 'bac'), true);
  assert.equal(S.within1('abc', 'bca'), false); assert.equal(S.within1('abc', 'xyz'), false); assert.equal(S.within1('abc', 'abcde'), false); assert.equal(S.within1('', 'a'), true);
});

test('empty query lists everything in order; limits and odd queries are safe', () => {
  assert.deepEqual(plain(S.rank(index, '').map(r => r.item.label)), cms.map(c => c.label));
  assert.deepEqual(plain(S.rank(index, '   ').map(r => r.item.label)), cms.map(c => c.label));
  assert.equal(S.rank(index, '', 5).length, 5); assert.equal(S.rank(index, 'a', 2).length, 2);
  for (const q of ['(', '[', '\\', '.*', '(?<=x)', '$^', '<script>alert(1)</script>', '%', '\u0000', '😀', 'x'.repeat(10000), undefined, null, 5, {}, [], 'ﬁ', 'İ', 'Ａｔｔ'])
    assert.doesNotThrow(() => S.rank(index, q), String(q).slice(0, 20));
  assert.equal(S.rank(index, 'Ａｔｔ')[0].item.label, 'Attendance', 'full-width letters are understood');
  for (const list of [undefined, null, 5, 'x', {}]) assert.deepEqual(plain(S.rank(list, 'a')), []);
  assert.equal(S.rank(index, 'att', -1).length > 0, true); assert.equal(S.rank(index, 'att', NaN).length > 0, true);
});

test('equal matches keep the menu\'s order', () => {
  const same = S.build(['Alpha One', 'Alpha Two', 'Alpha Three'].map((label, i) => ({ label, href: 'p' + i + '.aspx' })), BASE);
  assert.deepEqual(plain(S.rank(same, 'alpha').map(r => r.item.label)), ['Alpha One', 'Alpha Two', 'Alpha Three']);
});

test('highlighting: which parts of a name were matched', () => {
  assert.deepEqual(plain(S.marks('Time Table', 'tim')), [[0, 3]]);
  assert.deepEqual(plain(S.marks('Time Table', 'table time')), [[0, 4], [5, 10]]);
  assert.deepEqual(plain(S.marks('Time Table', 'e')), [[3, 4]]);
  assert.deepEqual(plain(S.marks('Time Table', 'zzz')), []); assert.deepEqual(plain(S.marks('Time Table', '')), []);
  assert.deepEqual(plain(S.marks('Attendance', 'att tend')), [[0, 6]], 'overlapping matches merge');
  assert.doesNotThrow(() => S.marks(undefined, undefined));
});

test('fast enough for a long menu', () => {
  const big = S.build(Array.from({ length: 300 }, (_, i) => ({ label: 'Course Page Number ' + i, group: 'Group ' + (i % 9), href: 'p' + i + '.aspx' })), BASE);
  const t = process.hrtime.bigint(); for (let i = 0; i < 200; i++) S.rank(big, 'course pag nmb');
  const ms = Number(process.hrtime.bigint() - t) / 1e6 / 200;
  assert.ok(ms < 5, 'one search took ' + ms.toFixed(2) + ' ms');
});

test('the module touches nothing outside itself', () => {
  const code = fs.readFileSync('extension/search.js', 'utf8');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|document\.|window\.|localStorage|storage\.|chrome\.|browser\.|RegExp\s*\(|eval\s*\(|new Function/);
});
