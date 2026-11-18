// Calculs de langue, exécutés en arrière-plan (voir arriere-plan.js) : orthographe avec Hunspell
// (WebAssembly), langue de chaque passage, synonymes du thésaurus. Charger un dictionnaire ou un
// thésaurus prend un temps sensible : dans le processus principal, il figeait la fenêtre.
// Ce module ne lit pas le dictionnaire personnel : spell.js lui en donne les mots (setPersonal, addWords).
const path = require('path');
const fs = require('fs/promises');
const zlib = require('zlib');
const { pathToFileURL } = require('url');
const { LANGS, detect } = require('./languages');

const VENDOR = path.join(__dirname, 'vendor');

// Mots élidés acceptés devant un autre mot (l'homme, jusqu'à, lorsqu'on… ; l'uomo, dell'anno…).
const ELISIONS = {
  fr: new Set(['l', 'd', 'j', 'm', 'n', 's', 't', 'c', 'ç', 'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu', 'presqu', 'quelqu']),
  it: new Set(['l', 'd', 'c', 'm', 't', 's', 'v', 'n', 'un', 'dell', 'nell', 'all', 'dall', 'sull', 'coll', 'quest', 'quell', 'bell', 'sant', 'tutt'])
};

const spellers = new Map(); // langue -> correcteur (un ou plusieurs dictionnaires Hunspell)
const loading = new Map(); // langue -> chargement en cours
let personal = []; // mots du dictionnaire personnel

// Un correcteur réunit les dictionnaires d'une langue (anglais américain et britannique, portugais
// du Portugal et du Brésil) : un mot est juste s'il l'est dans l'un d'eux.
function combine(list) {
  const [main, ...others] = list;
  return {
    testSpelling: (w) => list.some((h) => h.testSpelling(w)),
    getSpellingSuggestions(w) {
      const out = [...main.getSpellingSuggestions(w)];
      for (const h of others) for (const s of h.getSpellingSuggestions(w)) if (!out.includes(s)) out.push(s);
      return out;
    },
    stemWord(w) {
      const out = [];
      for (const h of list) for (const s of h.stemWord(w)) if (!out.includes(s)) out.push(s);
      return out;
    },
    addWord: (w) => list.forEach((h) => h.addWord(w)),
    dispose: () => list.forEach((h) => h.dispose())
  };
}

async function load(lang) {
  const meta = LANGS[lang] || LANGS.fr;
  if (!meta.dicts.length) return null; // mandarin : pas de dictionnaire d'orthographe
  const { createHunspellFromFiles } = await import(pathToFileURL(path.join(VENDOR, 'hunspell-wasm', 'dist', 'Hunspell.js')).href);
  const list = [];
  for (const name of meta.dicts) {
    const dict = path.join(VENDOR, name);
    list.push(await createHunspellFromFiles(path.join(dict, 'index.aff'), path.join(dict, 'index.dic')));
  }
  const h = list.length === 1 ? list[0] : combine(list);
  for (const word of personal) h.addWord(word);
  const old = spellers.get(lang);
  if (old) old.dispose();
  spellers.set(lang, h);
  return h;
}

// Correcteur d'une langue (null pour le mandarin).
function ready(lang = 'fr') {
  if (!LANGS[lang]) lang = 'fr';
  if (!loading.has(lang)) loading.set(lang, load(lang).catch((err) => { loading.delete(lang); throw err; }));
  return loading.get(lang);
}

// Mots du dictionnaire personnel. reset : des mots ont été retirés (ou le dossier a changé) : les
// correcteurs déjà chargés sont refaits.
async function setPersonal(list, reset) {
  personal = Array.isArray(list) ? list.map(String) : [];
  if (!reset) return;
  const langs = loading.size ? [...loading.keys()] : [];
  loading.clear();
  await Promise.all(langs.map((l) => ready(l).catch(() => null)));
}

// Mots ajoutés au dictionnaire personnel : donnés aux correcteurs déjà chargés.
async function addWords(list) {
  await Promise.all([...loading.values()].map((p) => p.catch(() => null)));
  for (const word of list || []) {
    if (personal.includes(word)) continue;
    personal.push(word);
    for (const h of spellers.values()) if (h) h.addWord(word);
  }
}

// (Chargement anticipé : renvoie seulement si la langue a un dictionnaire.)
async function preload(lang) {
  return !!(await ready(lang));
}

function isCorrect(h, word, lang = 'fr') {
  if (h.testSpelling(word)) return true;
  // Apostrophe courbe : les dictionnaires étrangers ne connaissent que l'apostrophe droite (don't, l'uomo).
  if (word.includes('’') && lang !== 'fr') return isCorrect(h, word.replace(/’/g, '\''), lang);
  // Écriture inclusive : « auteur·rice·s » est juste si « auteur » l'est.
  if (word.includes('·')) {
    const base = word.split('·')[0];
    return base.length > 1 && isCorrect(h, base, lang);
  }
  // Élision : l'homme, jusqu'à, dell'anno…
  const elided = word.match(/^([\p{L}]+)['’](.+)$/u);
  if (elided && ELISIONS[lang] && ELISIONS[lang].has(elided[1].toLowerCase())) return isCorrect(h, elided[2], lang);
  // Mots composés : chaque partie doit exister (« dit-il », « porte-avions »…).
  if (word.includes('-')) {
    const parts = word.split('-').filter(Boolean);
    return parts.length > 1 && parts.every((p) => p.length === 1 || isCorrect(h, p, lang));
  }
  return false;
}

// Mot en écriture chinoise : jamais vérifié (le mandarin n'a pas de dictionnaire d'orthographe).
const HAN = /\p{Script=Han}/u;

async function check(list, lang) {
  const h = await ready(lang);
  return list.map((w) => !h || HAN.test(w) || isCorrect(h, w, lang));
}

async function suggest(word, lang) {
  const h = await ready(lang || 'fr');
  return h ? h.getSpellingSuggestions(word).slice(0, 6) : [];
}

// Langue de chaque passage, parmi celles du document.
async function detectAll(texts, langs) {
  const found = {};
  if (langs.length > 1) {
    await Promise.all(langs.map(async (l) => {
      try { found[l] = await ready(l); } catch { /* reconnue sans dictionnaire */ }
    }));
  }
  return texts.map((t) => detect(t, langs, found));
}

// ----- Thésaurus -----

const tables = new Map(); // langue -> (mot en minuscules -> synonymes, sans doublons)
const loadings = new Map();

const keyOf = (lang, word) => (lang === 'de' ? word : word.toLowerCase());

async function loadThesaurus(lang) {
  const meta = LANGS[lang];
  const map = new Map();
  if (!meta || !meta.thesaurus) return map;
  const file = path.join(__dirname, 'vendor', meta.thesaurus);
  let data = await fs.readFile(file);
  if (file.endsWith('.gz')) data = zlib.gunzipSync(data);
  const lines = data.toString('utf8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const [entry, count] = lines[i].split('|');
    const n = Number(count);
    if (!entry || !n) continue;
    // En allemand, la majuscule distingue le nom (« Schnelle ») de l'adjectif (« schnelle ») : la casse est gardée.
    const word = keyOf(lang, entry);
    const list = map.get(word) || [];
    for (let j = 1; j <= n && i + j < lines.length; j++) {
      // Chaque sens : « (Nature)|syn1|syn2… »
      for (const s of lines[i + j].split('|').slice(1)) {
        const syn = s.trim();
        if (syn && syn !== word && !list.includes(syn)) list.push(syn);
      }
    }
    map.set(word, list);
    i += n;
  }
  return map;
}

function thesaurus(lang = 'fr') {
  if (!LANGS[lang]) lang = 'fr';
  if (!loadings.has(lang)) {
    loadings.set(lang, loadThesaurus(lang).then((map) => { tables.set(lang, map); return map; }).catch((err) => { loadings.delete(lang); throw err; }));
  }
  return loadings.get(lang);
}

// Les synonymes les plus proches d'abord : ceux qui renvoient eux-mêmes au mot, et qui partagent
// le plus de synonymes avec lui (un mot à plusieurs sens mélange sinon des sens éloignés).
function ranked(table, word) {
  const list = table.get(word) || [];
  const own = new Set(list);
  return list
    .map((syn, i) => {
      const theirs = table.get(table.has(syn) ? syn : syn.toLowerCase()) || [];
      let shared = 0;
      for (const t of theirs) if (own.has(t)) shared++;
      const back = theirs.some((t) => t === word || t.toLowerCase() === word) ? 1.5 : 0;
      return { syn, score: back + (6 * shared) / Math.sqrt((theirs.length + 5) * (list.length + 5)) + 0.3 / (1 + i / 5) };
    })
    .sort((a, b) => b.score - a.score)
    .map((o) => o.syn);
}

const ok = (h, form, lemma) => h.testSpelling(form) && h.stemWord(form).includes(lemma);

// Terminaisons de l'infinitif, pour accorder un verbe au même temps (langues romanes seulement).
const INFINITIVES = { fr: /(er|ir|re|oir)$/, es: /(ar|er|ir)$/, pt: /(ar|er|ir|or)$/, it: /(are|ere|ire|rre)$/ };

// Accorde un synonyme comme le mot de départ (lemme -> forme), ou renvoie null.
function inflect(h, syn, lemma, form, lang = 'fr') {
  if (form === lemma) return syn;
  if (syn.includes(' ')) return null;
  // 1. Même changement de fin de mot : manger -> mangeons donne dévorer -> dévorons.
  let p = 0;
  while (p < lemma.length && p < form.length && lemma[p] === form[p]) p++;
  for (let q = p; q >= Math.max(0, p - 3); q--) {
    const from = lemma.slice(q);
    if (!syn.endsWith(from)) continue;
    const base = syn.slice(0, syn.length - from.length);
    let to = form.slice(q);
    const tries = [to];
    if (/^e[aoâ]/.test(to)) tries.push(to.slice(1)); // mangeons -> dévorons
    if (/[aoâ]/.test(to[0]) && /g$/.test(base)) tries.push('e' + to);
    for (const t of tries) if (ok(h, base + t, syn)) return base + t;
  }
  // 2. Même temps du verbe d'un groupe à l'autre : courir -> courait donne galoper -> galopait.
  const inf = INFINITIVES[lang];
  const lm = inf && inf.exec(lemma);
  const sm = inf && inf.exec(syn);
  if (lm && sm) {
    if (!form.startsWith(lemma.slice(0, lm.index))) return null;
    let end = form.slice(lm.index);
    if (/[gc]$/.test(lemma.slice(0, lm.index)) && /^e[aoâ]/.test(end)) end = end.slice(1); // mangeait -> mang|ait
    const base = syn.slice(0, sm.index);
    const tries = [end, end.replace(/^iss/, ''), end.replace(/^i/, ''), 'iss' + end];
    if (/^[aoâ]/.test(end) && /g$/.test(base)) tries.unshift('e' + end); // nageait
    const fixed = /^[aoâu]/.test(end) && /c$/.test(base) ? base.slice(0, -1) + 'ç' : base; // fonçait
    for (const t of tries) {
      if (ok(h, base + t, syn)) return base + t;
      if (fixed !== base && ok(h, fixed + t, syn)) return fixed + t;
    }
    return null; // un verbe : pas d'essai au hasard, qui donnerait un autre temps
  }
  // 3. Même terminaison (belles -> éclatantes) : la plus longue d'abord.
  for (let len = Math.min(3, form.length - 1); len >= 1; len--) {
    const end = form.slice(-len);
    for (let cut = 0; cut <= 1; cut++) {
      const cand = syn.slice(0, syn.length - cut) + end;
      if (cand !== syn && ok(h, cand, syn)) return cand;
    }
  }
  return null;
}

// Synonymes du thésaurus, accordés comme le mot (au plus `max`).
function fromThesaurus(h, lower, max, lang = 'fr', word = lower) {
  const table = tables.get(lang);
  if (!table) return [];
  // Le mot lui-même et sa forme de base (« heureuse » -> « heureux ») : la liste la plus riche d'abord.
  const key = lang === 'de' && !table.has(word) ? lower : keyOf(lang, word);
  const sources = [];
  if (table.has(key)) sources.push(key);
  if (h) {
    for (const stem of h.stemWord(lang === 'de' ? word : lower)) {
      const lemma = keyOf(lang, stem);
      if (lemma !== key && table.has(lemma) && !sources.includes(lemma)) sources.push(lemma);
    }
  }
  sources.sort((a, b) => table.get(b).length - table.get(a).length);
  const out = [];
  for (const lemma of sources) {
    for (const syn of ranked(table, lemma)) {
      if (out.length >= max) break;
      const form = lemma === key ? syn : h && inflect(h, syn, lemma, key, lang);
      if (form && form.toLowerCase() !== lower && !out.includes(form)) out.push(form);
    }
  }
  return out;
}

// Réponse du modèle -> synonymes vérifiés : bien écrits, deux mots au plus, et ni le mot lui-même ni
// une autre forme de lui (« mangé » pour « mangeait », « regarder de près » pour « regarder »).
// Les noms allemands gardent leur majuscule ; le mandarin s'écrit sans espaces entre les mots.
function cleanWith(answer, lower, h, lang = 'fr') {
  const out = [];
  const stems = (w) => (h ? h.stemWord(w).map((x) => x.toLowerCase()) : []);
  const own = new Set([lower, ...stems(lower)]);
  const bare = (w) => w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const root = bare(lower).slice(0, Math.max(4, lower.length - 5)); // « parl » pour « parlaient »
  for (const raw of (answer && answer.synonymes) || []) {
    let s = String(raw || '').replace(/[«»"*.,;:!?()。，、！？“”]/g, '').replace(/\s+/g, ' ').trim();
    if (lang !== 'de') s = s.toLowerCase();
    const low = s.toLowerCase();
    if (lang === 'zh') {
      if (!s || low === lower || s.length > 12 || s.includes(lower) || out.includes(s)) continue;
      out.push(s);
      continue;
    }
    // Un synonyme d'une expression peut compter un mot de plus (« grande maison » → « demeure spacieuse »).
    const maxWords = Math.max(2, lower.split(' ').length + 1);
    if (!s || low === lower || s.length > 30 || s.split(' ').length > maxWords || out.includes(s)) continue;
    const words = s.split(/[\s-]/).filter(Boolean);
    if (words.some((w) => own.has(w.toLowerCase()) || (root.length >= 4 && bare(w).startsWith(root)))) continue;
    if (h && !words.every((w) => h.testSpelling(w) || h.testSpelling(w.replace(/’/g, '\'')))) continue;
    if (h && stems(s).some((st) => own.has(st))) continue;
    out.push(s);
  }
  return out;
}

const hunspellOr = (lang) => ready(lang).catch(() => null);

// Synonymes du thésaurus pour un mot (au plus max), accordés comme lui.
async function pool(word, max, lang = 'fr') {
  if (!LANGS[lang]) lang = 'fr';
  await thesaurus(lang);
  const h = await hunspellOr(lang);
  return fromThesaurus(h, String(word).toLowerCase(), max, lang, String(word));
}

// Pistes du thésaurus pour un mot (sans Hunspell : seulement les entrées directes). Pour les essais.
async function poolOf(word, max, lang = 'fr') {
  await thesaurus(lang);
  return fromThesaurus(null, String(word).toLowerCase(), max, lang);
}

// Synonymes proposés par le modèle, vérifiés avec le dictionnaire de la langue.
async function clean(answer, lower, lang = 'fr') {
  return cleanWith(answer, lower, lang === 'zh' ? null : await hunspellOr(lang), lang);
}

module.exports = { setPersonal, addWords, preload, check, suggest, detectAll, pool, poolOf, clean, cleanWith };
