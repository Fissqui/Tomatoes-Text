// Lecture et écriture des fichiers JSON, exécutées en arrière-plan (voir arriere-plan.js et json-files.js) :
// transformer un long document, avec ses photos, en texte (ou l'inverse) prend un temps sensible.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// File d'attente par fichier : deux écritures du même fichier passent l'une après l'autre (sinon elles
// se partagent le même fichier temporaire et peuvent se mélanger).
const queues = new Map();
function inOrder(key, task) {
  const run = (queues.get(key) || Promise.resolve()).then(task, task);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

// Sous Windows, le remplacement échoue parfois un court instant (EPERM, EBUSY) quand un autre programme
// lit le fichier au même moment (antivirus, OneDrive, indexation) : on réessaie pendant 2 s au plus.
async function renameRetry(from, to) {
  for (let wait = 20; ; wait *= 2) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      if (!/^(EPERM|EACCES|EBUSY)$/.test(err.code) || wait > 1000) throw err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Écriture atomique : on écrit dans un fichier temporaire puis on le renomme, pour ne jamais laisser un
// fichier à moitié écrit en cas de coupure. (Le texte est fait à l'appel : les données de ce moment-là.)
function writeJson(file, data, space = 2) {
  const text = JSON.stringify(data, null, space);
  return inOrder(path.resolve(file), async () => {
    const tmp = file + '.tmp';
    await fs.writeFile(tmp, text, 'utf8');
    await renameRetry(tmp, file);
  });
}

function isFrameTextDoc(doc) {
  return !!doc && doc.format === 'frame-text' && !!doc.content && typeof doc.content.html === 'string';
}

// Documents vers lesquels renvoient les liens (( )) d'un texte (pour la mindmap).
function docLinks(html) {
  const ids = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bclass="[^"]*\bft-doclink\b[^>]*>/g)) {
    const id = /\bdata-doc="([^"]+)"/.exec(m[0]);
    if (id) ids.add(id[1]);
  }
  return [...ids];
}

// Fiche d'un document pour la bibliothèque (null si ce n'est pas un document) : seule la fiche revient,
// pas le texte.
async function docEntry(file) {
  const doc = await readJson(file, null);
  if (!isFrameTextDoc(doc)) return null;
  return { id: doc.id, title: doc.title, modified: doc.modified, links: docLinks(doc.content.html), tags: Array.isArray(doc.tags) ? doc.tags : [] };
}

// ----- Historique des versions -----

function fingerprint(doc) {
  const data = JSON.stringify([doc.title, doc.content && doc.content.html, doc.settings, doc.tags]);
  return crypto.createHash('sha1').update(data).digest('hex');
}

function countWords(html) {
  const text = String(html || '')
    .replace(/<\/(p|li|h[1-6]|td|th|div|blockquote)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .trim();
  return text ? text.split(/\s+/).length : 0;
}

// Ce que l'historique doit savoir d'un document enregistré (sans renvoyer son texte).
async function versionInfo(file) {
  const doc = await readJson(file, null);
  if (!doc || !doc.content) return null;
  return { id: doc.id, title: doc.title, hash: fingerprint(doc), words: countWords(doc.content.html) };
}

// Fiche d'une copie faite à la main (le document vient de la fenêtre).
function versionOf(doc) {
  return { title: doc.title, hash: fingerprint(doc), words: countWords(doc.content && doc.content.html) };
}

// ----- Images d'un document -----
// Images reçues avec un enregistrement (app.js packDoc) : gardées pour les enregistrements suivants, dont
// le texte ne porte que leurs références.
const savedImages = new Map(); // ftimg-<session>-<n> -> data:…

// (Image en binaire : data:…;base64, refait ; sinon les données telles quelles.)
function image(id, head, data) {
  if (!/^ftimg-[a-z0-9]+-\d+$/.test(String(id))) return;
  if (!data) { savedImages.set(id, String(head)); return; }
  const bytes = ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(new Uint8Array(data));
  savedImages.set(id, head + bytes.toString('base64'));
}

function unpackImages(doc) {
  const sent = doc.images;
  const session = doc.imageSession;
  delete doc.images;
  delete doc.imageSession;
  if (sent && typeof sent === 'object') for (const [id, data] of Object.entries(sent)) savedImages.set(id, data);
  const html = doc.content && doc.content.html;
  if (!session || typeof html !== 'string' || !/^ftimg-[a-z0-9]+$/.test(session) || !html.includes(session)) return;
  let missing = false;
  doc.content.html = html.replace(new RegExp(session + '-\\d+', 'g'), (id) => {
    const data = savedImages.get(id);
    if (!data) missing = true;
    return data || id;
  });
  if (missing) throw new Error('FT_IMAGES');
}

// Images remises dans le texte (erreur FT_IMAGES s'il en manque), puis document écrit.
function writeDoc(file, doc) {
  unpackImages(doc);
  return writeJson(file, doc);
}

module.exports = { readJson, writeJson, docEntry, docLinks, isFrameTextDoc, versionInfo, versionOf, fingerprint, countWords, image, unpackImages, writeDoc };
