// Petit modèle d'IA qui tourne directement sur l'ordinateur (gratuit, sans internet après le
// téléchargement). Moteur : llama.cpp, via la bibliothèque node-llama-cpp (llm-moteur.js).
// Le moteur travaille dans un processus à part (llm-processus.js) : démarrer llama.cpp charge les
// bibliothèques de la carte graphique d'un bloc, ce qui figeait la fenêtre une à deux secondes (au
// lancement, quand la relecture grammaticale commence, ou à l'ouverture de l'AAT). Si ce processus ne
// peut pas démarrer, le moteur tourne ici, comme avant.
const electron = require('electron');
const path = require('path');
const moteur = require('./llm-moteur');

const { MODELS, DEFAULT_MODEL, CUSTOM } = moteur;
const utilityProcess = electron.utilityProcess;

let dir = path.join(electron.app.getPath('userData'), 'modeles');
moteur.setModelsDir(dir);
let downloading = null; // modèle en cours de téléchargement

function modelsDir() {
  return dir;
}

// Dossier choisi dans les réglages de l'AAT.
function setModelsDir(newDir) {
  dir = newDir;
  moteur.setModelsDir(newDir);
}

// Modèle indiqué par l'utilisateur (fichier .gguf), ou '' : transmis aussi au processus à part.
let custom = '';
function setCustomModel(file) {
  custom = file || '';
  moteur.setCustomModel(custom);
}

const isDownloaded = (id) => moteur.isDownloaded(id);

function listModels() {
  return moteur.listModels().map((m) => ({ ...m, downloading: m.downloading || downloading === m.id }));
}

// ----- Processus à part -----

let child = null;
let worked = false; // le processus a déjà répondu une fois
let broken = !utilityProcess; // pas de processus à part : le moteur tourne ici
let seq = 0;
const pending = new Map(); // id -> { op, args, resolve, reject, onProgress }

function direct(job) {
  const [a, b, c] = job.args;
  const run = job.op === 'downloadModel' ? () => moteur.downloadModel(a, job.onProgress || (() => {}))
    : job.op === 'generate' ? () => moteur.generate(a, b, { ...(c || {}), signal: job.signal })
      : () => moteur[job.op](...job.args);
  return Promise.resolve().then(run).then(job.resolve, job.reject);
}

function start() {
  try {
    child = utilityProcess.fork(path.join(__dirname, 'llm-processus.js'), [], { serviceName: 'Tomatoes Text - IA locale' });
  } catch {
    broken = true;
    return null;
  }
  // (Arrêté avec le logiciel.)
  electron.app.once('will-quit', () => { if (child) child.kill(); });
  child.on('message', (m) => {
    const job = pending.get(m && m.id);
    if (!job) return;
    if ('progress' in m) {
      if (job.onProgress) job.onProgress(m.progress);
      return;
    }
    worked = true;
    pending.delete(m.id);
    if (m.ok) job.resolve(m.value);
    else job.reject(new Error(m.error));
  });
  child.on('exit', () => {
    child = null;
    const jobs = [...pending.values()];
    pending.clear();
    // N'a jamais répondu (processus impossible à lancer ici) : le moteur tourne désormais dans ce
    // processus. Sinon (arrêt pendant une demande) : la demande échoue, le suivant relance le moteur.
    if (!worked) {
      broken = true;
      for (const job of jobs) direct(job);
    } else {
      for (const job of jobs) job.reject(new Error('Le moteur d’IA s’est arrêté.'));
    }
  });
  return child;
}

function ask(op, args, extra = {}) {
  return new Promise((resolve, reject) => {
    const job = { op, args, resolve, reject, ...extra };
    if (broken || (!child && !start())) return direct(job);
    const id = ++seq;
    pending.set(id, job);
    child.postMessage({ id, op, args, dir, custom });
    if (extra.signal) {
      extra.signal.addEventListener('abort', () => {
        if (child && pending.has(id)) child.postMessage({ op: 'abort', ref: id });
      }, { once: true });
    }
  });
}

// prompt : { system, examples: [[demande, réponse], …], text } (voir llm-moteur.js).
function generate(id, prompt, { signal, ...options } = {}) {
  if (signal && signal.aborted) return Promise.resolve('');
  return ask('generate', [id, prompt, options], { signal });
}

// Charge le modèle à l'avance (ouverture du tiroir) : le premier chargement prend plusieurs secondes.
function preload(id) {
  if (!isDownloaded(id)) return Promise.resolve();
  return ask('preload', [id]);
}

async function downloadModel(id, onProgress) {
  if (!MODELS[id]) throw new Error('Modèle inconnu.');
  if (downloading) throw new Error('Un téléchargement est déjà en cours.');
  downloading = id;
  try {
    await ask('downloadModel', [id], { onProgress });
  } finally {
    downloading = null;
  }
}

const cancelDownload = () => (downloading ? ask('cancelDownload', []) : Promise.resolve());
const deleteModel = (id) => ask('deleteModel', [id]);
const memoryState = () => ask('memoryState', []);

module.exports = { memoryState, MODELS, DEFAULT_MODEL, CUSTOM, setCustomModel, setModelsDir, modelsDir, listModels, isDownloaded, downloadModel, cancelDownload, deleteModel, preload, generate };
