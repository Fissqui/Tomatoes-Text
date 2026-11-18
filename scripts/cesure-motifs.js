// Motifs de césure (coupure des mots en fin de ligne) : convertit les fichiers hyph-<langue>.tex du
// paquet hyph-utf8 (https://github.com/hyphenation/tex-hyphen, dossier hyph-utf8/tex/generic/hyph-utf8/
// patterns/tex) en scripts du logiciel, src/renderer/vendor/cesure/cesure-<code>.js, avec leur en-tête
// (auteurs, licence). Usage : node scripts/cesure-motifs.js <dossier des fichiers hyph-*.tex>
const fs = require('fs');
const path = require('path');

// Code de langue du logiciel -> fichier TeX, et longueurs minimales avant / après la coupure.
// (Français : au moins 3 lettres sur la ligne suivante, comme en édition française.)
const LANGS = {
  fr: { file: 'hyph-fr.tex', left: 2, right: 3 },
  en: { file: 'hyph-en-gb.tex', left: 2, right: 3 },
  de: { file: 'hyph-de-1996.tex', left: 2, right: 2 },
  es: { file: 'hyph-es.tex', left: 2, right: 2 },
  it: { file: 'hyph-it.tex', left: 2, right: 2 },
  pt: { file: 'hyph-pt.tex', left: 2, right: 3 }
};

const dir = process.argv[2];
if (!dir) {
  console.error('Usage : node scripts/cesure-motifs.js <dossier des fichiers hyph-*.tex>');
  process.exit(1);
}
const out = path.join(__dirname, '..', 'src', 'renderer', 'vendor', 'cesure');
fs.mkdirSync(out, { recursive: true });

// Contenu d'une commande \patterns{…} ou \hyphenation{…} (sans les commentaires).
function block(tex, name) {
  const i = tex.search(new RegExp('\\\\' + name + '\\s*\\{'));
  if (i < 0) return [];
  let depth = 0;
  let body = '';
  for (let k = tex.indexOf('{', i); k < tex.length; k++) {
    const c = tex[k];
    if (c === '{') { depth++; if (depth === 1) continue; }
    if (c === '}') { depth--; if (!depth) break; }
    body += c;
  }
  return body.split('\n').map((l) => l.replace(/%.*$/, '').trim()).join(' ').split(/\s+/).filter(Boolean);
}

for (const [code, l] of Object.entries(LANGS)) {
  const tex = fs.readFileSync(path.join(dir, l.file), 'utf8');
  // En-tête : les lignes de commentaire du début (titre, auteurs, licence…).
  const head = [];
  for (const line of tex.split('\n')) {
    if (!line.startsWith('%')) { if (head.length) break; continue; }
    head.push(line.replace(/^%\s?/, '').replace(/\*\//g, '* /'));
  }
  const patterns = block(tex, 'patterns');
  const exceptions = block(tex, 'hyphenation');
  const js = `// Motifs de césure : ${l.file} (hyph-utf8), converti par scripts/cesure-motifs.js. En-tête d'origine :\n/*\n${head.join('\n')}\n*/\n` +
    `(window.FTMotifsCesure = window.FTMotifsCesure || {})[${JSON.stringify(code)}] = {\n  left: ${l.left},\n  right: ${l.right},\n` +
    `  patterns: ${JSON.stringify(patterns.join(' '))},\n  exceptions: ${JSON.stringify(exceptions.join(' '))}\n};\n`;
  fs.writeFileSync(path.join(out, `cesure-${code}.js`), js);
  console.log(code, patterns.length, 'motifs,', exceptions.length, 'exceptions');
}
