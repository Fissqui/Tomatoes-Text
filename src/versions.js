// Historique des versions : des copies d'un document, gardées dans le dossier « Historique des versions »
// du projet (un sous-dossier par document, nommé par son identifiant, avec un index.json).
// Copie automatique : quand le document est modifié et que la dernière copie a plus de 10 minutes,
// le contenu d'avant la modification est gardé. Copies « à la main » : jamais effacées.
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { readJson, writeJson: writeJsonFile, serialize, fichiers } = require('./json-files');

const FOLDER = 'Historique des versions';
const EVERY = 10 * 60 * 1000;
const KEEP_ALL = 2 * 24 * 3600 * 1000; // toutes les copies automatiques des deux derniers jours…
const MAX_AUTO = 150; // …puis une par jour, et pas plus de 150 en tout

let libraryDir = () => '';

function dirOf(docId) {
  return path.join(libraryDir(), FOLDER, path.basename(String(docId)));
}

function writeJson(file, data, pretty) {
  return writeJsonFile(file, data, pretty ? 2 : 0);
}

// L'index d'un document est lu, modifié puis réécrit : ces opérations passent l'une après l'autre
// pour un même document, sinon deux d'entre elles pourraient effacer le travail de l'autre.
function inOrder(dir, task) {
  return serialize('versions:' + path.resolve(dir), task);
}

async function readIndex(dir) {
  const list = await readJson(path.join(dir, 'index.json'), []);
  return Array.isArray(list) ? list : [];
}

// Garde toutes les copies récentes et celles faites à la main ; pour les plus anciennes, une par jour.
async function prune(dir, list) {
  const now = Date.now();
  const days = new Set();
  const keep = [];
  const drop = [];
  let autos = 0;
  for (const v of [...list].sort((a, b) => b.saved.localeCompare(a.saved))) {
    if (v.kind === 'manuel') { keep.push(v); continue; }
    const age = now - Date.parse(v.saved);
    const day = v.saved.slice(0, 10);
    if (autos < MAX_AUTO && (age < KEEP_ALL || !days.has(day))) {
      keep.push(v);
      days.add(day);
      autos++;
    } else {
      drop.push(v);
    }
  }
  for (const v of drop) await fs.rm(path.join(dir, path.basename(v.file)), { force: true });
  return keep;
}

// Ajoute une copie du document. Si rien n'a changé depuis la dernière copie, celle-ci reçoit
// seulement le nom et le genre donnés (une copie à la main n'est pas doublée).
// (Empreinte et nombre de mots calculés en arrière-plan : un long document les fait attendre.)
function addVersion(doc, kind, label) {
  return inOrder(dirOf(doc.id), async () => addVersionNow(doc.id, await fichiers.call('versionOf', [doc]), (file) => writeJson(file, doc), kind, label));
}

// info : { title, hash, words } ; write(fichier) écrit la copie.
async function addVersionNow(docId, info, write, kind, label) {
  const dir = dirOf(docId);
  await fs.mkdir(dir, { recursive: true });
  let list = await readIndex(dir);
  const hash = info.hash;
  const last = list.reduce((a, b) => (!a || b.saved > a.saved ? b : a), null);
  if (last && last.hash === hash) {
    if (kind !== 'auto') {
      last.kind = kind;
      if (label) last.label = label;
      await writeJson(path.join(dir, 'index.json'), list, true);
    }
    return last;
  }
  const saved = new Date().toISOString();
  // Deux copies faites dans la même milliseconde ne doivent pas partager un fichier.
  const stem = saved.replace(/[:.]/g, '-');
  let file = stem + '.tmtx';
  for (let n = 2; list.some((v) => v.file === file); n++) file = `${stem}-${n}.tmtx`;
  await write(path.join(dir, file));
  const entry = { file, saved, kind, label: label || '', title: info.title, words: info.words, hash };
  list.push(entry);
  list = await prune(dir, list);
  await writeJson(path.join(dir, 'index.json'), list, true);
  return entry;
}

// Appelé avant chaque enregistrement : garde l'état du fichier sur le disque si la dernière copie
// date de plus de 10 minutes.
async function beforeSave(filePath, doc) {
  try {
    await inOrder(dirOf(doc.id), async () => {
      const list = await readIndex(dirOf(doc.id));
      const last = list.reduce((a, b) => (!a || b.saved > a.saved ? b : a), null);
      if (last && Date.now() - Date.parse(last.saved) < EVERY) return;
      // Le fichier sur le disque est copié tel quel (sans être relu ni réécrit ici).
      const old = await fichiers.call('versionInfo', [filePath]).catch(() => null);
      if (!old || old.id !== doc.id) return;
      await addVersionNow(doc.id, old, (file) => fs.copyFile(filePath, file), 'auto');
    });
  } catch {
    // L'historique ne doit jamais empêcher d'enregistrer le document.
  }
}

function registerVersions(options) {
  libraryDir = options.libraryDir;
  ipcMain.handle('versions:list', async (_e, docId) => {
    const list = await readIndex(dirOf(docId));
    return list.sort((a, b) => b.saved.localeCompare(a.saved)).map(({ hash, ...v }) => v);
  });
  ipcMain.handle('versions:read', async (_e, docId, file) => {
    const doc = await readJson(path.join(dirOf(docId), path.basename(file)), null);
    if (!doc || !doc.content) throw new Error('Cette version ne peut pas être lue.');
    return doc;
  });
  ipcMain.handle('versions:save', async (_e, doc, kind, label) => {
    const { hash, ...entry } = await addVersion(doc, kind === 'restauration' ? 'restauration' : 'manuel', label);
    return entry;
  });
  ipcMain.handle('versions:delete', (_e, docId, file) => {
    const dir = dirOf(docId);
    return inOrder(dir, async () => {
      const list = (await readIndex(dir)).filter((v) => v.file !== file);
      await fs.rm(path.join(dir, path.basename(file)), { force: true });
      await writeJson(path.join(dir, 'index.json'), list, true);
    });
  });
}

module.exports = { registerVersions, beforeSave };
