// Orthographe : Hunspell (WebAssembly), avec le dictionnaire de chaque langue du document (chargé au
// premier usage), complété par le dictionnaire personnel de l'utilisateur, un simple fichier texte
// (un mot par ligne) qu'il peut modifier lui-même, commun à toutes les langues.
// Les dictionnaires et les vérifications sont en arrière-plan (langue-calcul.js) : charger un
// dictionnaire figeait la fenêtre au lancement, ou en écrivant dans une autre langue.
const { ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { serialize } = require('./json-files');
const { tache } = require('./arriere-plan');

const langue = tache(path.join(__dirname, 'langue-calcul.js'));

const PERSONAL_FILE = 'Dictionnaire personnel.txt';
const HEADER = [
  '# Dictionnaire personnel de Tomatoes Text',
  '# Un mot par ligne : les mots écrits ici ne sont plus signalés comme des fautes d\'orthographe.',
  '# Les lignes qui commencent par # sont ignorées.',
  ''
].join('\r\n');

let getDir = () => null; // dossier de stockage (fourni par main.js)
let watched = null;
let onChange = () => {};
let words = new Set(); // mots du dictionnaire personnel déjà donnés aux correcteurs
let personalSent = null; // mots du dictionnaire personnel donnés à l'arrière-plan

const personalPath = () => path.join(getDir(), PERSONAL_FILE);

async function readPersonal() {
  try {
    const text = await fs.readFile(personalPath(), 'utf8');
    return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

// Donne les mots du dictionnaire personnel à l'arrière-plan (reset : les correcteurs sont refaits).
function sendPersonal(reset) {
  personalSent = readPersonal().then((list) => {
    words = new Set(list);
    watchPersonal();
    return langue.call('setPersonal', [list, reset]);
  });
  return personalSent;
}

// Calcul de langue, une fois le dictionnaire personnel connu.
async function call(name, ...args) {
  if (!personalSent) sendPersonal(false);
  await personalSent.catch(() => {});
  return langue.call(name, args);
}

// Le fichier peut être modifié dans un autre logiciel : on le relit dès qu'il change.
function watchPersonal() {
  const file = personalPath();
  if (watched === file) return;
  if (watched) fsSync.unwatchFile(watched);
  watched = file;
  fsSync.watchFile(file, { interval: 1000 }, () => refresh().catch(() => {}));
}

// Fichier changé : si des mots ont seulement été ajoutés (cas le plus courant, y compris « Ajouter au
// dictionnaire »), ils sont donnés à Hunspell sans tout recharger ; si des mots ont été retirés,
// le dictionnaire est rechargé en entier.
async function refresh() {
  if (personalSent) await personalSent.catch(() => {});
  const now = await readPersonal();
  const set = new Set(now);
  if ([...words].some((w) => !set.has(w))) return reload();
  const added = now.filter((w) => !words.has(w));
  for (const w of added) words.add(w);
  if (added.length) await call('addWords', added);
  onChange();
}

// Rechargement complet (dictionnaire modifié à la main, ou dossier de stockage changé).
async function reload() {
  await sendPersonal(true);
  onChange();
}

async function addWord(word) {
  word = String(word || '').trim();
  if (!word || /[\r\n]/.test(word)) return;
  words.add(word);
  await call('addWords', [word]);
  const file = personalPath();
  // Deux ajouts rapprochés passent l'un après l'autre, pour qu'aucun mot ne soit perdu.
  await serialize(file, async () => {
    let text = '';
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      text = HEADER;
    }
    if (text && !/\n$/.test(text)) text += '\r\n';
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text + word + '\r\n', 'utf8');
  });
}

async function openPersonal() {
  const file = personalPath();
  if (!fsSync.existsSync(file)) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, HEADER, 'utf8');
  }
  return shell.openPath(file);
}

// Charge à l'avance le dictionnaire d'une langue (en arrière-plan).
const ready = (lang = 'fr') => call('preload', lang);

function registerSpell(options) {
  getDir = options.storageDir;
  onChange = options.onChange || onChange;
  ipcMain.handle('spell:check', (_e, list, lang) => call('check', list, lang || 'fr'));
  ipcMain.handle('spell:suggest', (_e, word, lang) => call('suggest', word, lang || 'fr'));
  ipcMain.handle('lang:detect', (_e, texts, langs) => call('detectAll', (texts || []).map(String), Array.isArray(langs) ? langs : ['fr']));
  ipcMain.handle('spell:add', (_e, word) => addWord(word));
  ipcMain.handle('spell:openDictionary', () => openPersonal());
  ready('fr').catch(() => {});
}

module.exports = { registerSpell, reloadSpell: reload, openPersonalDictionary: openPersonal, spellReady: ready, langueCall: call };
