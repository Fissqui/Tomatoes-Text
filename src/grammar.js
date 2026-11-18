// Grammaire : le modèle d'IA local relève les fautes d'accord, de conjugaison et les homophones
// grammaticaux d'un paragraphe, dans la langue de ce passage. La réponse est forcée en JSON, puis
// chaque faute est retrouvée dans le texte : on ne garde que les remarques précises (un extrait
// court, vraiment présent). Les explications sont toujours en français.
const { ipcMain } = require('electron');
const local = require('./local-llm');
const { LANGS } = require('./languages');
const languagetool = require('./languagetool');

const SYSTEM = 'Tu es un correcteur expert de la langue française. Tu relèves les fautes de grammaire d’un texte sans jamais toucher à son style. Tu réponds toujours en français.';

const SCHEMA = {
  type: 'object',
  properties: {
    fautes: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          extrait: { type: 'string' },
          correction: { type: 'string' },
          explication: { type: 'string' }
        }
      }
    }
  }
};

function ask(text) {
  return [
    'Relève les fautes de grammaire du texte ci-dessous : accords (genre, nombre, participes passés), conjugaison,',
    'homophones grammaticaux (a/à, et/est, ce/se, ces/ses, on/ont, son/sont, leur/leurs, ou/où…), mode du verbe, négation incomplète.',
    'Rappels : après « il faut que », « bien que », « pour que »…, le verbe est au subjonctif ; le participe passé employé avec',
    '« avoir » s’accorde avec le complément d’objet direct seulement s’il est placé avant le verbe ; après « si », jamais de conditionnel',
    '(« si j’avais su », pas « si j’aurais su »).',
    'Ne signale pas : les fautes de frappe ou d’orthographe d’un mot isolé, le style, les répétitions, la ponctuation facultative,',
    'l’écriture inclusive (point médian), ni ce qui est correct.',
    'Pour chaque faute : « extrait » est le passage fautif copié exactement, en quelques mots seulement ; « correction » est ce même',
    'passage corrigé ; « explication » donne la règle en une phrase courte.',
    'Si le texte ne contient aucune faute de grammaire, renvoie une liste vide.',
    '',
    'Texte :',
    '"""',
    text,
    '"""'
  ].join('\n');
}

const EXAMPLES = [
  [
    ask('Les enfants a mangé les pommes que j’ai acheter hier, puis il sont partit se promener.'),
    JSON.stringify({
      fautes: [
        { extrait: 'Les enfants a mangé', correction: 'Les enfants ont mangé', explication: 'Le verbe s’accorde avec son sujet pluriel « les enfants ».' },
        { extrait: 'j’ai acheter', correction: 'j’ai achetées', explication: 'Après « avoir », on écrit le participe passé, accordé avec « les pommes », placé avant.' },
        { extrait: 'il sont partit', correction: 'ils sont partis', explication: 'Le sujet est pluriel, et le participe passé employé avec « être » s’accorde avec lui.' }
      ]
    })
  ],
  [
    ask('Il faut que tu fais attention aux lettres que tu as écrit à ta sœur.'),
    JSON.stringify({
      fautes: [
        { extrait: 'tu fais', correction: 'tu fasses', explication: 'Après « il faut que », le verbe se met au subjonctif.' },
        { extrait: 'tu as écrit', correction: 'tu as écrites', explication: 'Le complément d’objet direct « que » (les lettres) est placé avant : le participe passé s’accorde avec lui.' }
      ]
    })
  ],
  [
    ask('Nous sommes allés au marché ce matin, puis nous avons préparé le repas avec les légumes que nous avions choisis.'),
    JSON.stringify({ fautes: [] })
  ]
];

// ----- Autres langues : mêmes consignes, avec les pièges propres à chaque langue -----

const FOREIGN = {
  en: {
    points: 'accord du sujet et du verbe (he go / he goes), temps et formes verbales (have went), homophones (its/it’s, their/there/they’re, your/you’re, then/than, to/too, whose/who’s), article a/an, pluriels irréguliers, comparatifs (more better)',
    examples: [
      ['The children was playing in the garden when there mother called them, and they comes back quickly.', [
        ['The children was', 'The children were', 'Le sujet « children » est pluriel : le verbe se met au pluriel.'],
        ['there mother', 'their mother', '« their » est le possessif ; « there » signifie « là ».'],
        ['they comes', 'they come', 'Au présent, le verbe ne prend pas de -s avec « they ».']
      ]],
      ['If I would have known, I would have went to the meeting.', [
        ['If I would have known', 'If I had known', 'Après « if », on emploie le plus-que-parfait, jamais « would ».'],
        ['would have went', 'would have gone', 'Après « have », on emploie le participe passé « gone ».']
      ]],
      ['We visited the old castle yesterday and took many photos of its towers.', []]
    ]
  },
  de: {
    points: 'cas après les prépositions et les verbes (mit + datif, für + accusatif), terminaisons des adjectifs, accord du verbe, place du verbe (en deuxième position, à la fin dans une subordonnée), das/dass, seid/seit, wider/wieder, genre et article des noms',
    examples: [
      ['Ich gehe mit meinen Freund ins Kino, weil der Film ist sehr gut.', [
        ['mit meinen Freund', 'mit meinem Freund', '« mit » est suivi du datif : « meinem Freund ».'],
        ['weil der Film ist sehr gut', 'weil der Film sehr gut ist', 'Dans une subordonnée introduite par « weil », le verbe conjugué va à la fin.']
      ]],
      ['Ich glaube, das du recht hast, und wir sind seid gestern hier.', [
        ['das du recht hast', 'dass du recht hast', 'La conjonction « que » s’écrit « dass ».'],
        ['seid gestern', 'seit gestern', '« seit » (depuis) se distingue de « seid » (du verbe sein).']
      ]],
      ['Gestern haben wir einen langen Spaziergang am Fluss gemacht.', []]
    ]
  },
  es: {
    points: 'accord en genre et en nombre, conjugaison, subjonctif (quiero que vengas, cuando llegues), ser/estar, haber/a ver, hay/ahí/ay, porque/por qué/porqué, si/sí, tu/tú, el/él, mas/más, accent écrit qui change le sens',
    examples: [
      ['Las niñas estaba muy cansados porque habían caminado mucho.', [
        ['Las niñas estaba', 'Las niñas estaban', 'Le verbe s’accorde avec le sujet pluriel « las niñas ».'],
        ['muy cansados', 'muy cansadas', 'L’adjectif s’accorde avec « las niñas », féminin pluriel.']
      ]],
      ['Quiero que vienes mañana y no se por qué no lo hiciste.', [
        ['Quiero que vienes', 'Quiero que vengas', 'Après « quiero que », le verbe se met au subjonctif.'],
        ['no se por qué', 'no sé por qué', '« sé » (du verbe saber) porte un accent écrit.']
      ]],
      ['Ayer fuimos al mercado y compramos frutas frescas para la semana.', []]
    ]
  },
  it: {
    points: 'accord en genre et en nombre, auxiliaire essere/avere et accord du participe passé, congiuntivo (penso che sia, credo che abbia), homophones a/ha, e/è, o/ho, anno/hanno, apostrophe (un amico, un’amica, qual è)',
    examples: [
      ['Le ragazze è andati al mare e anno fatto il bagno.', [
        ['Le ragazze è andati', 'Le ragazze sono andate', 'Le verbe s’accorde avec le sujet pluriel, et le participe passé avec « le ragazze », féminin pluriel.'],
        ['anno fatto', 'hanno fatto', '« hanno » est le verbe avere ; « anno » signifie « an ».']
      ]],
      ['Penso che lui ha ragione, ma qual’è il problema?', [
        ['Penso che lui ha ragione', 'Penso che lui abbia ragione', 'Après « penso che », le verbe se met au subjonctif (congiuntivo).'],
        ['qual’è', 'qual è', '« qual è » s’écrit sans apostrophe.']
      ]],
      ['Ieri siamo andati al mercato e abbiamo comprato frutta fresca.', []]
    ]
  },
  pt: {
    points: 'accord en genre et en nombre, conjugaison, crase (à/a), há/a, mas/mais, mal/mau, porque/por que/porquê, onde/aonde, place du pronom (disse-me), subjonctif (quero que venhas)',
    examples: [
      ['As meninas estava muito cansados e foram a praia de manhã.', [
        ['As meninas estava', 'As meninas estavam', 'Le verbe s’accorde avec le sujet pluriel « as meninas ».'],
        ['muito cansados', 'muito cansadas', 'L’adjectif s’accorde avec « as meninas », féminin pluriel.'],
        ['foram a praia', 'foram à praia', '« ir a » + « a praia » : la préposition et l’article se contractent en « à » (crase).']
      ]],
      ['Ele é um mal aluno, mais estuda muito.', [
        ['um mal aluno', 'um mau aluno', '« mau » est l’adjectif (contraire de « bom ») ; « mal » est l’adverbe.'],
        ['mais estuda', 'mas estuda', '« mas » marque l’opposition ; « mais » signifie « plus ».']
      ]],
      ['Ontem fomos ao mercado e comprámos fruta fresca para a semana.', []]
    ]
  },
  zh: {
    points: 'particules 的/地/得 (的 devant un nom, 地 devant un verbe, 得 après un verbe), caractères confondus (在/再, 做/作, 已/以), classificateurs (一个人, 一本书), place de 了 et des compléments de temps et de lieu, négation 不/没',
    examples: [
      ['他高兴的跑过来，说他跑的很快。', [
        ['高兴的跑', '高兴地跑', '« 地 » relie un adverbe au verbe qui suit.'],
        ['跑的很快', '跑得很快', '« 得 » introduit le complément de degré après le verbe.']
      ]],
      ['我们明天在见，我已经做完了作业。', [
        ['明天在见', '明天再见', '« 再 » signifie « de nouveau » ; « 在 » indique le lieu.']
      ]],
      ['昨天我们去市场买了一些新鲜的水果。', []]
    ]
  }
};

function askForeign(text, lang) {
  const { name } = LANGS[lang];
  return [
    `Le texte ci-dessous est en ${name}. Relève ses fautes de grammaire selon les règles de cette langue : ${FOREIGN[lang].points}.`,
    'Ne signale pas : les fautes de frappe ou d’orthographe d’un mot isolé, le style, les répétitions, la ponctuation facultative,',
    'les mots d’une autre langue, ni ce qui est correct.',
    'Pour chaque faute : « extrait » est le passage fautif copié exactement, en quelques mots seulement ; « correction » est ce même',
    `passage corrigé, en ${name} ; « explication » donne la règle en une phrase courte, en français.`,
    'Si le texte ne contient aucune faute de grammaire, renvoie une liste vide.',
    '',
    'Texte :',
    '"""',
    text,
    '"""'
  ].join('\n');
}

const foreignSystem = (lang) => `Tu es un correcteur expert de la langue ${LANGS[lang].tongue}. Tu relèves les fautes de grammaire d’un texte sans jamais toucher à son style. Tu écris tes explications en français.`;

function foreignExamples(lang) {
  return FOREIGN[lang].examples.map(([text, list]) => [
    askForeign(text, lang),
    JSON.stringify({ fautes: list.map(([extrait, correction, explication]) => ({ extrait, correction, explication })) })
  ]);
}

function buildPrompt(text, lang = 'fr') {
  if (FOREIGN[lang]) return { system: foreignSystem(lang), examples: foreignExamples(lang), text: askForeign(text, lang) };
  return { system: SYSTEM, examples: EXAMPLES, text: ask(text) };
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const sameApostrophes = (s) => s.replace(/’/g, '\'');
const matchCase = (first, s) => (first === first.toUpperCase() ? s[0].toUpperCase() : s[0].toLowerCase()) + s.slice(1);

// Remarques du modèle -> fautes situées dans le texte ({ start, end, correction, explication }).
function locate(text, answer, offset = 0) {
  const found = [];
  const plain = sameApostrophes(text);
  const lower = plain.toLowerCase();
  for (const f of (answer && answer.fautes) || []) {
    const extrait = String(f.extrait || '').trim();
    let correction = String(f.correction || '').trim();
    if (!extrait || !correction || extrait.length > 80 || extrait === correction) continue;
    // Une « correction » qui réécrit la phrase n'est pas une faute de grammaire.
    if (Math.abs(words(extrait) - words(correction)) > 2) continue;
    // Des mots seulement ajoutés à la suite de l'extrait : le modèle complète au lieu de corriger.
    if (correction.startsWith(extrait + ' ')) continue;
    let start = text.indexOf(extrait);
    if (start < 0) start = plain.indexOf(sameApostrophes(extrait));
    // Le modèle change parfois la majuscule du début de phrase.
    if (start < 0) {
      start = lower.indexOf(sameApostrophes(extrait).toLowerCase());
      if (start >= 0 && text[start] !== extrait[0]) correction = matchCase(text[start], correction);
    }
    // Même extrait déjà signalé : on cherche l'occurrence suivante.
    while (start >= 0 && found.some((x) => x.start === start + offset)) start = plain.indexOf(sameApostrophes(extrait), start + 1);
    if (start < 0) continue;
    // La correction reprend les apostrophes du texte.
    if (text.slice(start, start + extrait.length).includes('’')) correction = correction.replace(/'/g, '’');
    if (correction === text.slice(start, start + extrait.length)) continue;
    found.push({ start: start + offset, end: start + offset + extrait.length, correction, explication: String(f.explication || '').trim() });
  }
  return found;
}

// Les longs paragraphes sont relus par morceaux de quelques phrases.
function chunks(text, max = 1200) {
  const parts = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const cut = slice.search(/[.!?…]\s(?![\s\S]*[.!?…]\s)/);
      const cutZh = slice.search(/[。！？](?![\s\S]*[。！？])/);
      if (cut > 200) end = start + cut + 2;
      else if (cutZh > 100) end = start + cutZh + 1;
    }
    parts.push([start, text.slice(start, end)]);
    start = end;
  }
  return parts;
}

let readSettings = null;

async function check(text, lang) {
  if (!LANGS[lang]) lang = 'fr';
  // LanguageTool (règles, sur l'ordinateur) s'il est installé ; le modèle d'IA local sinon, ou pour le
  // mandarin, ou si LanguageTool ne démarre pas.
  if (languagetool.supports(lang) && languagetool.installed()) {
    try {
      return { errors: await languagetool.check(text, lang), engine: 'languagetool' };
    } catch (err) {
      console.error(err);
    }
  }
  const settings = await readSettings();
  local.setModelsDir(settings.modelsDir);
  if (!local.isDownloaded(settings.localModel)) return { unavailable: true };
  const result = [];
  for (const [offset, part] of chunks(text, lang === 'zh' ? 500 : 1200)) {
    try {
      const answer = await local.generate(settings.localModel, buildPrompt(part, lang), { temperature: 0.1, maxTokens: 600, schema: SCHEMA, preemptible: true });
      result.push(...locate(part, answer, offset));
    } catch (err) {
      // Interrompue par une demande de synonymes : le paragraphe sera relu ensuite.
      if (err && err.message === 'preempted') return { retry: true };
      // Réponse illisible ou coupée : ce morceau n'aura pas de remarque.
    }
  }
  return { errors: result };
}

function registerGrammar(options) {
  readSettings = options.readSettings;
  ipcMain.handle('grammar:check', (_e, text, lang) => check(String(text || ''), lang));
}

const stopGrammar = () => languagetool.stop();

module.exports = { registerGrammar, stopGrammar, buildPrompt, locate, chunks, SCHEMA };
