// Synonymes, dans la langue du mot (celle de son passage). Quand le modèle d'IA local est installé,
// il choisit des synonymes qui gardent le sens du mot dans sa phrase (le thésaurus mélange tous les
// sens d'un mot : « joli » y côtoie « épilogue »). Sinon, ou s'il tarde, on prend ceux du thésaurus
// de la langue (format MyThes : Dicollecte pour le français, LibreOffice pour les autres, voir
// src/vendor/thesaurus-*), lu au premier usage. Pour un mot accordé ou conjugué (« rapides »,
// « mangeons »), on cherche son infinitif ou son masculin singulier avec Hunspell, puis on accorde
// chaque synonyme de la même façon : seules les formes que le dictionnaire reconnaît sont proposées.
// Le mandarin n'a ni thésaurus ni dictionnaire : seul le modèle propose des synonymes.
// Le thésaurus et Hunspell travaillent en arrière-plan (langue-calcul.js) : lire un thésaurus figeait
// la fenêtre. Le modèle d'IA reste ici (un seul modèle chargé pour tout le logiciel).
const { ipcMain } = require('electron');
const { LANGS } = require('./languages');
const { cleanWith } = require('./langue-calcul');

const MAX = 6;
const POOL = 20;
const LLM_TIMEOUT = 15000;

let langue = async () => { throw new Error('pas encore prêt'); }; // calculs de langue (spell.js)
let readSettings = null;
let local = null; // ./local-llm, chargé seulement si on s'en sert

// ----- Choix par le modèle d'IA local, d'après la phrase -----

const SYSTEM = 'Tu es un lexicographe expert de la langue française. Tu proposes des synonymes justes, qui gardent le sens qu’un mot a dans sa phrase. Tu réponds toujours en français.';
const systemFor = (lang) => (lang === 'fr' || !LANGS[lang] ? SYSTEM
  : `Tu es un lexicographe expert de la langue ${LANGS[lang].tongue}. Tu proposes des synonymes justes, en ${LANGS[lang].name}, qui gardent le sens qu’un mot a dans sa phrase.`);

const SCHEMA = {
  type: 'object',
  properties: { synonymes: { type: 'array', maxItems: MAX, items: { type: 'string' } } }
};

// Le modèle seul choisit mieux : les pistes du thésaurus l'entraînaient vers d'autres sens du mot.
function ask(word, sentence, lang = 'fr') {
  const foreign = lang !== 'fr' && LANGS[lang];
  return [
    `Phrase : « ${sentence} »`,
    `Mot : « ${word} »`,
    '',
    ...(foreign ? [`La phrase est en ${LANGS[lang].name}. Les synonymes doivent être des mots ${lang === 'zh' ? 'chinois (mandarin, caractères simplifiés si la phrase les emploie)' : LANGS[lang].name + 's'}, jamais traduits en français.`] : []),
    `Propose jusqu’à ${MAX} synonymes de « ${word} » qui gardent le sens qu’il a dans cette phrase et qui peuvent le remplacer`,
    'tel quel : même nature, même genre et même nombre ; pour un verbe, même temps et même personne.',
    'Un mot (ou une très courte expression) par synonyme, du plus proche au plus éloigné. N’invente pas de mot.',
    'Ne reprends pas le mot lui-même dans une expression. S’il n’y a pas de bon synonyme dans ce sens, renvoie une liste vide.'
  ].join('\n');
}

const EXAMPLES = [
  [
    ask('mangeaient', 'Elles **mangeaient** des pommes dans le jardin.'),
    JSON.stringify({ synonymes: ['dévoraient', 'croquaient', 'savouraient', 'grignotaient', 'avalaient'] })
  ],
  [
    ask('long', 'Ce film est vraiment **long** et un peu ennuyeux.'),
    JSON.stringify({ synonymes: ['interminable', 'lent', 'laborieux', 'sans fin'] })
  ],
  [
    ask('jolie', 'Ils habitent une **jolie** maison au bord de la mer.'),
    JSON.stringify({ synonymes: ['belle', 'charmante', 'ravissante', 'mignonne', 'coquette', 'agréable'] })
  ]
];

// Les mêmes exemples dans les autres langues (un exemple français entraînerait des réponses en français).
const FOREIGN_EXAMPLES = {
  en: [
    ['ate', 'They **ate** apples in the garden.', ['devoured', 'consumed', 'munched', 'gobbled', 'nibbled']],
    ['long', 'This film is really **long** and a bit boring.', ['lengthy', 'interminable', 'drawn-out', 'tedious']],
    ['pretty', 'They live in a **pretty** house by the sea.', ['lovely', 'charming', 'beautiful', 'attractive', 'delightful', 'nice']]
  ],
  de: [
    ['aßen', 'Sie **aßen** Äpfel im Garten.', ['verspeisten', 'verzehrten', 'naschten', 'futterten']],
    ['lang', 'Dieser Film ist wirklich **lang** und etwas langweilig.', ['langwierig', 'endlos', 'zäh', 'ausgedehnt']],
    ['hübschen', 'Sie wohnen in einem **hübschen** Haus am Meer.', ['schönen', 'reizenden', 'netten', 'charmanten', 'entzückenden']]
  ],
  es: [
    ['comían', 'Ellas **comían** manzanas en el jardín.', ['devoraban', 'saboreaban', 'mordisqueaban', 'tomaban']],
    ['larga', 'Esta película es muy **larga** y un poco aburrida.', ['extensa', 'interminable', 'pesada', 'lenta']],
    ['bonita', 'Viven en una **bonita** casa junto al mar.', ['linda', 'hermosa', 'preciosa', 'encantadora', 'bella', 'agradable']]
  ],
  it: [
    ['mangiavano', 'Loro **mangiavano** mele in giardino.', ['divoravano', 'gustavano', 'sgranocchiavano', 'consumavano']],
    ['lungo', 'Questo film è davvero **lungo** e un po’ noioso.', ['interminabile', 'prolisso', 'lento', 'pesante']],
    ['bella', 'Abitano in una **bella** casa sul mare.', ['graziosa', 'incantevole', 'splendida', 'carina', 'deliziosa', 'piacevole']]
  ],
  pt: [
    ['comiam', 'Elas **comiam** maçãs no jardim.', ['devoravam', 'saboreavam', 'mordiscavam', 'consumiam']],
    ['longo', 'Este filme é mesmo **longo** e um pouco aborrecido.', ['extenso', 'interminável', 'demorado', 'arrastado']],
    ['bonita', 'Eles vivem numa **bonita** casa à beira-mar.', ['linda', 'bela', 'encantadora', 'graciosa', 'agradável']]
  ],
  zh: [
    ['吃', '她们在花园里**吃**苹果。', ['品尝', '享用', '啃']],
    ['长', '这部电影真的很**长**，有点无聊。', ['冗长', '漫长', '拖沓']],
    ['漂亮', '他们住在海边一栋**漂亮**的房子里。', ['美丽', '好看', '精致', '雅致', '迷人']]
  ]
};

const examplesFor = (lang) => (FOREIGN_EXAMPLES[lang]
  ? FOREIGN_EXAMPLES[lang].map(([word, sentence, list]) => [ask(word, sentence, lang), JSON.stringify({ synonymes: list })])
  : EXAMPLES);

const cache = new Map();

async function fromModel(word, sentence, lang = 'fr') {
  if (!readSettings || !sentence) return null;
  const settings = await readSettings();
  if (!local) local = require('./local-llm');
  local.setModelsDir(settings.modelsDir);
  if (!local.isDownloaded(settings.localModel)) return null;
  const key = lang + '\u0000' + word + '\u0000' + sentence;
  if (cache.has(key)) return cache.get(key);
  const controller = new AbortController();
  let timer = null;
  // Le délai court aussi pendant l'attente de son tour : passé ce délai, le thésaurus répond seul.
  const late = new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(null); }, LLM_TIMEOUT); });
  try {
    const answer = await Promise.race([late, local.generate(settings.localModel, { system: systemFor(lang), examples: examplesFor(lang), text: ask(word, sentence, lang) },
      { temperature: 0.2, maxTokens: 120, schema: SCHEMA, signal: controller.signal, urgent: true })]);
    if (controller.signal.aborted || !answer) return null;
    const list = await langue('clean', answer, word.toLowerCase(), lang);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    cache.set(key, list);
    return list;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function matchCase(model, word) {
  if (model.length > 1 && model === model.toUpperCase() && model !== model.toLowerCase()) return word.toUpperCase();
  if (model[0] !== model[0].toLowerCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

// context : { before, after } (le texte autour du mot, dans son paragraphe) ; lang : langue du passage.
async function synonyms(word, context, lang = 'fr') {
  word = String(word || '').trim();
  if (!LANGS[lang]) lang = 'fr';
  if (!word || word.length > 60) return [];
  let pool = [];
  try { pool = await langue('pool', word, POOL, lang); } catch { /* sans thésaurus */ }
  const sentence = context ? sentenceOf(word, context) : '';
  const chosen = await fromModel(word, sentence, lang);
  let out = chosen || [];
  // Le modèle en a trouvé peu : on complète avec le thésaurus.
  if (out.length < 3) for (const s of pool) if (out.length < (chosen && chosen.length ? 3 : MAX) && !out.includes(s)) out.push(s);
  return out.slice(0, MAX).map((s) => matchCase(word, s));
}

// La phrase du mot, le mot marqué **ainsi** (au plus quelques centaines de caractères).
function sentenceOf(word, { before = '', after = '' }) {
  before = String(before).slice(-400);
  after = String(after).slice(0, 400);
  const cut = before.search(/(?:[.!?…]\s+|[。！？])(?=[^.!?…。！？]*$)/);
  if (cut >= 0) before = before.slice(cut).replace(/^(?:[.!?…]\s+|[。！？])/, '');
  const end = after.search(/[.!?…](\s|$)|[。！？]/);
  if (end >= 0) after = after.slice(0, end + 1);
  return (before + '**' + word + '**' + after).replace(/\s+/g, ' ').trim();
}

// options.langue : calcul de langue en arrière-plan, après le dictionnaire personnel (spell.js langueCall).
function registerThesaurus(options) {
  langue = options.langue;
  readSettings = options.readSettings || null;
  ipcMain.handle('thesaurus:synonyms', async (_e, word, context, lang) => {
    try {
      return await synonyms(word, context, lang);
    } catch {
      return [];
    }
  });
}

// Pistes du thésaurus pour un mot (sans Hunspell : seulement les entrées directes). Pour les essais.
function poolOf(word, lang = 'fr') {
  return require('./langue-calcul').poolOf(word, POOL, lang);
}

module.exports = { registerThesaurus, synonyms, sentenceOf, ask, clean: cleanWith, poolOf, systemFor, examplesFor, SYSTEM, EXAMPLES, SCHEMA };
