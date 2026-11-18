// Essai de la relecture grammaticale avec le vrai modèle, hors du logiciel.
// Sous Windows, avec le logiciel installé (pas besoin de Node.js) :
//   $env:ELECTRON_RUN_AS_NODE=1; & "$env:LOCALAPPDATA\Programs\Tomatoes Text\Tomatoes Text.exe" scripts\test-grammaire.js
// Variables facultatives : FT_APP (dossier resources\app du logiciel installé), FT_MODEL (fichier .gguf),
// FT_LANG (en, de, es, it, pt ou zh : phrases d'essai dans cette langue ; français par défaut).
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

// grammar.js est prévu pour Electron : on lui fournit le strict nécessaire.
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return { ipcMain: { handle() {} }, app: { getPath: () => process.cwd() } };
  return load.call(this, request, ...rest);
};
const { buildPrompt, locate, chunks, SCHEMA } = require('../src/grammar');

// Le logiciel installé : « Tomatoes Text », ou son ancien nom « Frame Text » s'il n'a pas été renommé.
const installed = (name) => path.join(process.env.LOCALAPPDATA || '', 'Programs', name, 'resources', 'app');
const appDir = process.env.FT_APP || [installed('Tomatoes Text'), installed('Frame Text')].find((d) => require('fs').existsSync(d)) || installed('Tomatoes Text');
const modelFile = process.env.FT_MODEL || 'C:\\Local LLM\\Mistral Nemo 12B\\Mistral-Nemo-Instruct-2407-Q4_K_M.gguf';

const SAMPLES = [
  'Les élèves qui sont venu hier on rendu leurs devoirs en retard.',
  'Je pense qu’il faut que tu viens demain pour voir les résultats.',
  'Elle s’est permise de critiquer les décisions que nous avons pris.',
  'Ces livres sont à moi, mais ses cahiers sont à toi.',
  'Les fleurs que j’ai cueilli sentent bon et il y en a beaucoup.',
  'On a jamais vu une chose pareille dans ce village.',
  'Quand il sera arrivé, nous partirons ensemble vers la gare.',
  'Les auteur·rice·s ont présenté leurs travaux devant un public nombreux.',
  'Si j’aurais su, je ne serais pas venu à cette réunion interminable.',
  'Le chat et le chien se sont battu toute la nuit dans le jardin.',
  'Malgré la pluie, nous avons marché pendant trois heures sans nous arrêter.',
  'Il faut leur dire que leurs idées sont bonnes et qu’ils doivent continuer.'
];

// Phrases d'essai des autres langues (avec et sans fautes).
const FOREIGN_SAMPLES = {
  en: ['She don’t like the movies that we watched yesterday.', 'Their going to the park because its sunny.', 'He has went home early, and I has finished my work.', 'The results were better than we expected.'],
  de: ['Ich habe gestern mit meine Schwester gesprochen.', 'Er sagt, das er morgen kommt.', 'Wir gehen in den Park, weil das Wetter ist schön.', 'Die Kinder spielen im Garten.'],
  es: ['Los niños estaba jugando en el parque.', 'Espero que vienes a la fiesta mañana.', 'No se si ella a terminado el trabajo.', 'Ayer visitamos a nuestros abuelos.'],
  it: ['I ragazzi è andati a scuola presto.', 'Credo che lui ha ragione.', 'Loro anno comprato una casa nuova.', 'Domani andremo al mare con gli amici.'],
  pt: ['Os meninos estava a brincar no jardim.', 'Vou a praia amanhã de manhã.', 'Ele é um mal jogador, mais treina muito.', 'Ontem visitámos os nossos avós.'],
  zh: ['他高兴的说他明天在来。', '我已经做完了作业了，现在去玩。', '她跑的很快，大家都很惊讶。', '我们昨天去公园散步了。']
};
const LANG = process.env.FT_LANG && FOREIGN_SAMPLES[process.env.FT_LANG] ? process.env.FT_LANG : 'fr';
if (LANG !== 'fr') SAMPLES.splice(0, SAMPLES.length, ...FOREIGN_SAMPLES[LANG]);

(async () => {
  const { getLlama, LlamaChatSession } = await import(pathToFileURL(path.join(appDir, 'node_modules', 'node-llama-cpp', 'dist', 'index.js')).href);
  const llama = await getLlama({ gpu: 'auto', build: 'never' });
  let t = Date.now();
  const model = await llama.loadModel({ modelPath: modelFile });
  console.log(`Modèle chargé en ${((Date.now() - t) / 1000).toFixed(1)} s`);
  const grammar = await llama.createGrammarForJsonSchema(SCHEMA);
  for (const text of SAMPLES) {
    for (const [offset, part] of chunks(text)) {
      const prompt = buildPrompt(part, LANG);
      const context = await model.createContext({ contextSize: 4096 });
      const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: prompt.system });
      const history = [{ type: 'system', text: prompt.system }];
      for (const [q, a] of prompt.examples) history.push({ type: 'user', text: q }, { type: 'model', response: [a] });
      session.setChatHistory(history);
      t = Date.now();
      const raw = await session.prompt(prompt.text, { maxTokens: 600, temperature: 0.1, grammar });
      const kept = locate(part, grammar.parse(raw), offset);
      console.log(`\n« ${text} » (${((Date.now() - t) / 1000).toFixed(1)} s)`);
      console.log('  réponse :', raw);
      for (const f of kept) console.log(`  -> « ${text.slice(f.start, f.end)} » => « ${f.correction} » : ${f.explication}`);
      if (!kept.length) console.log('  -> aucune faute retenue');
      await context.dispose();
    }
  }
  await model.dispose();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
