// Small invented Office files for the tests, built byte by byte: a zip writer, .xlsx and .pptx samples, a compound-file writer, and .doc, .xls and .ppt samples.
// Nothing here is a real person's file. The samples exist to prove the preview readers against the real file layouts, in unit tests and in real Chrome.
import zlib from 'node:zlib';

const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zipOf(files) {
  const locals = [], central = []; let offset = 0;
  for (const [name, content] of files) {
    const raw = Buffer.from(content), data = zlib.deflateRawSync(raw), nm = Buffer.from(name), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nm, data); central.push(ch, nm); offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- .xlsx
export const excelSerial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
export function xlsxSample() {
  const M = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const strings = ['Name', 'Marks', 'Ammad', '<script>window.__pwned = 4</script>', 'Merged title'];
  const c = (ref, v, t, s) => `<c r="${ref}"${t ? ` t="${t}"` : ''}${s ? ` s="${s}"` : ''}>${v === null ? '' : `<v>${v}</v>`}</c>`;
  const sheet1 = `<worksheet ${M}><cols><col min="1" max="1" width="18" customWidth="1"/></cols><sheetData>`
    + `<row r="1">${c('A1', 0, 's')}${c('B1', 1, 's')}</row>`
    + `<row r="2">${c('A2', 2, 's')}${c('B2', 91.5, '', 1)}</row>`
    + `<row r="3"><c r="A3" t="inlineStr"><is><t>Inline text</t></is></c><c r="B3"><f>SUM(B2:B2)</f><v>91.5</v></c></row>`
    + `<row r="4">${c('A4', 3, 's')}${c('B4', 1, 'b')}${c('C4', '#DIV/0!', 'e')}</row>`
    + `<row r="5">${c('A5', 4, 's')}</row>`
    + `<row r="6">${c('A6', 0.256, '', 3)}${c('B6', 1234567.891, '', 5)}<c r="C6" s="1"/></row>`
    + `<row r="1200">${c('A1200', 2, 's')}</row>`
    + `</sheetData><mergeCells count="1"><mergeCell ref="A5:C5"/></mergeCells></worksheet>`;
  const sheet2 = `<worksheet ${M}><sheetData><row r="1">${c('A1', 2, 's')}</row></sheetData></worksheet>`;
  const sheet3 = `<worksheet ${M}><sheetData><row r="1">${c('A1', excelSerial(2026, 11, 17), '', 2)}${c('B1', excelSerial(2026, 11, 17), '', 4)}${c('C1', excelSerial(2026, 11, 17) + 0.5, '', 2)}</row></sheetData></worksheet>`;
  return zipOf([
    ['[Content_Types].xml', '<Types/>'],
    ['xl/workbook.xml', `<workbook ${M}><workbookPr/><sheets><sheet name="Marks" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId2"/><sheet name="Dates" sheetId="3" r:id="rId3"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', `<sst ${M}>${strings.map(s => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`],
    ['xl/styles.xml', `<styleSheet ${M}><numFmts count="2"><numFmt numFmtId="165" formatCode="d\\ mmm\\ yyyy"/><numFmt numFmtId="166" formatCode="#,##0.0"/></numFmts><cellXfs count="6"><xf numFmtId="0"/><xf numFmtId="2"/><xf numFmtId="14"/><xf numFmtId="9"/><xf numFmtId="165"/><xf numFmtId="166"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', sheet1], ['xl/worksheets/sheet2.xml', sheet2], ['xl/worksheets/sheet3.xml', sheet3],
  ]);
}

// ---------------------------------------------------------------- .pptx
export function pptxSample() {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"', T = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const xfrm = (x, y, w, h, extra = '') => `<a:xfrm${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
  const ph = (id, name, attrs, spPr, body) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr><p:ph ${attrs}/></p:nvPr></p:nvSpPr><p:spPr>${spPr}</p:spPr>${body}</p:sp>`;
  const para = (t, ppr = '', rpr = '') => `<a:p>${ppr}<a:r>${rpr}<a:t>${esc(t)}</a:t></a:r></a:p>`;
  const tx = (...ps) => `<p:txBody><a:bodyPr/><a:lstStyle/>${ps.join('')}</p:txBody>`;
  const master = `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>`
    + ph(2, 'Title', 'type="title"', xfrm(457200, 274638, 8229600, 1143000), tx(para('Click to edit the title')))
    + ph(3, 'Body', 'type="body" idx="1"', xfrm(457200, 1600200, 8229600, 4525963), tx(para('Click to edit the text')))
    + `<p:sp><p:nvSpPr><p:cNvPr id="9" name="Band"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 6400800, 9144000, 457200)}<a:prstGeom prst="rect"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>`
    + `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/><p:txStyles>`
    + `<p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4000"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill></a:defRPr></a:lvl1pPr></p:titleStyle>`
    + `<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="&#8226;"/><a:defRPr sz="2800"/></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750"><a:buChar char="&#8211;"/><a:defRPr sz="2400"/></a:lvl2pPr></p:bodyStyle>`
    + `<p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const layout = `<p:sldLayout ${NS}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${ph(2, 'Title', 'type="title"', '', tx(para('Title')))}${ph(3, 'Content', 'idx="1"', '', tx(para('Text')))}</p:spTree></p:cSld></p:sldLayout>`;
  const slide1 = `<p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>`
    + ph(2, 'Title', 'type="title"', '', tx(para('Operating Systems')))
    + ph(3, 'Content', 'idx="1"', '', tx(para('Processes and threads'), para('Scheduling', '<a:pPr lvl="1"/>'), para('<script>window.__pwned = 6</script>')))
    + `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Note"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(5486400, 4800600, 3200400, 914400)}<a:prstGeom prst="rect"/></p:spPr>${tx(para('Free text box', '', '<a:rPr sz="2000" b="1"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill></a:rPr>'))}</p:sp>`
    + `<p:pic><p:nvPicPr><p:cNvPr id="5" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr>${xfrm(7772400, 228600, 914400, 914400)}</p:spPr></p:pic>`
    + `</p:spTree></p:cSld></p:sld>`;
  const cell = t => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(t)}</a:txBody><a:tcPr/></a:tc>`;
  const slide2 = `<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="1F3864"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>`
    + ph(2, 'Title', 'type="title"', '', tx(para('Dark slide')))
    + `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(457200, 1600200, 6400800, 1371600).replace(/a:xfrm/g, 'p:xfrm')}<a:graphic><a:graphicData><a:tbl><a:tblGrid><a:gridCol w="3200400"/><a:gridCol w="3200400"/></a:tblGrid>`
    + `<a:tr h="457200">${cell('Layer')}${cell('Protocol')}</a:tr><a:tr h="457200">${cell('Transport')}${cell('TCP')}</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="7" name="Dot"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(457200, 3657600, 1828800, 1828800)}<a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="F4B400"/></a:solidFill></p:spPr>${tx(para('Round'))}</p:sp>`
    + `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="8" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(3200400, 3657600, 3657600, 2286000).replace(/a:xfrm/g, 'p:xfrm')}<a:graphic><a:graphicData uri="chart"/></a:graphic></p:graphicFrame>`
    + `</p:spTree></p:cSld></p:sld>`;
  const theme = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="t"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="2F5597"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`;
  return zipOf([
    ['[Content_Types].xml', '<Types/>'],
    ['ppt/presentation.xml', `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships ${REL}><Relationship Id="rId1" Type="${T}slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${T}slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${T}slide" Target="slides/slide2.xml"/><Relationship Id="rId4" Type="${T}theme" Target="theme/theme1.xml"/></Relationships>`],
    ['ppt/theme/theme1.xml', theme],
    ['ppt/slideMasters/slideMaster1.xml', master],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', `<Relationships ${REL}><Relationship Id="rId1" Type="${T}slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/slideLayouts/slideLayout1.xml', layout],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<Relationships ${REL}><Relationship Id="rId1" Type="${T}slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', slide1], ['ppt/slides/slide2.xml', slide2],
    ['ppt/slides/_rels/slide1.xml.rels', `<Relationships ${REL}><Relationship Id="rId1" Type="${T}slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${T}image" Target="../media/image1.png"/></Relationships>`],
    ['ppt/slides/_rels/slide2.xml.rels', `<Relationships ${REL}><Relationship Id="rId1" Type="${T}slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`],
    ['ppt/media/image1.png', PNG],
  ]);
}

// ---------------------------------------------------------------- the old compound file (OLE2) writer: 512-byte sectors, small streams in the mini stream
export function cfb(streams) {
  const SS = 512, MS = 64, CUT = 4096, FREE = 0xffffffff, END = 0xfffffffe, FATSEC = 0xfffffffd;
  const big = streams.filter(([, d]) => d.length >= CUT), small = streams.filter(([, d]) => d.length < CUT);
  const secs = n => Math.ceil(n / SS);
  // the mini stream: every small stream padded to 64-byte pieces
  const miniParts = [], miniStart = new Map(); let miniCount = 0; const miniFat = [];
  for (const [name, d] of small) {
    const n = Math.max(1, Math.ceil(d.length / MS)); miniStart.set(name, miniCount);
    for (let i = 0; i < n; i++) miniFat.push(i === n - 1 ? END : miniCount + i + 1);
    const pad = Buffer.alloc(n * MS); d.copy(pad); miniParts.push(pad); miniCount += n;
  }
  const miniData = Buffer.concat(miniParts), miniFatBuf = Buffer.alloc(Math.max(1, secs(miniFat.length * 4)) * SS, 0xff); miniFat.forEach((v, i) => miniFatBuf.writeUInt32LE(v, i * 4));
  const entries = streams.length + 1, dirSecs = secs(entries * 128);
  // plan the sector numbers: big streams, the mini stream, the mini FAT, the directory, then the FAT itself
  let next = 0; const plan = {};
  for (const [name, d] of big) { plan[name] = { start: next, n: secs(d.length) }; next += plan[name].n; }
  const miniSecs = miniData.length ? secs(miniData.length) : 0, miniAt = next; next += miniSecs;
  const miniFatAt = next, miniFatSecs = small.length ? miniFatBuf.length / SS : 0; next += miniFatSecs;
  const dirAt = next; next += dirSecs;
  let fatSecs = 1; while ((next + fatSecs) > fatSecs * 128) fatSecs++;
  const fatAt = next, total = next + fatSecs;
  const fat = new Array(fatSecs * 128).fill(FREE);
  const chain = (start, n) => { for (let i = 0; i < n; i++) fat[start + i] = i === n - 1 ? END : start + i + 1; };
  for (const name of Object.keys(plan)) chain(plan[name].start, plan[name].n);
  if (miniSecs) chain(miniAt, miniSecs); if (miniFatSecs) chain(miniFatAt, miniFatSecs); chain(dirAt, dirSecs);
  for (let i = 0; i < fatSecs; i++) fat[fatAt + i] = FATSEC;
  const header = Buffer.alloc(SS, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x3e, 24); header.writeUInt16LE(3, 26); header.writeUInt16LE(0xfffe, 28); header.writeUInt16LE(9, 30); header.writeUInt16LE(6, 32);
  header.writeUInt32LE(fatSecs, 44); header.writeUInt32LE(dirAt, 48); header.writeUInt32LE(CUT, 56); header.writeUInt32LE(miniFatSecs ? miniFatAt : END, 60); header.writeUInt32LE(miniFatSecs, 64);
  header.writeUInt32LE(END, 68); header.writeUInt32LE(0, 72);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i < fatSecs ? fatAt + i : FREE, 76 + i * 4);
  const dir = Buffer.alloc(dirSecs * SS, 0);
  const entry = (i, name, type, start, size, child = FREE, right = FREE) => {
    const o = i * 128, nm = Buffer.from(name, 'utf16le'); nm.copy(dir, o); dir.writeUInt16LE(nm.length + 2, o + 64); dir[o + 66] = type; dir[o + 67] = 1;
    dir.writeUInt32LE(FREE, o + 68); dir.writeUInt32LE(right, o + 72); dir.writeUInt32LE(child, o + 76); dir.writeUInt32LE(start, o + 116); dir.writeUInt32LE(size, o + 120);
  };
  entry(0, 'Root Entry', 5, miniSecs ? miniAt : END, miniData.length, streams.length ? 1 : FREE);
  streams.forEach(([name, d], i) => entry(i + 1, name, 2, d.length >= CUT ? plan[name].start : miniStart.get(name), d.length, FREE, i + 2 <= streams.length ? i + 2 : FREE));
  const body = Buffer.alloc(total * SS, 0);
  for (const [name, d] of big) d.copy(body, plan[name].start * SS);
  miniData.copy(body, miniAt * SS); if (miniFatSecs) miniFatBuf.copy(body, miniFatAt * SS); dir.copy(body, dirAt * SS);
  fat.forEach((v, i) => body.writeUInt32LE(v, fatAt * SS + i * 4));
  return Buffer.concat([header, body]);
}

// ---------------------------------------------------------------- .doc (Word 97-2003): text with a piece table
export function docSample(text) {
  const raw = Buffer.from(text, 'latin1'), w = Buffer.alloc(4096 + 1024);
  w.writeUInt16LE(0xa5ec, 0); w.writeUInt16LE(0x0200, 10); w.writeUInt32LE(raw.length, 0x4c);
  raw.copy(w, 0x400);
  const prc = Buffer.from([1, 0, 0]), plc = Buffer.alloc(16); plc.writeUInt32LE(0, 0); plc.writeUInt32LE(raw.length, 4); plc.writeUInt32LE((0x400 * 2 | 0x40000000) >>> 0, 10);
  const pcdt = Buffer.concat([Buffer.from([2]), Buffer.from(new Uint32Array([plc.length]).buffer), plc]), clx = Buffer.concat([prc, pcdt]);
  w.writeUInt32LE(0, 0x1a2); w.writeUInt32LE(clx.length, 0x1a6);
  return cfb([['WordDocument', w], ['1Table', clx]]);   // the table stream is small, so it lives in the mini stream
}

// ---------------------------------------------------------------- .xls (Excel 97-2003, BIFF8)
const rec = (id, data = Buffer.alloc(0)) => { const h = Buffer.alloc(4); h.writeUInt16LE(id, 0); h.writeUInt16LE(data.length, 2); return Buffer.concat([h, data]); };
const u16 = (...v) => { const b = Buffer.alloc(v.length * 2); v.forEach((x, i) => b.writeUInt16LE(x, i * 2)); return b; };
const u32 = (...v) => { const b = Buffer.alloc(v.length * 4); v.forEach((x, i) => b.writeUInt32LE(x >>> 0, i * 4)); return b; };
const f64 = x => { const b = Buffer.alloc(8); b.writeDoubleLE(x, 0); return b; };
const xlStr = (s, wide = false) => Buffer.concat([u16(s.length), Buffer.from([wide ? 1 : 0]), Buffer.from(s, wide ? 'utf16le' : 'latin1')]);
export function xlsSample() {
  const bof = dt => rec(0x0809, Buffer.concat([u16(0x0600, dt, 0x0dbb, 0x07cc), u32(0, 6)]));
  const SCRIPT = '<script>window.__pwned = 5</script>';
  // the shared strings: "ABCDEFGHIJ" is split between the table and its CONTINUE record, which starts with the flag byte for the rest
  const sstA = Buffer.concat([u32(5, 5), xlStr('Name'), xlStr('Marks'), xlStr('Ammad'), Buffer.concat([u16(10), Buffer.from([0]), Buffer.from('ABCD', 'latin1')])]);
  const sstB = Buffer.concat([Buffer.from([0]), Buffer.from('EFGHIJ', 'latin1'), xlStr(SCRIPT, true)]);
  const xf = ifmt => rec(0x00e0, Buffer.concat([u16(0, ifmt), Buffer.alloc(16)]));
  const sheetNames = ['Marks', 'Hidden'];
  const globalsBody = Buffer.concat([rec(0x0022, u16(0)), rec(0x041e, Buffer.concat([u16(165), xlStr('d mmm yyyy')])), xf(0), xf(2), xf(14), xf(165), rec(0x00fc, sstA), rec(0x003c, sstB)]);
  const mkSheet = () => Buffer.concat([
    bof(0x10),
    rec(0x007d, u16(0, 0, 18 * 256, 0, 0, 0)),
    rec(0x00fd, Buffer.concat([u16(0, 0, 0), u32(0)])), rec(0x00fd, Buffer.concat([u16(0, 1, 0), u32(1)])),
    rec(0x00fd, Buffer.concat([u16(1, 0, 0), u32(2)])), rec(0x0203, Buffer.concat([u16(1, 1, 1), f64(91.5)])),
    rec(0x00fd, Buffer.concat([u16(2, 0, 0), u32(3)])), rec(0x027e, Buffer.concat([u16(2, 1, 0), u32((42 << 2) | 2)])), rec(0x027e, Buffer.concat([u16(2, 2, 0), u32((12345 << 2) | 3)])),
    rec(0x00bd, Buffer.concat([u16(2, 3), u16(0), u32((7 << 2) | 2), u16(0), u32((8 << 2) | 2), u16(4)])),
    rec(0x00fd, Buffer.concat([u16(3, 0, 0), u32(4)])),
    rec(0x0006, Buffer.concat([u16(3, 1, 0), f64(7), u16(0), u32(0), u16(0)])),
    rec(0x0006, Buffer.concat([u16(4, 0, 0), Buffer.from([0, 0, 0, 0, 0, 0, 0xff, 0xff]), u16(0), u32(0), u16(0)])), rec(0x0207, xlStr('calc')),
    rec(0x0205, Buffer.concat([u16(5, 0, 0), Buffer.from([1, 0])])), rec(0x0205, Buffer.concat([u16(5, 1, 0), Buffer.from([7, 1])])),
    rec(0x0203, Buffer.concat([u16(6, 0, 2), f64(46343)])), rec(0x0203, Buffer.concat([u16(6, 1, 3), f64(46343)])),
    rec(0x00e5, Buffer.concat([u16(1), u16(7, 7, 0, 2)])),
    rec(0x000a),
  ]);
  const sheet = mkSheet(), hidden = bof(0x10), hiddenSheet = Buffer.concat([hidden, rec(0x00fd, Buffer.concat([u16(0, 0, 0), u32(2)])), rec(0x000a)]);
  const boundLen = name => rec(0x0085, Buffer.concat([u32(0), Buffer.from([0, 0, name.length, 0]), Buffer.from(name, 'latin1')])).length;
  const globalsLen = bof(5).length + globalsBody.length + boundLen(sheetNames[0]) + boundLen(sheetNames[1]) + rec(0x000a).length;
  const bound = (name, pos, state) => rec(0x0085, Buffer.concat([u32(pos), Buffer.from([state, 0, name.length, 0]), Buffer.from(name, 'latin1')]));
  const wb = Buffer.concat([bof(5), globalsBody, bound('Marks', globalsLen, 0), bound('Hidden', globalsLen + sheet.length, 1), rec(0x000a), sheet, hiddenSheet]);
  const pad = Buffer.alloc(Math.max(4096, wb.length)); wb.copy(pad);
  return cfb([['Workbook', pad]]);
}

// ---------------------------------------------------------------- .ppt (PowerPoint 97-2003): the text records
export function pptSample() {
  const r = (ver, inst, type, body = Buffer.alloc(0)) => { const h = Buffer.alloc(8); h.writeUInt16LE((inst << 4) | ver, 0); h.writeUInt16LE(type, 2); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };
  const header = kind => r(0, 0, 0x0f9f, u32(kind)), chars = s => r(0, 0, 0x0fa0, Buffer.from(s, 'utf16le')), bytes = s => r(0, 0, 0x0fa8, Buffer.from(s, 'latin1'));
  const persist = id => r(0, 0, 0x03f3, Buffer.concat([u32(0, 0, id, 0), u32(0)]));
  const list = r(15, 0, 0x0ff0, Buffer.concat([
    persist(256), header(0), chars('Networks 101'), header(1), bytes('Layers\rTCP and UDP\x0bsecond line'),
    persist(257), header(0), chars('<script>window.__pwned = 7</script>'), header(1), bytes('Last point'),
  ]));
  const doc = r(15, 0, 0x03e8, list);
  const slide = text => r(15, 0, 0x03ee, r(15, 0, 0x040c, r(15, 0, 0xf00d, Buffer.concat([header(4), chars(text)]))));
  const stream = Buffer.concat([doc, slide('Free text box on slide one'), slide('Another box'), Buffer.alloc(4096)]);
  return cfb([['PowerPoint Document', stream]]);
}
