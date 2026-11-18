// Mise à jour en un clic (Aide > « Rechercher une mise à jour… »).
// - Version publiée (programme d'installation) : versions publiées sur GitHub Releases (dépôt public, sans clé).
//   Si seuls les fichiers du logiciel changent, l'archive « Tomatoes-Text-<version>-fichiers.tar.gz » est
//   recopiée dans le logiciel installé ; si Electron ou les composants changent, le programme d'installation
//   de la nouvelle version est téléchargé et lancé.
// - Version de développement (src/prive.json présent, jamais publié) : d'abord le dossier de travail sur cet
//   ordinateur, copie Git du dépôt (« git pull », puis copie de src) ; à défaut, GitHub Releases.
// Aucun réglage n'est demandé à l'utilisateur.
// Les fichiers sont recopiés par-dessus ceux du logiciel installé (comme robocopy /E), puis le logiciel redémarre.
const { app, ipcMain } = require('electron');
const electron = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const zlib = require('zlib');
const { execFile, spawn } = require('child_process');
const { readJson, writeJson } = require('./json-files');

const readConf = (name) => {
  try { return JSON.parse(fsSync.readFileSync(path.join(__dirname, name), 'utf8')); } catch { return null; }
};
// Version de développement : { dossiers: [dossier de travail, ancien nom…] }.
// FT_UPDATE_PRIVE (banc d'essai) : JSON à la place du fichier, ou vide pour aucun.
function privateConf() {
  const env = process.env.FT_UPDATE_PRIVE;
  const c = env !== undefined ? (env ? JSON.parse(env) : null) : readConf('prive.json');
  return c && Array.isArray(c.dossiers) ? c : null;
}
// Dépôt public : champ « repository » de package.json. FT_UPDATE_API (banc d'essai) : autre adresse que l'API GitHub.
function publicRepo() {
  const pkg = readConf(path.join('..', 'package.json')) || {};
  const url = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository && pkg.repository.url) || '';
  const m = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url);
  return m ? m[1] : null;
}
const apiBase = () => process.env.FT_UPDATE_API || 'https://api.github.com';
const enabled = () => !!(privateConf() || publicRepo());

// Une préversion (src/edition.json, absent de la version publiée) suit sa propre branche. Le dossier de travail reste sur
// la branche principale : la préversion en extrait seulement ses fichiers (git archive), sans le changer.
const EDITION = readConf('edition.json');
const BRANCH = (EDITION && EDITION.branch) || 'main';
const OWN_BRANCH = BRANCH !== 'main';
function defaultFolder() {
  const list = ((privateConf() || {}).dossiers || []).filter((d) => typeof d === 'string' && d);
  return list.find((d) => fsSync.existsSync(d)) || list[0] || '';
}

// Dossier src du logiciel en marche (celui qui est remplacé). FT_UPDATE_TARGET : banc d'essai.
const targetSrc = () => process.env.FT_UPDATE_TARGET || __dirname;
const settingsFile = () => path.join(app.getPath('userData'), 'mise-a-jour.json');

// Dossier de travail : réglage enregistré (mise-a-jour.json), sinon le premier dossier existant de src/prive.json.
async function workFolder() {
  if (!privateConf()) return null;
  const s = await readJson(settingsFile(), {});
  const folder = typeof s.folder === 'string' && s.folder ? s.folder : defaultFolder();
  return folder && isClone(folder) ? folder : null;
}

// ----- Versions -----

// Version installée : src/version.json (tenu à jour avec package.json). Le package.json du logiciel
// installé n'était pas recopié par l'ancienne ligne PowerShell : il peut être plus ancien.
function installedVersion() {
  try {
    return JSON.parse(fsSync.readFileSync(path.join(targetSrc(), 'version.json'), 'utf8')).version || app.getVersion();
  } catch {
    return app.getVersion();
  }
}

function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// Messages des commits (le plus récent d'abord) jusqu'à celui de la version installée.
function changesSince(subjects, version) {
  const out = [];
  for (const s of subjects) {
    const m = /^(?:Version )?(\d+\.\d+(?:\.\d+)*) ?:/.exec(s); // « Version 2.3.0 : … » ou « 2.3.9 : … »
    if (m && compareVersions(m[1], version) <= 0) break;
    out.push(s);
    if (out.length >= 30) break;
  }
  return out;
}

// ----- Git (dossier de travail) -----

let gitPath = null;
function gitCandidates() {
  const list = ['git'];
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]) {
      if (base) list.push(path.join(base, 'Git', 'cmd', 'git.exe'));
    }
  }
  return list;
}

function exec(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '');
        reject(err);
      } else resolve(String(stdout));
    });
  });
}

async function findGit() {
  if (gitPath) return gitPath;
  for (const c of gitCandidates()) {
    try {
      await exec(c, ['--version'], { timeout: 15000 });
      gitPath = c;
      return c;
    } catch { /* suivant */ }
  }
  return null;
}

// interactive : la fenêtre de connexion de Git peut s'ouvrir (recherche demandée par l'utilisateur).
async function git(folder, args, interactive) {
  const bin = await findGit();
  if (!bin) throw new Error("Git n'est pas installé sur cet ordinateur.");
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
  if (!interactive) env.GCM_INTERACTIVE = 'never';
  return exec(bin, ['-C', folder, ...args], { env });
}

function isClone(folder) {
  return fsSync.existsSync(path.join(folder, '.git')) && fsSync.existsSync(path.join(folder, 'src', 'main.js'));
}

async function checkFolder(folder, interactive) {
  await git(folder, ['fetch', '--quiet', 'origin', BRANCH], interactive);
  const remote = `origin/${BRANCH}`;
  const behind = OWN_BRANCH ? 0 : parseInt(await git(folder, ['rev-list', '--count', `HEAD..${remote}`]), 10) || 0;
  const pkg = JSON.parse(await git(folder, ['show', `${remote}:package.json`]));
  const subjects = (await git(folder, ['log', '-n', '40', '--format=%s', remote])).split('\n').filter(Boolean);
  return { source: 'dossier', version: pkg.version, behind, subjects };
}

async function applyFolder(folder) {
  if (OWN_BRANCH) return extractFolder(folder);
  // Avance jusqu'à la version de GitHub (refusé si le dossier contient des modifications en conflit).
  try {
    await git(folder, ['merge', '--ff-only', '--quiet', `origin/${BRANCH}`]);
  } catch (err) {
    throw new Error("le dossier de travail contient des modifications qui empêchent la mise à jour (" + firstLine(err.stderr || err.message) + ').');
  }
  return { src: path.join(folder, 'src'), pkg: JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8')) };
}

// Préversion : src/ et package.json de sa branche, extraits dans un dossier temporaire.
async function extractFolder(folder) {
  const bin = await findGit();
  const tar = await new Promise((resolve, reject) => {
    execFile(bin, ['-C', folder, 'archive', '--format=tar', `origin/${BRANCH}`, 'src', 'package.json'],
      { windowsHide: true, timeout: 120000, maxBuffer: 512 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr: String(stderr || '') })) : resolve(stdout)));
  });
  return unpack(tar, (name) => name);
}

// Copie src/ et package.json d'une archive tar dans un dossier temporaire.
async function unpack(tar, relOf) {
  const dir = path.join(app.getPath('userData'), 'mise-a-jour');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  let pkg = null;
  for (const entry of readTar(tar)) {
    const rel = relOf(entry.name);
    if (rel === 'package.json') pkg = JSON.parse(entry.data.toString('utf8'));
    if (!rel.startsWith('src/') || entry.type !== 'file') continue;
    const dest = path.join(dir, rel);
    if (!dest.startsWith(dir + path.sep)) continue;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, entry.data);
  }
  if (!pkg || !fsSync.existsSync(path.join(dir, 'src', 'main.js'))) throw new Error('archive incomplète.');
  return { src: path.join(dir, 'src'), pkg, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

// ----- Réseau -----

function httpFetch(url, options) {
  // net.fetch passe par les réglages réseau de Windows (proxy) ; fetch de Node sinon (banc d'essai).
  const f = electron.net && electron.net.fetch ? electron.net.fetch.bind(electron.net) : fetch;
  return f(url, options);
}

// Lecture d'une archive tar (format ustar, avec les en-têtes pax de GitHub pour les noms longs).
function readTar(buf) {
  const out = [];
  let pos = 0;
  let longName = null;
  const str = (a, b) => buf.toString('utf8', a, b).replace(/\0.*$/s, '');
  while (pos + 512 <= buf.length) {
    if (buf[pos] === 0) break; // fin de l'archive
    let name = str(pos, pos + 100);
    const size = parseInt(str(pos + 124, pos + 136).trim() || '0', 8);
    const type = String.fromCharCode(buf[pos + 156] || 48);
    const prefix = str(pos + 345, pos + 500);
    if (prefix) name = prefix + '/' + name;
    const data = buf.subarray(pos + 512, pos + 512 + size);
    pos += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      const m = /\d+ path=([^\n]*)\n/.exec(data.toString('utf8'));
      if (m) longName = m[1];
      continue;
    }
    if (type === 'L') { longName = data.toString('utf8').replace(/\0.*$/s, ''); continue; }
    if (type === 'g') continue;
    if (longName) { name = longName; longName = null; }
    out.push({ name, type: type === '0' || type === '\0' ? 'file' : type === '5' ? 'dir' : 'other', data });
  }
  return out;
}

// ----- GitHub Releases (version publiée) -----

const ASSET_FILES = /-fichiers\.tar\.gz$/i;
const ASSET_SETUP = /\.exe$/i;

async function publicGet(route) {
  const res = await httpFetch(`${apiBase()}/repos/${publicRepo()}${route}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Tomatoes-Text' }
  });
  if (res.status === 404) throw new Error('aucune version publiée pour le moment.');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub limite temporairement les recherches depuis cette connexion. Réessayez dans une heure.');
  if (!res.ok) throw new Error(`GitHub répond ${res.status}.`);
  return res.json();
}

// Notes d'une version : une ligne par élément (titres Markdown ignorés, tirets et gras retirés).
function releaseNotes(body) {
  return String(body || '').split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/^\s*[-*+]\s*/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);
}

async function checkPublic(installed) {
  const list = await publicGet('/releases?per_page=30');
  const releases = (Array.isArray(list) ? list : [])
    .filter((r) => r && !r.draft && !r.prerelease && /^v?\d+(\.\d+)*$/.test(String(r.tag_name || '')))
    .map((r) => ({ ...r, version: String(r.tag_name).replace(/^v/, '') }))
    .sort((a, b) => compareVersions(b.version, a.version));
  if (!releases.length) throw new Error('aucune version publiée pour le moment.');
  const latest = releases[0];
  const changes = [];
  for (const r of releases) {
    if (compareVersions(r.version, installed) <= 0) break;
    for (const line of releaseNotes(r.body)) if (changes.length < 30) changes.push(line);
  }
  return { source: 'public', version: latest.version, behind: 0, subjects: changes, release: latest };
}

async function download(url) {
  const res = await httpFetch(url, { headers: { Accept: 'application/octet-stream', 'User-Agent': 'Tomatoes-Text' } });
  if (!res.ok) throw new Error(`téléchargement refusé (GitHub répond ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

// Electron ou composants (node_modules) différents : la mise à jour passe par le programme d'installation.
function needsSetup(pkg) {
  let installedPkg = {};
  try { installedPkg = JSON.parse(fsSync.readFileSync(path.join(path.dirname(targetSrc()), 'package.json'), 'utf8')); } catch { /* absent */ }
  const deps = (p) => JSON.stringify(p.dependencies || {});
  const wanted = String((pkg.devDependencies || {}).electron || '').replace(/^[\^~]/, '');
  const running = process.versions.electron || '';
  return deps(installedPkg) !== deps(pkg) || (wanted && running && wanted !== running);
}

async function applyPublic(send) {
  const found = await checkPublic(installedVersion());
  const assets = found.release.assets || [];
  const files = assets.find((a) => ASSET_FILES.test(a.name));
  const setup = assets.find((a) => ASSET_SETUP.test(a.name));
  let got = null;
  if (files) {
    send('Téléchargement de la version ' + found.version + '…');
    got = await unpack(zlib.gunzipSync(await download(files.browser_download_url)), (name) => name.replace(/^\.\//, ''));
    if (!needsSetup(got.pkg)) return got;
    await got.cleanup();
  }
  if (!setup) throw new Error('la version ' + found.version + ' ne contient pas de fichiers de mise à jour.');
  send('Téléchargement du programme d\'installation ' + found.version + '…');
  const file = path.join(app.getPath('temp'), setup.name.replace(/[^\w.-]/g, '_'));
  await fs.writeFile(file, await download(setup.browser_download_url));
  return { setup: file, pkg: { version: found.version } };
}

// ----- Copie dans le logiciel installé -----

const samePath = (a, b) => {
  const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

async function install({ src, pkg }) {
  const target = targetSrc();
  const appDir = path.dirname(target);
  const installedPkg = await readJson(path.join(appDir, 'package.json'), {});
  // De nouveaux composants (node_modules) demandent une réinstallation complète.
  const deps = (p) => JSON.stringify(p.dependencies || {});
  if (installedPkg.dependencies && deps(installedPkg) !== deps(pkg)) {
    throw new Error('cette version demande une réinstallation complète (nouveaux composants) : installez-la avec son programme d\'installation.');
  }
  if (samePath(src, target)) return; // logiciel lancé depuis le dossier de travail lui-même
  await fs.cp(src, target, { recursive: true, force: true });
  const { devDependencies, scripts, ...appPkg } = pkg;
  await writeJson(path.join(appDir, 'package.json'), appPkg);
  // Version installée d'après package.json, même si src/version.json n'a pas suivi (sinon la même
  // mise à jour serait proposée sans fin).
  await fs.writeFile(path.join(target, 'version.json'), JSON.stringify({ version: pkg.version }) + '\n');
}

const firstLine = (s) => String(s || '').trim().split('\n').filter(Boolean).pop() || '';

// ----- Recherche -----

async function check({ interactive }) {
  const installed = installedVersion();
  if (!enabled()) return { ok: false, disabled: true, installed, notes: ['Mise à jour automatique non disponible dans cette version.'] };
  const notes = [];
  const folder = await workFolder();
  if (folder) {
    try {
      const found = await checkFolder(folder, interactive);
      return {
        ok: true, installed, latest: found.version, source: 'dossier',
        available: compareVersions(found.version, installed) > 0 || found.behind > 0,
        changes: changesSince(found.subjects, installed), notes
      };
    } catch (err) {
      notes.push('Dossier de travail : ' + firstLine(err.stderr || err.message));
    }
  }
  if (publicRepo()) {
    try {
      const found = await checkPublic(installed);
      const available = compareVersions(found.version, installed) > 0;
      return { ok: true, installed, latest: found.version, source: 'public', available, changes: available ? found.subjects : [], notes };
    } catch (err) {
      notes.push(err.message.charAt(0).toUpperCase() + err.message.slice(1));
    }
  }
  return { ok: false, installed, notes };
}

let running = false;
let pendingSetup = null; // programme d'installation téléchargé, lancé à la fermeture
async function update(send) {
  if (running) throw new Error('mise à jour déjà en cours.');
  running = true;
  try {
    if (!enabled()) throw new Error('mise à jour automatique non disponible dans cette version.');
    let got = null;
    let folderError = null;
    const folder = await workFolder();
    if (folder) {
      try {
        send('Récupération depuis le dossier de travail…');
        await git(folder, ['fetch', '--quiet', 'origin', BRANCH], true);
        got = await applyFolder(folder);
      } catch (err) {
        folderError = err;
      }
    }
    if (!got && publicRepo()) got = await applyPublic(send);
    if (!got) throw folderError || new Error('aucune source de mise à jour.');
    if (got.setup) {
      pendingSetup = got.setup;
      return { version: got.pkg.version, setup: true };
    }
    send('Installation des fichiers…');
    try {
      await install(got);
    } finally {
      if (got.cleanup) await got.cleanup().catch(() => {});
    }
    return { version: got.pkg.version };
  } finally {
    running = false;
  }
}

function registerUpdater({ getWindow }) {
  ipcMain.handle('update:check', async (_e, opts) => check({ interactive: !!(opts && opts.interactive) }));
  ipcMain.handle('update:apply', async (e) => {
    try {
      return { ok: true, ...(await update((step) => e.sender.send('update:progress', step))) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  // Redémarrage après la mise à jour : la fenêtre enregistre d'abord le document ouvert.
  // Programme d'installation : lancé seul, le logiciel se ferme pour qu'il remplace ses fichiers.
  ipcMain.on('update:restart', () => {
    if (pendingSetup) {
      spawn(pendingSetup, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      pendingSetup = null;
    } else {
      app.relaunch();
    }
    const win = getWindow();
    if (win) win.close(); else app.quit();
  });
}

module.exports = { registerUpdater, compareVersions, changesSince, releaseNotes, readTar, installedVersion, updatesEnabled: enabled };
