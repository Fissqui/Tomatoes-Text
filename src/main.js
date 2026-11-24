// Processus principal de Tomatoes Text : crée la fenêtre et gère les fichiers sur le disque.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

// Édition : une préversion (src/edition.json, absent de la version publiée) est un logiciel
// à part, installé à côté de l'autre : son propre nom, ses réglages et son dossier de stockage, qui
// commence par une copie des projets de la version courante (jamais modifiés par la préversion).
const EDITION = (() => {
  try { return JSON.parse(fsSync.readFileSync(path.join(__dirname, 'edition.json'), 'utf8')); } catch { return null; }
})();

// Le logiciel s'appelait « Frame Text ». Ses réglages sont recopiés une fois dans le dossier du
// nouveau nom (l'ancien dossier reste intact).
const APP_NAME = EDITION ? EDITION.name : 'Tomatoes Text';
const OLD_NAME = EDITION ? EDITION.from : 'Frame Text';
(function moveUserData() {
  const dir = path.join(app.getPath('appData'), APP_NAME);
  const old = path.join(app.getPath('appData'), OLD_NAME);
  if (!fsSync.existsSync(dir) && fsSync.existsSync(old)) {
    const skip = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'blob_storage', 'Crashpad']);
    try {
      fsSync.cpSync(old, dir, { recursive: true, filter: (src) => !skip.has(path.basename(src)) || path.dirname(src) !== old });
      if (EDITION) copyProjectsForEdition(old, dir);
    } catch {
      // Réglages non repris : le logiciel repart des réglages d'origine.
    }
  }
  app.setName(APP_NAME);
  app.setPath('userData', dir);
})();

// Préversion, premier lancement : le dossier de stockage de la version courante est recopié dans
// Documents\<nom de la préversion>, qui devient le stockage de la préversion.
function copyProjectsForEdition(oldUserData, newUserData) {
  let from = null;
  try { from = JSON.parse(fsSync.readFileSync(path.join(oldUserData, 'stockage.json'), 'utf8')).dir || null; } catch { /* stockage par défaut */ }
  if (!from) from = path.join(app.getPath('documents'), EDITION.from);
  const to = path.join(app.getPath('documents'), APP_NAME);
  if (fsSync.existsSync(from) && !fsSync.existsSync(to)) fsSync.cpSync(from, to, { recursive: true });
  let project = null;
  try { project = JSON.parse(fsSync.readFileSync(path.join(oldUserData, 'stockage.json'), 'utf8')).project || null; } catch { /* premier projet */ }
  fsSync.writeFileSync(path.join(newUserData, 'stockage.json'), JSON.stringify({ dir: to, project }, null, 2));
  for (const f of ['association.json', 'mise-a-jour.json']) fsSync.rmSync(path.join(newUserData, f), { force: true });
}
const crypto = require('crypto');
const { registerAssistant, readSettings: readAssistSettings } = require('./assistant');
const { registerSpell, reloadSpell, openPersonalDictionary, langueCall } = require('./spell');
const { registerThesaurus } = require('./thesaurus');
const { registerGrammar, stopGrammar } = require('./grammar');
const languagetool = require('./languagetool');
const { registerOfficeFonts } = require('./office-fonts');
const { registerVersions, beforeSave: keepVersion } = require('./versions');
const { registerSummary } = require('./summary');
const { registerCoherence } = require('./coherence');
const { registerUpdater, updatesEnabled } = require('./updater');
const { mergePdfs } = require('./pdf-merge');
const { registerLivre } = require('./livre');
const { readJson, writeJson, fichiers } = require('./json-files');
const { registerSourcesEnLigne } = require('./sources-en-ligne');
const journal = require('./journal');

// Erreur inattendue du processus principal : notée dans le journal, le logiciel continue (le document
// ouvert reste enregistré automatiquement). Avant l'ouverture de la fenêtre, elle est aussi affichée :
// sans cela, un démarrage manqué ne montrerait rien. (Pas au banc d'essai, qui doit voir ses échecs.)
let windowShown = false;
if (process.versions.electron) {
  journal.init(app.getPath('userData'));
  process.on('uncaughtException', (err) => {
    journal.write('principal', err);
    if (!windowShown && app.isReady()) dialog.showErrorBox('Tomatoes Text', 'Erreur au démarrage :\n' + String((err && err.message) || err).slice(0, 600));
  });
  process.on('unhandledRejection', (err) => journal.write('principal, promesse', err));
}
ipcMain.on('journal', (_e, text) => journal.write('fenêtre', String(text || '').slice(0, 4000)));

const FILE_EXT = 'tmtx';
// Extension des documents avant la version 1.2.3 : les fichiers sont renommés à l'ouverture du projet.
const OLD_EXT = 'ftxt';
const isDocFile = (name) => name.endsWith('.' + FILE_EXT) || name.endsWith('.' + OLD_EXT);
const LIBRARY_INDEX = 'bibliotheque.json';

let mainWindow;

// Stockage : le dossier choisi par l'utilisateur. Il contient un dossier « Projets », où chaque
// projet est un sous-dossier qui contient tous ses documents ; les sections n'existent que dans
// le logiciel (bibliotheque.json).
const DEFAULT_PROJECT = 'Mes documents';
const PROJECTS_FOLDER = 'Projets';
const FIRST_SECTION = 'Section sans titre';
let storage = { dir: null, project: null };

// Mode présentation (Fichier > « Mode présentation ») : le projet de démonstration (src/presentation)
// est recopié dans un dossier à part (userData\Présentation), qui sert de stockage le temps de la
// présentation. Les projets de l'utilisateur et son choix de stockage ne sont pas touchés ; le dossier
// est recréé à chaque entrée et effacé à la sortie.
const PRESENTATION_PROJECT = 'Le Jardin des Quatre Saisons';
let presentation = null; // { storage } : le stockage de l'utilisateur, rendu à la sortie
const presentationDir = () => path.join(app.getPath('userData'), 'Présentation');

// Documents\Tomatoes Text ; les documents déjà rangés dans l'ancien dossier « Frame Text » y restent.
function defaultStorageDir() {
  const dir = path.join(app.getPath('documents'), APP_NAME);
  const old = path.join(app.getPath('documents'), OLD_NAME);
  return !EDITION && !fsSync.existsSync(dir) && fsSync.existsSync(old) ? old : dir;
}

function storageFile() {
  return path.join(app.getPath('userData'), 'stockage.json');
}

function storageDir() {
  return storage.dir || defaultStorageDir();
}

function projectsDir() {
  return path.join(storageDir(), PROJECTS_FOLDER);
}

// Dossier du projet ouvert.
function libraryDir() {
  return path.join(projectsDir(), storage.project || DEFAULT_PROJECT);
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'reglages.json');
}

async function ensureLibrary() {
  await fs.mkdir(libraryDir(), { recursive: true });
}

// Noms que Windows refuse pour un fichier ou un dossier, même suivis d'une extension (« Nul.tmtx »).
const RESERVED_NAME = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

function safeFileName(title) {
  const cleaned = String(title || 'Sans titre').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[ \t]{2,}/g, ' ').trim().slice(0, 80).trim();
  if (!cleaned) return 'Sans titre';
  // (Le nom du document ne change pas : seul son fichier reçoit un tiret bas.)
  return RESERVED_NAME.test(cleaned.split('.')[0].trim()) ? '_' + cleaned : cleaned;
}

// Choisit un nom de fichier libre dans la bibliothèque à partir d'un titre.
function uniqueFileName(title, exclude) {
  const base = safeFileName(title);
  let name = `${base}.${FILE_EXT}`;
  let n = 2;
  // (Windows ne distingue pas majuscules et minuscules : « Titre » remplace bien « titre », sans « (2) ».)
  const same = (a, b) => !!b && (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  while (!same(name, exclude) && fsSync.existsSync(path.join(libraryDir(), name))) {
    name = `${base} (${n++}).${FILE_EXT}`;
  }
  return name;
}

// Le nom de fichier correspond-il au titre : « Titre.tmtx » ou « Titre (2).tmtx » exactement ? (Pas un
// simple début de nom : « fichier 1.5.tmtx » ne convient pas au titre « fichier 1 ».)
function fitsTitle(fileName, title) {
  const base = safeFileName(title);
  const name = String(fileName);
  const ext = '.' + FILE_EXT;
  if (!name.endsWith(ext)) return false;
  const stem = name.slice(0, -ext.length);
  // (Casse comprise : « titre » renommé « Titre » renomme aussi son fichier.)
  if (stem === base) return true;
  const m = / \((\d+)\)$/.exec(stem);
  return !!m && stem.slice(0, -m[0].length) === base;
}

// Fichier d'un document : un nom dans le dossier du projet (path.basename empêche d'en sortir), ou le chemin
// complet d'un document rangé ailleurs sur l'ordinateur (ouvert depuis l'Explorateur, déplacé…).
function inLibrary(fileName) {
  const f = String(fileName);
  if (path.isAbsolute(f) && isDocFile(f.toLowerCase())) return f;
  return path.join(libraryDir(), path.basename(f));
}

function newDocument(title) {
  const now = new Date().toISOString();
  return {
    format: 'frame-text',
    version: 1,
    id: crypto.randomUUID(),
    title: title || 'Sans titre',
    created: now,
    modified: now,
    settings: { autoIndent: false, titleInText: true }, // (vide : ni titre ni texte au départ)
    content: { html: '<p><br></p>' },
    tags: [],
    // Réservés pour les prochaines versions (liens entre notes, aide à la rédaction).
    links: [],
    meta: {}
  };
}

function isFrameTextDoc(doc) {
  return doc && doc.format === 'frame-text' && doc.content && typeof doc.content.html === 'string';
}

// ---------- Stockage et projets ----------

async function loadStorage() {
  const saved = await readJson(storageFile(), {});
  storage = { dir: typeof saved.dir === 'string' ? saved.dir : null, project: typeof saved.project === 'string' ? saved.project : null };
}

// Passage à la 2.0 (nouveau moteur d'édition) : au premier lancement, les projets sont recopiés tels
// quels dans le dossier de stockage (« Copie avant la 2.0 »). Une seule fois ; réessayé si la copie échoue.
async function keepCopyBefore2() {
  if (EDITION) return;
  const mark = path.join(app.getPath('userData'), 'copie-2.0.json');
  if (fsSync.existsSync(mark)) return;
  const from = projectsDir();
  const to = path.join(storageDir(), 'Copie avant la 2.0');
  let made = false;
  try {
    if (fsSync.existsSync(from) && !fsSync.existsSync(to)) {
      made = true;
      await fs.cp(from, path.join(to, PROJECTS_FOLDER), { recursive: true });
    }
    await writeJson(mark, { date: new Date().toISOString(), dir: to });
  } catch {
    // Copie incomplète : refaite au prochain lancement.
    if (made) await fs.rm(to, { recursive: true, force: true }).catch(() => {});
  }
}

function saveStorage() {
  if (presentation) return Promise.resolve();
  return writeJson(storageFile(), storage);
}

// Stockage choisi par l'utilisateur, même pendant une présentation (dictionnaire personnel).
function userStorageDir() {
  return (presentation ? presentation.storage.dir : storage.dir) || defaultStorageDir();
}

async function listProjects() {
  await fs.mkdir(projectsDir(), { recursive: true });
  const entries = await fs.readdir(projectsDir(), { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort(new Intl.Collator('fr', { sensitivity: 'base', numeric: true }).compare);
}

// Un dossier de projet porte au moins un document ou le fichier des sections.
async function looksLikeProject(dir) {
  try {
    return (await fs.readdir(dir)).some((name) => name === LIBRARY_INDEX || isDocFile(name));
  } catch {
    return false;
  }
}

function freeName(dir, name) {
  let candidate = name;
  for (let n = 2; fsSync.existsSync(path.join(dir, candidate)); n++) candidate = `${name} (${n})`;
  return candidate;
}

// Rangements des versions précédentes, déplacés (sans être modifiés) dans « Projets » :
// documents posés directement dans le stockage → projet « Mes documents » ;
// projets posés directement dans le stockage (version 0.5) → « Projets ».
async function migrateOldLayout() {
  const root = storageDir();
  await fs.mkdir(projectsDir(), { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || e.name === PROJECTS_FOLDER || e.name.startsWith('.')) continue;
    if (!(await looksLikeProject(path.join(root, e.name)))) continue;
    await fs.rename(path.join(root, e.name), path.join(projectsDir(), freeName(projectsDir(), e.name)));
  }
  const loose = [];
  for (const e of entries) {
    if (!e.isFile() || !isDocFile(e.name)) continue;
    if (isFrameTextDoc(await readJson(path.join(root, e.name), null))) loose.push(e.name);
  }
  if (!loose.length) return;
  const target = path.join(projectsDir(), DEFAULT_PROJECT);
  await fs.mkdir(target, { recursive: true });
  for (const name of loose) {
    let dest = name;
    for (let n = 2; fsSync.existsSync(path.join(target, dest)); n++) dest = name.replace(/\.(ftxt|tmtx)$/, ` (${n}).$1`);
    await fs.rename(path.join(root, name), path.join(target, dest));
  }
  const index = path.join(root, LIBRARY_INDEX);
  if (fsSync.existsSync(index) && !fsSync.existsSync(path.join(target, LIBRARY_INDEX))) {
    await fs.rename(index, path.join(target, LIBRARY_INDEX));
  }
}

// Un nouveau projet commence avec une première section.
async function createProjectFolder(name) {
  const dir = path.join(projectsDir(), name);
  await fs.mkdir(dir, { recursive: true });
  const sectionId = 's' + crypto.randomUUID().slice(0, 8);
  await writeJson(path.join(dir, LIBRARY_INDEX), {
    sections: [{ id: sectionId, name: FIRST_SECTION, collapsed: false, children: [] }],
    placement: {},
    unsortedCollapsed: false
  });
}

// Choisit le projet à ouvrir : celui demandé, sinon le dernier, sinon le premier (créé au besoin).
async function selectProject(wanted) {
  await migrateOldLayout();
  let projects = await listProjects();
  if (!projects.length) {
    await createProjectFolder(DEFAULT_PROJECT);
    projects = [DEFAULT_PROJECT];
  }
  const pick = [wanted, storage.project].find((p) => p && projects.includes(p)) || projects[0];
  if (pick !== storage.project) {
    storage.project = pick;
    await saveStorage();
  }
  return projects;
}

// (Windows retire les points et les espaces à la fin d'un nom de dossier : le projet ne serait plus retrouvé.)
function projectName(name) {
  const cleaned = safeFileName(name).replace(/^\.+/, '').replace(/[. ]+$/, '').trim();
  // (Nom réservé par Windows : refusé, plutôt qu'un dossier au nom modifié.)
  if (RESERVED_NAME.test(String(name || '').trim().split('.')[0].trim())) return null;
  return cleaned && cleaned !== 'Sans titre' ? cleaned : null;
}

// ---------- Bibliothèque (le projet ouvert) ----------

// Sections : [{ id, name, collapsed, children: [...] }], sur plusieurs niveaux.
function sectionIds(sections, ids = new Set()) {
  for (const s of sections) {
    ids.add(s.id);
    sectionIds(Array.isArray(s.children) ? s.children : [], ids);
  }
  return ids;
}

// Documents d'avant la version 1.2.3 (.ftxt) : renommés en .tmtx, même contenu.
async function renameOldDocs(dir) {
  const entries = await fs.readdir(dir);
  const out = [];
  for (const name of entries) {
    if (!name.endsWith('.' + OLD_EXT)) { out.push(name); continue; }
    const next = name.slice(0, -OLD_EXT.length) + FILE_EXT;
    if (entries.includes(next) || fsSync.existsSync(path.join(dir, next))) { out.push(name); continue; }
    try {
      await fs.rename(path.join(dir, name), path.join(dir, next));
      out.push(next);
    } catch {
      out.push(name);
    }
  }
  return out;
}

// Fiche d'un document pour la bibliothèque. Un document qui n'a pas changé sur le disque depuis
// la dernière lecture n'est pas relu (les documents avec des images peuvent peser lourd).
const entryCache = new Map();

async function docEntry(file, name) {
  let stamp;
  try {
    const st = await fs.stat(file);
    stamp = `${st.mtimeMs}:${st.size}:${st.ino}`;
  } catch {
    return null;
  }
  const cached = entryCache.get(file);
  if (cached && cached.stamp === stamp) return { ...cached.entry, fileName: name };
  // (Lu en arrière-plan : seule la fiche revient, pas le texte.)
  let entry = null;
  try { entry = await fichiers.call('docEntry', [file]); } catch { /* illisible */ }
  if (!entry) {
    entryCache.delete(file);
    return null;
  }
  entry = { fileName: name, ...entry };
  entryCache.set(file, { stamp, entry });
  return { ...entry };
}

// Deux fichiers qui portent le même document (copie faite dans l'Explorateur, copie enregistrée par une
// version précédente) : la copie devient un document à part entière, avec son propre identifiant. Son
// texte n'est pas touché ; l'historique des versions reste à l'original.
// Même fichier sur le disque (chemins écrits autrement, raccourci de dossier, lecteur relié…).
function sameFile(a, b) {
  if (samePath(a, b)) return true;
  try {
    const x = fsSync.statSync(a, { bigint: true });
    const y = fsSync.statSync(b, { bigint: true });
    return x.ino !== 0n && x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}

async function giveNewId(file) {
  const doc = await readJson(file, null);
  if (!isFrameTextDoc(doc)) return null;
  doc.id = crypto.randomUUID();
  await writeJson(file, doc);
  entryCache.delete(file);
  return doc.id;
}

// Index d'un projet (bibliotheque.json) : sections, rangement de chaque document (par identifiant) et
// emplacement de chaque document (files : { id: { path, title } }). Le classement est propre au logiciel :
// un document garde sa section où que soit son fichier sur l'ordinateur.
async function readIndex(dir = libraryDir()) {
  const index = await readJson(path.join(dir, LIBRARY_INDEX), { sections: [], placement: {} });
  index.sections = Array.isArray(index.sections) ? index.sections : [];
  index.placement = index.placement && typeof index.placement === 'object' ? index.placement : {};
  index.files = index.files && typeof index.files === 'object' ? index.files : {};
  return index;
}

async function writeIndex(index, dir = libraryDir()) {
  await fs.mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, LIBRARY_INDEX), {
    sections: index.sections,
    placement: index.placement,
    files: index.files || {},
    unsortedCollapsed: !!index.unsortedCollapsed
  });
}

async function loadLibrary(wantedProject) {
  const projects = await selectProject(wantedProject);
  const index = await readIndex();
  const before = JSON.stringify(index.files);

  const entries = await renameOldDocs(libraryDir());
  const found = (await Promise.all(entries.filter(isDocFile).map((name) => docEntry(path.join(libraryDir(), name), name)))).filter(Boolean);
  // Chaque fichier est un document distinct, même quand deux fichiers portent le même identifiant (l'un
  // est la copie de l'autre) : le fichier connu de l'index garde l'identifiant, l'autre en reçoit un neuf
  // et prend la même section.
  const renamed = {};
  const keeperOf = async (id, group) => {
    const known = index.files[id] && typeof index.files[id].path === 'string' ? index.files[id].path : '';
    const inFolder = group.find((d) => known && sameFile(path.join(libraryDir(), d.fileName), known));
    if (inFolder) return inFolder;
    // Fichier connu rangé hors du dossier du projet, toujours là et portant ce document : il reste l'original.
    if (known && isDocFile(known.toLowerCase())) {
      const e = await docEntry(known, known);
      if (e && e.id === id) return null;
    }
    return group[0];
  };
  const groups = new Map();
  for (const d of found) groups.set(d.id, [...(groups.get(d.id) || []), d]);
  for (const [id, group] of groups) {
    const keeper = await keeperOf(id, group);
    for (const d of group) {
      if (d === keeper) continue;
      const fresh = await giveNewId(path.join(libraryDir(), d.fileName));
      if (!fresh) continue;
      d.id = fresh;
      renamed[d.fileName] = fresh;
      if (index.placement[id]) index.placement[fresh] = index.placement[id];
    }
  }
  const docs = found;
  for (const d of docs) index.files[d.id] = { path: path.join(libraryDir(), d.fileName), title: d.title };
  // Documents rangés ailleurs sur l'ordinateur (ou sortis du dossier du projet) : lus à leur emplacement ;
  // introuvables, ils restent dans la liste (marqués), avec leur section.
  for (const [id, f] of Object.entries(index.files)) {
    if (docs.some((d) => d.id === id)) continue;
    const at = f && typeof f.path === 'string' ? f.path : '';
    const entry = at && isDocFile(at.toLowerCase()) ? await docEntry(at, at) : null;
    if (entry && entry.id === id) {
      f.title = entry.title;
      docs.push(entry);
    } else {
      docs.push({ fileName: at, id, title: (f && f.title) || 'Sans titre', modified: null, links: [], tags: [], missing: true });
    }
  }
  if (JSON.stringify(index.files) !== before || Object.keys(renamed).length) await writeIndex(index);
  // On oublie les rangements de documents inconnus, ou de sections disparues.
  const known = sectionIds(index.sections);
  for (const [key, sid] of Object.entries(index.placement)) {
    if (!index.files[key] || !known.has(sid)) delete index.placement[key];
  }
  // Un projet sans aucune section (créé par une version précédente) reçoit sa première section,
  // qui accueille ses documents.
  if (!index.sections.length) {
    const first = { id: 's' + crypto.randomUUID().slice(0, 8), name: FIRST_SECTION, collapsed: false, children: [] };
    index.sections.push(first);
    for (const d of docs) index.placement[d.id] = first.id;
    await saveLibraryIndex(index);
  }
  return {
    projects,
    project: storage.project,
    storageDir: storageDir(),
    sections: index.sections,
    placement: index.placement,
    unsortedCollapsed: !!index.unsortedCollapsed,
    docs,
    renamed,
    folder: libraryDir()
  };
}

// (La fenêtre envoie sections et rangement ; les emplacements des documents sont gardés.)
async function saveLibraryIndex(index) {
  await ensureLibrary();
  const old = await readIndex();
  await writeIndex({ ...index, files: old.files });
}

ipcMain.handle('library:load', (_e, project) => loadLibrary(project));
ipcMain.handle('library:saveIndex', (_e, index) => saveLibraryIndex(index));
ipcMain.handle('library:openFolder', () => shell.openPath(libraryDir()));

ipcMain.handle('project:create', async (_e, name) => {
  const clean = projectName(name);
  if (!clean) return { error: 'Ce nom de projet n’est pas utilisable.' };
  if (fsSync.existsSync(path.join(projectsDir(), clean))) return { error: `Un projet « ${clean} » existe déjà.` };
  await createProjectFolder(clean);
  storage.project = clean;
  await saveStorage();
  return { project: clean };
});

// Renommer un projet renomme son dossier ; les documents restent dedans.
ipcMain.handle('project:rename', async (_e, name) => {
  const clean = projectName(name);
  if (!clean) return { error: 'Ce nom de projet n’est pas utilisable.' };
  if (clean === storage.project) return { project: clean };
  const dir = path.join(projectsDir(), clean);
  // (Sous Windows, changer seulement des majuscules garde le même dossier : ce n'est pas un doublon.)
  if (fsSync.existsSync(dir) && !samePath(dir, libraryDir())) return { error: `Un projet « ${clean} » existe déjà.` };
  try {
    await fs.rename(libraryDir(), dir);
  } catch (err) {
    return { error: 'Impossible de renommer le dossier du projet (un fichier est peut-être ouvert ailleurs).' };
  }
  storage.project = clean;
  await saveStorage();
  return { project: clean };
});

// Supprimer un projet met son dossier (et tous ses documents) à la corbeille.
ipcMain.handle('project:delete', async () => {
  try {
    await shell.trashItem(libraryDir());
  } catch (err) {
    return { error: 'Impossible de mettre le dossier du projet à la corbeille (un fichier est peut-être ouvert ailleurs).' };
  }
  storage.project = null;
  await saveStorage();
  return { ok: true };
});

ipcMain.handle('storage:choose', async () => {
  if (presentation) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Dossier de stockage des projets',
    defaultPath: storageDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths[0]) return null;
  storage = { dir: filePaths[0], project: null };
  await saveStorage();
  reloadSpell().catch(() => {}); // le dictionnaire personnel est rangé dans le dossier de stockage
  return filePaths[0];
});

ipcMain.handle('doc:create', async (_e, title) => {
  await ensureLibrary();
  const doc = newDocument(title);
  const fileName = uniqueFileName(doc.title);
  await writeJson(inLibrary(fileName), doc);
  return { fileName, doc };
});

ipcMain.handle('doc:read', async (_e, fileName) => {
  const doc = await readJson(inLibrary(fileName), null);
  if (!isFrameTextDoc(doc)) throw new Error('Ce fichier ne peut pas être lu.');
  return doc;
});

// Enregistre un document. Si le titre a changé, le fichier est renommé en conséquence.
// Images reçues avec un enregistrement (app.js packDoc) : gardées en arrière-plan pour les
// enregistrements suivants, dont le texte ne porte que leurs références (fichiers-calcul.js).
ipcMain.handle('doc:image', (_e, id, head, data) => fichiers.call('image', [id, head, data]));
// Image d'un texte collé (Word, page web) : son fichier (file:) ou son adresse (http, https) lue en données
// (data:), pour que l'image reste dans le document. 20 Mo au plus ; null si illisible.
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };
ipcMain.handle('paste:image', async (_e, url) => {
  const MAX = 20 * 1024 * 1024;
  try {
    const u = new URL(String(url));
    if (u.protocol === 'file:') {
      const file = require('url').fileURLToPath(u);
      const type = IMAGE_TYPES[path.extname(file).slice(1).toLowerCase()];
      if (!type) return null;
      const st = await fs.stat(file);
      if (st.size > MAX) return null;
      return `data:${type};base64,` + (await fs.readFile(file)).toString('base64');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(u, { signal: ctrl.signal });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok || !/^image\//.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX) return null;
      return `data:${type};base64,` + buf.toString('base64');
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
});

ipcMain.handle('doc:save', async (_e, fileName, doc) => {
  doc.modified = new Date().toISOString();
  let target = fileName;
  // (Un document rangé hors du projet garde le nom de fichier choisi par l'utilisateur.)
  if (!path.isAbsolute(String(fileName)) && !fitsTitle(fileName, doc.title)) {
    target = uniqueFileName(doc.title, fileName);
  }
  await keepVersion(inLibrary(fileName), doc);
  // Images remises dans le texte puis document écrit, en arrière-plan (erreur FT_IMAGES s'il manque une
  // image : rien n'est écrit, la fenêtre renvoie tout).
  await fichiers.call('writeDoc', [inLibrary(target), doc]);
  // (Même fichier à la casse près, sous Windows : l'effacer effacerait le document qu'on vient d'écrire.)
  const sameFile = process.platform === 'win32' && target.toLowerCase() === fileName.toLowerCase();
  if (target !== fileName && !sameFile) await fs.rm(inLibrary(fileName), { force: true });
  // Document rangé hors du projet : son titre est gardé dans l'index (affiché s'il devient introuvable).
  if (path.isAbsolute(String(fileName)) && doc.id) {
    const index = await readIndex();
    const known = index.files[doc.id];
    if (known && known.title !== doc.title) {
      known.title = doc.title;
      await writeIndex(index);
    }
  }
  return { fileName: target, modified: doc.modified };
});

ipcMain.handle('doc:delete', async (_e, fileName) => {
  // Mise à la corbeille plutôt que suppression définitive ; le document sort de la liste du projet.
  const file = inLibrary(fileName);
  const doc = await readJson(file, null);
  await shell.trashItem(file);
  if (doc && doc.id) await forgetDoc(doc.id);
});

async function forgetDoc(id) {
  const index = await readIndex();
  delete index.files[id];
  delete index.placement[id];
  await writeIndex(index);
}

// « Changer de projet » : le document passe dans l'index d'un autre projet (« Non classés »). Un fichier
// rangé dans le dossier du projet est déplacé dans le dossier de l'autre projet, avec son historique des
// versions ; un fichier rangé ailleurs sur l'ordinateur reste à sa place.
ipcMain.handle('doc:changeProject', async (_e, fileName, target) => {
  const name = String(target || '');
  const projects = await listProjects();
  if (!projects.includes(name) || name === storage.project) return { error: 'Projet introuvable.' };
  const destDir = path.join(projectsDir(), name);
  const from = inLibrary(fileName);
  const doc = await readJson(from, null);
  if (!isFrameTextDoc(doc) || !doc.id) return { error: 'Ce document ne peut pas être lu.' };
  const dest = await readIndex(destDir);
  // L'autre projet connaît déjà ce document dans un autre fichier (une copie) : celui qu'on déplace devient
  // un document distinct, avec son propre identifiant.
  const oldId = doc.id;
  const there = dest.files[doc.id] && typeof dest.files[doc.id].path === 'string' ? dest.files[doc.id].path : '';
  if (there && fsSync.existsSync(there) && !sameFile(there, from)) {
    const fresh = await giveNewId(from);
    if (!fresh) return { error: 'Ce document ne peut pas être lu.' };
    doc.id = fresh;
  }
  if (path.isAbsolute(String(fileName))) {
    dest.files[doc.id] = { path: from, title: doc.title };
  } else {
    const base = safeFileName(doc.title);
    let file = `${base}.${FILE_EXT}`;
    for (let n = 2; fsSync.existsSync(path.join(destDir, file)); n++) file = `${base} (${n}).${FILE_EXT}`;
    try {
      await fs.rename(from, path.join(destDir, file));
    } catch {
      return { error: 'Impossible de déplacer le fichier (il est peut-être ouvert ailleurs).' };
    }
    dest.files[doc.id] = { path: path.join(destDir, file), title: doc.title };
    const versions = path.join(libraryDir(), 'Historique des versions', path.basename(oldId));
    const versionsTo = path.join(destDir, 'Historique des versions', path.basename(doc.id));
    if (fsSync.existsSync(versions) && !fsSync.existsSync(versionsTo)) {
      await fs.mkdir(path.dirname(versionsTo), { recursive: true });
      await fs.rename(versions, versionsTo).catch(() => {});
    }
  }
  delete dest.placement[doc.id];
  await writeIndex(dest, destDir);
  await forgetDoc(oldId);
  return { ok: true, project: name };
});

// Document introuvable : retiré de la liste, ou retrouvé (fichier choisi, même document).
ipcMain.handle('library:forget', (_e, id) => forgetDoc(String(id)));
ipcMain.handle('library:locate', async (_e, id) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Localiser le document',
    filters: [{ name: 'Document Tomatoes Text', extensions: [FILE_EXT, OLD_EXT] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return null;
  const doc = await readJson(filePaths[0], null);
  if (!isFrameTextDoc(doc) || doc.id !== id) return { error: 'Ce fichier contient un autre document.' };
  const index = await readIndex();
  index.files[id] = { path: filePaths[0], title: doc.title };
  await writeIndex(index);
  return { fileName: filePaths[0] };
});

ipcMain.handle('doc:export', async (_e, doc) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer une copie du document',
    defaultPath: path.join(app.getPath('documents'), `${safeFileName(doc.title)}.${FILE_EXT}`),
    filters: [{ name: 'Document Tomatoes Text', extensions: [FILE_EXT] }]
  });
  if (canceled || !filePath) return null;
  // (La copie est un document distinct : son propre identifiant, pour ne pas être confondue avec l'original.)
  await writeJson(filePath, { ...doc, id: crypto.randomUUID() });
  return filePath;
});

// Export Word : le fichier .docx est préparé par la fenêtre, on l'enregistre où l'utilisateur veut.
ipcMain.handle('doc:exportWord', async (_e, title, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter en document Word',
    defaultPath: path.join(app.getPath('documents'), `${safeFileName(title)}.docx`),
    filters: [{ name: 'Document Word', extensions: ['docx'] }]
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, Buffer.from(data));
  return filePath;
});

// Polices intégrées au logiciel que le document Word emploie (polices.js), jointes au fichier.
ipcMain.handle('doc:fontsForWord', (_e, names) => require('./polices').forWord(Array.isArray(names) ? names.slice(0, 40) : []));
ipcMain.handle('doc:fontsForSvg', (_e, wanted) => require('./polices').forSvg(Array.isArray(wanted) ? wanted.slice(0, 40) : []));

// Thèmes de document (theme.js) : un fichier .tttheme (JSON) pour les partager.
ipcMain.handle('theme:export', async (_e, name, theme) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le thème',
    defaultPath: path.join(app.getPath('documents'), `${safeFileName(name || 'Thème')}.tttheme`),
    filters: [{ name: 'Thème Tomatoes Text', extensions: ['tttheme'] }]
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, JSON.stringify({ format: 'tomatoes-text-theme', version: 1, theme }, null, 2), 'utf8');
  return filePath;
});
ipcMain.handle('theme:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer un thème',
    properties: ['openFile'],
    filters: [{ name: 'Thème Tomatoes Text', extensions: ['tttheme', 'json'] }]
  });
  if (canceled || !filePaths || !filePaths.length) return null;
  try {
    const data = JSON.parse(await fs.readFile(filePaths[0], 'utf8'));
    return data && data.format === 'tomatoes-text-theme' && data.theme && typeof data.theme === 'object' ? data.theme : { error: 'Ce fichier n’est pas un thème de Tomatoes Text.' };
  } catch {
    return { error: 'Ce fichier ne peut pas être lu.' };
  }
});

// Modèles de mise en page (modeles.js) : un fichier .ttmodele (JSON) pour les partager.
ipcMain.handle('modele:export', async (_e, name, model) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le modèle de mise en page',
    defaultPath: path.join(app.getPath('documents'), `${safeFileName(name || 'Modèle')}.ttmodele`),
    filters: [{ name: 'Modèle de mise en page Tomatoes Text', extensions: ['ttmodele'] }]
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, JSON.stringify({ format: 'tomatoes-text-modele', version: 1, model }, null, 2), 'utf8');
  return filePath;
});
ipcMain.handle('modele:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer un modèle de mise en page',
    properties: ['openFile'],
    filters: [{ name: 'Modèle de mise en page Tomatoes Text', extensions: ['ttmodele', 'json'] }]
  });
  if (canceled || !filePaths || !filePaths.length) return null;
  try {
    const data = JSON.parse(await fs.readFile(filePaths[0], 'utf8'));
    return data && data.format === 'tomatoes-text-modele' && data.model && typeof data.model === 'object' ? data.model : { error: 'Ce fichier n’est pas un modèle de mise en page de Tomatoes Text.' };
  } catch {
    return { error: 'Ce fichier ne peut pas être lu.' };
  }
});

// Export PDF : la page préparée par la fenêtre (pdf.js) est ouverte dans une fenêtre cachée,
// puis Chromium la découpe en pages au format du document.
ipcMain.handle('doc:exportPdf', async (_e, title, job) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter en PDF',
    defaultPath: path.join(app.getPath('documents'), `${safeFileName(title)}.pdf`),
    filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return null;
  const tmp = path.join(app.getPath('temp'), `tomatoes-pdf-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, job.html, 'utf8');
  const win = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadFile(tmp);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => true)');
    // Composition des paragraphes (coupure des mots, justification) : composition.js, dans la page.
    if (job.compose) await win.webContents.executeJavaScript(`window.FTComposition ? window.FTComposition.run(${JSON.stringify(job.compose)}) : null`);
    // Notes de bas de page au pied de leur page (notes-pied.js), une fois les paragraphes composés.
    if (job.notes) await win.webContents.executeJavaScript(`window.FTNotesPied ? window.FTNotesPied.run(${JSON.stringify(job.notes)}) : null`);
    const inch = (mm) => mm / 25.4;
    const m = job.page.margins;
    const options = {
      pageSize: { width: inch(job.page.width), height: inch(job.page.height) },
      margins: { top: inch(m.top), bottom: inch(m.bottom), left: inch(m.left), right: inch(m.right) },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: job.header || '<span></span>',
      footerTemplate: job.footer || '<span></span>',
      preferCSSPageSize: false
    };
    let pdf;
    if (job.firstDifferent) {
      // Première page sans en-tête ni numéro (page de titre) : imprimée à part, puis assemblée avec la suite.
      // (Page de titre : la feuille entière, sans marges.)
      const bleed = (on) => win.webContents.executeJavaScript(`document.documentElement.classList.toggle('ft-cover-bleed', ${on}); true`);
      if (job.cover) await bleed(true);
      const first = await win.webContents.printToPDF({ ...options, displayHeaderFooter: false, pageRanges: '1', ...(job.cover ? { margins: { top: 0, bottom: 0, left: 0, right: 0 } } : {}) });
      if (job.cover) await bleed(false);
      let rest = null;
      try {
        rest = await win.webContents.printToPDF({ ...options, pageRanges: '2-' });
      } catch {
        rest = null; // une seule page
      }
      try {
        pdf = rest ? mergePdfs(first, rest) : first;
      } catch {
        pdf = await win.webContents.printToPDF(options);
      }
    } else {
      pdf = await win.webContents.printToPDF(options);
    }
    await fs.writeFile(filePath, pdf);
    return filePath;
  } finally {
    win.destroy();
    fs.unlink(tmp).catch(() => {});
  }
});

ipcMain.handle('doc:showFile', (_e, filePath) => shell.showItemInFolder(filePath));

// Clic droit sur un document > « Ouvrir le dossier du projet » : l'Explorateur s'ouvre là où se trouve
// réellement le fichier (dossier du projet, ou autre dossier pour un document rangé ailleurs), fichier sélectionné.
ipcMain.handle('doc:showInFolder', async (_e, fileName) => {
  const file = inLibrary(fileName);
  if (fsSync.existsSync(file)) { shell.showItemInFolder(file); return true; }
  const dir = path.dirname(file);
  await shell.openPath(fsSync.existsSync(dir) ? dir : libraryDir());
  return false;
});

// Charge des documents depuis n'importe où : un .tmtx (ou .ftxt) est ajouté à la bibliothèque tel quel ; un
// document Word (.docx) est renvoyé à la fenêtre, qui le convertit (word-import.js).
ipcMain.handle('doc:import', async (_e, kind) => {
  const word = kind === 'word';
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: word ? 'Importer un document Word' : 'Ouvrir un document',
    filters: word
      ? [{ name: 'Document Word', extensions: ['docx'] }]
      : [
          { name: 'Documents (Tomatoes Text, Word)', extensions: [FILE_EXT, OLD_EXT, 'docx'] },
          { name: 'Document Tomatoes Text', extensions: [FILE_EXT, OLD_EXT] },
          { name: 'Document Word', extensions: ['docx'] }
        ],
    properties: ['openFile', 'multiSelections']
  });
  if (canceled || !filePaths.length) return [];
  return importFiles(filePaths);
});

// Deux chemins du même dossier (sous Windows, la casse et les barres peuvent différer).
const samePath = (a, b) => {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
};

// Projet qui connaît un document (son index, ou un fichier de son dossier), et son fichier : nom dans le
// dossier du projet, ou chemin complet.
async function findOwner(id) {
  const order = [storage.project, ...(await listProjects()).filter((p) => p !== storage.project)].filter(Boolean);
  for (const project of order) {
    const dir = path.join(projectsDir(), project);
    if (!fsSync.existsSync(dir)) continue;
    const index = await readIndex(dir);
    let names = [];
    try { names = (await fs.readdir(dir)).filter(isDocFile); } catch { /* dossier illisible */ }
    for (const name of names) {
      const e = await docEntry(path.join(dir, name), name);
      if (e && e.id === id) return { project, dir, index, fileName: name };
    }
    const f = index.files[id];
    if (f) return { project, dir, index, fileName: typeof f.path === 'string' ? f.path : '' };
  }
  return null;
}

// Fichiers ouverts depuis l'ordinateur : .tmtx ouvert sur place, .docx renvoyé à la fenêtre.
async function importFiles(filePaths) {
  await ensureLibrary();
  const imported = [];
  await loadLibrary();
  for (const file of filePaths.map((f) => path.resolve(f))) {
    if (/\.docx$/i.test(file)) {
      const data = await fs.readFile(file);
      imported.push({ word: path.basename(file), data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
      continue;
    }
    let doc = await readJson(file, null);
    // Fichier vide créé par l'Explorateur (clic droit > Nouveau > Document Tomatoes Text) : il devient un
    // document neuf, nommé comme le fichier.
    const stat = doc ? null : await fs.stat(file).catch(() => null);
    if (stat && stat.size === 0) {
      doc = newDocument(path.basename(file).replace(/\.[^.]+$/, ''));
      await writeJson(file, doc);
    }
    if (!isFrameTextDoc(doc)) {
      dialog.showErrorBox('Fichier illisible', `« ${path.basename(file)} » n'est pas un document Tomatoes Text valide.`);
      continue;
    }
    // Jamais de copie : le document est ouvert là où il est. Déjà connu d'un projet (même identifiant) :
    // ouvert dans ce projet, avec sa section ; à sa place connue s'il y est encore, sinon son nouvel
    // emplacement est retenu. Inconnu : ajouté au projet ouvert, dans « Non classés ».
    // Copie d'un document connu (même identifiant, autre fichier, l'original toujours là) : c'est un
    // document distinct, qui reçoit son propre identifiant.
    let owner = await findOwner(doc.id);
    if (owner && owner.fileName) {
      const known = path.isAbsolute(owner.fileName) ? owner.fileName : path.join(owner.dir, owner.fileName);
      if (fsSync.existsSync(known) && !sameFile(known, file)) {
        const fresh = await giveNewId(file);
        if (fresh) {
          doc.id = fresh;
          owner = null;
          // Copie posée dans le dossier d'un projet : elle appartient à ce projet (lu à son ouverture).
          const dir = path.dirname(file);
          if (samePath(path.dirname(dir), projectsDir()) && fsSync.existsSync(path.join(dir, LIBRARY_INDEX))) {
            imported.push(samePath(dir, libraryDir()) ? path.basename(file) : { project: path.basename(dir), fileName: path.basename(file) });
            continue;
          }
        }
      }
    }
    if (owner) {
      let fileName = owner.fileName;
      if (!fileName || !fsSync.existsSync(owner.dir && !path.isAbsolute(fileName) ? path.join(owner.dir, fileName) : fileName)) {
        fileName = file;
        owner.index.files[doc.id] = { path: file, title: doc.title };
        await writeIndex(owner.index, owner.dir);
      }
      imported.push(samePath(owner.dir, libraryDir()) ? fileName : { project: owner.project, fileName });
      continue;
    }
    const index = await readIndex();
    index.files[doc.id] = { path: file, title: doc.title };
    await writeIndex(index);
    imported.push(file);
  }
  return imported;
}

// ---------- Mode présentation ----------

async function startPresentation() {
  if (!presentation) presentation = { storage: { ...storage } };
  const root = presentationDir();
  await fs.rm(root, { recursive: true, force: true });
  const dir = path.join(root, PROJECTS_FOLDER, PRESENTATION_PROJECT);
  await fs.mkdir(dir, { recursive: true });
  await fs.cp(path.join(__dirname, 'presentation'), dir, { recursive: true });
  storage = { dir: root, project: PRESENTATION_PROJECT };
  setPresentationMenu(true);
  return { project: PRESENTATION_PROJECT };
}

async function stopPresentation() {
  if (presentation) {
    storage = presentation.storage;
    presentation = null;
  }
  setPresentationMenu(false);
  await fs.rm(presentationDir(), { recursive: true, force: true }).catch(() => {});
  return { project: storage.project };
}

function setPresentationMenu(on) {
  const menu = typeof Menu.getApplicationMenu === 'function' ? Menu.getApplicationMenu() : null;
  const item = menu && menu.getMenuItemById('presentation');
  if (item) item.checked = on;
}

ipcMain.handle('presentation:start', () => startPresentation());
ipcMain.handle('presentation:stop', () => stopPresentation());

// ---------- Tutoriel ----------
// Projet « Tutoriel » (src/tutoriel) : recopié une fois dans le stockage, au premier lancement, puis
// proposé à l'ouverture. Aide > « Tutoriel » le rouvre ; s'il a été supprimé, il est recopié.
// (Rien n'est recopié par-dessus un dossier existant qui contient des documents.)
const TUTORIAL_PROJECT = 'Tutoriel';
const tutorialMark = () => path.join(app.getPath('userData'), 'tutoriel.json');

async function installTutorial() {
  const dir = path.join(projectsDir(), TUTORIAL_PROJECT);
  if (await looksLikeProject(dir)) return false;
  await fs.mkdir(dir, { recursive: true });
  await fs.cp(path.join(__dirname, 'tutoriel'), dir, { recursive: true });
  return true;
}

// Premier lancement : le projet est installé et l'ouverture du tutoriel proposée (une seule fois).
// (Banc d'essai : rien, sauf s'il le demande.)
ipcMain.handle('tutorial:first', async () => {
  if (presentation || process.env.FT_SANS_TUTORIEL) return { offer: false };
  if (fsSync.existsSync(tutorialMark())) return { offer: false };
  try {
    await installTutorial();
  } catch (err) {
    journal.write('tutoriel', 'Installation impossible : ' + ((err && err.message) || err));
    return { offer: false };
  }
  await writeJson(tutorialMark(), { date: new Date().toISOString() });
  return { offer: true, project: TUTORIAL_PROJECT };
});

ipcMain.handle('tutorial:open', async () => {
  if (presentation) return { error: 'Quittez d’abord le mode présentation.' };
  try {
    await installTutorial();
  } catch (err) {
    return { error: 'Impossible d’installer le tutoriel dans le dossier de stockage.' };
  }
  return { project: TUTORIAL_PROJECT };
});

// ---------- Ouvrir un document depuis l'Explorateur (double-clic sur un .tmtx) ----------

const OPENABLE = /\.(tmtx|ftxt|docx)$/i;
const filesIn = (argv) => argv.slice(1).filter((a) => OPENABLE.test(a) && fsSync.existsSync(a));
let pendingFiles = filesIn(process.argv);
// Une seule fenêtre : un second lancement (double-clic sur un autre fichier) passe son fichier à la première.
const firstInstance = typeof app.requestSingleInstanceLock === 'function' ? app.requestSingleInstanceLock() : true;
if (!firstInstance) app.quit();
app.on('second-instance', async (_e, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const files = filesIn(argv);
  if (files.length && mainWindow) mainWindow.webContents.send('open-files', await importFiles(files));
});
// Documents glissés sur la fenêtre (.tmtx, .docx) : ouverts comme par un double-clic.
ipcMain.handle('app:openDropped', async (_e, paths) => {
  const files = (Array.isArray(paths) ? paths : []).filter((f) => typeof f === 'string' && OPENABLE.test(f) && fsSync.existsSync(f));
  return files.length ? importFiles(files) : [];
});
// La fenêtre demande, une fois prête, les fichiers reçus au lancement.
ipcMain.handle('app:pendingFiles', async () => {
  const files = pendingFiles;
  pendingFiles = [];
  return files.length ? importFiles(files) : [];
});

// Windows : les fichiers .tmtx prennent l'icône des documents Tomatoes Text et s'ouvrent dans le logiciel
// (réglages de l'utilisateur, sans droits d'administrateur). Refait seulement si l'emplacement a changé.
async function registerFileType() {
  // La préversion n'ouvre pas les .tmtx d'un double-clic : ils restent à la version courante.
  if (process.platform !== 'win32' || !app.isPackaged || EDITION) return;
  const exe = process.execPath;
  const icon = path.join(__dirname, 'assets', 'tmtx.ico');
  const mark = path.join(app.getPath('userData'), 'association.json');
  // v : à monter quand l'icône change (l'Explorateur la relit alors).
  const want = { v: 3, exe, icon };
  const have = await readJson(mark, {});
  if (have.v === want.v && have.exe === exe && have.icon === icon) return;
  const { execFile } = require('child_process');
  const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { windowsHide: true }, (err) => resolve(!err)));
  const CLASSES = 'HKCU\\Software\\Classes';
  const PROG = 'TomatoesText.Document';
  const keys = [
    [`${CLASSES}\\.tmtx`, PROG],
    [`${CLASSES}\\.ftxt`, PROG],
    [`${CLASSES}\\${PROG}`, 'Document Tomatoes Text'],
    [`${CLASSES}\\${PROG}\\DefaultIcon`, `"${icon}",0`],
    [`${CLASSES}\\${PROG}\\shell\\open\\command`, `"${exe}" "%1"`]
  ];
  let ok = true;
  for (const [key, value] of keys) ok = (await run('reg', ['add', key, '/ve', '/d', value, '/f'])) && ok;
  // Clic droit > Nouveau > Document Tomatoes Text : l'Explorateur crée un .tmtx vide (rempli à l'ouverture).
  ok = (await run('reg', ['add', `${CLASSES}\\.tmtx\\ShellNew`, '/v', 'NullFile', '/t', 'REG_SZ', '/d', '', '/f'])) && ok;
  if (!ok) return;
  // Le menu « Nouveau » est gardé en cache : effacé, il est recomposé à la prochaine ouverture.
  await run('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Discardable\\PostSetup\\ShellNew', '/f']);
  await writeJson(mark, want);
  // L'Explorateur relit les icônes.
  await run('ie4uinit.exe', ['-show']);
}

// ---------- Réglages (mode nuit, etc.) ----------

// Sources du projet (citations et bibliographie, citations.js) : <projet>\sources.json.
ipcMain.handle('sources:load', () => readJson(path.join(libraryDir(), 'sources.json'), []));
ipcMain.handle('sources:save', async (_e, list) => {
  await ensureLibrary();
  await writeJson(path.join(libraryDir(), 'sources.json'), Array.isArray(list) ? list : []);
});

// Import de références (biblio.js lit le texte) : fichiers BibTeX, RIS ou CSL JSON (export de Zotero).
ipcMain.handle('sources:importFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer des références',
    filters: [{ name: 'Références (BibTeX, RIS, CSL JSON)', extensions: ['bib', 'bibtex', 'ris', 'json', 'txt'] }, { name: 'Tous les fichiers', extensions: ['*'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (canceled || !filePaths.length) return [];
  const out = [];
  for (const file of filePaths.slice(0, 20)) {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.size > 30 * 1024 * 1024) continue;
    out.push({ name: path.basename(file), text: (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '') });
  }
  return out;
});

// Zotero ouvert sur l'ordinateur : son API locale (Zotero 7, « Autoriser les autres applications de cet
// ordinateur à communiquer avec Zotero »). Rien ne sort de l'ordinateur.
// Remplissage d'une source par son DOI, ISBN, lien ou titre : bases publiques (sources-en-ligne.js).
registerSourcesEnLigne(ipcMain);

// Collage d'un passage d'une page web dont les notes n'ont pas été copiées (Wikipédia…) : la page est relue
// pour y prendre le texte des notes (notes-collage.js). Rien d'autre n'est envoyé que l'adresse de la page.
ipcMain.handle('paste:page', async (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TomatoesText', 'Accept': 'text/html' } });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return null;
    const text = await res.text();
    return text.length > 8 * 1024 * 1024 ? text.slice(0, 8 * 1024 * 1024) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
});

const ZOTERO_API = 'http://127.0.0.1:23119/api/users/0/';
async function zoteroGet(rel) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(ZOTERO_API + rel, { signal: ctrl.signal, headers: { 'Zotero-API-Version': '3' } });
    if (!res.ok) return null;
    return { data: await res.json(), total: parseInt(res.headers.get('total-results'), 10) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function zoteroAll(rel) {
  const out = [];
  for (let start = 0; start < 20000; start += 100) {
    const page = await zoteroGet(`${rel}${rel.includes('?') ? '&' : '?'}limit=100&start=${start}`);
    if (!page || !Array.isArray(page.data)) return start ? out : null;
    out.push(...page.data);
    if (page.data.length < 100 || (page.total && out.length >= page.total)) break;
  }
  return out;
}
ipcMain.handle('sources:zoteroCollections', async () => {
  const list = await zoteroAll('collections');
  if (!list) return { ok: false };
  return { ok: true, collections: list.map((c) => ({ key: c.key, name: (c.data && c.data.name) || '', parent: (c.data && c.data.parentCollection) || '' })) };
});
ipcMain.handle('sources:zoteroItems', async (_e, collection) => {
  const key = typeof collection === 'string' && /^[A-Z0-9]{8}$/.test(collection) ? collection : '';
  const items = await zoteroAll(key ? `collections/${key}/items/top` : 'items/top');
  if (!items) return { ok: false };
  return { ok: true, items: items.map((it) => ({ key: it.key, data: it.data })) };
});

// Repères biographiques (renderer/bio.js) : portrait d'une personne. Les portraits des personnes fournies
// sont livrés avec le logiciel (renderer/bio/portraits : <QID>.jpg et licences.json, pris sur Wikimedia
// Commons) ; sinon, il est pris sur Commons avec sa licence et son auteur, puis gardé dans userData\Portraits.
const portraitsDir = () => path.join(app.getPath('userData'), 'Portraits');
const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
async function commonsGet(url, json) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'TomatoesText/' + app.getVersion() + ' (logiciel de rédaction)' } });
    if (!res.ok) return null;
    return json ? await res.json() : { type: res.headers.get('content-type') || 'image/jpeg', data: Buffer.from(await res.arrayBuffer()) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
ipcMain.handle('bio:portrait', async (_e, id, file) => {
  if (typeof id !== 'string' || !/^Q\d+$/.test(id) || typeof file !== 'string' || !file || file.length > 300) return null;
  const own = path.join(__dirname, 'renderer', 'bio', 'portraits');
  const lic = (await readJson(path.join(own, 'licences.json'), {}))[id];
  if (lic && lic.fichier === file) {
    try {
      const data = await fs.readFile(path.join(own, id + '.jpg'));
      return { ...lic, file, src: 'data:image/jpeg;base64,' + data.toString('base64') };
    } catch { /* fichier absent : Commons */ }
  }
  const cache = path.join(portraitsDir(), id + '.json');
  const kept = await readJson(cache, null);
  if (kept && kept.file === file && kept.src) return kept;
  // (330 px : une des tailles de vignette que Wikimedia sert ; les autres sont refusées.)
  const info = await commonsGet('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', titles: 'File:' + file, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '330', format: 'json'
  }), true);
  const page = info && info.query && Object.values(info.query.pages || {})[0];
  const ii = page && page.imageinfo && page.imageinfo[0];
  if (!ii || !ii.thumburl) return null;
  const meta = ii.extmetadata || {};
  const v = (k) => stripTags(meta[k] && meta[k].value);
  const img = await commonsGet(ii.thumburl, false);
  if (!img || img.data.length > 3e6 || !/^image\/(jpeg|png|gif|webp)/.test(img.type)) return null;
  const out = {
    file,
    src: 'data:' + img.type.split(';')[0] + ';base64,' + img.data.toString('base64'),
    licence: v('LicenseShortName'),
    auteur: v('Artist').slice(0, 160),
    attribution: v('AttributionRequired') === 'true',
    page: ii.descriptionurl || ''
  };
  try { await fs.mkdir(portraitsDir(), { recursive: true }); await writeJson(cache, out); } catch { /* pas de cache */ }
  return out;
});

// Sources en PDF (sourcepdf.js) : copiées dans <projet>\Sources PDF, puis lues pour être affichées à côté
// du texte. Le contenu voyage en base64.
const PDF_FOLDER = 'Sources PDF';
ipcMain.handle('pdf:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Ouvrir un PDF',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths[0]) return null;
  await ensureLibrary();
  const dir = path.join(libraryDir(), PDF_FOLDER);
  await fs.mkdir(dir, { recursive: true });
  const data = await fs.readFile(filePaths[0]);
  const base = path.basename(filePaths[0]).replace(/\.pdf$/i, '');
  // Le même fichier déjà copié dans le projet est réutilisé ; sinon un nom libre.
  let file = base + '.pdf';
  for (let n = 2; fsSync.existsSync(path.join(dir, file)); n++) {
    const same = await fs.readFile(path.join(dir, file)).then((d) => d.equals(data), () => false);
    if (same) return { file, name: base, data: data.toString('base64'), known: true };
    file = `${base} (${n}).pdf`;
  }
  await fs.writeFile(path.join(dir, file), data);
  return { file, name: base, data: data.toString('base64') };
});
// Données de pdf.js (polices de base, tables de caractères), lues ici : une page file:// ne peut pas les charger.
ipcMain.handle('pdfjs:data', async (_e, rel) => {
  const base = path.join(__dirname, 'renderer', 'vendor', 'pdfjs');
  const file = path.resolve(base, String(rel));
  if (!file.startsWith(base + path.sep)) return null;
  try {
    return (await fs.readFile(file)).toString('base64');
  } catch {
    return null;
  }
});
ipcMain.handle('pdf:read', async (_e, file) => {
  try {
    return (await fs.readFile(path.join(libraryDir(), PDF_FOLDER, path.basename(String(file))))).toString('base64');
  } catch {
    return null;
  }
});

// Raccourcis clavier changés : le menu est refait avec les nouveaux.
ipcMain.on('menu:rebuild', async (_e, shortcuts) => {
  const settings = await readJson(settingsPath(), {});
  buildMenu({ ...settings, shortcuts });
});

// Pendant la saisie d'un nouveau raccourci, les raccourcis du menu ne doivent rien déclencher.
ipcMain.on('menu:suspend', (_e, on) => {
  if (mainWindow) mainWindow.webContents.setIgnoreMenuShortcuts(!!on);
});

// Mode lecture : plein écran demandé par la fenêtre.
ipcMain.on('window:fullscreen', (_e, on) => {
  if (mainWindow) mainWindow.setFullScreen(!!on);
});

// Réglages : la dernière version lisible est gardée à côté (réglages.precedent.json). Un fichier devenu
// illisible (coupure de courant, disque) est mis de côté et la copie reprise, au lieu de tout remettre
// aux valeurs d'origine.
async function loadSettings() {
  const file = settingsPath();
  const backup = file.replace(/\.json$/, '.precedent.json');
  const usable = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  let text = null;
  // (Fichier retenu un instant par un autre programme, antivirus ou synchronisation : relu peu après.)
  for (let attempt = 0; attempt < 3 && text === null; attempt++) {
    try {
      text = await fs.readFile(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  let settings = null;
  try { settings = text === null ? null : JSON.parse(text.replace(/^\uFEFF/, '')); } catch { settings = null; }
  if (usable(settings)) {
    fs.copyFile(file, backup).catch(() => {});
    return settings;
  }
  if (text !== null) {
    journal.write('réglages', 'Fichier des réglages illisible : mis de côté, copie précédente reprise.');
    await fs.rename(file, file.replace(/\.json$/, `.illisible-${Date.now()}.json`)).catch(() => {});
  }
  const kept = await readJson(backup, null);
  return usable(kept) ? kept : {};
}
ipcMain.handle('settings:load', loadSettings);
ipcMain.handle('settings:save', (_e, s) => writeJson(settingsPath(), s));
// ---------- Signaler un défaut (renderer/signaler.js) ----------
// Capture de la fenêtre au moment du signalement (avant l'ouverture de la fenêtre « Signaler un défaut »),
// puis signalement enregistré dans le dossier « Signalements » du dossier de stockage : le document, les
// dernières actions et la capture, pour rejouer le défaut au banc d'essai.
const reportsDir = () => path.join(storageDir(), 'Signalements');
ipcMain.handle('report:capture', async () => {
  try {
    const img = await mainWindow.webContents.capturePage();
    return img.toPNG().toString('base64');
  } catch { return null; }
});
ipcMain.handle('report:save', async (_e, report, png) => {
  const dir = reportsDir();
  await fs.mkdir(dir, { recursive: true });
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  const name = `signalement-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  // (Dernières erreurs inattendues du logiciel, s'il y en a eu.)
  const lines = journal.recent();
  if (lines.length && report && typeof report === 'object') report.journal = lines;
  await fs.writeFile(path.join(dir, name + '.json'), JSON.stringify(report, null, 1), 'utf8');
  if (png) await fs.writeFile(path.join(dir, name + '.png'), Buffer.from(png, 'base64'));
  return { name: name + '.json', dir };
});
ipcMain.handle('report:openFolder', async () => {
  await fs.mkdir(reportsDir(), { recursive: true });
  return shell.openPath(reportsDir());
});

// Version installée (src/version.json), affichée à côté du nom de la version dans la barre latérale.
ipcMain.handle('app:edition', () => EDITION);
ipcMain.handle('app:version', () => { try { return JSON.parse(fsSync.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version || ''; } catch { return ''; } });
// Nom de la session Windows : auteur des commentaires tant qu'aucun nom n'a été choisi.
ipcMain.handle('app:userName', () => { try { return require('os').userInfo().username || ''; } catch { return ''; } });

// ---------- Fenêtre et menu ----------

function send(channel) {
  if (mainWindow) mainWindow.webContents.send('menu', channel);
}

// LanguageTool : téléchargement unique de Java et de LanguageTool (environ 300 Mo), avec la progression
// dans la barre d'état et la barre des tâches.
let ltProgress = null; // dernier état de l'installation, montré de nouveau si l'on rouvre le menu

function sendLtProgress(p) {
  ltProgress = p;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('lt:progress', p);
  // Barre des tâches : avancement, puis rien ; en rouge en cas d'échec.
  if (p.step === 'download' || p.step === 'extract') mainWindow.setProgressBar(p.pct / 100);
  else if (p.step === 'start') mainWindow.setProgressBar(2);
  else if (p.step === 'error') mainWindow.setProgressBar(1, { mode: 'error' });
  else mainWindow.setProgressBar(-1);
}

// (Bouton de la fenêtre du premier lancement : pas de confirmation, l'utilisateur vient de cliquer
// « Télécharger et installer ».)
async function installLanguageTool({ confirm = true } = {}) {
  if (languagetool.isInstalling()) { if (ltProgress) sendLtProgress(ltProgress); return; }
  if (confirm) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Installer', 'Annuler'],
      defaultId: 0,
      cancelId: 1,
      title: 'LanguageTool',
      message: 'Installer LanguageTool ?',
      detail: 'Correcteur de grammaire à règles, exécuté sur cet ordinateur : aucun texte n\'est envoyé en ligne.\n' +
        'Téléchargement unique d\'environ 300 Mo (Java et LanguageTool). L\'IA locale reste utilisée pour le mandarin.'
    });
    if (response !== 0) return;
  }
  try {
    await languagetool.install(({ step, pct, detail }) => sendLtProgress({ step, pct, detail }));
    // Vérification : LanguageTool démarre et relit une phrase.
    sendLtProgress({ step: 'start', pct: 99, detail: '' });
    await languagetool.check('Les enfants a mangé.', 'fr');
    sendLtProgress({ step: 'done', pct: 100, detail: '' });
    buildMenu(await readJson(settingsPath(), {}));
    send('grammar-reset');
  } catch (err) {
    sendLtProgress({ step: 'error', pct: 0, detail: String((err && err.message) || err) });
    buildMenu(await readJson(settingsPath(), {}));
  }
}

ipcMain.handle('lt:status', () => ({ installed: languagetool.installed(), installing: languagetool.isInstalling(), progress: ltProgress }));
ipcMain.handle('lt:install', async () => {
  if (!languagetool.installed()) await installLanguageTool({ confirm: false });
  return { installed: languagetool.installed() };
});

function buildMenu(settings) {
  // Raccourcis choisis dans « Raccourcis clavier… » (shortcuts.js) : '' = aucun.
  const custom = settings.shortcuts && typeof settings.shortcuts === 'object' ? settings.shortcuts : {};
  const acc = (id, def) => {
    const combo = Object.prototype.hasOwnProperty.call(custom, id) ? custom[id] : def;
    return combo ? combo.replace(/^Ctrl\+/, 'CmdOrCtrl+') : undefined;
  };
  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Accueil', accelerator: acc('home', ''), click: () => send('home') },
        { type: 'separator' },
        { label: 'Nouveau document', accelerator: acc('new', 'CmdOrCtrl+N'), click: () => send('new') },
        { label: 'Nouveau document depuis un modèle…', accelerator: acc('new-model', ''), click: () => send('new-model') },
        { label: 'Ouvrir un document…', accelerator: acc('import', 'CmdOrCtrl+O'), click: () => send('import') },
        { label: 'Importer un document Word (.docx)…', accelerator: acc('import-word', ''), click: () => send('import-word') },
        { type: 'separator' },
        { label: 'Enregistrer', accelerator: acc('save', 'CmdOrCtrl+S'), click: () => send('save') },
        { label: 'Enregistrer une copie sous…', accelerator: acc('export', 'CmdOrCtrl+Shift+S'), click: () => send('export') },
        { label: 'Exporter…', accelerator: acc('export-choose', 'CmdOrCtrl+Shift+E'), click: () => send('export-choose') },
        { type: 'separator' },
        { label: 'Historique des versions…', accelerator: acc('versions', 'CmdOrCtrl+Shift+H'), click: () => send('versions') },
        { type: 'separator' },
        { label: 'Ouvrir le dossier du projet', click: () => shell.openPath(libraryDir()) },
        { type: 'separator' },
        { id: 'presentation', label: 'Mode présentation', type: 'checkbox', checked: !!presentation, accelerator: acc('presentation', ''), click: () => send('presentation') },
        { type: 'separator' },
        { label: 'Quitter', role: 'quit' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        // Ctrl+Z / Ctrl+Y sont traités dans la fenêtre (pile d'annulation propre au logiciel).
        { label: 'Annuler', accelerator: acc('undo', 'CmdOrCtrl+Z'), registerAccelerator: false, click: () => send('undo') },
        { label: 'Rétablir', accelerator: acc('redo', 'CmdOrCtrl+Y'), registerAccelerator: false, click: () => send('redo') },
        { type: 'separator' },
        { label: 'Couper', role: 'cut' },
        { label: 'Copier', role: 'copy' },
        { label: 'Coller', role: 'paste' },
        { label: 'Coller sans mise en forme', role: 'pasteAndMatchStyle' },
        // Tout sélectionner : seulement le texte du document (ou la case où l'on écrit), pas toute la fenêtre.
        { label: 'Tout sélectionner', accelerator: 'CmdOrCtrl+A', click: () => send('select-all') },
        { type: 'separator' },
        { label: 'Rechercher…', accelerator: acc('find', 'CmdOrCtrl+F'), click: () => send('find') },
        { label: 'Remplacer…', accelerator: acc('replace', 'CmdOrCtrl+H'), click: () => send('replace') },
        { type: 'separator' },
        { label: 'Suivi des modifications (marche / arrêt)', accelerator: acc('track', 'CmdOrCtrl+Shift+R'), click: () => send('track') },
        { label: 'Signets…', accelerator: acc('bookmarks', 'CmdOrCtrl+Shift+G'), click: () => send('bookmarks') },
        { label: 'Vérifier la cohérence (noms, dates)…', accelerator: acc('coherence', ''), click: () => send('coherence') },
        { label: 'Statistiques de lisibilité…', accelerator: acc('readability', ''), click: () => send('readability') },
        { type: 'separator' },
        { label: 'Langues du document…', accelerator: acc('languages', ''), click: () => send('languages') },
        {
          label: 'Vérifier la grammaire',
          type: 'checkbox',
          checked: settings.grammarCheck !== false,
          click: (item) => send(item.checked ? 'grammar-on' : 'grammar-off')
        },
        languagetool.installed()
          ? { label: 'Grammaire vérifiée par LanguageTool', enabled: false }
          : { label: 'Installer LanguageTool (grammaire)…', click: () => installLanguageTool() },
        { label: 'Ouvrir le dictionnaire personnel', click: () => openPersonalDictionary() }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Mode jour / crépuscule / lune', accelerator: acc('theme', 'CmdOrCtrl+D'), click: () => send('theme') },
        { label: 'Modèle de mise en page…', accelerator: acc('layout-model', ''), click: () => send('layout-model') },
        { label: 'Thème du document…', accelerator: acc('doc-theme', ''), click: () => send('doc-theme') },
        { label: 'Thème du logiciel…', accelerator: acc('customize', ''), click: () => send('customize') },
        { label: 'Raccourcis clavier…', accelerator: acc('shortcuts', ''), click: () => send('shortcuts') },
        { label: 'Liste des documents', accelerator: acc('sidebar', 'CmdOrCtrl+Shift+B'), click: () => send('sidebar') },
        { label: 'Volet de navigation', accelerator: acc('navpane', 'CmdOrCtrl+Shift+P'), click: () => send('navpane') },
        { label: "Afficher l'Aide au Texte", accelerator: acc('assist', 'CmdOrCtrl+Shift+A'), click: () => send('assist') },
        { label: 'Mindmap', accelerator: acc('mindmap', 'CmdOrCtrl+M'), click: () => send('mindmap') },
        { label: 'Carte du temps', accelerator: acc('timeline', 'CmdOrCtrl+Shift+T'), click: () => send('timeline') },
        { label: 'Mode lecture', accelerator: acc('focus', 'CmdOrCtrl+Shift+F'), click: () => send('focus') },
        { label: 'Objectifs et statistiques…', accelerator: acc('goals', ''), click: () => send('goals') },
        {
          label: 'Afficher les tags au-dessus des documents',
          type: 'checkbox',
          checked: settings.showTags !== false,
          click: (item) => send(item.checked ? 'tags-on' : 'tags-off')
        },
        {
          label: 'Mini-barre de mise en forme sur la sélection',
          type: 'checkbox',
          checked: settings.miniBar !== false,
          click: (item) => send(item.checked ? 'minibar-on' : 'minibar-off')
        },
        { type: 'separator' },
        // Zoom de la page (zoom.js) : les touches sont lues dans la page (claviers français compris).
        { label: 'Zoom avant', accelerator: 'CmdOrCtrl+Plus', registerAccelerator: false, click: () => send('zoom-in') },
        { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', registerAccelerator: false, click: () => send('zoom-out') },
        { label: 'Taille réelle', accelerator: 'CmdOrCtrl+0', registerAccelerator: false, click: () => send('zoom-reset') },
        { type: 'separator' },
        { label: 'Plein écran', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Tutoriel', accelerator: acc('tutorial', ''), click: () => send('tutorial') },
        { type: 'separator' },
        // (Sans dépôt public ni src/prive.json : pas de mise à jour automatique, voir updater.js.)
        ...(updatesEnabled() ? [
          { label: 'Rechercher une mise à jour…', accelerator: acc('update', ''), click: () => send('update') },
          { type: 'separator' }
        ] : []),
        { label: 'Signaler un défaut…', accelerator: acc('report', 'CmdOrCtrl+Shift+F1'), click: () => send('report') },
        { type: 'separator' },
        { label: 'Mentions et licences', click: () => shell.openPath(path.join(__dirname, 'licences', 'MENTIONS.txt')) }
      ]
    }
  ];
  if (!app.isPackaged) {
    template[2].submenu.push({ type: 'separator' }, { label: 'Outils de développement', role: 'toggleDevTools' });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Fermeture en cours (la fenêtre enregistre d'abord le document), et sa sécurité de 20 s.
let closing = false;
let closeTimer = null;
// L'enregistrement a échoué : la fenêtre reste ouverte et pose la question (app.js, « before-close »).
ipcMain.on('close-cancelled', () => {
  closing = false;
  clearTimeout(closeTimer);
});

// L'affichage s'est arrêté (plantage, mémoire) ou ne répond plus : on le dit et on propose de le relancer,
// au lieu d'une fenêtre blanche ou figée. Le document est enregistré automatiquement, presque rien n'est perdu.
let resumed = false; // affichage relancé après un arrêt : la fenêtre rouvre le dernier document, sans l'accueil
ipcMain.handle('window:resumed', () => {
  const was = resumed;
  resumed = false;
  return was;
});
function watchWindow(win) {
  const wc = win.webContents;
  let asking = false;
  let relaunching = false;
  wc.on('render-process-gone', async (_e, details) => {
    if (win.isDestroyed()) return;
    // (Arrêt demandé depuis la question « ne répond pas » : relancé sans autre question.)
    if (relaunching) { relaunching = false; resumed = true; wc.reload(); return; }
    if (!details || details.reason === 'clean-exit' || asking) return;
    journal.write('fenêtre', `Affichage arrêté (${details.reason}, code ${details.exitCode}).`);
    asking = true;
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'error',
        title: APP_NAME,
        message: 'L’affichage s’est arrêté de façon inattendue.',
        detail: 'Le document est enregistré automatiquement : seules les toutes dernières secondes de saisie peuvent manquer.',
        buttons: ['Relancer l’affichage', 'Quitter'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      if (win.isDestroyed()) return;
      if (response === 0) { resumed = true; wc.reload(); } else win.destroy();
    } finally {
      asking = false;
    }
  });
  let waiting = null;
  win.on('unresponsive', async () => {
    if (waiting || asking || closing || win.isDestroyed()) return;
    journal.write('fenêtre', 'La fenêtre ne répond plus.');
    waiting = new AbortController();
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: APP_NAME,
        message: 'Tomatoes Text ne répond pas.',
        detail: 'Une opération longue est peut-être en cours. Relancer l’affichage rouvre le document tel qu’il a été enregistré automatiquement.',
        buttons: ['Attendre', 'Relancer l’affichage'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        signal: waiting.signal
      });
      if (response === 1 && !win.isDestroyed()) {
        relaunching = true;
        wc.forcefullyCrashRenderer();
      }
    } catch { /* la fenêtre répond de nouveau : question retirée */ } finally {
      waiting = null;
    }
  });
  // (Elle répond de nouveau : la question n'a plus lieu d'être.)
  win.on('responsive', () => { if (waiting) waiting.abort(); });
}

// Taille, position et état agrandi de la fenêtre : retrouvés au lancement suivant (fenetre.json, dans le
// dossier des réglages). Une position hors des écrans branchés (écran débranché) est oubliée.
const windowFile = () => path.join(app.getPath('userData'), 'fenetre.json');
function savedBounds() {
  let b = null;
  try { b = JSON.parse(fsSync.readFileSync(windowFile(), 'utf8')); } catch { return null; }
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width < 700 || b.height < 450) return null;
  try {
    const { screen } = require('electron');
    // (Au moins 120 × 60 px de la barre de titre visibles sur un écran.)
    const seen = screen.getAllDisplays().some(({ workArea: a }) =>
      Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x) >= 120 && b.y >= a.y - 10 && b.y <= a.y + a.height - 60);
    if (!seen) return { width: b.width, height: b.height, maximized: !!b.maximized };
  } catch { /* écrans inconnus : position gardée */ }
  return b;
}
function keepBounds(win) {
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const n = win.getNormalBounds();
    try { fsSync.writeFileSync(windowFile(), JSON.stringify({ ...n, maximized: win.isMaximized() })); } catch { /* sans conséquence */ }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(save, 600); };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, later);
  win.on('close', save);
}

function createWindow() {
  const bounds = savedBounds();
  mainWindow = new BrowserWindow({
    width: (bounds && bounds.width) || 1200,
    height: (bounds && bounds.height) || 800,
    ...(bounds && Number.isFinite(bounds.x) ? { x: bounds.x, y: bounds.y } : {}),
    show: !(bounds && bounds.maximized),
    minWidth: 700,
    minHeight: 450,
    title: APP_NAME,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f22' : '#f4f1ea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // L'orthographe est vérifiée par le logiciel lui-même (spell.js), avec le dictionnaire personnel.
      spellcheck: false
    }
  });
  const ses = mainWindow.webContents.session;
  // Autorise la lecture de la liste des polices installées (et rien d'autre).
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'local-fonts');
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'local-fonts'));
  // Les liens éventuels s'ouvrent dans le navigateur, jamais dans le logiciel.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  // Avant de fermer, on laisse l'interface enregistrer le document en cours.
  closing = false;
  mainWindow.on('close', (e) => {
    if (closing) return;
    e.preventDefault();
    closing = true;
    mainWindow.webContents.send('menu', 'before-close');
    // (Sécurité si la fenêtre ne répond plus : un long document, avec ses images et sa copie dans
    // l'historique, peut demander plus de 3 s pour être enregistré.)
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => mainWindow && mainWindow.destroy(), 20000);
  });
  ipcMain.once('ready-to-close', () => { clearTimeout(closeTimer); if (mainWindow) mainWindow.destroy(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('leave-full-screen', () => send('fullscreen-left'));
  mainWindow.webContents.once('did-finish-load', () => { windowShown = true; });
  // (Fenêtre agrandie la dernière fois : agrandie avant d'être montrée, sans passer par la petite taille.)
  if (bounds && bounds.maximized) {
    mainWindow.maximize();
    mainWindow.show();
  }
  keepBounds(mainWindow);
  watchWindow(mainWindow);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  if (!firstInstance) return;
  await loadStorage();
  await keepCopyBefore2();
  // Reste d'une présentation interrompue (logiciel fermé pendant la présentation).
  fs.rm(presentationDir(), { recursive: true, force: true }).catch(() => {});
  registerAssistant();
  registerSummary(libraryDir);
  registerCoherence();
  registerUpdater({ getWindow: () => mainWindow });
  registerLivre({ getWindow: () => mainWindow, safeFileName });
  registerOfficeFonts();
  registerVersions({ libraryDir });
  registerSpell({
    storageDir: userStorageDir,
    onChange: () => mainWindow && mainWindow.webContents.send('spell:changed')
  });
  registerThesaurus({ langue: langueCall, readSettings: readAssistSettings });
  registerGrammar({ readSettings: readAssistSettings });
  buildMenu(await readJson(settingsPath(), {}));
  createWindow();
  registerFileType().catch(() => {});
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => stopGrammar());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
