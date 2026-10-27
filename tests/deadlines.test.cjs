const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() { const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync('extension/deadlines.js', 'utf8'), ctx); return ctx.BahriaDeadlines; }
const D = load();
const plain = o => JSON.parse(JSON.stringify(o));
// 11:55 pm Pakistan time (UTC+5) is 18:55 UTC the same day
const pkt = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h - 5, min);

test('parses the portal formats as Pakistan time, whatever the device time zone is', () => {
  assert.equal(D.parseDeadline('29 September 2026 - 11:55 pm'), pkt(2026, 9, 29, 23, 55));
  assert.equal(D.parseDeadline('27 September 2026-11:55 pm'), pkt(2026, 9, 27, 23, 55));
  assert.equal(D.parseDeadline('  5   Oct  2026 -  9:05 AM '), pkt(2026, 10, 5, 9, 5));
  assert.equal(D.parseDeadline('05 October 2026 - 12:00 am'), pkt(2026, 10, 5, 0, 0), '12 am is midnight');
  assert.equal(D.parseDeadline('05 October 2026 - 12:00 pm'), pkt(2026, 10, 5, 12, 0), '12 pm is noon');
  assert.equal(D.parseDeadline('5 Sept 2026 11:55pm'), pkt(2026, 9, 5, 23, 55));
  assert.equal(D.parseDeadline('Mon, 5 October 2026 at 11:55 p.m.'), pkt(2026, 10, 5, 23, 55));
  assert.equal(D.parseDeadline('5th October 2026, 23:30'), pkt(2026, 10, 5, 23, 30), 'a 24-hour time with no am/pm');
  assert.equal(D.parseDeadline('29 September 2026 - 11:55 pm'), pkt(2026, 9, 29, 23, 55), 'non-breaking space');
  assert.equal(D.parseDeadline('29 SEPTEMBER 2026 - 11:55 PM'), pkt(2026, 9, 29, 23, 55));
  assert.equal(D.parseDeadline('29 September 2026'), pkt(2026, 9, 29, 23, 59), 'a date with no time runs to the end of that day');
});

test('rejects anything that is not a real date, instead of guessing', () => {
  for (const bad of [undefined, null, 5, {}, [], '', '   ', '---', 'Deadline Exceeded', 'No deadline', '31 February 2026 - 11:55 pm', '31 April 2026 - 1:00 pm', '0 May 2026 - 1:00 pm', '32 May 2026 - 1:00 pm',
    '5 Octember 2026 - 1:00 pm', '5 October 1999 - 1:00 pm', '5 October 2101 - 1:00 pm', '5 October 2026 - 13:00 pm', '5 October 2026 - 0:30 am', '5 October 2026 - 11:75 pm', '5 October 2026 - 25:00', 'x'.repeat(200), '5 5 2026']) {
    assert.ok(Number.isNaN(D.parseDeadline(bad)), String(bad).slice(0, 40));
  }
  assert.equal(D.parseDeadline('29 February 2028 - 1:00 pm'), pkt(2028, 2, 29, 13, 0), 'a real leap day');
  assert.ok(Number.isNaN(D.parseDeadline('29 February 2027 - 1:00 pm')), 'not a leap year');
});

test('the deadline that counts is the latest one that can be read', () => {
  const e = D.effectiveDeadline([{ text: '29 September 2026 - 11:55 pm', extended: true }, { text: '27 September 2026-11:55 pm', extended: false }]);
  assert.deepEqual(plain(e), { ms: pkt(2026, 9, 29, 23, 55), extended: true });
  assert.deepEqual(plain(D.effectiveDeadline([{ text: 'garbage', extended: true }, { text: '27 September 2026-11:55 pm' }])), { ms: pkt(2026, 9, 27, 23, 55), extended: false }, 'an unreadable extension is ignored');
  assert.equal(D.effectiveDeadline([{ text: 'x' }]), null); assert.equal(D.effectiveDeadline([]), null); assert.equal(D.effectiveDeadline(undefined), null);
  assert.equal(D.effectiveDeadline([{ text: '27 September 2026-11:55 pm', extended: true }, { text: '29 September 2026 - 11:55 pm', extended: false }]).extended, false, 'extended only when the extended date is the later one');
});

test('durations read plainly', () => {
  const m = 60000, h = 60 * m, d = 24 * h;
  const cases = [[0, 'under a minute'], [59999, 'under a minute'], [m, '1 min'], [35 * m, '35 min'], [h, '1 hr'], [h + 20 * m, '1 hr 20 min'], [5 * h, '5 hrs'], [23 * h + 59 * m, '23 hrs 59 min'], [d, '1 day'], [d + h, '1 day 1 hr'], [2 * d + 4 * h + 30 * m, '2 days 4 hrs'], [30 * d, '30 days']];
  for (const [ms, text] of cases) assert.equal(D.duration(ms), text, String(ms));
  assert.equal(D.duration(-2 * h), '2 hrs', 'the size of the gap, either way');
});

test('status: the portal wins over a wrong device clock', () => {
  const at = pkt(2026, 10, 15, 23, 55), h = 3600000;
  // before the deadline, nothing submitted
  assert.deepEqual(plain(D.classify({ deadlineMs: at, portalClosed: false, hasControl: true }, at - 5 * h)), { state: 'open', level: 'bad', ms: at, left: 5 * h }, 'under a day left is urgent');
  assert.equal(D.classify({ deadlineMs: at, portalClosed: false }, at - 48 * h).level, 'warn', 'under three days');
  assert.equal(D.classify({ deadlineMs: at, portalClosed: false }, at - 100 * h).level, 'info');
  // the portal says exceeded: closed, even if the device clock thinks it is still early
  const wrongClock = D.classify({ deadlineMs: at, portalClosed: true }, at - 100 * h);
  assert.equal(wrongClock.state, 'closed'); assert.ok(Number.isNaN(wrongClock.ago), 'no "closed 4 days ago" from a clock that disagrees');
  assert.equal(D.describe(wrongClock), 'Closed, not submitted');
  assert.equal(D.describe(D.classify({ deadlineMs: at, portalClosed: true }, at + 26 * h)), 'Closed 1 day 2 hrs ago, not submitted');
  assert.equal(D.describe(D.classify({ deadlineMs: at, portalClosed: true }, at + 40 * 24 * h)), 'Closed, not submitted', 'a semester-old deadline is not counted in days');
  // the portal still shows an upload box but the device clock is past the deadline: say so instead of claiming it is closed
  assert.equal(D.classify({ deadlineMs: at, portalClosed: false, hasControl: true }, at + h).state, 'check');
  assert.equal(D.describe(D.classify({ deadlineMs: at, portalClosed: false }, at + h)), 'Open. Check the deadline on the portal');
  // no portal word at all: the date decides
  assert.equal(D.classify({ deadlineMs: at, portalClosed: null }, at + h).state, 'closed');
  assert.equal(D.classify({ deadlineMs: at, portalClosed: null }, at - h).state, 'open');
  assert.equal(D.classify({ portalClosed: null }, Date.now()).state, 'unknown');
  assert.equal(D.describe(D.classify({}, NaN)), '');
  // submitted beats everything
  assert.equal(D.classify({ deadlineMs: at, portalClosed: true, submitted: true }, at + h).state, 'submitted');
  assert.equal(D.describe(D.classify({ submitted: true })), 'Submitted');
  assert.equal(D.describe(D.classify({ deadlineMs: at, portalClosed: false }, at - 2 * 24 * h - 4 * h)), 'Due in 2 days 4 hrs');
});

test('the exact moment of the deadline counts as passed', () => {
  const at = pkt(2026, 10, 15, 23, 55);
  assert.equal(D.classify({ deadlineMs: at, portalClosed: null }, at - 1).state, 'open');
  assert.equal(D.classify({ deadlineMs: at, portalClosed: null }, at).state, 'closed');
});

test('messy input never throws', () => {
  for (const bad of [undefined, null, 5, 'x', [], {}, { deadlineMs: 'soon' }, { deadlineMs: Infinity }, { deadlineMs: NaN, portalClosed: false }]) {
    assert.doesNotThrow(() => D.describe(D.classify(bad, Date.now())), JSON.stringify(bad));
    assert.doesNotThrow(() => D.classify(bad, NaN));
  }
  assert.doesNotThrow(() => D.summarize(undefined)); assert.doesNotThrow(() => D.summarize([null, undefined, {}]));
  assert.equal(D.describe(undefined), '');
});

test('summary finds the next deadline among open ones only', () => {
  const rows = [{ state: 'closed' }, { state: 'open', left: 5000 }, { state: 'submitted' }, { state: 'open', left: 1000 }, { state: 'check' }];
  const s = D.summarize(rows);
  assert.deepEqual(plain(s), { total: 5, open: 3, submitted: 1, closed: 1, nextIndex: 3 });
  assert.equal(D.summarize([{ state: 'closed' }]).nextIndex, -1);
  assert.deepEqual(plain(D.summarize([])), { total: 0, open: 0, submitted: 0, closed: 0, nextIndex: -1 });
});

test('the module touches nothing outside itself', () => {
  const code = fs.readFileSync('extension/deadlines.js', 'utf8');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|document\.|window\.|localStorage|storage\.|chrome\.|browser\.|Intl\./);
});
