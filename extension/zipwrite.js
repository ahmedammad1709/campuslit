(function (root) {
  'use strict';
  // A small zip writer, for "Download all lecture notes". It builds the archive in memory (as a Blob) from files that were fetched one at a time,
  // compressing each with the browser's own CompressionStream (no libraries), and never writes or sends anything itself.
  // Files that are already compressed (Office files, PDFs of scans, images, archives) are stored as they are: compressing them again only costs time.
  const MAX_FILES = 500, MAX_FILE = 0xfffffffe, MAX_TOTAL = 0xfffffffe;
  const STORE_ONLY = new Set(['zip', 'docx', 'pptx', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'mp4', 'm4a', 'mov', '7z', 'rar', 'gz']);

  const table = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  // A name that is safe inside an archive and on every operating system: no folders, no reserved characters, no leading dots, no control characters.
  function safeName(name, fallback) {
    let n = String(name === undefined || name === null ? '' : name).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^[. -]+/, '').replace(/[. ]+$/, '');
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(n)) n = '_' + n;     // names Windows will not accept
    if (n.length > 120) { const dot = n.lastIndexOf('.'), ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : ''; n = n.slice(0, 120 - ext.length).replace(/[\ud800-\udbff]$/, '') + ext; }
    return n || fallback || 'file';
  }
  // The same name again becomes "name (2).ext": compared without regard to case, as Windows and macOS do.
  function unique(taken, name) {
    const lower = s => s.toLowerCase();
    if (!taken.has(lower(name))) { taken.add(lower(name)); return name; }
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 2; i < 10000; i++) { const next = stem + ' (' + i + ')' + ext; if (!taken.has(lower(next))) { taken.add(lower(next)); return next; } }
    throw new Error('Too many files with the same name.');
  }
  const extOf = name => { const dot = name.lastIndexOf('.'); return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''; };

  async function deflate(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); } catch (e) { return null; }
  }
  function dosTime(date) {
    const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const year = Math.min(2107, Math.max(1980, d.getFullYear()));
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }

  // A writer collects files one at a time (add) and gives the finished archive as a Blob (finish).
  function writer(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const stamp = dosTime(o.now instanceof Date ? o.now : new Date());
    const parts = [], central = [], names = new Set(); let offset = 0, total = 0;
    const enc = new TextEncoder();
    const u16 = n => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
    const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
    const cat = (...list) => { const n = list.reduce((a, b) => a + b.length, 0), out = new Uint8Array(n); let at = 0; for (const b of list) { out.set(b, at); at += b.length; } return out; };
    return {
      get count() { return central.length; },
      get size() { return total; },
      // bytes: Uint8Array. Returns the name it was stored under.
      async add(name, bytes) {
        if (!(bytes instanceof Uint8Array)) throw new Error('A file must be bytes.');
        if (central.length >= MAX_FILES) throw new Error('Too many files for one archive.');
        if (bytes.length > MAX_FILE || total + bytes.length > MAX_TOTAL) throw new Error('This archive would be too large.');
        const stored = unique(names, safeName(name)), nm = enc.encode(stored);
        const crc = crc32(bytes);
        let method = 0, data = bytes;
        if (bytes.length > 64 && !STORE_ONLY.has(extOf(stored))) { const packed = await deflate(bytes); if (packed && packed.length < bytes.length) { method = 8; data = packed; } }
        const head = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(stamp.time), u16(stamp.date), u32(crc), u32(data.length), u32(bytes.length), u16(nm.length), u16(0), nm);   // 0x0800: the name is UTF-8
        central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method), u16(stamp.time), u16(stamp.date), u32(crc), u32(data.length), u32(bytes.length), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nm));
        parts.push(head, data); offset += head.length + data.length; total += bytes.length;
        return stored;
      },
      finish() {
        const dir = cat(...central), end = cat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(dir.length), u32(offset), u16(0));
        return new Blob([...parts, dir, end], { type: 'application/zip' });
      }
    };
  }

  root.BahriaZipWrite = { writer, safeName, unique, crc32, MAX_FILES, MAX_TOTAL };
})(globalThis);
