// Polices fixes (renderer/fonts/statiques, voir scripts/polices-statiques.py) jointes aux exports Word.
// Les fichiers sont en WOFF2 sans transformation des tables : une décompression Brotli suffit pour
// retrouver la police TrueType que Word sait intégrer.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIR = path.join(__dirname, 'renderer', 'fonts', 'statiques');
const TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

// WOFF2 (tables non transformées) → police TrueType (sfnt).
function woff2ToTtf(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('WOFF2 attendu');
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[p++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('WOFF2 illisible');
  };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++];
    let tag = TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; }
    const version = flags >> 6;
    const length = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    if (transformed) throw new Error('WOFF2 transformé : ' + tag);
    tables.push({ tag, length });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(p, p + compressedSize));
  let at = 0;
  for (const t of tables) { t.data = data.subarray(at, at + t.length); at += t.length; }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  // En-tête sfnt, répertoire des tables, puis les tables alignées sur 4 octets.
  const pad = (n) => (n + 3) & ~3;
  const head = 12 + 16 * tables.length;
  const size = tables.reduce((s, t) => s + pad(t.length), head);
  const out = Buffer.alloc(size);
  const pow = 2 ** Math.floor(Math.log2(tables.length));
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(tables.length, 4);
  out.writeUInt16BE(pow * 16, 6);
  out.writeUInt16BE(Math.log2(pow), 8);
  out.writeUInt16BE(tables.length * 16 - pow * 16, 10);
  const sum = (b, from, len) => {
    let s = 0;
    for (let i = 0; i < pad(len); i += 4) s = (s + (from + i + 4 <= b.length ? b.readUInt32BE(from + i) : 0)) >>> 0;
    return s;
  };
  let off = head;
  let headAt = -1;
  tables.forEach((t, i) => {
    t.data.copy(out, off);
    if (t.tag === 'head') { headAt = off; out.writeUInt32BE(0, off + 8); }
    const r = 12 + 16 * i;
    out.write(t.tag, r, 4, 'latin1');
    out.writeUInt32BE(sum(out, off, t.length), r + 4);
    out.writeUInt32BE(off, r + 8);
    out.writeUInt32BE(t.length, r + 12);
    off += pad(t.length);
  });
  if (headAt >= 0) out.writeUInt32BE((0xB1B0AFBA - sum(out, 0, size)) >>> 0, headAt + 8);
  return out;
}

let manifest;
function list() {
  if (manifest === undefined) {
    try { manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'polices.json'), 'utf8')); } catch { manifest = null; }
  }
  return manifest || {};
}

// Polices à joindre à un document Word : pour chaque famille intégrée au logiciel que le document
// emploie, le romain, le gras, l'italique et le gras italique (s'ils existent), en base 64.
function forWord(names) {
  const all = list();
  const out = [];
  for (const name of new Set(names || [])) {
    const f = all[name];
    if (!f) continue;
    const pick = (style, w) => {
      const ws = f.styles[style] || [];
      if (!ws.length) return null;
      const best = ws.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
      return path.join(DIR, `${f.slug}-${best}-${style}.woff2`);
    };
    const want = [['', 'normal', 400], ['bold', 'normal', 700], ['italic', 'italic', 400], ['boldItalic', 'italic', 700]];
    const used = new Set();
    for (const [style, cssStyle, w] of want) {
      const file = pick(cssStyle, w);
      if (!file || used.has(file + style)) continue;
      // (Gras demandé sans graisse 600 ou plus dans la famille : Word fera le gras lui-même.)
      if (style.startsWith('bold') && !/-(6|7|8)00-/.test(path.basename(file))) continue;
      try {
        out.push({ name, style: style || undefined, data: woff2ToTtf(fs.readFileSync(file)).toString('base64') });
        used.add(file + style);
      } catch { /* fichier absent ou illisible : la police n'est pas jointe */ }
    }
  }
  return out;
}

module.exports = { woff2ToTtf, forWord, list };
