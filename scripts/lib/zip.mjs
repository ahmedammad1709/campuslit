// A small, dependency-free ZIP writer and reader (stored or deflated entries, UTF-8 names).
// The writer is deterministic: the same files always give the same bytes (fixed timestamp, sorted names).
import { deflateRawSync, inflateRawSync, crc32 } from 'node:zlib';

const DOS_DATE = ((1980 - 1980) << 9) | (1 << 5) | 1;   // 1980-01-01, the zip epoch
const MAX_ENTRY = 0xffffffff;

function checkName(name) {
  if (typeof name !== 'string' || !name) throw new Error('A zip entry needs a name.');
  if (name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(part => part === '..' || part === '' || part === '.')) throw new Error('Unsafe zip entry name: ' + name);
}

// files: Map<string, Buffer> (or an array of [name, Buffer]); returns a Buffer.
export function createZip(files) {
  const list = [...(files instanceof Map ? files.entries() : files)].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const seen = new Set(), locals = [], centrals = []; let offset = 0;
  for (const [name, data] of list) {
    checkName(name);
    if (seen.has(name)) throw new Error('Duplicate zip entry: ' + name);
    seen.add(name);
    if (!Buffer.isBuffer(data)) throw new Error('Entry data must be a Buffer: ' + name);
    if (data.length > MAX_ENTRY || offset > MAX_ENTRY) throw new Error('Too large for a plain zip: ' + name);
    const nameBytes = Buffer.from(name, 'utf8'), crc = crc32(data);
    let method = 8, body = deflateRawSync(data, { level: 9 });
    if (body.length >= data.length) { method = 0; body = data; }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((0o100644 << 16) >>> 0), 38); central.writeUInt32LE(offset, 42);   // -rw-r--r-- for unzip on Linux and macOS
    locals.push(local, nameBytes, body); centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  if (list.length > 0xffff || centralSize > MAX_ENTRY || offset > MAX_ENTRY) throw new Error('Too many or too large files for a plain zip.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// Reads a zip back (and checks every checksum and size); returns Map<string, Buffer>.
export function readZip(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('Not a zip file (no end record).');
  const count = buffer.readUInt16LE(end + 10); let at = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('Damaged zip (central directory).');
    const method = buffer.readUInt16LE(at + 10), crc = buffer.readUInt32LE(at + 16), csize = buffer.readUInt32LE(at + 20), usize = buffer.readUInt32LE(at + 24);
    const nameLen = buffer.readUInt16LE(at + 28), extraLen = buffer.readUInt16LE(at + 30), commentLen = buffer.readUInt16LE(at + 32), local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLen);
    checkName(name.endsWith('/') ? name.slice(0, -1) : name);
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('Damaged zip (entry ' + name + ').');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28), body = buffer.subarray(start, start + csize);
    const data = method === 0 ? Buffer.from(body) : method === 8 ? inflateRawSync(body) : null;
    if (!data) throw new Error('Unsupported compression in ' + name);
    if (data.length !== usize || crc32(data) !== crc) throw new Error('Checksum mismatch in ' + name);
    if (files.has(name)) throw new Error('Duplicate zip entry: ' + name);
    files.set(name, data);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
