// Résumé d'un document entier par le modèle d'IA local de l'AAT.
// Le modèle ne lit qu'environ 4 000 jetons à la fois : un long document est coupé en parties,
// chaque partie est résumée, puis les résumés des parties sont réunis en un seul.
const { ipcMain } = require('electron');
const path = require('path');
const local = require('./local-llm');
const { readSettings } = require('./assistant');
const { readJson, writeJson } = require('./json-files');
const { LANGS } = require('./languages');

const SYSTEM = 'Tu es l’aide à la rédaction d’un logiciel d’écriture en français. Tu écris toujours en français correct et naturel, sans aucun mot anglais.';
const PART_CHARS = 5000; // environ 1 500 jetons : la consigne et la réponse tiennent à côté
const ZH_PART_CHARS = 1500;

const LENGTHS = {
  court: { ask: 'Résume ce document en deux ou trois phrases.', tokens: 220 },
  moyen: { ask: 'Résume ce document en un paragraphe d’environ 120 à 150 mots.', tokens: 400 },
  points: { ask: 'Résume ce document en 5 à 8 points clés, un par ligne, chaque ligne commençant par « – ».', tokens: 500 }
};

const RULES = 'Garde les faits importants : noms, lieux, dates, chiffres, décisions. N’invente rien, n’ajoute aucun avis ni commentaire, ne traduis pas. Réponds uniquement par le résumé, sans titre, sans phrase d’introduction comme « Ce document parle de ».';

// Coupe le texte en parties d'au plus `max` caractères, entre deux paragraphes si possible.
// Le chinois compte à peu près un jeton par caractère : ses parties sont plus courtes.
function split(text, max = PART_CHARS) {
  const parts = [];
  let cur = '';
  for (const para of text.split(/\n+/)) {
    if (!para.trim()) continue;
    if (para.length > max) {
      if (cur) { parts.push(cur); cur = ''; }
      // Paragraphe immense : coupé entre deux phrases.
      let rest = para;
      while (rest.length > max) {
        let cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('。', max));
        if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
        if (cut < 1) cut = max;
        parts.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      cur = rest.trim();
      continue;
    }
    if (cur && cur.length + para.length + 1 > max) { parts.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + para;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function clean(answer) {
  return String(answer || '').trim()
    .replace(/^(?:voici (?:le|un) résumé[^:\n]*:|résumé\s*:)\s*/i, '')
    .replace(/^"""\s*|\s*"""$/g, '')
    .trim();
}

let current = null;

// Document écrit surtout dans une autre langue : le résumé est écrit dans cette langue.
function systemFor(lang) {
  if (!lang || lang === 'fr' || !LANGS[lang]) return SYSTEM;
  return `Tu es l’aide à la rédaction d’un logiciel d’écriture. Tu écris toujours en ${LANGS[lang].name} correct et naturel, la langue du document.`;
}
const inLanguage = (lang) => (lang && lang !== 'fr' && LANGS[lang] ? ` Écris le résumé en ${LANGS[lang].name}, la langue du document.` : '');

async function summarize(sender, { id, title, text, length, lang }) {
  if (current) current.abort();
  const controller = new AbortController();
  current = controller;
  const settings = await readSettings();
  local.setModelsDir(settings.modelsDir);
  if (!local.isDownloaded(settings.localModel)) {
    return { error: 'Le modèle de l’AAT n’est pas encore installé.', needsSetup: true };
  }
  const want = LENGTHS[length] || LENGTHS.moyen;
  const name = title ? ` intitulé « ${title} »` : '';
  const progress = (done, total, step) => { if (!sender.isDestroyed()) sender.send('assist:summaryProgress', { id, done, total, step }); };
  const tokens = (n) => (lang === 'zh' ? n * 2 : n);
  const gen = (prompt, maxTokens) => local.generate(settings.localModel, { system: systemFor(lang), examples: [], text: prompt }, { temperature: 0.3, maxTokens: tokens(maxTokens), signal: controller.signal });
  try {
    const size = lang === 'zh' ? ZH_PART_CHARS : PART_CHARS;
    let parts = split(text, size);
    if (!parts.length) return { error: 'Ce document est vide : il n’y a rien à résumer.' };
    // Résumés des parties, puis résumés de ces résumés tant qu'ils sont trop longs pour une seule lecture.
    let round = 0;
    while (parts.length > 1) {
      const notes = [];
      for (let i = 0; i < parts.length; i++) {
        if (controller.signal.aborted) return { cancelled: true };
        progress(i, parts.length, round ? 'regroupement' : 'lecture');
        const ask = `Voici la partie ${i + 1} sur ${parts.length} d’un document${name}. Résume cette partie en quelques phrases, au plus 120 mots. ${RULES}${inLanguage(lang)}\n\nPartie :\n"""\n${parts[i]}\n"""`;
        notes.push(clean(await gen(ask, 260)));
      }
      parts = split(notes.map((n, i) => `Partie ${i + 1} : ${n}`).join('\n'), size);
      round++;
      if (round > 4) break;
    }
    if (controller.signal.aborted) return { cancelled: true };
    progress(1, 1, 'final');
    const intro = round ? `Voici, dans l’ordre, les résumés des parties d’un document${name}.` : `Voici un document${name}.`;
    const ask = `${intro} ${want.ask} ${RULES}${inLanguage(lang)}\n\nTexte :\n"""\n${parts[0]}\n"""`;
    const summary = clean(await gen(ask, want.tokens));
    if (controller.signal.aborted) return { cancelled: true };
    return { text: summary, parts: round ? split(text, size).length : 1 };
  } catch (err) {
    if (controller.signal.aborted) return { cancelled: true };
    return { error: 'Le modèle n’a pas pu répondre : ' + (err && err.message ? err.message : 'erreur inconnue') };
  } finally {
    if (current === controller) current = null;
  }
}

// Résumés déjà faits, gardés dans le dossier du projet (resumes.json) : { docId: { hash, length, text, date } }.
function registerSummary(libraryDir) {
  const file = () => path.join(libraryDir(), 'resumes.json');
  ipcMain.handle('assist:summarize', (e, request) => summarize(e.sender, request));
  ipcMain.handle('assist:summaryCancel', () => { if (current) current.abort(); });
  ipcMain.handle('summary:load', () => readJson(file(), {}));
  ipcMain.handle('summary:save', (_e, all) => writeJson(file(), all || {}));
}

module.exports = { registerSummary, split, ZH_PART_CHARS };
