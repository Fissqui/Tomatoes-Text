// Moteur du petit modèle d'IA qui tourne directement sur l'ordinateur (gratuit, sans internet après le
// téléchargement) : llama.cpp, via la bibliothèque node-llama-cpp. Il travaille dans un processus à part
// (llm-processus.js, voir local-llm.js) : démarrer llama.cpp (carte graphique) figeait la fenêtre.
// Sans électron (banc d'essai), local-llm.js l'utilise directement.
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

// Modèles proposés (Mistral AI, licence libre Apache 2.0), au format GGUF compressé en 4 bits.
// Mistral Nemo 12B écrit nettement mieux en français ; Mistral 7B est plus léger et plus rapide.
const MODELS = {
  'mistral-nemo-12b': {
    label: 'Mistral Nemo 12B (7,5 Go)',
    folder: 'Mistral Nemo 12B',
    url: 'https://huggingface.co/bartowski/Mistral-Nemo-Instruct-2407-GGUF/resolve/main/Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
    file: 'Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
    size: 7477208192
  },
  'mistral-7b': {
    label: 'Mistral 7B (4,4 Go)',
    folder: 'Mistral 7B',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    file: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
    size: 4372812000 // octets : un fichier plus petit est un téléchargement inachevé
  }
};
const DEFAULT_MODEL = 'mistral-nemo-12b';
// Banc d'essai : FT_MODELE_ESSAI=<fichier .gguf> ajoute un tout petit modèle « essai » (dans son dossier).
if (process.env.FT_MODELE_ESSAI) {
  MODELS.essai = { label: 'Essai', folder: path.basename(path.dirname(process.env.FT_MODELE_ESSAI)), file: path.basename(process.env.FT_MODELE_ESSAI), size: 1 };
}

let lib = null; // module node-llama-cpp, chargé à la première utilisation
let llama = null;
let loaded = null; // { id, model, context, sequence }
let download = null; // { id, downloader }

let dir = '';

function modelsDir() {
  return dir;
}

// Dossier choisi dans les réglages de l'AAT.
function setModelsDir(newDir) {
  dir = newDir;
}

// Chaque modèle a son propre sous-dossier, au nom du modèle (ex. « C:\Local LLM\Mistral 7B »).
function modelPath(id) {
  return path.join(modelsDir(), MODELS[id].folder, MODELS[id].file);
}

// Le modèle n'est prêt que si le fichier est complet (pas en cours de téléchargement).
function isDownloaded(id) {
  if (!MODELS[id]) return false;
  try {
    return fsSync.statSync(modelPath(id)).size >= MODELS[id].size;
  } catch {
    return false;
  }
}

async function getLib() {
  if (!lib) lib = await import('node-llama-cpp');
  return lib;
}

// Utilise la carte graphique si possible (Vulkan), sinon le processeur.
async function getEngine() {
  if (llama) return llama;
  const { getLlama } = await getLib();
  try {
    llama = await getLlama({ gpu: 'auto', build: 'never' });
  } catch {
    llama = await getLlama({ gpu: false, build: 'never' });
  }
  return llama;
}

// Mémoire de travail du modèle (en jetons). Elle est réservée une seule fois, juste après le chargement,
// et sert à toutes les demandes : en recréer une à chaque demande finissait par ne plus tenir dans la
// carte graphique (8 Go, presque tous pris par Mistral Nemo).
const CONTEXT = { min: 2048, max: 4096 };

async function unload() {
  if (!loaded) return;
  const old = loaded;
  loaded = null;
  await old.context.dispose().catch(() => {});
  await old.model.dispose();
}

async function getLoaded(id) {
  if (loaded && loaded.id === id) return loaded;
  await unload();
  const engine = await getEngine();
  // Le nombre de couches mises sur la carte graphique laisse la place à la mémoire de travail.
  let model = await engine.loadModel({ modelPath: modelPath(id), gpuLayers: { fitContext: { contextSize: CONTEXT.max } } });
  let context;
  try {
    context = await model.createContext({ contextSize: CONTEXT });
  } catch {
    // La carte graphique s'est remplie entre-temps (autre logiciel) : moins de couches sur elle.
    const fewer = Math.floor(model.gpuLayers * 0.7);
    await model.dispose();
    model = await engine.loadModel({ modelPath: modelPath(id), gpuLayers: fewer });
    context = await model.createContext({ contextSize: CONTEXT });
  }
  loaded = { id, model, context, sequence: context.getSequence() };
  return loaded;
}

// Charge le modèle à l'avance (ouverture du tiroir) : le premier chargement prend plusieurs secondes.
function preload(id) {
  if (!isDownloaded(id)) return Promise.resolve();
  return enqueue(() => getLoaded(id).then(() => {}));
}

function listModels() {
  return Object.entries(MODELS).map(([id, m]) => ({
    id,
    label: m.label,
    downloaded: isDownloaded(id),
    partial: !isDownloaded(id) && fsSync.existsSync(modelPath(id)),
    downloading: !!download && download.id === id
  }));
}

async function downloadModel(id, onProgress) {
  if (!MODELS[id]) throw new Error('Modèle inconnu.');
  if (download) throw new Error('Un téléchargement est déjà en cours.');
  download = { id, downloader: null };
  try {
    const target = path.dirname(modelPath(id));
    await fs.mkdir(target, { recursive: true });
    const { createModelDownloader } = await getLib();
    download.downloader = await createModelDownloader({
      modelUri: MODELS[id].url,
      dirPath: target,
      fileName: MODELS[id].file,
      onProgress: ({ totalSize, downloadedSize }) => onProgress(totalSize ? downloadedSize / totalSize : 0)
    });
    await download.downloader.download();
  } finally {
    download = null;
  }
}

async function cancelDownload() {
  if (download && download.downloader) await download.downloader.cancel();
}

// Passe par la file d'attente : le modèle n'est jamais retiré pendant qu'il répond ou se charge.
function deleteModel(id) {
  return enqueue(async () => {
    if (loaded && loaded.id === id) await unload();
    await fs.rm(modelPath(id), { force: true });
  }, true);
}

// Une seule génération à la fois. Une demande urgente (synonymes) passe devant celles en attente, et
// interrompt la relecture grammaticale en cours (« preemptible ») : celle-ci est refaite ensuite.
const jobs = [];
let busy = null; // demande en cours

function enqueue(run, urgent = false, preempt = null) {
  return new Promise((resolve, reject) => {
    const job = { run, resolve, reject, preempt };
    if (urgent) jobs.unshift(job);
    else jobs.push(job);
    if (urgent && busy && busy.preempt) busy.preempt();
    pump();
  });
}

function pump() {
  if (busy || !jobs.length) return;
  const job = jobs.shift();
  busy = job;
  job.run().then(job.resolve, job.reject).finally(() => {
    busy = null;
    pump();
  });
}

// prompt : { system, examples: [[demande, réponse], …], text }. Les exemples sont présentés au modèle
// comme un échange déjà passé : c'est ce qui le guide le mieux (langue, longueur, ton).
// Avec schema (schéma JSON), la réponse est forcée dans ce format et renvoyée déjà lue.
// Chaque demande repart de zéro : le modèle ne garde de la précédente que le début identique (les
// consignes et les exemples, déjà lus, ce qui fait gagner du temps) ; tout le reste est effacé.
// preemptible : une demande urgente peut l'interrompre ; elle échoue alors avec l'erreur « preempted ».
function generate(id, prompt, { temperature = 0.5, maxTokens = 1500, signal, schema, urgent = false, preemptible = false } = {}) {
  const stop = preemptible ? new AbortController() : null;
  if (stop && signal) signal.addEventListener('abort', () => stop.abort(), { once: true });
  const run = async () => {
    if (!isDownloaded(id)) throw new Error('not-downloaded');
    if (signal && signal.aborted) return '';
    if (stop && stop.signal.aborted) throw new Error('preempted');
    const { LlamaChatSession } = await getLib();
    const { sequence } = await getLoaded(id);
    const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: prompt.system });
    try {
      const history = [{ type: 'system', text: prompt.system }];
      for (const [question, answer] of prompt.examples || []) {
        history.push({ type: 'user', text: question }, { type: 'model', response: [answer] });
      }
      session.setChatHistory(history);
      const grammar = schema ? await (await getEngine()).createGrammarForJsonSchema(schema) : undefined;
      const answer = await session.prompt(prompt.text, {
        maxTokens,
        temperature,
        signal: stop ? stop.signal : signal,
        grammar,
        stopOnAbortSignal: true
      });
      if (stop && stop.signal.aborted && !(signal && signal.aborted)) throw new Error('preempted');
      return grammar ? grammar.parse(answer) : answer.trim();
    } catch (err) {
      await sequence.clearHistory().catch(() => {});
      throw err;
    } finally {
      session.dispose({ disposeSequence: false });
    }
  };
  return enqueue(run, urgent, stop ? () => stop.abort() : null);
}

// État de la mémoire, pour les essais (scripts/test-memoire.js).
async function memoryState() {
  if (!loaded) return null;
  const vram = await (await getEngine()).getVramState();
  return { gpuLayers: loaded.model.gpuLayers, contextSize: loaded.context.contextSize, tokens: loaded.sequence.nextTokenIndex, vramFree: vram.free };
}

module.exports = { memoryState, MODELS, DEFAULT_MODEL, setModelsDir, modelsDir, listModels, isDownloaded, downloadModel, cancelDownload, deleteModel, preload, generate };
