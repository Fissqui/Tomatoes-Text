// Fabrique la liste des mots courants du français (statistiques de lisibilité, « mots rares ») :
// src/renderer/vendor/frequences-fr/frequences.js.
// Source : wordfreq (Robyn Speer), large_fr.msgpack.gz, données CC BY-SA 4.0 :
// https://github.com/rspeer/wordfreq (wordfreq/data/large_fr.msgpack.gz).
// Un mot est courant si sa fréquence, ou celle de son lemme (toutes ses formes réunies, lemme donné par
// Hunspell et le dictionnaire français du logiciel), atteint 1 par million (échelle Zipf ≥ 3).
// Usage : node scripts/frequences-fr.mjs <chemin de large_fr.msgpack.gz>
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEUIL = 3.0;

// Lecture msgpack minimale (tableaux, chaînes, dictionnaires, petits nombres).
function unpack(buf) {
  let p = 0;
  const str = (n) => { const s = buf.toString('utf8', p, p + n); p += n; return s; };
  const arr = (n) => Array.from({ length: n }, read);
  const map = (n) => { const o = {}; for (let i = 0; i < n; i++) { const k = read(); o[k] = read(); } return o; };
  function read() {
    const b = buf[p++];
    if (b <= 0x7f) return b;
    if (b >= 0x80 && b <= 0x8f) return map(b & 0x0f);
    if (b >= 0x90 && b <= 0x9f) return arr(b & 0x0f);
    if (b >= 0xa0 && b <= 0xbf) return str(b & 0x1f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xd9: return str(buf[p++]);
      case 0xda: { const n = buf.readUInt16BE(p); p += 2; return str(n); }
      case 0xdb: { const n = buf.readUInt32BE(p); p += 4; return str(n); }
      case 0xdc: { const n = buf.readUInt16BE(p); p += 2; return arr(n); }
      case 0xdd: { const n = buf.readUInt32BE(p); p += 4; return arr(n); }
      case 0xde: { const n = buf.readUInt16BE(p); p += 2; return map(n); }
      case 0xcc: return buf[p++];
      case 0xcd: { const n = buf.readUInt16BE(p); p += 2; return n; }
      default: throw new Error('msgpack : type ' + b.toString(16));
    }
  }
  return read();
}

const source = process.argv[2];
if (!source) { console.error('Usage : node scripts/frequences-fr.mjs large_fr.msgpack.gz'); process.exit(1); }
const data = unpack(zlib.gunzipSync(fs.readFileSync(source)));
const zipf = new Map();
data.slice(1).forEach((bucket, i) => { for (const w of bucket) if (!zipf.has(w)) zipf.set(w, 9 - (i + 1) / 100); });
const LETTERS = /^[a-zàâäéèêëîïôöùûüçœæÿ]+$/;
const forms = [...zipf.keys()].filter((w) => LETTERS.test(w));

const { createHunspellFromFiles } = await import(pathToFileURL(path.join(root, 'src', 'vendor', 'hunspell-wasm', 'dist', 'Hunspell.js')).href);
const dict = path.join(root, 'src', 'vendor', 'dictionary-fr');
const h = await createHunspellFromFiles(path.join(dict, 'index.aff'), path.join(dict, 'index.dic'));

// Fréquence de chaque lemme : somme des fréquences de ses formes.
const stems = new Map();
const lemma = new Map();
for (const w of forms) {
  const s = h.testSpelling(w) ? h.stemWord(w).filter(Boolean) : [];
  stems.set(w, s);
  for (const l of s) lemma.set(l, (lemma.get(l) || 0) + 10 ** zipf.get(w) / s.length);
}
const common = forms.filter((w) => zipf.get(w) >= SEUIL || stems.get(w).some((l) => Math.log10(lemma.get(l) || 1) >= SEUIL)).sort();

const out = path.join(root, 'src', 'renderer', 'vendor', 'frequences-fr');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'frequences.js'),
  '// Mots courants du français (fabriqué par scripts/frequences-fr.mjs à partir de wordfreq, CC BY-SA 4.0).\n' +
  'window.FT_COMMON_WORDS = ' + JSON.stringify(common.join('\n')) + ';\n');
fs.writeFileSync(path.join(out, 'LICENCE.txt'),
  'Liste des mots courants du français (frequences.js).\n\n' +
  'Fabriquée par scripts/frequences-fr.mjs à partir des fréquences de wordfreq (Robyn Speer et contributeurs),\n' +
  'https://github.com/rspeer/wordfreq, fichier wordfreq/data/large_fr.msgpack.gz.\n' +
  'Ces données sont distribuées sous licence Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) :\n' +
  'https://creativecommons.org/licenses/by-sa/4.0/ ; la liste dérivée l\'est sous la même licence.\n' +
  'Elles réunissent notamment Wikipédia, OpenSubtitles, Google Books Ngrams, NewsCrawl et le web (voir wordfreq).\n');
console.log(`${forms.length} formes, ${lemma.size} lemmes, ${common.length} mots courants`);
