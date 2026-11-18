// Travaux en arrière-plan. Le processus principal d'Electron reçoit aussi le clavier et la souris de la
// fenêtre : tant qu'il calcule, la fenêtre ne répond plus. Les calculs longs (lire ou écrire un gros
// document, charger un dictionnaire ou un thésaurus) se font donc dans un fil à part (worker_threads),
// qui exécute les fonctions d'un module. Si ce fil ne peut pas démarrer ou s'arrête, les fonctions
// sont exécutées sur place, comme avant.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Côté fil : exécute les fonctions demandées et renvoie leurs résultats (ou leurs erreurs).
if (!isMainThread && workerData && workerData.arrierePlan) {
  const mod = require(workerData.arrierePlan);
  parentPort.on('message', async ({ id, name, args }) => {
    try {
      const value = await mod[name](...args);
      parentPort.postMessage({ id, ok: true, value });
    } catch (err) {
      parentPort.postMessage({ id, ok: false, error: { message: String((err && err.message) || err), code: err && err.code } });
    }
  });
}

// Côté processus principal : tache(module).call(nom, [arguments]) -> promesse du résultat.
function tache(file) {
  let direct = null;
  const local = () => direct || (direct = require(file));
  // (Déjà dans un fil : pas de fil dans le fil.)
  if (!isMainThread) return { call: async (name, args = []) => local()[name](...args) };
  let worker = null;
  let broken = false;
  let seq = 0;
  const waiting = new Map(); // id -> { name, args, resolve, reject }

  const runHere = (job) => Promise.resolve().then(() => local()[job.name](...job.args)).then(job.resolve, job.reject);

  function fail() {
    if (broken) return;
    broken = true;
    worker = null;
    const jobs = [...waiting.values()];
    waiting.clear();
    for (const job of jobs) runHere(job);
  }

  function start() {
    try {
      worker = new Worker(__filename, { workerData: { arrierePlan: file } });
    } catch {
      broken = true;
      return null;
    }
    worker.unref();
    worker.on('message', ({ id, ok, value, error }) => {
      const job = waiting.get(id);
      if (!job) return;
      waiting.delete(id);
      if (!waiting.size && worker) worker.unref();
      if (ok) job.resolve(value);
      else job.reject(Object.assign(new Error(error.message), error.code ? { code: error.code } : {}));
    });
    worker.on('error', fail);
    worker.on('exit', fail);
    return worker;
  }

  function call(name, args = []) {
    return new Promise((resolve, reject) => {
      const job = { name, args, resolve, reject };
      if (broken || (!worker && !start())) return runHere(job);
      const id = ++seq;
      try {
        // (Les arguments sont copiés ici, au moment de l'appel, comme JSON.stringify le faisait.)
        worker.postMessage({ id, name, args });
      } catch {
        return runHere(job); // donnée impossible à copier : calculée sur place
      }
      waiting.set(id, job);
      // (Un appel en attente garde le processus en vie, comme une lecture de fichier.)
      if (waiting.size === 1) worker.ref();
    });
  }

  return { call };
}

module.exports = { tache };
