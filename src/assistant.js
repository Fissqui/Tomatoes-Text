// Aide au texte (AAT) : propositions de reformulation par un modèle d'IA local, hors ligne.
const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const local = require('./local-llm');
const { writeJson } = require('./json-files');
const { LANGS } = require('./languages');
const FOREIGN = require('./aat-langues');

const STYLES = {
  neutre: 'un style neutre et naturel',
  professionnel: 'un style professionnel : clair, précis et courtois, comme dans un courriel ou un rapport de travail',
  academique: 'un style académique vulgarisé : un raisonnement structuré, articulé par des connecteurs logiques (d’abord, ensuite, en effet, ainsi), un vocabulaire précis et un ton objectif, mais compréhensible par tous et sans jargon',
  synthetique: 'un résumé synthétique qui garde l’essentiel, y compris les informations pratiques (dates, heures, noms)'
};

// Intensité de la reformulation, choisie à côté du style. Pour le résumé, elle règle la longueur.
// (Essais : sans consignes très marquées, « légère » et « forte » donnaient presque le même texte.)
const INTENSITIES = {
  legere: {
    strength: 'Intensité légère : fais seulement des retouches. Garde les mêmes phrases, dans le même ordre, et la plupart des mots ; change uniquement les tournures maladroites ou qui ne collent pas au style.',
    summary: 'Raccourcis le passage d’environ un tiers, en gardant toutes ses idées.',
    temperature: 0.2
  },
  moyenne: {
    strength: 'Intensité moyenne : reformule chaque phrase avec d’autres mots, en gardant l’ordre des idées.',
    summary: 'Résume le passage en deux fois moins de mots environ, en gardant l’essentiel.',
    temperature: 0.5
  },
  forte: {
    strength: 'Intensité forte : réécris entièrement. Réorganise les phrases, change la structure et le vocabulaire : le texte doit être nettement différent de l’original, tout en disant la même chose.',
    summary: 'Résume le passage en une seule phrase courte.',
    temperature: 0.6
  }
};

// Un exemple par style et par intensité, montré au modèle avant le vrai passage (essais : sans
// exemple, les modèles répondent parfois en anglais, entre guillemets, ou ajoutent des détails).
const EXAMPLE_SOURCE = 'J’ai pas trop aimé le film qu’on a vu hier soir. Il était vraiment long, on s’ennuyait pas mal au milieu, et franchement les acteurs jouaient mal, sauf peut-être l’actrice principale.';
const EXAMPLES = {
  neutre: {
    legere: 'Je n’ai pas trop aimé le film qu’on a vu hier soir. Il était vraiment long, on s’ennuyait pas mal au milieu, et les acteurs jouaient mal, sauf peut-être l’actrice principale.',
    moyenne: 'Le film que nous avons vu hier soir ne m’a pas beaucoup plu. Il durait très longtemps, le milieu était assez ennuyeux, et le jeu des acteurs était mauvais, à part peut-être celui de l’actrice principale.',
    forte: 'À part peut-être l’actrice principale, les acteurs du film d’hier soir jouaient mal. Ajoutez à cela une durée interminable et un milieu franchement ennuyeux : je n’ai pas vraiment accroché.'
  },
  professionnel: {
    legere: 'Je n’ai pas vraiment apprécié le film vu hier soir. Il était très long, avec un passage ennuyeux au milieu, et les acteurs jouaient mal, sauf peut-être l’actrice principale.',
    moyenne: 'Le film visionné hier soir ne m’a pas convaincu. Il était trop long, avec un net essoufflement au milieu, et l’interprétation était faible, à l’exception peut-être de l’actrice principale.',
    forte: 'Mon avis sur le film d’hier soir est plutôt négatif. Deux points posent problème : une durée excessive, qui entraîne un creux en milieu de récit, et une interprétation globalement faible, dont seule l’actrice principale se distingue peut-être.'
  },
  academique: {
    legere: 'Je n’ai pas vraiment apprécié le film vu hier soir. En effet, il était très long, ce qui rendait le milieu ennuyeux, et les acteurs jouaient mal, à l’exception peut-être de l’actrice principale.',
    moyenne: 'Le film vu hier soir m’a déçu, pour deux raisons. D’abord, sa longueur : le rythme faiblit au milieu, ce qui crée de l’ennui. Ensuite, le jeu des acteurs, peu convaincant, à l’exception peut-être de l’actrice principale.',
    forte: 'Deux facteurs expliquent la déception suscitée par le film vu hier soir. Le premier tient à sa durée : trop long, le récit s’essouffle en son milieu et l’attention du spectateur se relâche. Le second concerne l’interprétation, globalement peu convaincante ; seule l’actrice principale fait peut-être exception.'
  },
  synthetique: {
    legere: 'Je n’ai pas aimé le film d’hier soir : trop long, ennuyeux au milieu, et mal joué, sauf peut-être par l’actrice principale.',
    moyenne: 'Film d’hier soir décevant : trop long et mal joué, sauf l’actrice principale.',
    forte: 'Un film trop long et mal joué.'
  }
};

function settingsFile() {
  return path.join(app.getPath('userData'), 'aide.json');
}

// Dossier commun des modèles d'IA locaux, choisi par l'utilisateur (modifiable dans les réglages).
function defaultModelsDir() {
  return process.platform === 'win32' ? 'C:\\Local LLM' : path.join(app.getPath('userData'), 'Local LLM');
}

// Réglages de l'AAT : dossier des modèles, modèle indiqué par l'utilisateur (fichier .gguf) et modèle choisi.
async function readSettings() {
  let s = {};
  try { s = JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { /* valeurs par défaut */ }
  const modelFile = typeof s.modelFile === 'string' ? s.modelFile : '';
  local.setCustomModel(modelFile);
  return {
    modelsDir: typeof s.modelsDir === 'string' && s.modelsDir ? s.modelsDir : defaultModelsDir(),
    modelFile,
    localModel: local.MODELS[s.localModel] ? s.localModel : local.DEFAULT_MODEL
  };
}

// ----- Emplacement d'un LLM déjà présent sur l'ordinateur -----

// Un vrai modèle GGUF commence par « GGUF ».
async function isGguf(file) {
  let h;
  try {
    h = await fs.open(file, 'r');
    const { buffer, bytesRead } = await h.read(Buffer.alloc(4), 0, 4, 0);
    return bytesRead === 4 && buffer.toString('latin1') === 'GGUF';
  } catch {
    return false;
  } finally {
    if (h) await h.close().catch(() => {});
  }
}

// Fichiers .gguf du dossier et de ses sous-dossiers (trois niveaux). Écartés : les projecteurs d'images
// (mmproj), les parties 2 et suivantes d'un modèle découpé, les téléchargements inachevés.
async function findModels(dir, depth = 3) {
  const found = [];
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && depth > 1) found.push(...await findModels(full, depth - 1));
    else if (e.isFile() && /\.gguf$/i.test(e.name) && !/mmproj/i.test(e.name) && !/-0*([2-9]|\d{2,})-of-\d+\.gguf$/i.test(e.name)) {
      let size = 0;
      try { size = (await fs.stat(full)).size; } catch { continue; }
      const known = Object.values(local.MODELS).find((m) => !m.custom && m.file.toLowerCase() === e.name.toLowerCase());
      if (known && size < known.size) continue;
      if (await isGguf(full)) found.push({ file: full, size, known: known ? Object.keys(local.MODELS).find((id) => local.MODELS[id] === known) : null });
    }
  }
  return found;
}

// Choix parmi les modèles trouvés : le fichier déjà utilisé, sinon un modèle proposé (Mistral Nemo 12B
// d'abord), sinon le plus gros fichier.
function pickModel(found, current) {
  if (!found.length) return null;
  const same = found.find((f) => f.file === current);
  if (same) return same;
  const order = Object.keys(local.MODELS).filter((id) => !local.MODELS[id].custom);
  const known = found.filter((f) => f.known).sort((a, b) => order.indexOf(a.known) - order.indexOf(b.known));
  return known[0] || [...found].sort((a, b) => b.size - a.size)[0];
}

// Dossier (ou fichier .gguf) indiqué : le modèle trouvé devient le modèle de l'AAT.
async function connectModel(target) {
  const s = await readSettings();
  let found;
  try {
    found = (await fs.stat(target)).isDirectory() ? await findModels(target)
      : (/\.gguf$/i.test(target) && await isGguf(target) ? [{ file: target }] : []);
  } catch {
    found = [];
  }
  const pick = pickModel(found, s.modelFile);
  if (!pick) return { error: 'Aucun modèle au format GGUF (.gguf) dans ce dossier.' };
  await writeSettings({ ...s, modelFile: pick.file, localModel: local.CUSTOM });
  const next = await publicSettings();
  local.preload(local.CUSTOM).catch(() => {}); // chargé à l'avance ; une erreur réelle sera signalée à la première demande
  return { ok: true, label: local.MODELS[local.CUSTOM].label, file: pick.file, settings: next };
}

function writeSettings(s) {
  return writeJson(settingsFile(), s);
}

async function publicSettings() {
  const s = await readSettings();
  local.setModelsDir(s.modelsDir);
  return { ...s, models: local.listModels() };
}

const SYSTEM = 'Tu es l’aide à la rédaction d’un logiciel d’écriture en français. Tu écris toujours en français correct et naturel.';

// Passage dans une autre langue du document : consignes en français, réponse dans la langue du passage.
const foreign = (lang) => lang && lang !== 'fr' && FOREIGN[lang] && LANGS[lang];
const systemFor = (lang) => (foreign(lang)
  ? `Tu es l’aide à la rédaction d’un logiciel d’écriture. Tu écris toujours en ${LANGS[lang].name} correct et naturel, dans la langue du passage.`
  : SYSTEM);
// Les connecteurs donnés en exemple pour le style académique sont français.
const styleText = (style, lang) => {
  const text = STYLES[style] || STYLES.neutre;
  return foreign(lang) ? text.replace(/ \(d’abord, ensuite, en effet, ainsi\)/, '') : text;
};

function instructions({ style, intensity, lang }) {
  const level = INTENSITIES[intensity] || INTENSITIES.moyenne;
  const other = foreign(lang);
  const lines = [`Réécris le passage ci-dessous en ${other ? other.name : 'français'}, avec ${styleText(style, lang)}.`];
  if (style === 'synthetique') {
    lines.push(level.summary, 'N’ajoute aucune information et n’invente rien.');
  } else {
    lines.push(level.strength);
    lines.push('Garde exactement le même sens : n’ajoute aucune précision absente du passage (par exemple « initialement prévue », « prochain », une cause, un but, un détail technique), n’invente rien, ne continue pas le texte.');
  }
  if (other) {
    lines.push(`Garde les retours à la ligne entre paragraphes. Écris uniquement en ${other.name} : ne traduis jamais le passage, ni en français ni dans une autre langue.`);
    if (lang === 'zh') lines.push('Garde le même type de caractères que le passage (simplifiés ou traditionnels) et la ponctuation chinoise.');
  } else {
    lines.push('Garde les retours à la ligne entre paragraphes. Ne traduis jamais dans une autre langue et n’emploie aucun mot anglais.');
  }
  lines.push('Réponds uniquement par le texte réécrit, sans guillemets, sans titre ni commentaire.');
  return lines.join('\n');
}

function ask(request, passage) {
  return `${instructions(request)}\n\nPassage :\n"""\n${passage}\n"""`;
}

function buildPrompt(request) {
  const set = foreign(request.lang) ? FOREIGN[request.lang] : null;
  const examples = (set || EXAMPLES)[request.style] || (set || EXAMPLES).neutre;
  const example = examples[request.intensity] || examples.moyenne;
  return {
    system: systemFor(request.lang),
    examples: [[ask(request, set ? set.source : EXAMPLE_SOURCE), example]],
    text: ask(request, request.text)
  };
}

// Limite de longueur : évite que le modèle continue le texte au lieu de le reformuler.
// (Le chinois compte à peu près un jeton par caractère.)
function maxTokens({ style, text, lang }) {
  const factor = (style === 'academique' ? 0.8 : 0.6) * (lang === 'zh' ? 2.5 : 1);
  return Math.min(1500, Math.round(text.length * factor) + 80);
}

let current = null; // demande en cours : { id, controller }

function cancelCurrent() {
  if (current) current.controller.abort();
  current = null;
}

// Réponse à refaire : coupée en plein milieu (essais : Mistral Nemo s'arrête parfois sur un mot
// entamé), ou résumé qui ne résume pas.
function looksCut(answer, { style, text }) {
  if (!answer) return true;
  const ends = /[.!?…»"')\]。！？」』”]$/;
  if (ends.test(text.trim()) && !ends.test(answer)) return true;
  const length = text.trim().length;
  // Un résumé aussi long que le passage n'en est pas un (essais : cela arrive parfois).
  if (style === 'synthetique') return length > 80 && answer.length >= length * 0.9;
  return answer.length < length * 0.4;
}

// Rédige une proposition ; l'interface ne l'affiche qu'une fois terminée.
async function suggest(request) {
  cancelCurrent();
  const controller = new AbortController();
  const me = { id: request.id, controller };
  current = me;
  const settings = await readSettings();
  local.setModelsDir(settings.modelsDir);
  if (!local.isDownloaded(settings.localModel)) {
    return { error: 'Le modèle n’est pas encore installé : ouvrez « Réglages de l’Aide au texte ».', needsSetup: true };
  }
  try {
    let text = '';
    for (let attempt = 0; attempt < 3 && !controller.signal.aborted; attempt++) {
      text = await local.generate(settings.localModel, buildPrompt(request), {
        temperature: (INTENSITIES[request.intensity] || INTENSITIES.moyenne).temperature,
        maxTokens: maxTokens(request),
        signal: controller.signal
      });
      if (!looksCut(text, request)) break;
    }
    return controller.signal.aborted ? { cancelled: true } : { text };
  } catch (err) {
    if (controller.signal.aborted) return { cancelled: true };
    return { error: 'Le modèle n’a pas pu répondre : ' + (err && err.message ? err.message : 'erreur inconnue') };
  } finally {
    if (current === me) current = null;
  }
}

function registerAssistant() {
  ipcMain.handle('assist:suggest', (e, request) => suggest(request));
  ipcMain.handle('assist:cancel', () => cancelCurrent());
  ipcMain.handle('assist:getSettings', () => publicSettings());
  ipcMain.handle('assist:warmUp', async () => {
    const s = await readSettings();
    local.setModelsDir(s.modelsDir);
    local.preload(s.localModel).catch(() => {}); // une erreur réelle sera signalée à la première demande
  });
  ipcMain.handle('assist:chooseFolder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const s = await readSettings();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Dossier où ranger les modèles d’IA',
      defaultPath: s.modelsDir,
      properties: ['openDirectory', 'createDirectory']
    });
    if (!canceled && filePaths[0]) await writeSettings({ ...s, modelsDir: filePaths[0] });
    return publicSettings();
  });
  // « Indiquer l'emplacement du LLM… » (accueil du premier lancement, réglages de l'AAT).
  ipcMain.handle('assist:locateModel', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const s = await readSettings();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Dossier du LLM local (fichier .gguf)',
      defaultPath: s.modelFile ? path.dirname(s.modelFile) : s.modelsDir,
      properties: ['openDirectory']
    });
    if (canceled || !filePaths[0]) return { cancelled: true };
    return connectModel(filePaths[0]);
  });
  ipcMain.handle('assist:setModel', async (e, id) => {
    const s = await readSettings();
    if (local.MODELS[id]) await writeSettings({ ...s, localModel: id });
    return publicSettings();
  });
  ipcMain.handle('assist:downloadModel', async (e) => {
    const s = await readSettings();
    local.setModelsDir(s.modelsDir);
    let last = -1;
    try {
      await local.downloadModel(s.localModel, (ratio) => {
        // On n'envoie la progression qu'à chaque pour cent gagné.
        const pct = Math.floor(ratio * 100);
        if (pct !== last && !e.sender.isDestroyed()) {
          last = pct;
          e.sender.send('assist:downloadProgress', { pct });
        }
      });
      return { ok: true };
    } catch (err) {
      return { error: 'Le téléchargement a échoué : ' + (err && err.message ? err.message : 'erreur inconnue') };
    }
  });
  ipcMain.handle('assist:cancelDownload', () => local.cancelDownload());
  ipcMain.handle('assist:deleteModel', async () => {
    const s = await readSettings();
    local.setModelsDir(s.modelsDir);
    await local.deleteModel(s.localModel);
    // Modèle indiqué par l'utilisateur : retiré de la liste, son fichier reste en place.
    if (s.localModel === local.CUSTOM) {
      await writeSettings({ ...s, modelFile: '', localModel: local.DEFAULT_MODEL });
      local.setCustomModel('');
    }
  });
}

module.exports = { registerAssistant, readSettings, connectModel, findModels, buildPrompt, maxTokens, systemFor };
