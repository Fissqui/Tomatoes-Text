// Export livre et PDF de qualité imprimeur (2.1) : coupure des mots (règles du français, autres langues),
// justification équilibrée (lignes pleines, texte intact, pas de ligne de plus quand les pages sont
// gardées), export PDF avec typographie soignée, export livre (format, chapitres sur une page de droite,
// pages blanches sans folio, folios, titres courants absents des pages d'ouverture, numéros du sommaire,
// des renvois et de l'index), livret à plier (ordre d'un cahier), traits de coupe, export EPUB (archive,
// fichiers bien formés, liens et notes).
// Mesures sur un très long document (300 pages) : export PDF avec et sans typographie, export livre.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-livre.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');
const R = path.join(SRC, 'renderer');
const { parse } = require(path.join(SRC, 'pdf-merge.js'));
const { valueOf } = require(path.join(SRC, 'pdf-livre.js'));

function corpus() {
  const dir = path.join(SRC, 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

// Fichiers d'une archive zip (répertoire central) : [{ name, method, data }].
function unzipAll(buf) {
  let e = buf.length - 22;
  while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < buf.readUInt16LE(e + 10); i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.push({ name, method, local, data: method ? zlib.inflateRawSync(data) : data });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

// Pages d'un PDF (objets /Type /Page) : MediaBox et TrimBox.
function boxes(buf) {
  const doc = parse(buf);
  const out = [];
  for (const o of doc.objs.values()) {
    if (!/\/Type\s*\/Page(?![s\w])/.test(o.head)) continue;
    const num = (k) => { const v = valueOf(o.head, k); return v ? v.replace(/[[\]]/g, ' ').trim().split(/\s+/).map(Number) : null; };
    out.push({ media: num('MediaBox'), trim: num('TrimBox') });
  }
  return out;
}

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const browser = page.context().browser();
  electron.BrowserWindow.printer = browser;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-livre-'));
  let saveAs = null;
  electron.dialog.showSaveDialog = async () => (saveAs ? { canceled: false, filePath: saveAs } : { canceled: true });
  const exportTo = async (name, fn, arg) => {
    saveAs = path.join(tmp, name);
    const res = await v(fn, arg);
    saveAs = null;
    return res;
  };
  // Texte de chaque page d'un PDF (pdf.js du logiciel, dans la page).
  const pdfPages = (buf) => v(async (b64) => {
    if (!window.pdfjsLib) {
      const load = (src) => new Promise((ok2, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok2; s.onerror = ko; document.head.append(s); });
      await load('vendor/pdfjs/pdf.worker.js');
      await load('vendor/pdfjs/pdf.js');
    }
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await window.pdfjsLib.getDocument({ data, verbosity: 0, isEvalSupported: false, useWorkerFetch: false }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      const items = tc.items.filter((t) => t.str && t.str.trim()).map((t) => ({ s: t.str, x: t.transform[4], y: t.transform[5] }));
      out.push({ w: vp.width, h: vp.height, items, text: items.map((t) => t.s).join(' ') });
    }
    await doc.destroy();
    return out;
  }, buf.toString('base64'));
  const errorsBefore = () => (electron.BrowserWindow.printErrors || []).length;

  // ----- 1. Coupure des mots -----
  const unit = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await unit.setContent('<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><div id="editor"></div></body></html>');
  for (const f of ['vendor/cesure/cesure-fr.js', 'vendor/cesure/cesure-en.js', 'vendor/cesure/cesure-de.js', 'cesure.js', 'composition.js']) await unit.addScriptTag({ path: path.join(R, f) });
  const cuts = await unit.evaluate(() => {
    const C = window.FTCesure;
    const show = (t, l) => C.hyphenate(t, l).replace(/­/g, '-');
    return {
      fr: show('extraordinaire contemporains aujourd’hui éléphant l’ensemble', 'fr'),
      proper: show('Mitterrand SNCF porte-monnaie https://exemple.fr/tomates 2026abc', 'fr'),
      short: show('ami idée agir oui', 'fr'),
      de: show('Donaudampfschifffahrt Gesellschaft', 'de'),
      en: show('typography hyphenation', 'en')
    };
  });
  assert.strictEqual(cuts.fr, 'ex-tra-or-di-naire contem-po-rains au-jourd’hui élé-phant l’en-semble', cuts.fr);
  assert.strictEqual(cuts.proper, 'Mitterrand SNCF porte-monnaie https://exemple.fr/tomates 2026abc', 'noms propres, sigles, mots composés, adresses intacts : ' + cuts.proper);
  assert.strictEqual(cuts.short, 'ami idée agir oui', 'au moins 2 lettres avant et 3 après la coupure : ' + cuts.short);
  assert(/-/.test(cuts.de) && /-/.test(cuts.en), 'allemand et anglais coupés : ' + cuts.de + ' / ' + cuts.en);
  ok('coupure à la française : ' + cuts.fr + ' ; noms propres, sigles, mots composés et adresses intacts');
  ok('autres langues : ' + cuts.de + ' ; ' + cuts.en);
  const speed = await unit.evaluate(() => {
    const words = 'Le jardin partagé accueille chaque printemps les nouvelles variétés de tomates anciennes cultivées par les adhérents de l’association';
    const text = Array.from({ length: 20000 }, () => words).join(' ');
    const t = performance.now();
    window.FTCesure.hyphenate(text, 'fr');
    return { chars: text.length, ms: Math.round(performance.now() - t) };
  });
  assert(speed.ms < 4000, 'coupure trop lente : ' + speed.ms + ' ms');
  ok(`coupure : ${(speed.chars / 1e6).toFixed(1)} M caractères en ${speed.ms} ms`);

  // ----- 2. Justification équilibrée -----
  const lorem = await v(() => { const L = window.FTLorem; const out = []; for (let i = 0; i < 12; i++) { let t = ''; for (let k = 0; k < 7; k++) t += L.sentence('general') + ' '; out.push(t.trim()); } return out; });
  const comp = await unit.evaluate(([paras, keep]) => {
    const ed = document.getElementById('editor');
    ed.style.cssText = 'width: 330px; font: 15px/1.4 Georgia, serif;';
    ed.innerHTML = paras.map((t) => `<p style="text-align: justify; text-indent: 1.2em; margin: 0 0 6px;">${t}</p>`).join('');
    const ps = [...ed.querySelectorAll('p')];
    const letters = (s) => s.replace(/[\s­\-‐]/g, '');
    const before = ps.map((p) => ({ h: p.getBoundingClientRect().height, t: letters(p.textContent) }));
    const stats = window.FTComposition.run({ lang: 'fr', hyphenate: true, justify: true, keepLines: keep });
    const right = ed.getBoundingClientRect().right;
    let ragged = 0;
    let full = 0;
    for (const l of ed.querySelectorAll('.ft-kp:not(.ft-kp-der)')) {
      const r = document.createRange();
      r.selectNodeContents(l);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0);
      const end = Math.max(...rects.map((x) => x.right));
      full++;
      if (Math.abs(end - right) > 1.5) ragged++;
    }
    return {
      stats,
      full,
      ragged,
      same: ps.every((p, i) => letters(p.textContent) === before[i].t),
      taller: ps.filter((p, i) => p.getBoundingClientRect().height > before[i].h + 0.5).length,
      dashes: ed.querySelectorAll('.ft-kp').length && [...ed.querySelectorAll('.ft-kp')].filter((l) => /-$/.test(l.textContent)).length
    };
  }, [lorem, false]);
  assert(comp.stats.composed >= 10, 'paragraphes composés : ' + JSON.stringify(comp.stats));
  assert(comp.stats.hyphens > 0 && comp.dashes > 0, 'mots coupés en fin de ligne : ' + comp.dashes);
  assert.strictEqual(comp.ragged, 0, `lignes pleines : ${comp.ragged} sur ${comp.full} ne vont pas jusqu'au bord`);
  assert(comp.same, 'texte intact après composition');
  ok(`justification : ${comp.stats.composed} paragraphes, ${comp.full} lignes pleines jusqu'au bord, ${comp.dashes} coupures en fin de ligne, texte intact`);
  const kept = await unit.evaluate(([paras]) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = paras.map((t) => `<p style="text-align: justify; margin: 0 0 6px;">${t}</p>`).join('');
    const ps = [...ed.querySelectorAll('p')];
    const h = ps.map((p) => p.getBoundingClientRect().height);
    window.FTComposition.run({ lang: 'fr', hyphenate: true, justify: true, keepLines: true });
    return ps.filter((p, i) => p.getBoundingClientRect().height > h[i] + 0.5).length;
  }, [lorem]);
  assert.strictEqual(kept, 0, 'pages gardées : aucun paragraphe plus long que sans composition');
  ok('pages gardées (mode avancé) : aucun paragraphe ne prend une ligne de plus');
  await unit.close();

  // ----- 3. Export PDF avec typographie soignée -----
  await v(() => {
    const L = window.FTLorem;
    let html = '<h1 class="ft-title">Essai de typographie</h1>';
    for (let i = 0; i < 14; i++) { let t = ''; for (let k = 0; k < 6; k++) t += L.sentence('general') + ' '; html += `<p style="text-align: justify">${t.trim()}</p>`; }
    window.FTEditor.load({ content: { html }, settings: { mode: 'note' } });
    document.getElementById('page').hidden = false;
  });
  await page.waitForTimeout(1200);
  const e0 = errorsBefore();
  const pdfOf = async (typo) => {
    const file = await exportTo(typo ? 'typo.pdf' : 'brut.pdf', async (t) => window.frameText.exportPdf('Essai', await window.FTPdf.build({ typo: t })), typo);
    assert(file && fs.existsSync(file), 'PDF écrit');
    return pdfPages(fs.readFileSync(file));
  };
  const typo = await pdfOf(true);
  const brut = await pdfOf(false);
  const endDash = (pages) => pages.reduce((n, p) => n + p.items.filter((t) => /\p{L}-$/u.test(t.s)).length, 0);
  assert(endDash(typo) > 0, 'PDF : mots coupés en fin de ligne');
  assert.strictEqual(endDash(brut), 0, 'PDF sans typographie : pas de coupure');
  assert(typo.length <= brut.length + 1, `PDF : ${typo.length} pages avec typographie, ${brut.length} sans`);
  assert.strictEqual((electron.BrowserWindow.printErrors || []).length, e0, 'pas d\'erreur dans la page imprimée : ' + (electron.BrowserWindow.printErrors || []).slice(e0).join(' | '));
  ok(`export PDF : ${endDash(typo)} mots coupés en fin de ligne (aucun sans la typographie soignée), ${typo.length} page(s)`);

  // ----- 4. Export livre -----
  const BOOK = 'Le Jardin des tomates';
  await v(([book]) => {
    const L = window.FTLorem;
    const para = (extra = '') => { let t = ''; for (let i = 0; i < 6; i++) t += L.sentence('general') + ' '; return '<p>' + t.trim() + extra + '</p>'; };
    let html = `<h1 class="ft-title">${book}</h1><p>Un roman d’essai pour l’export livre, avec un renvoi au <span class="ft-xref" contenteditable="false" data-target="x:ch3" data-show="label-page">chapitre 3, page 1</span>.</p>`;
    for (let c = 1; c <= 5; c++) {
      html += `<h1${c === 3 ? ' data-xid="ch3"' : ''}>Chapitre ${c} : la saison ${c}</h1>`;
      for (let i = 0; i < 7 + c; i++) {
        html += para(i === 2 ? ' Une tomate cœur de bœuf.' : c === 2 && i === 1 ? '<sup class="ft-fn-ref" data-fn="n1" contenteditable="false">1</sup>' : '');
        if (i === 3) html += `<h2>Partie ${c}.1</h2>`;
      }
    }
    html += '<div class="ft-index" contenteditable="false"></div><div class="ft-footnotes"><ol><li data-fn="n1">Une note de bas de page.</li></ol></div>';
    window.FTEditor.load({ content: { html }, settings: { mode: 'avance', index: [{ term: 'tomate', variants: [], parent: '' }] } });
    window.FTIndex.load({ index: [{ term: 'tomate', variants: [], parent: '' }] });
    document.getElementById('page').hidden = false;
  }, [BOOK]);
  await page.waitForTimeout(1500);
  // Sommaire en tête, après le titre.
  await v(() => {
    const t = document.querySelector('#editor h1.ft-title');
    const r = document.createRange();
    r.setStart(t.nextElementSibling, 0);
    r.collapse(true);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    window.FTToc.insert();
  });
  await page.waitForTimeout(1200);
  assert(await v(() => !!document.querySelector('#editor .ft-toc .ft-toc-item') && !!document.querySelector('#editor .ft-index .ft-index-entry')), 'sommaire et index dans le document');
  const opts = (output) => ({ format: '13x20', margins: [17, 13, 15, 18], cesure: true, justif: true, justifyText: true, recto: true, heads: true, output });
  const e1 = errorsBefore();
  let t0 = Date.now();
  const res = await exportTo('livre.pdf', async (o) => window.frameText.exportBook('Livre', await window.FTLivre.build(o)), opts('pages'));
  const bookMs = Date.now() - t0;
  assert(res && res.filePath && fs.existsSync(res.filePath), 'livre écrit');
  const bookBuf = fs.readFileSync(res.filePath);
  const pages = await pdfPages(bookBuf);
  if (process.env.GARDE) console.log(pages.map((p, i) => (i + 1) + ': ' + p.text.slice(0, 90) + ' … ' + p.text.slice(-60)).join('\n'));
  assert.strictEqual(pages.length, res.pages, 'nombre de pages annoncé');
  const mm = (pt) => pt / 72 * 25.4;
  assert(Math.abs(mm(pages[0].w) - 130) < 1 && Math.abs(mm(pages[0].h) - 200) < 1, `format 13 × 20 : ${mm(pages[0].w).toFixed(1)} × ${mm(pages[0].h).toFixed(1)} mm`);
  ok(`livre : ${pages.length} pages au format ${mm(pages[0].w).toFixed(1)} × ${mm(pages[0].h).toFixed(1)} mm en ${bookMs} ms`);
  // Page de chaque chapitre (titre en haut de page, hors sommaire).
  const isToc = (p) => /Partie 1\.1.*Partie 2\.1/.test(p.text);
  const opening = (title) => pages.findIndex((p) => !isToc(p) && p.items.some((t) => t.s.includes(title))) + 1;
  const chaps = [1, 2, 3, 4, 5].map((c) => opening(`Chapitre ${c} :`));
  // (2.2 : la note de bas de page est au pied de la page de son appel, dans le chapitre 2.)
  const notesPage = pages.findIndex((p) => /Une note de bas de page/.test(p.text)) + 1;
  assert(notesPage > chaps[1] - 1 && notesPage < chaps[2], 'note dans le chapitre 2 : page ' + notesPage);
  assert(!pages.some((p) => p.items.some((t) => t.s.trim() === 'Notes')), 'plus de chapitre « Notes »');
  const noteLine = pages[notesPage - 1].items.find((t) => /Une note de bas de page/.test(t.s));
  const textBelow = pages[notesPage - 1].items.filter((t) => t.y < noteLine.y - 2 && t.y > pages[notesPage - 1].h * 0.12);
  assert(!textBelow.length, 'note au pied de la page : ' + textBelow.map((t) => t.s).join(' '));
  assert(chaps.every((n) => n > 0 && n % 2 === 1), 'chapitres sur une page de droite (impaire) : ' + chaps.join(', '));
  ok('chapitres ouverts sur une page de droite : pages ' + chaps.join(', ') + ' ; note au pied de la page ' + notesPage);
  const blanks = pages.map((p, i) => (p.items.length ? 0 : i + 1)).filter(Boolean);
  assert(blanks.length > 0 && blanks.every((n) => n % 2 === 0 && chaps.includes(n + 1)), 'pages blanches (sans folio) juste avant un chapitre : ' + blanks.join(', '));
  ok('pages blanches sans folio avant les chapitres : ' + (blanks.join(', ') || 'aucune'));
  // Folios : numéro de la page, en bas, côté extérieur.
  const folio = (p, n) => p.items.find((t) => t.s.trim() === String(n) && t.y < p.h * 0.12);
  for (let i = 1; i < pages.length; i++) {
    const p = pages[i];
    if (!p.items.length) continue;
    const f = folio(p, i + 1);
    assert(f, 'folio de la page ' + (i + 1));
    const outside = (i + 1) % 2 ? f.x > p.w / 2 : f.x < p.w / 2;
    assert(outside, `folio côté extérieur, page ${i + 1} (x = ${Math.round(f.x)})`);
  }
  ok('folios en pied de page, côté extérieur');
  // Titres courants : livre à gauche, chapitre à droite, rien sur les pages d'ouverture.
  // (Titre courant : dans la marge du haut, 15 mm.)
  const head = (p) => p.h - 15 / 25.4 * 72;
  const top = (p) => p.items.filter((t) => t.y > head(p)).map((t) => t.s).join(' ');
  for (const n of chaps) assert(!top(pages[n - 1]).includes(BOOK) && !/Chapitre \d : la saison/.test(top(pages[n - 1])), 'pas de titre courant sur la page d\'ouverture ' + n);
  const left = pages.findIndex((p, i) => i + 1 > chaps[0] && (i + 1) % 2 === 0 && p.items.length) + 1;
  const right = pages.findIndex((p, i) => i + 1 > chaps[0] && (i + 1) % 2 === 1 && !chaps.includes(i + 1) && p.items.length && i + 1 < chaps[1]) + 1;
  assert(top(pages[left - 1]).toLowerCase() === BOOK.toLowerCase(), `titre du livre en haut de la page de gauche ${left} : « ${top(pages[left - 1])} »`);
  if (right > 0) assert(top(pages[right - 1]) === 'Chapitre 1 : la saison 1', `titre du chapitre en haut de la page de droite ${right} : « ${top(pages[right - 1])} »`);
  ok(`titres courants : « ${top(pages[left - 1])} » à gauche (page ${left})${right > 0 ? `, « ${top(pages[right - 1])} » à droite (page ${right})` : ''}, aucun sur les pages d'ouverture`);
  // Sommaire, renvoi, index : les vraies pages du livre.
  const tocPage = pages.find(isToc);
  assert(tocPage, 'sommaire imprimé');
  for (let c = 1; c <= 5; c++) {
    const row = tocPage.items.findIndex((t) => t.s.includes(`Chapitre ${c} :`));
    const num = tocPage.items.slice(row + 1).find((t) => /^\d+$/.test(t.s.trim()) && Math.abs(t.y - tocPage.items[row].y) < 3);
    assert(num && Number(num.s) === chaps[c - 1], `sommaire : chapitre ${c} page ${num && num.s}, imprimé page ${chaps[c - 1]}`);
  }
  ok('sommaire : numéros de page des chapitres justes');
  const all = pages.map((p) => p.text).join(' ');
  const xref = /la saison 3 », page (\d+)/.exec(all);
  assert(xref && Number(xref[1]) === chaps[2], 'renvoi : ' + (xref && xref[0]) + ', chapitre 3 page ' + chaps[2]);
  ok('renvoi : « ' + xref[0] + ' »');
  const ixPage = pages.find((p) => /Index/.test(p.text) && /tomate,/.test(p.text));
  assert(ixPage, 'index imprimé');
  const ix = /tomate,\s*([\d,\s–]+)/.exec(ixPage.text)[1].trim().replace(/,\s*$/, '');
  const ixPages = ix.split(/,\s*/).flatMap((s) => { const [a, b] = s.split('–').map(Number); return b ? Array.from({ length: b - a + 1 }, (_x, k) => a + k) : [a]; });
  // (Texte des pages sans titre courant ; « tomate » seul, pas « tomates ».)
  const body = (p) => p.items.filter((t) => t.y < head(p)).map((t) => t.s).join(' ').replace(/(\p{L})-\s+(?=\p{Ll})/gu, '$1');
  const real = pages.map((p, i) => (p !== ixPage && /tomate(?!\p{L})/u.test(body(p)) && !isToc(p) ? i + 1 : 0)).filter(Boolean);
  assert.deepStrictEqual(ixPages, real, `index : pages de « tomate » ${ix}, dans le texte ${real.join(', ')}`);
  ok('index : « tomate, ' + ix + ' »');
  assert.strictEqual((electron.BrowserWindow.printErrors || []).length, e1, 'pas d\'erreur dans la page du livre');

  // ----- 5. Livret à plier, traits de coupe -----
  const lv = await exportTo('livret.pdf', async (o) => window.frameText.exportBook('Livre', await window.FTLivre.build(o)), opts('livret'));
  const lvBuf = fs.readFileSync(lv.filePath);
  const sheets = await pdfPages(lvBuf);
  const N = Math.ceil(lv.pages / 4) * 4;
  assert.strictEqual(sheets.length, N / 2, `livret : ${sheets.length} faces pour ${lv.pages} pages`);
  assert(sheets[0].w > sheets[0].h, 'livret : feuilles à l\'italienne');
  // Première face : dernière page du cahier à gauche, page 1 à droite ; troisième face : N-2 à gauche, 3 à droite.
  const firstRight = sheets[0].items.filter((t) => t.x > sheets[0].w / 2).map((t) => t.s).join(' ');
  assert(firstRight.includes(BOOK), 'livret : page 1 à droite de la première face');
  const folios = (sh) => sh.items.filter((t) => t.y < sh.h * 0.2 && /^\d+$/.test(t.s.trim()));
  const third = folios(sheets[2]);
  const fl = third.find((t) => t.x < sheets[2].w / 2);
  const fr = third.find((t) => t.x > sheets[2].w / 2);
  assert(fr && Number(fr.s) === 3 && (!fl || Number(fl.s) === N - 2), `livret : troisième face = pages ${fl && fl.s} et ${fr && fr.s}`);
  const fourth = folios(sheets[3]);
  const gl = fourth.find((t) => t.x < sheets[3].w / 2);
  const gr = fourth.find((t) => t.x > sheets[3].w / 2);
  assert(gl && Number(gl.s) === 4 && (!gr || Number(gr.s) === N - 3), `livret : quatrième face = pages ${gl && gl.s} et ${gr && gr.s}`);
  ok(`livret : ${sheets.length} faces de ${Math.round(mm(sheets[0].w))} × ${Math.round(mm(sheets[0].h))} mm, pages ${N - 2} et 3, puis 4 et ${N - 3} au dos`);
  const cp = await exportTo('coupe.pdf', async (o) => window.frameText.exportBook('Livre', await window.FTLivre.build(o)), opts('coupe'));
  const bx = boxes(fs.readFileSync(cp.filePath));
  assert.strictEqual(bx.length, cp.pages, 'traits de coupe : une feuille par page');
  const trimW = mm(bx[0].trim[2] - bx[0].trim[0]);
  const trimH = mm(bx[0].trim[3] - bx[0].trim[1]);
  assert(Math.abs(trimW - 130) < 1 && Math.abs(trimH - 200) < 1 && mm(bx[0].media[2]) > 150, `TrimBox ${trimW.toFixed(1)} × ${trimH.toFixed(1)} mm`);
  ok(`traits de coupe : page de ${Math.round(mm(bx[0].media[2]))} × ${Math.round(mm(bx[0].media[3]))} mm, format fini ${trimW.toFixed(1)} × ${trimH.toFixed(1)} mm (TrimBox)`);

  // ----- 6. EPUB -----
  const ep = await exportTo('livre.epub', async () => window.frameText.exportEpub('Livre', await window.FTEpub.build()));
  assert(ep && fs.existsSync(ep), 'EPUB écrit');
  const zip = unzipAll(fs.readFileSync(ep));
  assert.strictEqual(zip[0].name, 'mimetype', 'EPUB : mimetype en premier');
  assert.strictEqual(zip[0].method, 0, 'EPUB : mimetype sans compression');
  assert.strictEqual(zip[0].local, 0, 'EPUB : mimetype au début de l\'archive');
  assert.strictEqual(zip[0].data.toString(), 'application/epub+zip');
  const files = new Map(zip.map((f) => [f.name, f.data.toString('utf8')]));
  assert(/full-path="OEBPS\/content\.opf"/.test(files.get('META-INF/container.xml')), 'container.xml');
  const opf = files.get('OEBPS/content.opf');
  const manifest = [...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map((m) => ({ id: m[1], href: m[2] }));
  for (const it of manifest) assert(files.has('OEBPS/' + it.href), 'fichier du manifeste : ' + it.href);
  for (const [, idref] of opf.matchAll(/<itemref idref="([^"]+)"/g)) assert(manifest.some((it) => it.id === idref), 'élément du sommaire de lecture : ' + idref);
  assert(/properties="nav"/.test(opf) && /<dc:title>Le Jardin des tomates<\/dc:title>/.test(opf), 'nav et titre dans content.opf');
  const xhtml = [...files.keys()].filter((n) => /\.(xhtml|opf|ncx)$/.test(n) || n.endsWith('container.xml'));
  const check = await v((docs) => {
    const bad = [];
    const ids = {};
    const links = [];
    for (const [name, text] of docs) {
      const d = new DOMParser().parseFromString(text, name.endsWith('.xhtml') ? 'application/xhtml+xml' : 'application/xml');
      if (d.querySelector('parsererror')) { bad.push(name); continue; }
      ids[name] = [...d.querySelectorAll('[id]')].map((e) => e.id);
      if (name.endsWith('.xhtml')) for (const a of d.querySelectorAll('a[href]')) links.push({ from: name, href: a.getAttribute('href'), note: a.getAttribute('epub:type') });
    }
    return { bad, ids, links };
  }, xhtml.map((n) => [n, files.get(n)]));
  assert.deepStrictEqual(check.bad, [], 'fichiers XHTML bien formés');
  const chapters = [...files.keys()].filter((n) => /chapitre-\d+\.xhtml$/.test(n));
  assert(chapters.length >= 6, 'un fichier par chapitre : ' + chapters.length);
  for (const l of check.links) {
    if (/^https?:/.test(l.href)) continue;
    const [file, id] = l.href.split('#');
    const target = 'OEBPS/' + (file || l.from.replace(/^OEBPS\//, ''));
    assert(files.has(target), 'lien vers un fichier du livre : ' + l.href);
    if (id) assert(check.ids[target].includes(id), 'lien vers un identifiant : ' + l.href);
  }
  const noterefs = check.links.filter((l) => l.note === 'noteref');
  assert(noterefs.length === 1 && /^notes\.xhtml#/.test(noterefs[0].href), 'appel de note vers notes.xhtml');
  assert(/epub:type="footnote"/.test(files.get('OEBPS/notes.xhtml')), 'note de bas de page');
  assert(!/ft-toc|ft-index-entry/.test(chapters.map((n) => files.get(n)).join('')), 'pas de sommaire ni d\'index à numéros de page dans l\'EPUB');
  ok(`EPUB : ${chapters.length} chapitres, ${manifest.length} fichiers au manifeste, ${check.links.length} liens valides, note et retour, mimetype en tête`);

  // ----- 7. Mesures sur 300 pages -----
  const html = corpus();
  const big = await v(([h, n]) => {
    window.FTEditor.load({ content: { html: Array.from({ length: n }, () => h).join('') }, settings: { mode: 'avance' } });
    document.getElementById('page').hidden = false;
    return true;
  }, [html, 21]);
  assert(big);
  await page.waitForTimeout(6000);
  await v(() => window.FTNotes.sync());
  await page.waitForTimeout(3000);
  const nPages = await v(() => window.FTPages.pageCount());
  const timed = async (name, fn, arg) => { const t = Date.now(); const r = await exportTo(name, fn, arg); return { r, ms: Date.now() - t }; };
  const pdfT = await timed('gros-typo.pdf', async () => window.frameText.exportPdf('Gros', await window.FTPdf.build({ typo: true })));
  const pdfB = await timed('gros-brut.pdf', async () => window.frameText.exportPdf('Gros', await window.FTPdf.build({ typo: false })));
  const bookT = await timed('gros-livre.pdf', async (o) => window.frameText.exportBook('Gros', await window.FTLivre.build(o)), opts('pages'));
  const bookL = await timed('gros-livret.pdf', async (o) => window.frameText.exportBook('Gros', await window.FTLivre.build(o)), opts('livret'));
  const epT = await timed('gros.epub', async () => window.frameText.exportEpub('Gros', await window.FTEpub.build()));
  const nT = boxes(fs.readFileSync(pdfT.r)).length;
  const nB = boxes(fs.readFileSync(pdfB.r)).length;
  // (Typographie soignée en mode avancé : les pages restent celles de l'export sans elle. Depuis la 2.2.12,
  // moins d'espace au-dessus des titres : les coupures de page dans les paragraphes composés tombent parfois
  // ailleurs ; écart toléré de 3 %.)
  assert(Math.abs(nT - nB) <= Math.ceil(nB * 0.03), `PDF : ${nB} pages sans typographie, ${nT} avec`);
  console.log(`  ${nPages} pages : PDF ${pdfB.ms} ms sans typographie, ${pdfT.ms} ms avec (${nB} et ${nT} pages) ; livre (${bookT.r.pages} pages) ${bookT.ms} ms ; livret ${bookL.ms} ms ; EPUB ${epT.ms} ms`);
  assert(nPages >= 250, 'document de 300 pages : ' + nPages);
  assert(pdfT.ms < pdfB.ms + 15000, 'typographie soignée : pas plus de 15 s de plus');
  assert(bookT.ms < 90000 && epT.ms < 20000, 'export livre et EPUB raisonnables');
  ok('mesures sur 300 pages');
  if (!process.env.GARDE) fs.rmSync(tmp, { recursive: true, force: true });
};
