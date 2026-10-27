(function (root) {
  'use strict';
  // Quick search: which pages exist, and how well they match what was typed. Pure functions: no page access, no storage, no network.
  const MAX_LABEL = 80, MAX_QUERY = 80, MAX_ITEMS = 300;

  // Extra words that find a page without being in its name ("gpa" finds Provisional Result). Looked up by the normalized page name.
  const ALIASES = [
    [/provisional result|^result/, 'gpa cgpa marks grades grade semester results'],
    [/fee challan|challan/, 'fee fees payment pay voucher dues bank installment'],
    [/time ?table/, 'timetable schedule classes routine timing'],
    [/^attendance/, 'absent present absence percentage bunk'],
    [/registered courses/, 'enrolled subjects my courses'],
    [/register regular courses/, 'enroll add subjects registration'],
    [/offered courses/, 'available subjects'],
    [/credits? transfer/, 'transfer'],
    [/exam seating/, 'seat room venue datesheet paper'],
    [/community service/, 'hours volunteer'],
    [/quality assurance/, 'survey feedback evaluation teacher'],
    [/academic documents/, 'transcript degree certificate'],
    [/scholarship/, 'financial aid funding'],
    [/^forms$/, 'application request'],
    [/profile/, 'personal details info my account name'],
    [/email account/, 'mail outlook microsoft office'],
    [/suggestion box/, 'complaint feedback'],
    [/convocation/, 'graduation degree'],
    [/thesis/, 'fyp project final year'],
    [/go to lms/, 'learning management moodle'],
    [/^assignments?$/, 'homework tasks deadline due submit'],
    [/^quizz?es$|^quiz$/, 'test'],
    [/lecture notes/, 'slides material handouts'],
    [/course outline/, 'syllabus'],
    [/course plan/, 'weekly plan topics'],
    [/^papers$/, 'past paper exam old'],
    [/miscellaneous/, 'other extra files'],
    [/online library/, 'books ebooks research'],
    [/^faqs?$/, 'help questions support'],
    [/announcements/, 'news notices updates'],
    [/guidelines/, 'rules policy'],
    [/^dashboard$/, 'home overview start']
  ];

  // lower-case, accents removed, anything that is not a letter or digit becomes a space
  function normalize(text) {
    return String(text === undefined || text === null ? '' : text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  const clean = text => String(text === undefined || text === null ? '' : text).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

  // A link is usable only if it is an ordinary web page on this site or on a bahria.edu.pk address.
  function safeUrl(href, base) {
    if (typeof href !== 'string' || !href.trim() || href.trim().startsWith('#')) return null;
    let url, origin;
    try { url = new URL(href.trim(), base); origin = new URL(base); } catch (e) { return null; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== origin.protocol) return null;   // no javascript:, data:, blob:, file: ...
    if (url.username || url.password) return null;                                  // never a link with a name and password in it
    if (url.origin === origin.origin) return url.href;                              // the page's own site (also the preview)
    const host = url.hostname.toLowerCase();
    return host === 'bahria.edu.pk' || host.endsWith('.bahria.edu.pk') ? url.href : null;
  }

  // links: [{ label, group, href }] as found in the page's menu. Returns the searchable list, in the menu's own order.
  function build(links, base) {
    const out = [], seen = new Set();
    (Array.isArray(links) ? links : []).slice(0, MAX_ITEMS * 2).forEach(link => {
      if (!link || typeof link !== 'object' || out.length >= MAX_ITEMS) return;
      const label = clean(link.label), group = clean(link.group), href = safeUrl(link.href, base);
      if (!label || !href || /^https?:/i.test(label) || seen.has(href)) return;
      seen.add(href);
      const name = normalize(label), alias = ALIASES.filter(([re]) => re.test(name)).map(([, words]) => words).join(' ');
      out.push({ label, group, href, name, groupName: normalize(group), alias: alias });
    });
    return out;
  }

  // one edit apart (a letter more, fewer, different, or two neighbours swapped)
  function within1(a, b) {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
  }
  // the typed letters appear in order, starting at the beginning of one of the page's words ("prvres" -> Provisional Result)
  function subsequence(token, words) {
    return words.some((word, w) => {
      if (word[0] !== token[0]) return false;
      let i = 0; for (const ch of words.slice(w).join('')) if (ch === token[i] && ++i === token.length) return true;
      return false;
    });
  }

  // How well one typed word matches one page (0 = not at all). Page name beats group name beats related words.
  function scoreToken(token, item) {
    const name = item.name, words = name.split(' ');
    if (name === token) return 100;
    if (name.startsWith(token)) return 80;
    if (words.some(w => w.startsWith(token))) return 70;
    if (name.includes(token)) return 50;
    const alias = item.alias ? item.alias.split(' ') : [];
    if (alias.includes(token)) return 60;
    if (alias.some(w => w.startsWith(token))) return 45;
    if (item.groupName.split(' ').some(w => w.startsWith(token))) return 30;
    if (item.groupName.includes(token)) return 20;
    if (token.length >= 5 && words.concat(alias).some(w => w.length >= 4 && within1(token, w))) return 25;
    if (token.length >= 4 && subsequence(token, words)) return 15;
    return 0;
  }

  // items: from build(). Every typed word must match something; results are best first, ties keep the menu's order.
  function rank(items, query, limit) {
    const list = Array.isArray(items) ? items : [];
    const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
    const q = normalize(String(query === undefined || query === null ? '' : query).slice(0, MAX_QUERY));
    if (!q) return list.slice(0, cap).map(item => ({ item, score: 0 }));
    const tokens = q.split(' ').slice(0, 6);
    const scored = [];
    list.forEach((item, index) => {
      let total = 0;
      for (const token of tokens) { const s = scoreToken(token, item); if (!s) return; total += s; }
      if (item.name.startsWith(q)) total += 20;
      scored.push({ item, score: total, index });
    });
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.slice(0, cap).map(({ item, score }) => ({ item, score }));
  }

  // The parts of a label to highlight for a query: [[start, end], ...] over the original label (case and accents ignored when possible).
  function marks(label, query) {
    const text = String(label || ''), lower = text.toLowerCase(), found = [];
    normalize(query).split(' ').filter(Boolean).slice(0, 6).forEach(token => {
      const at = lower.indexOf(token);
      if (at >= 0) found.push([at, at + token.length]);
    });
    found.sort((a, b) => a[0] - b[0]);
    const merged = [];
    found.forEach(r => { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r); });
    return merged;
  }

  root.BahriaSearch = { normalize, build, rank, marks, safeUrl, within1, MAX_ITEMS };
})(globalThis);
