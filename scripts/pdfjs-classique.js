// Prépare pdf.js (pdfjs-dist, modules ES) pour Tomatoes Text : une page file:// ne peut pas charger de
// module ES (origine « null »). Les deux fichiers deviennent des scripts ordinaires :
//   pdf.js        → window.pdfjsLib (ce qu'exportait pdf.min.mjs)
//   pdf.worker.js → globalThis.pdfjsWorker (pdf.js l'utilise alors dans la page même, sans Worker)
// Usage : node scripts/pdfjs-classique.js <dossier package de pdfjs-dist> (écrit dans src/renderer/vendor/pdfjs)
const fs = require('fs');
const path = require('path');
const from = process.argv[2];
const out = path.join(__dirname, '..', 'src', 'renderer', 'vendor', 'pdfjs');
if (!from) { console.error('dossier de pdfjs-dist manquant'); process.exit(1); }

function convert(file, global) {
  let code = fs.readFileSync(path.join(from, 'build', file), 'utf8');
  code = code.replace(/import\.meta\.url/g, 'location.href');
  const m = /export\s*\{([^}]*)\};?\s*(\/\/#.*)?\s*$/.exec(code);
  if (!m) throw new Error('export introuvable dans ' + file);
  const names = m[1].split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [local, , exported] = x.split(/\s+/);
    return exported ? `${exported}:${local}` : local;
  });
  code = code.slice(0, m.index) + (global ? `globalThis.${global}={${names.join(',')}};` : '');
  if (/^\s*import\s/m.test(code)) throw new Error('import statique dans ' + file);
  return `/* pdf.js (Mozilla, Apache 2.0), version script ordinaire, préparée par scripts/pdfjs-classique.js */\n(function(){"use strict";\n${code}\n})();\n`;
}

fs.writeFileSync(path.join(out, 'pdf.js'), convert('pdf.min.mjs', 'pdfjsLib'));
fs.writeFileSync(path.join(out, 'pdf.worker.js'), convert('pdf.worker.min.mjs', null));
console.log('pdf.js et pdf.worker.js écrits dans', out);
