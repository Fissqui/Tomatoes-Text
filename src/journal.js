// Journal des erreurs inattendues (processus principal et fenêtre) : écrites dans « journal.log », dans le
// dossier des réglages, au lieu d'être perdues. Les dernières lignes sont jointes aux signalements
// (Aide > Signaler un défaut…). Le fichier ne dépasse pas 200 Ko : l'ancien est gardé une fois à côté.
const fs = require('fs');
const path = require('path');

const MAX_SIZE = 200 * 1024;
const MAX_LINES = 300;   // par séance : une erreur qui se répète à chaque touche ne remplit pas le disque
const KEPT = 30;

let file = null;
let written = 0;
let last = '';
const recent = [];

function init(dir) {
  file = path.join(dir, 'journal.log');
}

function textOf(err) {
  if (err && err.stack) return String(err.stack);
  if (err && err.message) return String(err.message);
  return typeof err === 'string' ? err : JSON.stringify(err);
}

function write(origin, err) {
  let text = '';
  try { text = textOf(err); } catch { text = String(err); }
  text = String(text).slice(0, 4000);
  // (La même erreur deux fois de suite : notée une seule fois.)
  if (text === last) return;
  last = text;
  const line = `${new Date().toISOString()} [${origin}] ${text}`;
  recent.push(line);
  if (recent.length > KEPT) recent.shift();
  console.error(line);
  if (!file || written >= MAX_LINES) return;
  written++;
  try {
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* premier message */ }
    if (size > MAX_SIZE) fs.renameSync(file, file.replace(/\.log$/, '.ancien.log'));
    fs.appendFileSync(file, line + '\n', 'utf8');
  } catch { /* journal impossible à écrire : l'erreur reste dans la console */ }
}

module.exports = { init, write, recent: () => recent.slice(), file: () => file };
