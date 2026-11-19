// Processus à part pour le modèle d'IA local (lancé par local-llm.js avec utilityProcess d'Electron).
// llama.cpp s'y charge (bibliothèques de la carte graphique, modèle de plusieurs Go) sans figer la
// fenêtre ; les demandes arrivent par messages, les réponses repartent de même.
const moteur = require('./llm-moteur');

const port = process.parentPort;
const controllers = new Map(); // demande -> AbortController

port.on('message', async (e) => {
  const m = e.data || {};
  if (m.op === 'abort') {
    const c = controllers.get(m.ref);
    if (c) c.abort();
    return;
  }
  if (m.dir) moteur.setModelsDir(m.dir);
  if ('custom' in m) moteur.setCustomModel(m.custom);
  const args = m.args || [];
  try {
    let value;
    if (m.op === 'generate') {
      const c = new AbortController();
      controllers.set(m.id, c);
      try {
        value = await moteur.generate(args[0], args[1], { ...(args[2] || {}), signal: c.signal });
      } finally {
        controllers.delete(m.id);
      }
    } else if (m.op === 'downloadModel') {
      value = await moteur.downloadModel(args[0], (progress) => port.postMessage({ id: m.id, progress }));
    } else if (['preload', 'deleteModel', 'cancelDownload', 'memoryState'].includes(m.op)) {
      value = await moteur[m.op](...args);
    } else {
      throw new Error('Demande inconnue : ' + m.op);
    }
    port.postMessage({ id: m.id, ok: true, value });
  } catch (err) {
    port.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
  }
});
