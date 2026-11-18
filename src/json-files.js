// Lecture et écriture des fichiers JSON du logiciel (documents, réglages, index…). Le travail (texte
// <-> données) se fait en arrière-plan, dans fichiers-calcul.js : un long document avec des photos
// figeait sinon la fenêtre à chaque enregistrement automatique.
const path = require('path');
const { tache } = require('./arriere-plan');

const fond = tache(path.join(__dirname, 'fichiers-calcul.js'));

function readJson(file, fallback) {
  return fond.call('readJson', [file, fallback]).catch(() => fallback);
}

// Écriture atomique (fichier temporaire puis renommé) ; deux écritures du même fichier passent l'une
// après l'autre. Les données sont prises au moment de l'appel.
function writeJson(file, data, space = 2) {
  return fond.call('writeJson', [file, data, space]);
}

// File d'attente par clé : les tâches d'une même clé passent l'une après l'autre,
// même si l'une d'elles échoue.
const queues = new Map();

function serialize(key, task) {
  const run = (queues.get(key) || Promise.resolve()).then(task, task);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

module.exports = { readJson, writeJson, serialize, fichiers: fond };
