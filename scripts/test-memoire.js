// Essai de la mémoire du modèle local, hors du logiciel : une vingtaine de demandes à la suite
// (synonymes, reformulations, grammaire), avec ce que garde le modèle et la place libre sur la carte graphique.
// Sous Windows, avec le logiciel installé (pas besoin de Node.js) :
//   $env:ELECTRON_RUN_AS_NODE=1; & "$env:LOCALAPPDATA\Programs\Tomatoes Text\Tomatoes Text.exe" scripts\test-memoire.js
// Variables facultatives : FT_APP (dossier resources\app du logiciel installé), FT_MODELS (dossier des modèles),
// FT_MODEL_ID (mistral-nemo-12b ou mistral-7b).
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { pathToFileURL } = require('url');

// Le logiciel installé : « Tomatoes Text », ou son ancien nom « Frame Text » s'il n'a pas été renommé.
const installed = (name) => path.join(process.env.LOCALAPPDATA || '', 'Programs', name, 'resources', 'app');
const appDir = process.env.FT_APP || [installed('Tomatoes Text'), installed('Frame Text')].find((d) => require('fs').existsSync(d)) || installed('Tomatoes Text');
const llamaUrl = pathToFileURL(path.join(appDir, 'node_modules', 'node-llama-cpp', 'dist', 'index.js')).href;

const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { ipcMain: { handle() {} }, app: { getPath: () => process.cwd() }, dialog: {}, BrowserWindow: {} };
  if (request === './local-llm') return local.exports; // défini juste après
  return load.call(this, request, ...rest);
};

// Le local-llm.js de ce dossier, mais avec la bibliothèque node-llama-cpp du logiciel installé.
const file = path.join(__dirname, '..', 'src', 'local-llm.js');
const local = new Module(file, module);
local.filename = file;
local.paths = Module._nodeModulePaths(path.dirname(file));
local._compile(fs.readFileSync(file, 'utf8').replace("import('node-llama-cpp')", `import(${JSON.stringify(llamaUrl)})`), file);

const thesaurus = require('../src/thesaurus');
const assistant = require('../src/assistant');
const grammar = require('../src/grammar');
const llm = local.exports;

const id = process.env.FT_MODEL_ID || 'mistral-nemo-12b';
llm.setModelsDir(process.env.FT_MODELS || 'C:\\Local LLM');

const LONG = [
  'La réunion de lundi a été reportée à la semaine prochaine, car plusieurs membres de l’équipe étaient absents.',
  'Nous en profiterons pour revoir le calendrier du projet et répartir les tâches qui restent à faire avant la fin du mois.',
  'Chacun devra préparer un court bilan de ce qu’il a accompli, des difficultés rencontrées et de ce dont il aurait besoin pour avancer.',
  'Les documents seront partagés la veille afin que tout le monde puisse les lire tranquillement.'
].join(' ');
const SHORT = 'Il faisait beau ce matin, alors nous sommes partis marcher le long de la rivière.';

const requests = [];
for (let round = 0; round < 4; round++) {
  requests.push(['synonymes', () => llm.generate(id, { system: thesaurus.SYSTEM, examples: thesaurus.EXAMPLES, text: thesaurus.ask('jolie', 'Il habite une **jolie** maison.') }, { temperature: 0.2, maxTokens: 120, schema: thesaurus.SCHEMA, urgent: true })]);
  for (const [style, intensity, text] of [['neutre', 'moyenne', SHORT], ['professionnel', 'forte', LONG], ['synthetique', 'moyenne', LONG]]) {
    const request = { style, intensity, text };
    requests.push([`reformulation ${style}`, () => llm.generate(id, assistant.buildPrompt(request), { temperature: 0.5, maxTokens: assistant.maxTokens(request) })]);
  }
  requests.push(['grammaire', () => llm.generate(id, grammar.buildPrompt('Il faut que tu viens demain. Les pommes que j’ai mangé étaient bonnes.'), { temperature: 0.1, maxTokens: 600, schema: grammar.SCHEMA })]);
}

(async () => {
  let t = Date.now();
  await llm.preload(id);
  const first = await llm.memoryState();
  console.log(`Modèle chargé en ${((Date.now() - t) / 1000).toFixed(1)} s :`, first);
  for (const [i, [label, run]] of requests.entries()) {
    t = Date.now();
    let answer;
    try {
      answer = await run();
    } catch (err) {
      answer = 'ERREUR ' + (err && err.message);
    }
    const state = (await llm.memoryState()) || {};
    const shown = (typeof answer === 'string' ? answer : JSON.stringify(answer)).replace(/\s+/g, ' ').slice(0, 90);
    console.log(`${String(i + 1).padStart(2)}. ${label.padEnd(28)} ${((Date.now() - t) / 1000).toFixed(1)} s | jetons gardés ${state.tokens}/${state.contextSize} | VRAM libre ${Math.round((state.vramFree || 0) / 2 ** 20)} Mo | ${shown}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
