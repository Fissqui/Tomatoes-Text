// Essai du choix des synonymes par le vrai modèle, hors du logiciel.
// Sous Windows, avec le logiciel installé (pas besoin de Node.js) :
//   $env:ELECTRON_RUN_AS_NODE=1; & "$env:LOCALAPPDATA\Programs\Tomatoes Text\Tomatoes Text.exe" scripts\test-synonymes.js
// Variables facultatives : FT_APP (dossier resources\app du logiciel installé), FT_MODEL (fichier .gguf).
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

// thesaurus.js est prévu pour Electron : on lui fournit le strict nécessaire.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { ipcMain: { handle() {} }, app: { getPath: () => process.cwd() } };
  return load.call(this, request, ...rest);
};
const { sentenceOf, ask, clean, poolOf, SYSTEM, EXAMPLES, SCHEMA } = require('../src/thesaurus');

// Le logiciel installé : « Tomatoes Text », ou son ancien nom « Frame Text » s'il n'a pas été renommé.
const installed = (name) => path.join(process.env.LOCALAPPDATA || '', 'Programs', name, 'resources', 'app');
const appDir = process.env.FT_APP || [installed('Tomatoes Text'), installed('Frame Text')].find((d) => require('fs').existsSync(d)) || installed('Tomatoes Text');
const modelFile = process.env.FT_MODEL || 'C:\\Local LLM\\Mistral Nemo 12B\\Mistral-Nemo-Instruct-2407-Q4_K_M.gguf';

// [avant, mot, après]
const SAMPLES = [
  ['Ce chemin est ', 'long', ' et plein de cailloux.'],
  ['Nous avons passé une ', 'longue', ' soirée à discuter.'],
  ['Elle était très ', 'heureuse', ' de revoir ses amis.'],
  ['Il habite une ', 'jolie', ' maison près de la rivière.'],
  ['Le chat ', 'mangeait', ' sa pâtée dans la cuisine.'],
  ['Cette entreprise est une vieille ', 'maison', ' de couture parisienne.'],
  ['Il faut ', 'regarder', ' les chiffres avec attention.'],
  ['C’est un ', 'grand', ' écrivain du siècle dernier.'],
  ['Le problème est ', 'difficile', ' à résoudre.'],
  ['Les enfants ', 'parlaient', ' doucement dans la salle.']
];

(async () => {
  const { getLlama, LlamaChatSession } = await import(pathToFileURL(path.join(appDir, 'node_modules', 'node-llama-cpp', 'dist', 'index.js')).href);
  const llama = await getLlama({ gpu: 'auto', build: 'never' });
  let t = Date.now();
  const model = await llama.loadModel({ modelPath: modelFile });
  console.log(`Modèle chargé en ${((Date.now() - t) / 1000).toFixed(1)} s`);
  const grammar = await llama.createGrammarForJsonSchema(SCHEMA);
  for (const [before, word, after] of SAMPLES) {
    const sentence = sentenceOf(word, { before, after });
    const pool = await poolOf(word);
    console.log(`\n« ${sentence} »`);
    console.log('  thésaurus seul :', pool.slice(0, 6).join(', ') || '(aucun)');
    const context = await model.createContext({ contextSize: { min: 2048, max: 4096 } });
    const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: SYSTEM });
    const history = [{ type: 'system', text: SYSTEM }];
    for (const [q, a] of EXAMPLES) history.push({ type: 'user', text: q }, { type: 'model', response: [a] });
    session.setChatHistory(history);
    t = Date.now();
    const raw = await session.prompt(ask(word, sentence), { maxTokens: 120, temperature: 0.2, grammar });
    const answer = grammar.parse(raw);
    console.log(`  modèle (${((Date.now() - t) / 1000).toFixed(1)} s) :`, (answer.synonymes || []).join(', ') || '(aucun)');
    console.log('  gardés (sans le filtre Hunspell) :', clean(answer, word.toLowerCase(), null).join(', ') || '(aucun)');
    await context.dispose();
  }
  await model.dispose();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
