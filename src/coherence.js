// Vérification de cohérence d'un long texte par le modèle d'IA local de l'AAT.
// 1. Le texte est lu par parties : pour chacune, le modèle relève les faits sur les personnes,
//    les lieux et les dates (âge, apparence, liens de famille, métier, lieu de vie, date…).
// 2. Les faits sont regroupés par nom ; pour chaque nom qui en a plusieurs, le modèle dit
//    lesquels se contredisent.
// Les vérifications simples (noms écrits de deux façons, dates impossibles) sont faites sans
// le modèle, dans l'interface (renderer/coherence.js).
const { ipcMain } = require('electron');
const local = require('./local-llm');
const { readSettings } = require('./assistant');
const { split, ZH_PART_CHARS } = require('./summary');
const { LANGS } = require('./languages');

const SYSTEM = 'Tu es l’aide à la relecture d’un logiciel d’écriture en français. Tu réponds toujours en français, avec précision, sans rien inventer.';
const MAX_FACTS = 15;
const MAX_SUBJECTS = 25;

const FACTS_SCHEMA = {
  type: 'object',
  properties: {
    faits: {
      type: 'array',
      maxItems: MAX_FACTS,
      items: {
        type: 'object',
        properties: { sujet: { type: 'string' }, fait: { type: 'string' }, citation: { type: 'string' } }
      }
    }
  }
};

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    contradictions: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: { explication: { type: 'string' }, faits: { type: 'array', maxItems: 4, items: { type: 'integer' } } }
      }
    }
  }
};

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Texte écrit (aussi) dans d'autres langues : les citations restent dans leur langue, le reste en français.
function languagesNote(langs) {
  const others = (langs || []).filter((l) => l !== 'fr' && LANGS[l]);
  if (!others.length) return [];
  const names = (langs || []).filter((l) => LANGS[l]).map((l) => LANGS[l].name);
  return [`Le texte peut être écrit en ${names.join(', ')} : copie les citations telles quelles, dans leur langue, et écris « fait » en français.`];
}

function factsPrompt(part, i, total, title, langs) {
  return [
    `Voici la partie ${i + 1} sur ${total} d’un texte${title ? ` intitulé « ${title} »` : ''}.`,
    ...languagesNote(langs),
    `Relève au plus ${MAX_FACTS} faits précis qui pourraient être contredits ailleurs dans le texte : l’âge d’une personne, son apparence, sa famille et ses liens avec les autres, son métier, où elle vit, une date ou une durée, le jour d’un événement, l’ordre des événements.`,
    'Pour chaque fait : « sujet » = le nom de la personne, du lieu ou de l’événement, tel qu’il est écrit ; « fait » = le fait en quelques mots ; « citation » = les mots exacts du texte qui le disent (moins de 15 mots).',
    'Ne relève que ce qui est écrit, n’invente rien. S’il n’y a aucun fait de ce genre, renvoie une liste vide.',
    '',
    'Partie :',
    '"""',
    part,
    '"""'
  ].join('\n');
}

function checkPrompt(subject, facts) {
  return [
    `Voici des faits sur « ${subject} », relevés à différents endroits d’un même texte, numérotés :`,
    ...facts.map((f, i) => `${i + 1}. ${f.fait} (« ${f.citation} »)`),
    '',
    'Y a-t-il de vraies contradictions entre ces faits ? Par exemple deux âges qui ne vont pas ensemble, deux couleurs d’yeux, deux métiers, deux dates différentes pour le même événement, un lien de famille qui change.',
    'Un changement expliqué par le temps qui passe ou par l’histoire n’est pas une contradiction. Ne signale que ce qui se contredit vraiment ; sinon, renvoie une liste vide.',
    'Pour chaque contradiction : « explication » = une phrase simple qui dit ce qui ne va pas ; « faits » = les numéros des faits concernés.'
  ].join('\n');
}

let current = null;

async function check(sender, { id, title, text, langs }) {
  if (current) current.abort();
  const controller = new AbortController();
  current = controller;
  const settings = await readSettings();
  local.setModelsDir(settings.modelsDir);
  if (!local.isDownloaded(settings.localModel)) return { error: 'Le modèle de l’Aide au texte n’est pas encore installé.', needsSetup: true };
  const progress = (done, total, step) => { if (!sender.isDestroyed()) sender.send('assist:coherenceProgress', { id, done, total, step }); };
  const gen = (prompt, schema, maxTokens) => local.generate(settings.localModel, { system: SYSTEM, examples: [], text: prompt }, { temperature: 0.1, maxTokens, schema, signal: controller.signal });
  try {
    const parts = /\p{Script=Han}/u.test(text) ? split(text, ZH_PART_CHARS) : split(text);
    if (!parts.length) return { error: 'Ce document est vide : il n’y a rien à vérifier.' };
    // 1. Les faits, partie par partie.
    const facts = [];
    for (let i = 0; i < parts.length; i++) {
      if (controller.signal.aborted) return { cancelled: true };
      progress(i, parts.length, 'faits');
      const res = await gen(factsPrompt(parts[i], i, parts.length, title, langs), FACTS_SCHEMA, 900);
      for (const f of (res && res.faits) || []) {
        if (!f || !f.sujet || !f.fait) continue;
        facts.push({ sujet: String(f.sujet).trim(), fait: String(f.fait).trim(), citation: String(f.citation || '').trim(), part: i });
      }
    }
    // 2. Regroupés par nom (« Léa » et « Léa Martin » vont ensemble).
    const groups = new Map();
    for (const f of facts) {
      const key = fold(f.sujet);
      if (!key) continue;
      const known = [...groups.keys()].find((k) => k === key || k.split(' ').includes(key) || key.split(' ').includes(k));
      const k = known || key;
      if (!groups.has(k)) groups.set(k, { subject: f.sujet, facts: [] });
      groups.get(k).facts.push(f);
    }
    const subjects = [...groups.values()].filter((g) => g.facts.length > 1)
      .sort((a, b) => b.facts.length - a.facts.length).slice(0, MAX_SUBJECTS);
    // 3. Les contradictions, nom par nom.
    const found = [];
    for (let i = 0; i < subjects.length; i++) {
      if (controller.signal.aborted) return { cancelled: true };
      progress(i, subjects.length, 'comparaison');
      const g = subjects[i];
      const list = g.facts.slice(0, 12);
      const res = await gen(checkPrompt(g.subject, list), CHECK_SCHEMA, 500);
      for (const c of (res && res.contradictions) || []) {
        const used = [...new Set((c.faits || []).map((n) => list[n - 1]).filter(Boolean))];
        if (!c.explication || used.length < 2) continue;
        found.push({ subject: g.subject, explanation: String(c.explication).trim(), facts: used.map(({ fait, citation }) => ({ fait, citation })) });
      }
    }
    return { contradictions: found, facts: facts.length, subjects: subjects.length, parts: parts.length };
  } catch (err) {
    if (controller.signal.aborted) return { cancelled: true };
    return { error: 'Le modèle n’a pas pu répondre : ' + (err && err.message ? err.message : 'erreur inconnue') };
  } finally {
    if (current === controller) current = null;
  }
}

function registerCoherence() {
  ipcMain.handle('assist:coherence', (e, request) => check(e.sender, request));
  ipcMain.handle('assist:coherenceCancel', () => { if (current) current.abort(); });
}

module.exports = { registerCoherence };
