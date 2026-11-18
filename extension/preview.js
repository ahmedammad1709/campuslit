// File preview, the pure part: which addresses may be opened, what kind of file a link points to, and whether the bytes really are that kind.
// Nothing here touches the page or the network, so it is tested on its own (tests/preview.test.cjs).
(function (root) {
  'use strict';
  const MAX_BYTES = 25 * 1024 * 1024;              // the largest file that is opened for a preview
  const HOST = 'lms.bahria.edu.pk', PATH = /^\/student\/download\.php$/i;

  // The only addresses that may ever be fetched: the LMS's own Download.php, on the very site the page is on, carrying its k= code. Anything else is refused.
  function fileUrl(href, base) {
    try {
      const page = new URL(base), u = new URL(href, page);
      if (u.origin !== page.origin || u.hostname !== HOST || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
      if (!PATH.test(u.pathname) || !u.searchParams.get('k') || u.username || u.password) return null;
      return u.href;
    } catch (e) { return null; }
  }

  // The portal puts what it knows about the file inside k= (base64 of: id, date, kind, flag, file name, page). Only the file name and its extension are used.
  function parseKey(href) {
    try {
      const k = new URL(href, 'https://' + HOST + '/').searchParams.get('k');
      if (!k) return null;
      const text = new TextDecoder('utf-8').decode(Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
      const parts = text.split(',');
      if (parts.length < 5) return null;
      const name = parts.slice(4, -1).join(',').replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 180);
      const dot = name.lastIndexOf('.');
      if (!name || dot < 1) return null;
      return { source: parts[2] || '', name, ext: name.slice(dot + 1).toLowerCase() };
    } catch (e) { return null; }
  }

  // The portal now scrambles k=, so the link no longer says what the file is. The answer comes back with the file: its name in Content-Disposition, its Content-Type, or at last its first bytes.
  function nameFromHeaders(headers) {
    const cd = headers && headers.get && headers.get('content-disposition') || '';
    let m = /filename\*\s*=\s*utf-8''([^;]+)/i.exec(cd), name = '';
    if (m) { try { name = decodeURIComponent(m[1].trim().replace(/^"|"$/g, '')); } catch (e) { name = m[1]; } }
    else if ((m = /filename\s*=\s*"([^"]*)"/i.exec(cd)) || (m = /filename\s*=\s*([^;]+)/i.exec(cd))) name = m[1].trim();
    name = name.replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 180);
    const dot = name.lastIndexOf('.');
    return name && dot > 0 ? { name, ext: name.slice(dot + 1).toLowerCase() } : null;
  }
  const TYPES = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'text/plain': 'txt', 'text/csv': 'csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt' };
  const extFromType = type => TYPES[String(type || '').split(';')[0].trim().toLowerCase()] || '';
  function extFromBytes(b) {
    if (!b || b.length < 4) return '';
    if (starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
    if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return 'png';
    if (starts(b, [0xff, 0xd8, 0xff])) return 'jpg';
    if (starts(b, [0x47, 0x49, 0x46, 0x38])) return 'gif';
    if (starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
    if (starts(b, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
    if (starts(b, [0xd0, 0xcf, 0x11, 0xe0])) return 'doc';   // an old Office file
    return '';
  }

  const KINDS = { pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', txt: 'text', csv: 'text', log: 'text', md: 'text', docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', zip: 'zip', doc: 'legacy', xls: 'legacy', ppt: 'legacy' };
  const SUPPORTED = new Set(['pdf', 'image', 'text', 'docx']);   // grows step by step: spreadsheets, slides and archives come next
  const starts = (b, sig, at = 0) => sig.every((v, i) => b[at + i] === v);
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', csv: 'text/plain', log: 'text/plain', md: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip' };
  const kindOf = ext => KINDS[String(ext || '').toLowerCase()] || 'other';
  const supported = ext => SUPPORTED.has(kindOf(ext));
  const mimeFor = ext => MIME[String(ext || '').toLowerCase()] || 'application/octet-stream';

  // The bytes must look like the kind of file the name claims. A page that says "PDF" but sends something else is never shown.
  function sniff(bytes, ext) {
    const b = bytes, kind = kindOf(ext);
    if (!b || !b.length) return false;
    if (kind === 'pdf') { for (let i = 0; i < Math.min(b.length - 4, 1024); i++) if (starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return true; return false; }   // "%PDF-" near the start
    if (kind === 'image') {
      const e = String(ext).toLowerCase();
      if (e === 'png') return starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (e === 'jpg' || e === 'jpeg') return starts(b, [0xff, 0xd8, 0xff]);
      if (e === 'gif') return starts(b, [0x47, 0x49, 0x46, 0x38]);
      if (e === 'webp') return starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8);
      return false;
    }
    if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx' || kind === 'zip') return starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06]);
    if (kind === 'text') { for (let i = 0; i < Math.min(b.length, 4096); i++) if (b[i] === 0) return false; return true; }   // no binary bytes
    return false;
  }

  const readableSize = n => !Number.isFinite(n) || n < 0 ? '' : n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (Math.round(n / 104857.6) / 10) + ' MB';

  root.BahriaPreview = { MAX_BYTES, fileUrl, parseKey, nameFromHeaders, extFromType, extFromBytes, kindOf, supported, mimeFor, sniff, readableSize };
})(globalThis);
