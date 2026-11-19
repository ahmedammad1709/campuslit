const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');
const load = (...files) => {
  const ctx = vm.createContext({ Object, Array, String, Number, Math, JSON, Date, Map, Set, Error, Promise, Uint8Array, DataView, TextEncoder, TextDecoder, URL, console });
  ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
};
const plain = x => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------------------------------------------------------------------
// 1. Deadlines -> calendar file
// ---------------------------------------------------------------------------------------------------------------------------------
const CAL = load('calendar.js').BahriaCalendar;
const NOW = Date.UTC(2026, 10, 18, 10, 0), HOUR = 3600000, DAY = 86400000;
const lines = text => text.split('\r\n');

test('deadlines: a valid calendar file with one event per open deadline, ending at the deadline, with two reminders', () => {
  const due = Date.UTC(2026, 10, 28, 18, 55);   // 11:55 pm in Pakistan
  const r = CAL.buildDeadlines([{ title: 'CLO 4', due, course: 'Computer Networks' }], { now: NOW, course: 'Computer Networks' });
  assert.equal(r.ok, true); assert.equal(r.count, 1);
  const l = lines(r.text);
  assert.equal(l[0], 'BEGIN:VCALENDAR'); assert.equal(l[l.length - 2], 'END:VCALENDAR'); assert.equal(l[l.length - 1], '', 'ends with CRLF');
  assert.ok(l.includes('DTSTART;TZID=Asia/Karachi:20261128T232500') && l.includes('DTEND;TZID=Asia/Karachi:20261128T235500'), 'the event ends at 11:55 pm Pakistan time');
  assert.ok(l.includes('SUMMARY:Due: CLO 4'));
  assert.deepEqual(l.filter(x => x.startsWith('TRIGGER')), ['TRIGGER;RELATED=END:-PT1440M', 'TRIGGER;RELATED=END:-PT180M'], 'one day and three hours before');
  for (const line of l) assert.ok(Buffer.byteLength(line) <= 75, 'folded: ' + line.length);
  assert.equal(l.filter(x => x === 'BEGIN:VEVENT').length, l.filter(x => x === 'END:VEVENT').length);
});

test('deadlines: past, unreadable and absurd dates are left out, and nothing at all is an honest error, not an empty file', () => {
  const ok = { title: 'Open', due: NOW + 3 * DAY };
  const r = CAL.buildDeadlines([ok, { title: 'Past', due: NOW - HOUR }, { title: 'Now', due: NOW }, { title: 'NaN', due: NaN }, { title: 'Str', due: '2026-12-01' }, { title: 'Inf', due: Infinity }, { title: 'Far', due: Date.UTC(2101, 0, 1) }, null, 5, 'x', {}], { now: NOW });
  assert.equal(r.ok, true); assert.equal(r.count, 1); assert.ok(r.text.includes('Due: Open') && !r.text.includes('Past'));
  for (const items of [[], null, undefined, [{ title: 'Past', due: NOW - 1 }], 'nope', {}]) { const e = CAL.buildDeadlines(items, { now: NOW }); assert.equal(e.ok, false); assert.match(e.error, /nothing open/i); }
});

test('deadlines: a title can never break out of its event (line breaks, separators, escapes, huge, unicode)', () => {
  const evil = 'Evil\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected; with, separators \\ and \u0000 control   chars';
  const r = CAL.buildDeadlines([{ title: evil, due: NOW + DAY, course: 'Course\r\nX-INJECTED:1' }, { title: 'x'.repeat(5000), due: NOW + 2 * DAY }, { title: 'Café اردو 🌙 '.repeat(30), due: NOW + 3 * DAY }], { now: NOW, course: 'C\r\nBAD:1' });
  assert.equal(r.ok, true); assert.equal(r.count, 3);
  const l = lines(r.text);
  assert.equal(l.filter(x => x === 'BEGIN:VEVENT').length, 3, 'still exactly three events');
  assert.ok(!l.some(x => /^(X-INJECTED|BAD|SUMMARY:Injected)/.test(x)), 'nothing injected as its own line');
  for (const line of l) { assert.ok(Buffer.byteLength(line) <= 75, 'folded at 75 bytes'); assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(line), 'no control characters'); }
  const long = l.find(x => x.startsWith('SUMMARY:Due: xxx')); assert.ok(long && long.length < 100, 'a huge title is cut');
  assert.ok(!/\ud83c(?![\udc00-\udfff])/.test(r.text), 'no half an emoji');
});

test('deadlines: importing again updates instead of duplicating (stable ids), and same-titled assignments stay separate', () => {
  const a = CAL.buildDeadlines([{ title: 'CLO 1', due: NOW + 2 * DAY, course: 'CN' }], { now: NOW }), b = CAL.buildDeadlines([{ title: 'CLO 1', due: NOW + 5 * DAY, course: 'CN' }], { now: NOW + HOUR });
  const uid = t => lines(t).find(x => x.startsWith('UID:'));
  assert.equal(uid(a.text), uid(b.text), 'the same assignment keeps its id when the deadline is extended');
  const other = CAL.buildDeadlines([{ title: 'CLO 1', due: NOW + 2 * DAY, course: 'OS' }], { now: NOW }); assert.notEqual(uid(a.text), uid(other.text), 'another course gets another id');
  const twins = CAL.buildDeadlines([{ title: 'Quiz', due: NOW + DAY, course: 'CN' }, { title: 'Quiz', due: NOW + 2 * DAY, course: 'CN' }], { now: NOW });
  const uids = lines(twins.text).filter(x => x.startsWith('UID:')); assert.equal(uids.length, 2); assert.notEqual(uids[0], uids[1]);
});

test('deadlines: a hundred at most, custom reminders are checked, and the file name is safe', () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ title: 'T' + i, due: NOW + (i + 1) * HOUR, course: 'C' }));
  assert.equal(CAL.buildDeadlines(many, { now: NOW }).count, 100);
  const custom = CAL.buildDeadlines([{ title: 'x', due: NOW + DAY }], { now: NOW, alarms: [60, -5, 0, NaN, 'x', 99999999, 30] });
  assert.deepEqual(lines(custom.text).filter(x => x.startsWith('TRIGGER')), ['TRIGGER;RELATED=END:-PT60M', 'TRIGGER;RELATED=END:-PT30M']);
  assert.equal(CAL.buildDeadlines([{ title: 'x', due: NOW + DAY }], { now: NOW, alarms: [] }).text.includes('VALARM'), false, 'no reminders when none are asked for');
  assert.equal(CAL.deadlineFileName('Computer Networks & Labs'), 'campuslit-deadlines-Computer-Networks-Labs.ics');
  assert.equal(CAL.deadlineFileName('../../evil\\name:?*'), 'campuslit-deadlines-evil-name.ics'); assert.equal(CAL.deadlineFileName(''), 'campuslit-deadlines.ics'); assert.equal(CAL.deadlineFileName(null), 'campuslit-deadlines.ics');
  assert.ok(CAL.deadlineFileName('x'.repeat(500)).length < 60);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// 2. Next class
// ---------------------------------------------------------------------------------------------------------------------------------
const NC = load('nextclass.js').BahriaNextClass;
const MIN = 60000;
const pkt = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) - 5 * HOUR;       // a Pakistan wall-clock time as an epoch
const dayOf = ms => new Date(ms + 5 * HOUR).getUTCDay();
const cls = (day, from, to, title, extra) => ({ day, start: from * 60, end: to * 60, title, ...extra });
const MON = pkt(2026, 11, 16, 0, 0);   // a Monday
const note = (events, savedAt) => ({ v: 1, semester: 'Fall-2026', savedAt: savedAt === undefined ? MON - 2 * DAY : savedAt, events, hint: false });
const WEEK = [cls(1, 9, 10.5, 'Networks', { room: 'B-12', building: 'Block B' }), cls(1, 11, 12.5, 'Operating Systems Lab', { lab: true, room: 'L2' }), cls(3, 9, 10.5, 'Networks')];

test('next class: the sample dates are what the tests think they are', () => { assert.equal(dayOf(MON), 1); assert.equal(dayOf(MON + DAY), 2); });

test('next class: before, during and between classes', () => {
  let n = NC.next(note(WEEK), MON + 8 * HOUR);   // Monday 8:00
  assert.equal(n.event.title, 'Networks'); assert.equal(n.live, false); assert.equal(n.offset, 0); assert.equal(n.following.event.title, 'Operating Systems Lab'); assert.equal(n.leftToday, 2);
  let d = NC.describe(n, MON + 8 * HOUR); assert.deepEqual(plain({ b: d.badge, w: d.when, t: d.time, s: d.state, p: d.following }), { b: 'Next', w: 'Starts in 1 hr', t: '9:00 – 10:30 am', s: 'later', p: { title: 'Operating Systems Lab (Lab)', at: '11:00 am' } });
  n = NC.next(note(WEEK), MON + 9 * HOUR + 30 * MIN);   // 9:30, in class
  d = NC.describe(n, MON + 9 * HOUR + 30 * MIN); assert.equal(n.live, true); assert.equal(d.badge, 'Now'); assert.equal(d.when, 'Ends in 1 hr'); assert.equal(d.state, 'live');
  n = NC.next(note(WEEK), MON + 10 * HOUR + 45 * MIN);   // the gap before the lab
  d = NC.describe(n, MON + 10 * HOUR + 45 * MIN); assert.equal(n.event.title, 'Operating Systems Lab'); assert.equal(d.state, 'soon'); assert.equal(d.when, 'Starts in 15 min'); assert.equal(d.where, 'L2');
  n = NC.next(note(WEEK), MON + 12 * HOUR + 29 * MIN);   // the last class, almost over
  assert.equal(n.live, true); assert.equal(NC.describe(n, MON + 12 * HOUR + 29 * MIN).when, 'Ends in 1 min'); assert.equal(n.leftToday, 1); assert.equal(n.following, null);
});

test('next class: after the last class it looks to later days, and across the weekend', () => {
  let t = MON + 12 * HOUR + 30 * MIN;   // exactly when the lab ends: it is over
  let n = NC.next(note(WEEK), t), d = NC.describe(n, t);
  assert.equal(n.event.title, 'Networks'); assert.equal(n.offset, 2); assert.equal(d.badge, 'Wednesday'); assert.equal(d.when, 'Wednesday at 9:00 am');
  t = MON + DAY + 20 * HOUR; n = NC.next(note(WEEK), t); d = NC.describe(n, t);   // Tuesday evening: Wednesday is tomorrow
  assert.equal(d.badge, 'Tomorrow'); assert.equal(d.when, 'Starts at 9:00 am');
  t = MON + 3 * DAY + 11 * HOUR; n = NC.next(note(WEEK), t); d = NC.describe(n, t);   // Wednesday after class: Monday of next week
  assert.equal(n.event.title, 'Networks'); assert.equal(dayOf(n.startMs), 1); assert.equal(d.badge, 'Monday');
  t = MON + 5 * DAY + 15 * HOUR; n = NC.next(note(WEEK), t); assert.equal(dayOf(n.startMs), 1, 'Saturday afternoon: Monday');
  const lone = note([cls(1, 9, 10, 'Only class')]);
  t = MON + 11 * HOUR; n = NC.next(lone, t); assert.equal(n.offset, 7, 'the same weekday next week'); assert.equal(NC.describe(n, t).badge, 'Monday');
  const sunday = note([cls(0, 14, 15, 'Sunday class')]); n = NC.next(sunday, MON + 8 * HOUR); assert.equal(dayOf(n.startMs), 0);
});

test('next class: overlapping classes, back-to-back classes and the clock zone of the device', () => {
  const clash = note([cls(1, 9, 11, 'Long'), cls(1, 9, 10, 'Short'), cls(1, 12, 13, 'Later')]);
  let n = NC.next(clash, MON + 9 * HOUR + 15 * MIN); assert.equal(n.event.title, 'Short', 'of two live classes the one that ends first');
  n = NC.next(note([cls(1, 9, 10, 'A'), cls(1, 10, 11, 'B')]), MON + 9 * HOUR + 59 * MIN); assert.equal(n.following.event.title, 'B', 'back to back');
  const file = path.join(__dirname, '..', 'extension', 'nextclass.js');
  const answers = ['UTC', 'Pacific/Honolulu', 'Asia/Kolkata', 'Pacific/Kiritimati'].map(zone => {
    const code = "const vm = require('node:vm'), fs = require('node:fs'); const c = vm.createContext({ Object, Array, String, Number, Math, JSON, Date, Map, Set, Error, Promise, console }); c.globalThis = c; vm.runInContext(fs.readFileSync(process.argv[1], 'utf8'), c); const n = c.BahriaNextClass.next({ v: 1, savedAt: " + (MON - DAY) + ", events: [{ day: 1, start: 540, end: 630, title: 'Zone test' }] }, " + (MON + 8 * HOUR) + "); console.log(n.offset + ':' + (n.startMs - " + MON + "));";
    return require('node:child_process').execFileSync(process.execPath, ['-e', code, file], { env: { ...process.env, TZ: zone } }).toString().trim();
  });
  assert.deepEqual(answers, Array(4).fill('0:' + 9 * HOUR), 'the answer does not depend on the device time zone: ' + answers);
});

test('next class: notes that cannot be trusted are not used, and nothing crashes', () => {
  assert.equal(NC.next(null, MON), null); assert.equal(NC.next(note([]), MON), null); assert.equal(NC.next('x', MON), null); assert.equal(NC.next(note(WEEK), NaN), null);
  assert.equal(NC.next(note(WEEK, 0), MON), null, 'no save date');
  assert.equal(NC.next(note(WEEK, MON - 151 * DAY), MON), null, 'a time table from last semester');
  assert.notEqual(NC.next(note(WEEK, MON - 149 * DAY), MON), null);
  assert.equal(NC.next(note(WEEK, MON + 3 * DAY), MON), null, 'saved in the future: the clock is wrong somewhere');
  const messy = NC.sanitize({ savedAt: MON, hint: 'yes', semester: 'S'.repeat(500), events: [null, 5, 'x', [], { day: 7, start: 0, end: 60, title: 'bad day' }, { day: 1, start: 600, end: 600, title: 'zero' }, { day: 1, start: -5, end: 60, title: 'neg' }, { day: 1, start: 0, end: 1441, title: 'long' },
    { day: 1, start: 540, end: 600 }, { day: 1, start: 540, end: 600, title: 'Good\u0000‮Title', room: 'R'.repeat(99) }, { day: 1, start: 540, end: 600, title: 'Good\u0000‮Title' }, { day: 1.5, start: 1, end: 2, title: 'frac' }, { day: 2, start: '9', end: 10, title: 'str' }] });
  assert.equal(messy.hint, false, 'only a real true hides the suggestion'); assert.equal(messy.semester.length, 40);
  assert.equal(messy.events.length, 1, JSON.stringify(plain(messy.events))); assert.ok(!/[\u0000-\u001f]/.test(messy.events[0].title)); assert.equal(messy.events[0].room.length, 30);
  assert.equal(NC.sanitize({ events: Array.from({ length: 500 }, (_, i) => ({ day: 1, start: i, end: i + 1, title: 'c' + i })), savedAt: MON }).events.length, 80, 'at most 80 classes');
  assert.equal(NC.fromSchedule({ semester: 'F', events: [] }, MON), null); assert.equal(NC.fromSchedule(null, MON), null);
  const made = NC.fromSchedule({ semester: 'Fall', events: [{ day: 1, start: 540, end: 600, title: 'X', short: 'x', teacher: 'secret teacher', klass: 'BSE-5B', lab: false }] }, MON, { hint: true });
  assert.deepEqual(Object.keys(made.events[0]).sort(), ['building', 'day', 'end', 'lab', 'room', 'start', 'title'], 'only the fields needed are kept (no teacher, no class)'); assert.equal(made.hint, true, 'a dismissed suggestion stays dismissed');
});

test('next class: the words are plain and right at the edges', () => {
  const w = NC.wait; assert.equal(w(0), 'less than a minute'); assert.equal(w(59000), 'less than a minute'); assert.equal(w(60000), '1 min'); assert.equal(w(61000), '2 min'); assert.equal(w(59 * MIN), '59 min'); assert.equal(w(60 * MIN), '1 hr'); assert.equal(w(61 * MIN), '1 hr 1 min'); assert.equal(w(2 * HOUR + 59 * MIN + 40000), '3 hrs'); assert.equal(w(25 * HOUR), '1 day'); assert.equal(w(3 * DAY + 5 * HOUR), '3 days'); assert.equal(w(-5), 'less than a minute');
  assert.deepEqual([NC.clock(0), NC.clock(60), NC.clock(12 * 60), NC.clock(13 * 60 + 5), NC.clock(23 * 60 + 59)], ['12:00 am', '1:00 am', '12:00 pm', '1:05 pm', '11:59 pm']);
  assert.equal(NC.range({ start: 540, end: 630 }), '9:00 – 10:30 am'); assert.equal(NC.range({ start: 690, end: 780 }), '11:30 am – 1:00 pm');
  assert.equal(NC.savedAgo(note(WEEK, MON - 3 * DAY), MON), 0); assert.equal(NC.savedAgo(note(WEEK, MON - 12 * DAY), MON), 12);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// 3. Download all: the zip writer
// ---------------------------------------------------------------------------------------------------------------------------------
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const ZW_CTX = (() => { const c = load('zip.js', 'zipwrite.js'); return c; })();
const ZW = ZW_CTX.BahriaZipWrite, ZR = ZW_CTX.BahriaZip;
const readBlob = async blob => new Uint8Array(await blob.arrayBuffer());
function rnd(n, seed = 7) { const b = new Uint8Array(n); let s = seed; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; b[i] = s >> 16; } return b; }
const ctxCompression = () => { const c = vm.createContext({ Object, Array, String, Number, Math, JSON, Date, Map, Set, Error, Promise, Uint8Array, DataView, TextEncoder, TextDecoder, Blob, Response, CompressionStream, DecompressionStream, console }); c.globalThis = c; for (const f of ['zip.js', 'zipwrite.js']) vm.runInContext(read(f), c, { filename: f }); return c; };

test('zip writer: files come back exactly, through our reader and through an independent one', async () => {
  const c = ctxCompression(), W = c.BahriaZipWrite, R = c.BahriaZip;
  const files = [['Week 1 - Intro.pdf', new TextEncoder().encode('%PDF-1.4 hello '.repeat(500))], ['Slides.pptx', rnd(5000)], ['notes.txt', new TextEncoder().encode('a')], ['empty.docx', new Uint8Array(0)], ['Caf\u00e9 \u0627\u0631\u062f\u0648 \u2603.txt', new TextEncoder().encode('unicode name')], ['big.csv', new TextEncoder().encode('1,2,3\n'.repeat(60000))]];
  const w = W.writer({ now: new Date(2026, 10, 18, 9, 30, 10) });
  for (const [name, data] of files) await w.add(name, data);
  assert.equal(w.count, files.length);
  const blob = w.finish(); assert.equal(blob.type, 'application/zip');
  const bytes = await readBlob(blob), zip = R.open(bytes);
  assert.equal([...zip.entries.keys()].length, files.length);
  for (const [name, data] of files) { const got = await zip.read(name); assert.deepEqual([...got.slice(0, 50)], [...data.slice(0, 50)], name); assert.equal(got.length, data.length, name); }
  // an independent reader, plus the archive's own check values
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'lib', 'zip.mjs')).href);
  const other = mod.readZip(Buffer.from(bytes));
  for (const [name, data] of files) assert.ok(other.get(name) && Buffer.from(data).equals(other.get(name)), 'independent reader: ' + name);
  if (typeof zlib.crc32 === 'function') for (const [name, data] of files) assert.equal(W.crc32(data), zlib.crc32(Buffer.from(data)), 'crc32 of ' + name);
  assert.equal(R.open(bytes).entries.get('Slides.pptx').method, 0, 'an Office file is stored, not compressed again');
  assert.equal(R.open(bytes).entries.get('big.csv').method, 8, 'text is compressed'); assert.ok(R.open(bytes).entries.get('big.csv').comp < 20000, 'and really smaller');
  assert.equal(R.open(bytes).entries.get('notes.txt').method, 0, 'a tiny file is stored');
});

test('zip writer: an empty archive is still a valid archive, and bad input is refused', async () => {
  const c = ctxCompression(), W = c.BahriaZipWrite, R = c.BahriaZip;
  const empty = await readBlob(W.writer().finish()); assert.equal(R.open(empty).entries.size, 0);
  const w = W.writer();
  for (const bad of ['text', null, undefined, [1, 2, 3], 5, {}, new ArrayBuffer(4)]) await assert.rejects(() => w.add('x', bad), /must be bytes/);
  const many = W.writer(); for (let i = 0; i < 500; i++) await many.add('f' + i + '.txt', new Uint8Array([i & 255]));
  await assert.rejects(() => many.add('one-too-many.txt', new Uint8Array(1)), /Too many files/);
});

test('zip writer: names are safe on every system and never collide', () => {
  const S = ZW.safeName;
  assert.equal(S('Week 1/Intro\\notes.pdf'), 'Week 1-Intro-notes.pdf'); assert.equal(S('..\\..\\evil.txt'), 'evil.txt'); assert.equal(S('/etc/passwd'), 'etc-passwd'); assert.equal(S('C:\\x\\y.docx'), 'C-x-y.docx');
  assert.equal(S('a:b*c?d"e<f>g|h.txt'), 'a-b-c-d-e-f-g-h.txt'); assert.equal(S('  .hidden file.pdf  '), 'hidden file.pdf'); assert.equal(S('name...'), 'name'); assert.equal(S('tab\tand\nnewline\u0000.txt'), 'tab and newline .txt');
  for (const reserved of ['CON', 'con.txt', 'NUL', 'Com1.pdf', 'lpt9']) assert.match(S(reserved), /^_/, reserved);
  assert.equal(S(''), 'file'); assert.equal(S(null), 'file'); assert.equal(S('...'), 'file'); assert.equal(S('', 'Lecture'), 'Lecture'); assert.equal(S('   '), 'file');
  const long = S('x'.repeat(300) + '.pptx'); assert.ok(long.length <= 120 && long.endsWith('.pptx'), 'a long name keeps its extension: ' + long.length);
  assert.ok(!/\ud83c(?![\udc00-\udfff])/.test(S('a'.repeat(119) + '\ud83c\udf19.txt'.repeat(1))), 'no half an emoji');
  const taken = new Set();
  assert.deepEqual([ZW.unique(taken, 'a.pdf'), ZW.unique(taken, 'a.pdf'), ZW.unique(taken, 'A.PDF'), ZW.unique(taken, 'b'), ZW.unique(taken, 'b')], ['a.pdf', 'a (2).pdf', 'A (3).PDF', 'b', 'b (2)'], 'case-insensitive, extension kept');
});

// ---------------------------------------------------------------------------------------------------------------------------------
// 4. Marks overview
// ---------------------------------------------------------------------------------------------------------------------------------
const MK_CTX = load('deadlines.js', 'notify-core.js', 'marks.js'), MK = MK_CTX.BahriaMarks, NOTIFY = MK_CTX.BahriaNotify;
const SEM = 'ASsmD3Y0tdm2xWA_Y8o9577mxbWAFkEclwXiY9zsTg0-q3NSC6cMQZkmAQqS9Jv832otz96Zj9xejKKevo0Goro', CRS = 'AVJYg2clPR6mglvez4UhF_9uM93OKxJ4Vie88o7iBwmlLemyb6AJeHqdkJ1tq06lNiiAPFKFOLjTMX9ndcf3zJ8';

test('marks overview: only the LMS’s own two pages, with only the two values the portal uses, may ever be fetched', () => {
  const base = 'https://lms.bahria.edu.pk/Student/Quizzes.php?s=x&oc=y';
  assert.equal(MK.pageUrl('quiz', SEM, CRS, base), 'https://lms.bahria.edu.pk/Student/Quizzes.php?s=' + SEM + '&oc=' + CRS);
  assert.equal(MK.pageUrl('assignment', SEM, CRS, base), 'https://lms.bahria.edu.pk/Student/Assignments.php?s=' + SEM + '&oc=' + CRS);
  for (const bad of [['lecture', SEM, CRS], ['', SEM, CRS], [undefined, SEM, CRS], ['quiz', '', CRS], ['quiz', SEM, ''], ['quiz', 'short', CRS], ['quiz', SEM + '&evil=1', CRS], ['quiz', SEM + '#x', CRS], ['quiz', SEM, CRS + '/../../x'], ['quiz', SEM, 'a b c d e f g h'], ['quiz', 'x'.repeat(900), CRS], ['quiz', null, CRS], ['quiz', 5, CRS], ['quiz', SEM, '<script>alert(1)</script>']])
    assert.equal(MK.pageUrl(bad[0], bad[1], bad[2], base), null, JSON.stringify(bad));
  for (const wrongBase of ['https://cms.bahria.edu.pk/Student/Quizzes.php', 'https://evil.example/Student/Quizzes.php', 'https://lms.bahria.edu.pk.evil.example/Student/Quizzes.php', 'not a url', '', 'javascript:alert(1)'])
    assert.equal(MK.pageUrl('quiz', SEM, CRS, wrongBase), null, wrongBase);
});

test('marks overview: totals and averages count only what is marked, and nothing is invented', () => {
  assert.deepEqual(plain(MK.stats([{ marks: 3 }, { marks: 5 }, { marks: null }, { marks: NaN }, {}, null])), { count: 6, marked: 2, total: 8, average: 4 });
  assert.deepEqual(plain(MK.stats([])), { count: 0, marked: 0, total: 0, average: null }); assert.deepEqual(plain(MK.stats(null)), { count: 0, marked: 0, total: 0, average: null });
  assert.deepEqual(plain(MK.stats([{ marks: 0 }])), { count: 1, marked: 1, total: 0, average: 0 }, 'a mark of zero is a mark');
  const s = MK.summarize([{ name: 'A', quizzes: [{ marks: 3 }, { marks: 4 }], assignments: [{ marks: 5 }, { marks: null }] }, { name: 'B', quizzes: [], assignments: [], error: 'x' }, { name: 'C', quizzes: [{ marks: null }], assignments: [] }, null]);
  assert.equal(s.courses, 4); assert.equal(s.readable, 2); assert.equal(s.failed, 1); assert.equal(s.withMarks, 1);
  assert.deepEqual(plain({ q: s.quizzes, a: s.assignments }), { q: { count: 3, marked: 2, total: 7, average: 3.5 }, a: { count: 2, marked: 1, total: 5, average: 5 } });
  assert.deepEqual(plain(MK.summarize(null)), { courses: 0, readable: 0, failed: 0, quizzes: { count: 0, marked: 0, total: 0, average: null }, assignments: { count: 0, marked: 0, total: 0, average: null }, withMarks: 0 });
  assert.deepEqual([MK.fmt(5), MK.fmt(3.5), MK.fmt(7 / 3), MK.fmt(0), MK.fmt(1234.5678), MK.fmt(NaN), MK.fmt(null), MK.fmt(undefined)], ['5', '3.5', '2.33', '0', '1234.57', '', '', ''], 'trailing zeros are dropped, and nothing prints NaN');
});

test('marks overview: the portal’s own pages are read into marks (quizzes, assignments, marked and not yet marked)', () => {
  const quizzes = '<table class="table"><tbody><tr><th>Quiz No.</th><th>Quiz Title</th><th>Quiz</th><th>Quiz Marks</th><th>Quiz Solution</th></tr>'
    + '<tr><td>1</td><td> CLO 1</td><td><a href="Download.php?k=a">x</a></td><td> 3.000 </td><td></td></tr><tr><td>2</td><td> CLO 2</td><td></td><td> Not marked yet </td><td></td></tr><tr><td>3</td><td>CLO 3 &amp; more</td><td></td><td>7.5</td><td></td></tr></tbody></table>';
  const work = '<table><tbody><tr><th>Assign. No.</th><th>Title</th><th>Assignment</th><th>Added Submission</th><th>Marks Obtained</th><th>Returned</th><th>Action</th><th>Deadline</th></tr>'
    + '<tr><td>1</td><td>CLO 1</td><td></td><td><a href="x">Submission</a></td><td> 5.000 </td><td>---</td><td><div>Deadline Exceeded</div></td><td><small title="Actual">29 September 2026 - 11:55 pm</small></td></tr>'
    + '<tr><td>2</td><td>CLO 4</td><td></td><td>No Submission</td><td>Not marked yet</td><td>---</td><td></td><td><small title="Actual">28 November 2026-11:55 pm</small></td></tr></tbody></table>';
  const q = NOTIFY.parseQuizzes(quizzes).map(r => ({ title: r.title, marks: r.marks })), a = NOTIFY.parseAssignments(work).map(r => ({ title: r.title, marks: r.marks }));
  assert.deepEqual(plain(q), [{ title: 'CLO 1', marks: 3 }, { title: 'CLO 2', marks: null }, { title: 'CLO 3 & more', marks: 7.5 }]);
  assert.deepEqual(plain(a), [{ title: 'CLO 1', marks: 5 }, { title: 'CLO 4', marks: null }]);
  assert.equal(NOTIFY.parseQuizzes('<p>Please select a course</p>'), null, 'a page with no table is nothing posted, not an error'); assert.equal(NOTIFY.parseAssignments(''), null);
  const sum = MK.summarize([{ name: 'CN', quizzes: q, assignments: a }]); assert.equal(sum.quizzes.total, 10.5); assert.equal(sum.assignments.average, 5);
});

test('marks overview: the page script cannot inject markup and stays within its limits', () => {
  const src = read('marks.js');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(/, 'text only');
  assert.match(src, /const safe = pageUrl\(/); assert.match(src, /fetch\(safe, \{ credentials: 'same-origin'/);
  assert.ok(MK.LIMITS.courses <= 20 && MK.LIMITS.gap >= 150, 'gentle on the university: few courses, spaced out');
  assert.equal((src.match(/fetch\(/g) || []).length, 1, 'one place that fetches');
});
