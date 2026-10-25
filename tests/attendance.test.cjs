const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() { const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync('extension/attendance.js', 'utf8'), ctx); return ctx.BahriaAttendance; }
const A = load();
const plain = o => JSON.parse(JSON.stringify(o));
// Independent reference in whole hours: "more than 75%" is 4 * attended > 3 * total.
const above = (attended, total) => 4 * attended > 3 * total;
function reference(P, T, S, unit) {
  const total = Math.max(S, T), left = total - T;
  if (left === 0) return { state: 'ended' };
  const options = []; for (let a = 0; a <= left; a += unit) options.push(a); if (!options.includes(left)) options.push(left);   // attend whole classes, or everything
  const best = options.find(a => above(P + a, total));
  if (best === undefined) return { state: 'lost' };
  return { state: 'ok', need: best, canMiss: Math.floor((left - best) / unit) * unit, left };
}

test('the rule is strictly more than 75%: exactly 75% is not enough', () => {
  // 16 weeks x 3 hrs = 48 hours; 36 attended of 48 is exactly 75%
  const r = A.plan({ present: 24, total: 24, creditHours: 3, title: 'Data Structures' }, { weeks: 16 });
  assert.equal(r.needMin / 60, 13, 'attending 12 more would give exactly 75% (36 of 48), so 13 are needed');
  assert.equal(r.canMissMin / 60, 11);
  const ended = A.plan({ present: 36, total: 48, creditHours: 3, title: 'X' }, { weeks: 16 });
  assert.equal(ended.state, 'ended'); assert.equal(ended.level, 'bad', '75.0% at the end is not enough');
  assert.equal(A.plan({ present: 37, total: 48, creditHours: 3, title: 'X' }, { weeks: 16 }).level, 'ok');
  assert.equal(A.MIN_PERCENT, 75);
});

test('worked examples with your rule: credit hours = hours a week, a lab is one 3-hour session per credit hour', () => {
  // 3-credit theory, 20 of 22 held, 16 weeks: 48 hrs in the semester, 26 to go. Need 4(20+a) > 144 -> a >= 17, so 9 can be missed.
  const th = A.plan({ present: 20, total: 22, creditHours: 3, title: 'Computer Networks', percentage: '90.91' }, { weeks: 16 });
  assert.deepEqual([th.state, th.totalMin / 60, th.remainMin / 60, th.needMin / 60, th.canMissMin / 60, th.lab], ['safe', 48, 26, 17, 9, false]);
  // 1-credit lab = a 3-hour session a week = 48 hours over 16 weeks. 21 of 21 held (7 sessions); 27 hours (9 sessions) to go.
  // Need a >= 16 -> 6 sessions (18 hrs); so 9 hrs = 3 whole sessions can be missed.
  const lab = A.plan({ present: 21, total: 21, creditHours: 1, title: 'Computer Communication & Networks Lab' }, { weeks: 16 });
  assert.deepEqual([lab.state, lab.lab, lab.totalMin / 60, lab.remainMin / 60, lab.needMin / 60, lab.canMissMin / 60], ['safe', true, 48, 27, 18, 9]);
  assert.equal(A.describe(lab).text, 'Can miss up to 3 lab sessions (9 hrs) of the remaining 27 hrs and still finish above 75%');
  // below 75% now (15 of 21) but recoverable: 27 hours to go, must attend 22
  const rec = A.plan({ present: 15, total: 21, creditHours: 3, title: 'Networks' }, { weeks: 16 });
  assert.deepEqual([rec.state, rec.level, rec.needMin / 60, rec.canMissMin / 60], ['recover', 'bad', 22, 5]);
  assert.equal(A.describe(rec).text, 'Attend at least 22 hrs of the remaining 27 hrs to finish above 75%');
  // beyond rescue: 6 of 30 held, 18 left -> best possible 24 of 48
  const lost = A.plan({ present: 6, total: 30, creditHours: 3, title: 'X' }, { weeks: 16 });
  assert.equal(lost.state, 'lost'); assert.equal(lost.bestPercent, 50);
  assert.match(A.describe(lost).text, /^Cannot finish above 75% any more, even attending every remaining hour \(best possible 50%\)$/);
  // a different semester length changes the answer
  assert.equal(A.plan({ present: 20, total: 22, creditHours: 3, title: 'X' }, { weeks: 14 }).canMissMin / 60, 8, '42 hrs in the semester, 20 to go, attend at least 12');
  assert.equal(A.plan({ present: 0, total: 0 }).state, 'none');
  // tight: no whole class can be missed
  assert.equal(A.plan({ present: 36, total: 47, creditHours: 3, title: 'X' }, { weeks: 16 }).state, 'tight', '76.6% now, one hour left, and it must be attended');
});

test('brute force: matches an independent reference for every attended/held combination', () => {
  const configs = [[3, false, 16], [1, true, 16], [2, false, 14], [4, false, 18], [1, true, 12], [3, true, 16]];
  let checked = 0;
  for (const [credit, lab, weeks] of configs) {
    const S = weeks * credit * (lab ? 3 : 1), unit = lab ? 3 : 1;
    for (let T = 1; T <= S + 2; T++) {
      if (lab && T % 3) continue;                          // labs are held a whole session at a time
      for (let P = 0; P <= T; P++) {
        const got = A.plan({ present: P, total: T, creditHours: credit, lab }, { weeks }), want = reference(P, T, S, unit);
        const ctx = JSON.stringify({ credit, lab, weeks, P, T });
        checked++;
        if (want.state === 'ended') { assert.equal(got.state, 'ended', ctx); assert.equal(got.level === 'ok', above(P, T), ctx); continue; }
        if (want.state === 'lost') { assert.equal(got.state, 'lost', ctx); continue; }
        assert.ok(['safe', 'tight', 'recover'].includes(got.state), ctx + ' -> ' + got.state);
        assert.equal(got.needMin / 60, want.need, 'need ' + ctx); assert.equal(got.canMissMin / 60, want.canMiss, 'canMiss ' + ctx);
        // the promise itself: missing exactly that much still finishes above 75%; one more class does not
        assert.ok(above(P + want.left - want.canMiss, S > T ? S : T), 'promise holds ' + ctx);
        if (want.canMiss + unit <= want.left) assert.ok(!above(P + want.left - want.canMiss - unit, S > T ? S : T), 'one more class breaks it ' + ctx);
        assert.equal(got.state === 'recover', !above(P, T), 'recover means at or below 75% right now ' + ctx);
      }
    }
  }
  assert.ok(checked > 8000, 'checked ' + checked);
});

test('without credit hours it falls back to counting from now, in whole classes', () => {
  const r = A.plan({ present: 20, total: 22 }); assert.equal(r.mode, 'now');
  assert.equal(r.canMissMin / 60, 4);                       // 4*20 > 3*(22+x) -> x < 4.67 -> 4 whole hours
  assert.equal(A.describe(r).text, 'Can miss up to 4 hrs and stay above 75%');
  assert.equal(A.plan({ present: 15, total: 21 }).state, 'recover');
  assert.equal(A.plan({ present: 15, total: 21, creditHours: 'x' }).mode, 'now');
  assert.equal(A.plan({ present: 15, total: 21, creditHours: 0 }).mode, 'now');
  assert.equal(A.plan({ present: 15, total: 21, creditHours: 99 }).mode, 'now', 'an absurd credit-hour value is ignored');
});

test('messy inputs never throw and never give advice from bad numbers', () => {
  for (const bad of [undefined, null, 5, 'x', [], {}, { present: 'a', total: 3 }, { present: 3 }, { present: -1, total: 4 }, { present: NaN, total: 4 }, { present: Infinity, total: 4 }, { present: 1e9, total: 1e9 }, { present: 5, total: 4 }, { present: 3, total: 0 }]) {
    const r = A.plan(bad, { weeks: 16 }); assert.equal(r.state, 'invalid', JSON.stringify(bad));
    assert.match(A.describe(r).text, /Cannot work this out/);
  }
  assert.equal(A.plan({ present: '20.0', total: '22.0', creditHours: '3', percentage: '90.91' }, { weeks: 16 }).state, 'safe', 'numeric strings are fine');
  assert.equal(A.plan({ present: 20, total: 22, creditHours: 3, percentage: '50' }, { weeks: 16 }).state, 'invalid', "portal percentage that contradicts its hours");
  assert.equal(A.plan({ present: 20, total: 22, creditHours: 3, percentage: '90.9%' }, { weeks: 16 }).state, 'safe');
  for (const w of [undefined, null, 'abc', NaN, -5, 0, 1e9]) assert.doesNotThrow(() => A.plan({ present: 20, total: 22, creditHours: 3 }, { weeks: w }), 'weeks = ' + w);
  assert.equal(A.clampWeeks(undefined), 16); assert.equal(A.clampWeeks(2), 4); assert.equal(A.clampWeeks(500), 30); assert.equal(A.clampWeeks('18'), 18);
  assert.equal(A.summarize(undefined).total, 0); assert.equal(A.summaryText(A.summarize([])), '');
});

test('labs are recognised by title or course code, and only they use 3-hour sessions', () => {
  const base = { present: 21, total: 21, creditHours: 1 };
  assert.equal(A.plan({ ...base, title: 'Database Systems Lab' }).lab, true);
  assert.equal(A.plan({ ...base, code: 'CEL 223' }).lab, true);
  assert.equal(A.plan({ ...base, title: 'Labour Economics', code: 'ECO 101' }).lab, false, '"Labour" is not a lab');
  assert.equal(A.plan({ ...base, title: 'Artificial Intelligence', code: 'CSC 411' }).lab, false);
  assert.equal(A.plan({ ...base, title: 'Anything', lab: true }).lab, true);
});

test('summary wording', () => {
  const ok = A.plan({ present: 21, total: 21, creditHours: 3, title: 'X' }), bad = A.plan({ present: 15, total: 21, creditHours: 3, title: 'X' });
  assert.equal(A.summaryText(A.summarize([ok, ok])), 'All 2 courses are above 75%');
  assert.equal(A.summaryText(A.summarize([ok, bad, A.plan({ present: 0, total: 0 }), A.plan({ present: 9, total: 5 })])), '1 course is at or below 75%');
  assert.equal(A.summarize([ok, A.plan({ present: 9, total: 5 })]).unknown, 1);
  assert.match(A.summaryText(A.summarize([A.plan({ present: 36, total: 47, creditHours: 3, title: 'X' })])), /no room to miss/);
  assert.equal(A.plan({ present: 21, total: 21, creditHours: 3, title: 'X' }).level, 'ok');
  assert.equal(A.plan({ present: 30, total: 36, creditHours: 3, title: 'X' }).level, 'warn', 'can miss less than two weeks of class');
});

test('extractCourses reads the dashboard script safely', () => {
  const rows = [{ code: 'CEN 223', title: 'Networks [Lab] (2) ); tricky', present: 20, total: 22, percentage: '90.91' }, { code: 'X', title: 'He said "hi"', present: 1, total: 1, percentage: '100' }];
  const script = 'var a=1;\nrenderAttendanceSummaryChart(' + JSON.stringify(rows) + ');\nvar b=[1,2];';
  assert.deepEqual(plain(A.extractCourses(script)), rows, 'brackets, parentheses and quotes inside strings');
  for (const bad of [undefined, null, 5, '', 'nothing here', 'renderAttendanceSummaryChart(', 'renderAttendanceSummaryChart([{"a":1}', 'renderAttendanceSummaryChart([{bad json}]);', 'renderAttendanceSummaryChart({"a":1});', 'renderAttendanceSummaryChart(function(){ return [1]; });']) assert.equal(A.extractCourses(bad), null, String(bad));
  assert.deepEqual(plain(A.extractCourses('renderAttendanceSummaryChart([]);')), []);
});

test('the module touches nothing outside itself', () => {
  const code = fs.readFileSync('extension/attendance.js', 'utf8');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|document\.|window\.|localStorage|storage\.|chrome\.|browser\./);
});
