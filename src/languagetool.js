// LanguageTool : correcteur de grammaire à règles, exécuté sur l'ordinateur (aucun texte n'est envoyé
// en ligne). Il tourne dans un petit serveur Java local, démarré à la première relecture et arrêté
// après une demi-heure sans demande (il occupe environ 1 Go de mémoire).
// Emplacements possibles :
// - resources/languagetool, livré avec le programme d'installation (scripts/build-windows.js) ;
// - %LOCALAPPDATA%\Tomatoes Text\LanguageTool, téléchargé une fois depuis le menu Édition.
// Chacun contient jre/ (Java), LanguageTool-<version>/ et installe.json.
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const LT_VERSION = '6.6';
const DOWNLOADS = {
  languagetool: {
    url: `https://languagetool.org/download/LanguageTool-${LT_VERSION}.zip`,
    sha256: '53600506b399bb5ffe1e4c8dec794fd378212f14aaf38ccef9b6f89314d11631',
    size: 251998221,
    folder: `LanguageTool-${LT_VERSION}`,
    entries: 2032
  },
  jre: {
    url: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jre_x64_windows_hotspot_21.0.13_9.zip',
    sha256: '2332c0b4cff6bed722da3567c91d5e47568bcba863fa4945d0a8d6fc76158628',
    size: 49106397,
    folder: 'jdk-21.0.13+9-jre',
    entries: 378
  }
};

// Langues du document -> langue de LanguageTool (le mandarin n'est pas pris en charge).
const LT_LANG = { fr: 'fr', en: 'en-US', de: 'de-DE', es: 'es', it: 'it', pt: 'pt-PT' };

// Remarques écartées : l'orthographe (Hunspell s'en charge, avec le dictionnaire personnel), les mots
// répétés (surlignés à part), les espaces et le style.
const DROPPED_TYPES = new Set(['misspelling', 'duplication', 'whitespace', 'style', 'register']);
const DROPPED_RULE = /SPELL|MORFOLOGIK|HUNSPELL/;
const DISABLED_RULES = ['UPPERCASE_SENTENCE_START', 'WHITESPACE_RULE', 'COMMA_PARENTHESIS_WHITESPACE', 'FRENCH_WHITESPACE', 'FRENCH_WHITESPACE_STRICT'];

const IDLE_STOP = 30 * 60 * 1000;
const START_TIMEOUT = 120 * 1000;

let electronApp = null;
try { electronApp = require('electron').app; } catch { /* banc d'essai sous Node */ }

function userDir() {
  if (process.env.FT_LANGUAGETOOL_DIR) return process.env.FT_LANGUAGETOOL_DIR;
  const base = process.env.LOCALAPPDATA || (electronApp ? electronApp.getPath('userData') : require('os').homedir());
  return path.join(base, 'Tomatoes Text', 'LanguageTool');
}

function candidates() {
  const list = [];
  if (process.env.FT_LANGUAGETOOL_DIR) list.push(process.env.FT_LANGUAGETOOL_DIR);
  if (process.resourcesPath) list.push(path.join(process.resourcesPath, 'languagetool'));
  list.push(userDir());
  return list;
}

// Installation trouvée : { dir, java, jar } ou null.
function find() {
  for (const dir of candidates()) {
    let info;
    try { info = JSON.parse(fs.readFileSync(path.join(dir, 'installe.json'), 'utf8')); } catch { continue; }
    const jar = path.join(dir, info.languagetool || DOWNLOADS.languagetool.folder, 'languagetool-server.jar');
    const java = process.env.FT_JAVA || path.join(dir, 'jre', 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java');
    if (fs.existsSync(jar) && (process.env.FT_JAVA || fs.existsSync(java))) return { dir, java, jar, version: info.version || LT_VERSION };
  }
  return null;
}

const installed = () => !!find();
const supports = (lang) => Object.prototype.hasOwnProperty.call(LT_LANG, lang);

// ----- Serveur local -----

let server = null; // { proc, port, ready }
let idleTimer = null;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function request(port, method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, method, timeout: 60000,
      headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), Accept: 'application/json' } : { Accept: 'application/json' }
    }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8');
        if (res.statusCode !== 200) return reject(new Error(`LanguageTool répond ${res.statusCode} : ${text.slice(0, 200)}`));
        try { resolve(JSON.parse(text)); } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('LanguageTool ne répond pas.')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function launch() {
  const found = find();
  if (!found) throw new Error('LanguageTool non installé.');
  const port = await freePort();
  const args = ['-Xms64m', '-Xmx1g', '-Dfile.encoding=UTF-8', '-cp', found.jar, 'org.languagetool.server.HTTPServer', '--port', String(port)];
  const proc = spawn(found.java, args, { cwd: path.dirname(found.jar), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let errText = '';
  proc.stderr.on('data', (c) => { errText = (errText + c.toString()).slice(-2000); });
  const entry = { proc, port, ready: null };
  const exited = new Promise((_, reject) => {
    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => reject(new Error(`LanguageTool s'est arrêté (code ${code}). ${errText.slice(-300)}`)));
  });
  proc.on('exit', () => { if (server === entry) server = null; });
  entry.ready = (async () => {
    const start = Date.now();
    while (Date.now() - start < START_TIMEOUT) {
      const alive = await Promise.race([request(port, 'GET', '/v2/languages').then(() => true, () => false), exited]);
      if (alive) return port;
      await Promise.race([new Promise((r) => setTimeout(r, 400)), exited]);
    }
    throw new Error('LanguageTool met trop de temps à démarrer.');
  })();
  entry.ready.catch(() => { try { proc.kill(); } catch { /* déjà arrêté */ } if (server === entry) server = null; });
  return entry;
}

async function ensure() {
  if (!server) server = await launch();
  const entry = server;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(stop, IDLE_STOP);
  if (idleTimer.unref) idleTimer.unref();
  return entry.ready;
}

function stop() {
  clearTimeout(idleTimer);
  if (server) { try { server.proc.kill(); } catch { /* déjà arrêté */ } }
  server = null;
}

// Remarques de LanguageTool sur un passage : [{ start, end, correction, autres, explication }].
async function check(text, lang) {
  if (!supports(lang)) throw new Error('Langue non prise en charge par LanguageTool.');
  if (!text.trim()) return [];
  const port = await ensure();
  const body = new URLSearchParams({ text, language: LT_LANG[lang], level: 'default', disabledRules: DISABLED_RULES.join(',') }).toString();
  const answer = await request(port, 'POST', '/v2/check', body);
  return toErrors(text, answer);
}

function toErrors(text, answer) {
  const out = [];
  for (const m of (answer && answer.matches) || []) {
    const rule = m.rule || {};
    if (DROPPED_TYPES.has(rule.issueType) || DROPPED_RULE.test(rule.id || '')) continue;
    const start = m.offset;
    const end = m.offset + m.length;
    if (!(start >= 0 && end > start && end <= text.length)) continue;
    const extrait = text.slice(start, end);
    const choices = (m.replacements || []).map((r) => r.value).filter((v) => typeof v === 'string' && v !== extrait);
    const unique = [...new Set(choices)];
    out.push({
      start,
      end,
      correction: unique.length ? unique[0] : null,
      autres: unique.slice(1, 3),
      explication: String(m.message || m.shortMessage || '').trim()
    });
  }
  return out;
}

// ----- Installation (téléchargement unique) -----

// ----- Allègement : seules les données des langues des documents (LT_LANG) et du mandarin sont gardées -----
// L'archive de LanguageTool contient une trentaine de langues (environ 390 Mo une fois déballée).
// Pour les autres langues, on retire leurs dictionnaires et leurs règles écrites (environ 190 Mo) ;
// leur code (.class) et leurs mots courants (common_words.txt) restent : LanguageTool déclare toutes
// ses langues au démarrage et s'en sert pour reconnaître la langue d'un texte.
// Le mandarin (zh) est gardé aussi, pour qu'il puisse être relu plus tard.
const KEPT_CODES = new Set([...Object.values(LT_LANG).map((l) => l.split('-')[0]), 'zh']);
const DROPPED_JARS = ['asturian-pos-dict.jar', 'catalan-pos-dict.jar', 'dutch-pos-dict.jar', 'languagetool-ga-dicts.jar',
  'lucene-gosen-ipadic.jar', 'morfologik-crh-lt.jar', 'morfologik-ukrainian-lt.jar'];
const KEPT_FILE = (name) => name.endsWith('.class') || name === 'common_words.txt';
// 1 : 2.5.3 (mandarin retiré) ; 2 : mandarin gardé. Une installation au niveau 1 n'a plus les
// données du mandarin : à réinstaller (menu Édition) le jour où il est relu.
const TRIM_LEVEL = 2;

// ltDir : dossier LanguageTool-<version>. Renvoie le nombre d'octets libérés.
async function trimLanguages(ltDir) {
  if (!fs.existsSync(path.join(ltDir, 'languagetool-server.jar'))) throw new Error('Dossier de LanguageTool introuvable.');
  let freed = 0;
  const removeFile = async (f) => {
    try { freed += (await fsp.lstat(f)).size; } catch { return; }
    await fsp.rm(f, { force: true });
  };
  const walk = async (dir) => {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) await walk(f);
      else if (!KEPT_FILE(e.name)) await removeFile(f);
    }
  };
  for (const sub of ['resource', 'rules']) {
    const base = path.join(ltDir, 'org', 'languagetool', sub);
    let names = [];
    try { names = await fsp.readdir(base, { withFileTypes: true }); } catch { continue; }
    // « de-DE-x-simple-language » (allemand simplifié) n'est pas une langue des documents.
    for (const e of names) if (e.isDirectory() && !KEPT_CODES.has(e.name)) await walk(path.join(base, e.name));
  }
  for (const jar of DROPPED_JARS) await removeFile(path.join(ltDir, 'libs', jar));
  return freed;
}

// Allège une installation existante (dossier contenant installe.json) si ce n'est pas déjà fait.
async function trimInstalled(dir) {
  const file = path.join(dir, 'installe.json');
  let info;
  try { info = JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return 0; }
  if ((info.allege || 0) >= TRIM_LEVEL) return 0;
  if (server) return 0; // serveur en marche : ce sera pour le prochain démarrage
  const freed = await trimLanguages(path.join(dir, info.languagetool || DOWNLOADS.languagetool.folder));
  await fsp.writeFile(file, JSON.stringify({ ...info, allege: TRIM_LEVEL }, null, 2));
  return freed;
}

// Au démarrage du logiciel : installations livrées avec le programme d'installation et téléchargées.
async function trimAll() {
  let freed = 0;
  for (const dir of [...new Set(candidates())]) {
    try { freed += await trimInstalled(dir); } catch { /* droits insuffisants ou fichiers en cours d'usage : on réessaiera */ }
  }
  return freed;
}

let installing = null;

function httpGet(url, signal) {
  let f = fetch;
  try { const { net: enet } = require('electron'); if (enet && enet.fetch) f = enet.fetch.bind(enet); } catch { /* Node */ }
  return f(url, { headers: { 'User-Agent': 'Tomatoes-Text' }, signal });
}

// Téléchargement interrompu s'il ne reçoit plus rien pendant une minute (connexion coupée).
async function download(item, file, onBytes) {
  const ctrl = new AbortController();
  let timer = null;
  const watch = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), 60000); };
  watch();
  try {
    const res = await httpGet(item.url, ctrl.signal);
    if (!res.ok || !res.body) throw new Error(`téléchargement refusé (${res.status}).`);
    const hash = crypto.createHash('sha256');
    const count = new Transform({ transform(c, _enc, cb) { watch(); hash.update(c); onBytes(c.length); cb(null, c); } });
    await pipeline(Readable.fromWeb(res.body), count, fs.createWriteStream(file));
    if (hash.digest('hex') !== item.sha256) throw new Error('fichier téléchargé altéré (empreinte incorrecte).');
  } catch (err) {
    if (ctrl.signal.aborted) throw new Error('téléchargement interrompu : aucune donnée reçue depuis une minute (connexion Internet ?).');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Commande lancée sans fenêtre ; onLine est appelé pour chaque ligne écrite (fichiers déballés).
function run(cmd, args, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let rest = '';
    let errText = '';
    const read = (c) => {
      const text = rest + c.toString();
      const lines = text.split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) if (l.trim()) onLine(l);
    };
    proc.stdout.on('data', read);
    proc.stderr.on('data', (c) => { errText = (errText + c.toString()).slice(-1000); read(c); });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} : code ${code}. ${errText.slice(-300)}`))));
  });
}

// Déballe une archive .zip ; onFile est appelé pour chaque fichier déballé.
async function unzip(file, dest, onFile) {
  await fsp.mkdir(dest, { recursive: true });
  if (process.platform !== 'win32') return run('unzip', ['-o', file, '-d', dest], onFile);
  // tar.exe de Windows 10 et 11 lit les .zip (-v : un fichier par ligne) ; PowerShell sinon (plus lent).
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  try {
    await run(tar, ['-xvf', file, '-C', dest], onFile);
  } catch {
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${q(file)} -DestinationPath ${q(dest)} -Force`]);
  }
}

// Télécharge Java et LanguageTool, vérifie leurs empreintes et les déballe.
// onProgress({ step: 'download' | 'extract' | 'done', pct, detail }) ; pct = avancement global (0 à 100) :
// téléchargement jusqu'à 80 %, déballage ensuite.
function install(onProgress = () => {}) {
  if (installing) return installing;
  installing = (async () => {
    const dir = userDir();
    const work = path.join(dir, '.installation');
    await fsp.rm(work, { recursive: true, force: true });
    await fsp.mkdir(work, { recursive: true });
    const mb = (n) => Math.round(n / 1048576);
    const total = DOWNLOADS.jre.size + DOWNLOADS.languagetool.size;
    let done = 0;
    let last = '';
    const report = (step, pct, detail) => {
      const key = step + Math.floor(pct) + detail;
      if (key !== last) { last = key; onProgress({ step, pct: Math.floor(pct), detail }); }
    };
    const tick = (n) => { done += n; report('download', Math.min(80, (done / total) * 80), `${mb(done)} Mo sur ${mb(total)} Mo`); };
    report('download', 0, `0 Mo sur ${mb(total)} Mo`);
    const jreZip = path.join(work, 'jre.zip');
    const ltZip = path.join(work, 'languagetool.zip');
    await download(DOWNLOADS.jre, jreZip, tick);
    await download(DOWNLOADS.languagetool, ltZip, tick);
    stop();
    const unpacked = path.join(work, 'contenu');
    const files = DOWNLOADS.jre.entries + DOWNLOADS.languagetool.entries;
    let count = 0;
    const onFile = () => { count++; report('extract', 80 + Math.min(19, (count / files) * 19), `${Math.min(count, files)} fichiers sur ${files}`); };
    report('extract', 80, `0 fichier sur ${files}`);
    await unzip(jreZip, unpacked, onFile);
    await unzip(ltZip, unpacked, onFile);
    await fsp.rm(path.join(dir, 'jre'), { recursive: true, force: true });
    await fsp.rm(path.join(dir, DOWNLOADS.languagetool.folder), { recursive: true, force: true });
    await fsp.rename(path.join(unpacked, DOWNLOADS.jre.folder), path.join(dir, 'jre'));
    await fsp.rename(path.join(unpacked, DOWNLOADS.languagetool.folder), path.join(dir, DOWNLOADS.languagetool.folder));
    await trimLanguages(path.join(dir, DOWNLOADS.languagetool.folder));
    await fsp.writeFile(path.join(dir, 'installe.json'), JSON.stringify({ version: LT_VERSION, languagetool: DOWNLOADS.languagetool.folder, allege: TRIM_LEVEL }, null, 2));
    await fsp.rm(work, { recursive: true, force: true });
    report('done', 100, '');
    return find();
  })().finally(() => { installing = null; });
  return installing;
}

const isInstalling = () => !!installing;

module.exports = { LT_VERSION, DOWNLOADS, TRIM_LEVEL, trimLanguages, trimAll, find, installed, supports, check, toErrors, stop, install, isInstalling, userDir };
