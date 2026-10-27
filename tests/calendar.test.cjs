const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() { const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync('extension/calendar.js', 'utf8'), ctx); return ctx.BahriaCalendar; }
const C = load();
const plain = o => JSON.parse(JSON.stringify(o));
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const mon = { day: 1, start: 8 * 60 + 30, end: 10 * 60 + 30, title: 'Data Structures', room: 'R-204', building: 'Block A', teacher: 'DR. SANA MALIK', klass: 'BSE-5B' };

// What a calendar app does first: undo the line folding, then read property:value pairs.
function parse(text) {
  assert.ok(text.endsWith('\r\n'), 'ends with CRLF');
  assert.ok(!/(^|[^\r])\n/.test(text), 'no bare line feeds');
  const lines = text.slice(0, -2).split('\r\n');
  const unfolded = [];
  for (const line of lines) { assert.ok(Buffer.byteLength(line) <= 75, 'physical line within 75 octets: ' + line.length); if (line.startsWith(' ')) unfolded[unfolded.length - 1] += line.slice(1); else unfolded.push(line); }
  const stack = [], events = []; let current = null;
  for (const line of unfolded) {
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line); assert.ok(m, 'a property line: ' + line);
    const [, name, , value] = m;
    if (name === 'BEGIN') { stack.push(value); if (value === 'VEVENT') { current = {}; events.push(current); } else if (value === 'VALARM') { assert.ok(current, 'an alarm sits inside an event'); current = current.alarm = {}; } }
    else if (name === 'END') { assert.equal(stack.pop(), value, 'balanced ' + value); if (value === 'VEVENT') current = null; else if (value === 'VALARM') current = events[events.length - 1]; }
    else if (current) (current[name] = current[name] || []).push({ params: m[2], value });
  }
  assert.deepEqual(stack, [], 'everything closed');
  return { unfolded, events };
}
const one = (ev, name) => { assert.equal((ev[name] || []).length, 1, name + ' appears exactly once'); return ev[name][0]; };

test('a class becomes a weekly event at the right Pakistan time, repeating until the end of the semester', () => {
  const r = C.build([mon], { start: '2026-10-12', weeks: 16, alarm: 10, semester: 'Fall-2026', now: NOW });
  assert.equal(r.ok, true); assert.equal(r.count, 1); assert.equal(r.until, '20270131');
  const { events, unfolded } = parse(r.text); const ev = events[0];
  assert.deepEqual(unfolded.slice(0, 4), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campuslit//Time table//EN', 'CALSCALE:GREGORIAN']);
  assert.ok(unfolded.includes('TZID:Asia/Karachi') && unfolded.includes('TZOFFSETTO:+0500'), 'the time zone is defined in the file');
  assert.equal(one(ev, 'DTSTART').params, ';TZID=Asia/Karachi'); assert.equal(one(ev, 'DTSTART').value, '20261012T083000');
  assert.equal(one(ev, 'DTEND').value, '20261012T103000');
  assert.equal(one(ev, 'DTSTAMP').value, '20261011T120000Z');
  assert.equal(one(ev, 'RRULE').value, 'FREQ=WEEKLY;UNTIL=20270131T185959Z;BYDAY=MO', '16 weeks from 12 Oct: the last second of 31 Jan Pakistan time, in UTC');
  assert.equal(one(ev, 'SUMMARY').value, 'Data Structures'); assert.equal(one(ev, 'LOCATION').value, 'R-204\\, Block A');
  assert.equal(one(ev, 'DESCRIPTION').value, 'Teacher: DR. SANA MALIK\\nClass: BSE-5B\\nFall-2026');
  assert.equal(one(ev.alarm, 'TRIGGER').value, '-PT10M'); assert.equal(one(ev.alarm, 'ACTION').value, 'DISPLAY'); assert.equal(one(ev.alarm, 'DESCRIPTION').value, 'Data Structures');
});

test('the first date is the first matching weekday on or after the first day of classes', () => {
  const week = [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: 600, end: 660, title: 'C' + day }));
  const r = C.build(week, { start: '2026-10-14', weeks: 4, now: NOW });           // a Wednesday
  const dates = Object.fromEntries(parse(r.text).events.map(ev => [one(ev, 'SUMMARY').value, one(ev, 'DTSTART').value.slice(0, 8)]));
  assert.deepEqual(plain(dates), { C3: '20261014', C4: '20261015', C5: '20261016', C6: '20261017', C0: '20261018', C1: '20261019', C2: '20261020' });
  const byday = Object.fromEntries(parse(r.text).events.map(ev => [one(ev, 'SUMMARY').value, one(ev, 'RRULE').value.split('BYDAY=')[1]]));
  assert.deepEqual(plain(byday), { C0: 'SU', C1: 'MO', C2: 'TU', C3: 'WE', C4: 'TH', C5: 'FR', C6: 'SA' });
  assert.equal(r.until, '20261110', '4 weeks from Wed 14 Oct: through Tue 10 Nov');
});

test('no repeat can run past the end date, whatever day the semester starts on', () => {
  for (const start of ['2026-10-12', '2026-10-14', '2026-10-18', '2026-12-28', '2028-02-26']) {
    for (const weeks of [1, 2, 16, 30]) {
      const r = C.build([0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: 480, end: 540, title: 'X' + day })), { start, weeks, now: NOW });
      const until = C.dateStart(start) + weeks * 7 * 86400000 - 1000;
      parse(r.text).events.forEach(ev => {
        const first = Date.UTC(+one(ev, 'DTSTART').value.slice(0, 4), +one(ev, 'DTSTART').value.slice(4, 6) - 1, +one(ev, 'DTSTART').value.slice(6, 8), +one(ev, 'DTSTART').value.slice(9, 11) - 5, +one(ev, 'DTSTART').value.slice(11, 13));
        assert.ok(first >= C.dateStart(start), 'not before the first day: ' + start);
        assert.ok(first <= until, 'the first class itself is inside the semester: ' + start + ' ' + weeks);
      });
    }
  }
});

test('lab sessions are labelled, a 24:00 end rolls to the next day, and times are exact', () => {
  const r = C.build([{ day: 2, start: 14 * 60, end: 17 * 60, title: 'Database Systems Lab', lab: true, room: 'Lab-2' }, { day: 5, start: 22 * 60, end: 1440, title: 'Late class' }], { start: '2026-10-12', weeks: 2, now: NOW });
  const [lab, late] = parse(r.text).events;
  assert.equal(one(lab, 'SUMMARY').value, 'Database Systems Lab (Lab)'); assert.equal(one(lab, 'DTSTART').value, '20261013T140000'); assert.equal(one(lab, 'DTEND').value, '20261013T170000');
  assert.equal(one(late, 'DTSTART').value, '20261016T220000'); assert.equal(one(late, 'DTEND').value, '20261017T000000');
});

test('text is escaped, and a hostile title cannot add lines or properties to the file', () => {
  const evil = { day: 1, start: 600, end: 660, title: 'Maths\r\nBEGIN:VEVENT\r\nSUMMARY:Injected', room: 'R;1,2\\3', teacher: 'A\nATTENDEE:mailto:x@y.z', klass: 'K\u2028END:VCALENDAR' };
  const r = C.build([evil], { start: '2026-10-12', weeks: 2, alarm: 5, now: NOW });
  const { unfolded, events } = parse(r.text);
  assert.equal(events.length, 1, 'still exactly one event'); assert.equal(unfolded.filter(l => l === 'BEGIN:VEVENT').length, 1);
  assert.ok(!unfolded.some(l => /^ATTENDEE|^SUMMARY:Injected/.test(l)), 'no injected property lines');
  assert.equal(one(events[0], 'SUMMARY').value, 'Maths BEGIN:VEVENT SUMMARY:Injected'.replace(/,/g, '\\,').replace(/;/g, '\\;'));
  assert.equal(one(events[0], 'LOCATION').value, 'R\\;1\\,2\\\\3');
  assert.equal(C.esc('a,b;c\\d'), 'a\\,b\\;c\\\\d');
});

test('long and non-English text is folded safely', () => {
  const title = 'Introduction to Artificial Intelligence and Machine Learning for Software Engineers, Part Two';
  const urdu = { day: 3, start: 600, end: 660, title: 'اردو زبان و ادب ' + 'ت'.repeat(40), room: 'ہال', teacher: '🙂 '.repeat(20) };
  const r = C.build([{ day: 1, start: 600, end: 660, title }, urdu], { start: '2026-10-12', weeks: 2, now: NOW });
  const { events } = parse(r.text);                                    // parse() asserts 75 octets per physical line
  assert.equal(one(events[0], 'SUMMARY').value, title.replace(/,/g, '\\,'));
  assert.ok(one(events[1], 'SUMMARY').value.startsWith('اردو زبان و ادب'), 'multi-byte characters survive being folded');
  assert.ok(!r.text.includes('\ufffd'), 'no broken characters');
  assert.equal(C.fold('x'.repeat(200)).split('\r\n').length, 3);
});

test('reminders: only the offered values, otherwise none', () => {
  const alarm = a => (parse(C.build([mon], { start: '2026-10-12', weeks: 2, alarm: a, now: NOW }).text).events[0].alarm || {}).TRIGGER;
  assert.equal(alarm(0), undefined); assert.equal(alarm(30)[0].value, '-PT30M'); assert.equal(alarm(60)[0].value, '-PT60M');
  for (const bad of [-5, 7, 999999, NaN, 'soon', undefined, null, '10; X=1']) assert.equal(alarm(bad), undefined, String(bad));
  assert.equal(alarm('15')[0].value, '-PT15M', 'a numeric string from a form is fine');
});

test('bad input gives a plain message, never a broken file', () => {
  const ok = { start: '2026-10-12', weeks: 16, now: NOW };
  for (const start of [undefined, null, '', '12/10/2026', '2026-13-01', '2026-02-30', '1999-01-01', '2101-01-01', '2026-10-12; DROP', 5, {}]) {
    const r = C.build([mon], { ...ok, start }); assert.equal(r.ok, false, String(start)); assert.match(r.error, /first day of classes/);
  }
  for (const weeks of [0, -3, 31, 1000, NaN, 'x', undefined, null, Infinity]) { const r = C.build([mon], { ...ok, weeks }); assert.equal(r.ok, false, String(weeks)); assert.match(r.error, /Weeks must be between 1 and 30/); }
  for (const events of [undefined, null, [], 5, 'x', {}, [null], [{}], [{ day: 9, start: 1, end: 2, title: 'x' }], [{ day: 1, start: 600, end: 600, title: 'x' }], [{ day: 1, start: 700, end: 600, title: 'x' }], [{ day: 1, start: 600, end: 700, title: '' }], [{ day: 1.5, start: 600, end: 700, title: 'x' }], [{ day: 1, start: 600, end: 2000, title: 'x' }], [{ day: 1, start: NaN, end: 700, title: 'x' }]]) {
    const r = C.build(events, ok); assert.equal(r.ok, false, JSON.stringify(events)); assert.equal(r.error, 'There are no classes to export.');
  }
  assert.equal(C.build([mon], undefined).ok, false); assert.equal(C.build([mon], null).ok, false);
  // one bad class does not spoil the others
  const mixed = C.build([{ day: 99 }, mon, null, { ...mon, title: '' }], ok); assert.equal(mixed.ok, true); assert.equal(mixed.count, 1);
});

test('the same class always has the same id, so importing again updates instead of duplicating', () => {
  const ids = (events, opts) => parse(C.build(events, opts).text).events.map(ev => one(ev, 'UID').value);
  const a = ids([mon], { start: '2026-10-12', weeks: 16, now: NOW }), b = ids([mon], { start: '2026-10-19', weeks: 10, alarm: 30, now: NOW + 99999 });
  assert.deepEqual(a, b, 'dates and reminders do not change the id');
  assert.notDeepEqual(a, ids([{ ...mon, start: mon.start + 60, end: mon.end + 60 }], { start: '2026-10-12', weeks: 16, now: NOW }), 'a moved class is a different event');
  assert.notDeepEqual(a, ids([mon], { start: '2026-10-12', weeks: 16, semester: 'Spring-2027', now: NOW }), 'another semester is a different event');
  const twice = C.build([mon, { ...mon }, { ...mon, teacher: 'someone else' }], { start: '2026-10-12', weeks: 16, now: NOW });
  assert.equal(twice.count, 1, 'a duplicated row becomes one event');
  assert.equal(new Set(ids([mon, { ...mon, day: 2 }, { ...mon, title: 'Other' }], { start: '2026-10-12', weeks: 4, now: NOW })).size, 3, 'ids are unique per class');
});

test('size is bounded', () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ day: i % 7, start: 480 + (i % 20) * 10, end: 480 + (i % 20) * 10 + 5, title: 'Course ' + i }));
  const r = C.build(many, { start: '2026-10-12', weeks: 16, now: NOW });
  assert.equal(r.count, 200); assert.ok(r.text.length < 200000);
  assert.ok(parse(r.text).events.length === 200);
});

test('file name and default start date', () => {
  assert.equal(C.fileName('Fall-2026'), 'campuslit-timetable-Fall-2026.ics');
  assert.equal(C.fileName('../../etc/passwd; rm -rf'), 'campuslit-timetable-etc-passwd-rm-rf.ics');
  assert.equal(C.fileName(undefined), 'campuslit-timetable.ics'); assert.equal(C.fileName('???'), 'campuslit-timetable.ics');
  assert.ok(!/[\\/:*?"<>|\r\n]/.test(C.fileName('a/b\\c:d*e?f"g<h>i|j\r\nk')));
  assert.equal(C.mondayOf(new Date(2026, 9, 14)), '2026-10-12', 'Wednesday -> that week\'s Monday');
  assert.equal(C.mondayOf(new Date(2026, 9, 12)), '2026-10-12'); assert.equal(C.mondayOf(new Date(2026, 9, 18)), '2026-10-12', 'Sunday belongs to the week before');
  assert.equal(C.mondayOf(new Date(2027, 0, 1)), '2026-12-28', 'across a year end');
  assert.match(C.mondayOf(new Date('nope')), /^\d{4}-\d{2}-\d{2}$/); assert.match(C.mondayOf(undefined), /^\d{4}-\d{2}-\d{2}$/);
});

test('the module touches nothing outside itself', () => {
  const code = fs.readFileSync('extension/calendar.js', 'utf8');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|document\.|window\.|localStorage|storage\.|chrome\.|browser\.|Blob|createObjectURL/);
});
