// A small, careful zip reader for previewing Word, Excel and PowerPoint files (they are zip files inside) and plain .zip uploads.
// Uses the browser's own decompression (no libraries). Never writes anything, and never trusts the sizes a file claims about itself.
(function (root) {
  'use strict';
  const MAX_ENTRIES = 5000, MAX_ENTRY = 30 * 1024 * 1024, MAX_TOTAL = 80 * 1024 * 1024;

  function open(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 22) throw new Error('This is not a zip-based file.');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22, stop = Math.max(0, bytes.length - 22 - 65535); i >= stop; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This is not a zip-based file.');
    const count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdAt = dv.getUint32(eocd + 16, true);
    if (count === 0xffff || cdSize === 0xffffffff || cdAt === 0xffffffff) throw new Error('This archive is too large to preview.');
    if (count > MAX_ENTRIES || cdAt + cdSize > bytes.length) throw new Error('This archive looks damaged.');
    const names = new TextDecoder('utf-8'), entries = new Map();
    let p = cdAt;
    for (let i = 0; i < count; i++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('This archive looks damaged.');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true), at = dv.getUint32(p + 42, true);
      if (p + 46 + nameLen > bytes.length) throw new Error('This archive looks damaged.');
      const name = names.decode(bytes.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
      entries.set(name, { name, method, comp, size, at, encrypted: (flags & 1) === 1, dir: name.endsWith('/') });
      p += 46 + nameLen + extraLen + commentLen;
    }
    let spent = 0;
    // One entry's bytes, unpacked. Stops at the size limit however big the file claims (or lies) to be.
    async function read(name, limit = MAX_ENTRY) {
      const e = entries.get(name);
      if (!e || e.dir) throw new Error('Not in the file: ' + name);
      if (e.encrypted) throw new Error('This file is password protected.');
      if (e.size > limit || e.size > MAX_ENTRY) throw new Error('A part of this file is too large to preview.');
      if (dv.getUint32(e.at, true) !== 0x04034b50) throw new Error('This archive looks damaged.');
      const start = e.at + 30 + dv.getUint16(e.at + 26, true) + dv.getUint16(e.at + 28, true);
      if (start + e.comp > bytes.length) throw new Error('This archive looks damaged.');
      const packed = bytes.subarray(start, start + e.comp);
      let out;
      if (e.method === 0) out = packed.slice();
      else if (e.method === 8) {
        const reader = new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).body.getReader(), parts = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > limit || total > MAX_ENTRY) { try { await reader.cancel(); } catch (x) { /* stopped */ } throw new Error('A part of this file is too large to preview.'); }
          parts.push(value);
        }
        out = new Uint8Array(total); let o = 0; for (const v of parts) { out.set(v, o); o += v.length; }
      } else throw new Error('This file uses a compression the preview cannot read.');
      spent += out.length;
      if (spent > MAX_TOTAL) throw new Error('This file is too large to preview.');
      return out;
    }
    const readText = async (name, limit) => new TextDecoder('utf-8').decode(await read(name, limit));
    return { entries, has: n => entries.has(n), read, readText };
  }
  root.BahriaZip = { open, MAX_ENTRY };
})(globalThis);
