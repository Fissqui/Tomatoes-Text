// Prépare les thésaurus (synonymes) des autres langues à partir des fichiers MyThes de LibreOffice
// (paquets mythes-en-us, mythes-de, mythes-es, mythes-it, mythes-pt-pt).
// Chaque mot garde la liste de ses synonymes, tous sens confondus, comme le lit src/thesaurus.js.
// Sont retirés : les contraires, les termes plus généraux (« generic term », « Oberbegriff »),
// les annotations entre parenthèses (« (ugs.) », « (s.m.) »…) et les expressions à trous (« ... »).
// Le résultat est en UTF-8, compressé (gzip).
// Usage : node scripts/thesaurus-langues.js <th_xx_v2.dat> <sortie.dat.gz>
const fs = require('fs');
const zlib = require('zlib');

const [input, output] = process.argv.slice(2);
const raw = fs.readFileSync(input);
const firstLine = raw.subarray(0, 40).toString('latin1').split(/\r?\n/)[0].trim().toUpperCase();
const text = /UTF-?8/.test(firstLine) ? raw.toString('utf8') : raw.toString('latin1');
const lines = text.split(/\r?\n/);

const DROP = /\((?:antonym|antonimo|antónimo|antônimo|contrario|contrário|gegenteil|generic term|oberbegriff|unterbegriff)\)/i;
const MAX = 40;

const table = new Map();
for (let i = 1; i < lines.length; i++) {
  const [word, count] = lines[i].split('|');
  const n = Number(count);
  if (!word || !n) continue;
  const key = word.trim();
  const list = table.get(key) || [];
  for (let j = 1; j <= n && i + j < lines.length; j++) {
    for (const s of lines[i + j].split('|').slice(1)) {
      if (DROP.test(s) || s.includes('...') || s.includes('…')) continue;
      const syn = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      if (!syn || syn.toLowerCase() === key.toLowerCase() || list.includes(syn)) continue;
      list.push(syn);
    }
  }
  i += n;
  if (list.length) table.set(key, list.slice(0, MAX));
}

const out = ['UTF-8'];
for (const [word, list] of table) out.push(word + '|1', '-|' + list.join('|'));
fs.writeFileSync(output, zlib.gzipSync(out.join('\n') + '\n', { level: 9 }));
console.log(output, table.size, 'mots,', fs.statSync(output).size, 'octets');
