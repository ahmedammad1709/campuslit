(function (root) {
  'use strict';
  // Theme sharing: a custom theme as one short text code ("CL1-..."), and back. Nothing is sent anywhere: the code is just the theme's name and colours,
  // packed into a few dozen characters that can be pasted into a chat. Pure logic, no browser access; the settings page does the copying and pasting.
  //
  // What is inside, before it is turned into text: a version byte, a flags byte (which of the five optional colours are set), the five main colours
  // (3 bytes each), the optional ones that are set, the name (UTF-8) and a 2-byte check so a code that lost a character on the way is caught.
  const PREFIX = 'CL1-', VERSION = 1, MAX_CODE = 400;
  const ESSENTIAL = ['bg', 'surface', 'nav', 'ink', 'accent'], OPTIONAL = ['soft', 'line', 'muted', 'navInk', 'gold'];
  const HEX = /^#[0-9a-f]{6}$/i;

  function crc16(bytes) {   // CRC-16/CCITT-FALSE
    let crc = 0xffff;
    for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
    return crc;
  }
  const toB64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  function fromB64(text) {
    const s = text.replace(/-/g, '+').replace(/_/g, '/'), padded = s + '='.repeat((4 - s.length % 4) % 4), bin = atob(padded), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const hexBytes = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const bytesHex = (b, at) => '#' + [0, 1, 2].map(i => b[at + i].toString(16).padStart(2, '0')).join('');

  // custom: a theme as the settings keep it (name, five colours, optional colours that may be ''). Returns the code, or '' when the theme is not complete.
  function encode(custom) {
    if (!custom || typeof custom !== 'object' || !ESSENTIAL.every(k => typeof custom[k] === 'string' && HEX.test(custom[k]))) return '';
    let flags = 0;
    OPTIONAL.forEach((k, i) => { if (typeof custom[k] === 'string' && HEX.test(custom[k])) flags |= 1 << i; });
    const name = new TextEncoder().encode(String(custom.name || '').slice(0, 24)), body = [VERSION, flags];
    for (const k of ESSENTIAL) body.push(...hexBytes(custom[k]));
    OPTIONAL.forEach((k, i) => { if (flags & (1 << i)) body.push(...hexBytes(custom[k])); });
    body.push(name.length, ...name);
    const crc = crc16(body);
    return PREFIX + toB64(Uint8Array.from([...body, crc >> 8, crc & 0xff]));
  }

  // text: whatever was pasted (a bare code, or a message with a code inside it). normalizeCustom: the same validator the saved themes go through.
  // Returns { ok: true, custom } or { ok: false, reason: 'empty' | 'notcode' | 'damaged' | 'newer' | 'invalid' }.
  function decode(text, normalizeCustom) {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw) return { ok: false, reason: 'empty' };
    const found = /CL1-([A-Za-z0-9_-]{12,400})/i.exec(raw.slice(0, 2000));
    if (!found || found[0].length > MAX_CODE) return { ok: false, reason: 'notcode' };
    let bytes;
    try { bytes = fromB64(found[1]); } catch (e) { return { ok: false, reason: 'damaged' }; }
    if (bytes.length < 2 + 15 + 1 + 2) return { ok: false, reason: 'damaged' };
    const body = bytes.subarray(0, bytes.length - 2), crc = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
    if (crc16(body) !== crc) return { ok: false, reason: 'damaged' };
    if (body[0] !== VERSION) return { ok: false, reason: body[0] > VERSION ? 'newer' : 'damaged' };
    const flags = body[1]; let at = 2;
    const input = {};
    if (body.length < at + 15) return { ok: false, reason: 'damaged' };
    for (const k of ESSENTIAL) { input[k] = bytesHex(body, at); at += 3; }
    for (let i = 0; i < OPTIONAL.length; i++) {
      if (flags & (1 << i)) { if (body.length < at + 3) return { ok: false, reason: 'damaged' }; input[OPTIONAL[i]] = bytesHex(body, at); at += 3; } else input[OPTIONAL[i]] = '';
    }
    const n = body[at++];
    if (n > 96 || at + n !== body.length) return { ok: false, reason: 'damaged' };
    try { input.name = new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(at, at + n)); } catch (e) { return { ok: false, reason: 'damaged' }; }
    const custom = normalizeCustom(input);
    return custom ? { ok: true, custom } : { ok: false, reason: 'invalid' };
  }

  const MESSAGES = {
    empty: 'Paste a theme code first.',
    notcode: 'That does not look like a Campuslit theme code. It starts with CL1-.',
    damaged: 'That code looks damaged or cut short. Ask for it again and paste all of it.',
    newer: 'That code is from a newer Campuslit. Update Campuslit, then try again.',
    invalid: 'That code does not hold a usable theme.'
  };

  root.BahriaShare = { PREFIX, encode, decode, MESSAGES };
})(globalThis);
