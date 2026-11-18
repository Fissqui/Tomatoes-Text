// Sorties du nouveau moteur (préversion 2.0 n° 9) : zoom, double page (mêmes pages que le mode avancé,
// saisie, retour), mode lecture (entrée, sortie, texte intact), pages tournées (largeur du texte, saisie,
// retour), export Word (sections des pages tournées) et PDF (contenu sans marques du moteur).
// Mesures sur un très long document (300 pages, mode avancé) : zoom, double page, mode lecture.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-sorties-moteur.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');
function corpus() {
  const dir = path.join(SRC, 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

// Un fichier d'une archive .docx (zip) : lu dans le répertoire central.
function unzip(buf, name) {
  let e = buf.length - 22;
  while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < buf.readUInt16LE(e + 10); i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 3) => v((k) => new Promise((r) => {
    const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : setTimeout(r, 0));
    f(k);
  }), n);
  const median = (a) => { const x = [...a].sort((p, q) => p - q); return Math.round(x[Math.floor(x.length / 2)] || 0); };
  const load = async (html, wait) => {
    await page.keyboard.press('Escape');
    await v((h) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: 'avance' } });
      document.getElementById('page').hidden = false;
    }, html);
    await page.waitForTimeout(wait);
    // (Corpus répété : numéros de notes en double, renumérotés tout de suite plutôt qu'à la première touche.)
    await v(() => window.FTNotes.sync());
    await page.waitForTimeout(wait / 2);
  };
  const text = () => v(() => window.FTMoteur.view.state.doc.textContent);
  // Lignes de texte affichées hors des zones de texte des pages (feuilles du mode avancé).
  const misplaced = (pages) => v((only) => {
    const pg = document.getElementById('page');
    const pr = pg.getBoundingClientRect();
    const k = pg.currentCSSZoom || 1;
    const geo = window.FTPages._geo();
    const out = [];
    let lines = 0;
    const w = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.data.trim() || t.parentElement.closest('[data-pm-far], .ft-pg-gap, .ft-cover, .ft-footnotes')) continue;
      r.selectNodeContents(t);
      for (const rc of r.getClientRects()) {
        if (!rc.height || !rc.width) continue;
        const y = (rc.top + rc.height / 2 - pr.top) / k;
        const x1 = (rc.left - pr.left) / k;
        const x2 = (rc.right - pr.left) / k;
        const i = geo.findIndex((g) => y >= g.top && y < g.top + g.h);
        if (only && !only.includes(i)) continue;
        lines++;
        const g = geo[i];
        if (!g || y < g.ct - 2 || y > g.cb + 2 || x1 < g.left + 20 || x2 > g.left + g.w - 20) out.push({ page: i + 1, y: Math.round(y), t: t.data.trim().slice(0, 20) });
      }
    }
    return { lines, bad: out.length, first: out.slice(0, 3) };
  }, pages || null);
  // Double page : début, fin et nombre de lignes de chaque feuille affichée.
  const spreadText = () => v(() => {
    const pg = document.getElementById('page');
    const pr = pg.getBoundingClientRect();
    const k = pg.currentCSSZoom || 1;
    const sheets = [...document.querySelectorAll('#dp-sheets .dp-sheet')].map((s) => s.getBoundingClientRect());
    const out = sheets.map(() => []);
    const w = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.data.trim() || t.parentElement.closest('[data-pm-far], .ft-pg-gap, .ft-footnotes li:not([data-pm-n])')) continue;
      r.selectNodeContents(t);
      for (const rc of r.getClientRects()) {
        if (!rc.height) continue;
        const cx = (rc.left + rc.right) / 2;
        const cy = (rc.top + rc.bottom) / 2;
        if (cx < pr.left || cx > pr.right || cy < pr.top || cy > pr.bottom) continue;
        sheets.forEach((s, j) => { if (cx >= s.left && cx <= s.right) out[j].push({ y: Math.round((rc.top - s.top) / k), t: t.data.trim().slice(0, 20) }); });
      }
    }
    return out.map((l) => { l.sort((a, b) => a.y - b.y); return l.length ? [l[0].t, l[l.length - 1].t, l.length] : []; });
  });
  // Même chose pour une page du mode avancé ordinaire.
  const pageText = (i) => v((i) => {
    const pg = document.getElementById('page');
    const top = pg.getBoundingClientRect().top;
    const k = pg.currentCSSZoom || 1;
    const g = window.FTPages._geo()[i];
    const out = [];
    const w = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.data.trim() || t.parentElement.closest('[data-pm-far], .ft-pg-gap, .ft-footnotes li:not([data-pm-n])')) continue;
      r.selectNodeContents(t);
      for (const rc of r.getClientRects()) {
        if (!rc.height) continue;
        const y = (rc.top - top) / k;
        if (y >= g.ct - 1 && y < g.cb) out.push({ y, t: t.data.trim().slice(0, 20) });
      }
    }
    out.sort((a, b) => a.y - b.y);
    return out.length ? [out[0].t, out[out.length - 1].t, out.length] : [];
  }, i);
  const turn = async (p, wait = 300) => {
    await v((p) => {
      document.getElementById('pg-turn-page').value = String(p);
      document.getElementById('pg-turn-add').click();
    }, p);
    await frames(3);
    await page.waitForTimeout(wait);
  };
  const caretIn = (sel) => v((sel) => {
    const el = document.querySelector(sel);
    const t = el && document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (!t) return false;
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, w.posAtDOM(t, 2))));
    w.focus();
    return true;
  }, sel);
  await v(() => {
    window.__lat = [];
    let t0 = 0;
    document.addEventListener('keydown', () => { t0 = performance.now(); }, true);
    const done = () => {
      if (!t0) return;
      const t = t0;
      t0 = 0;
      requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t), 0));
    };
    window.addEventListener('keypress', done);
    document.addEventListener('keyup', done, true);
  });

  // ----- Document court (14 pages) -----

  const small = corpus();
  await load(small, 1500);
  const pages = await v(() => window.FTPages.pageCount());

  // Zoom : les lignes restent dans les pages.
  for (const z of [75, 150, 100]) {
    await v((z) => window.FTZoom.set(z), z);
    await frames(4);
    const m = await misplaced();
    assert.ok(m.lines > 50 && m.bad === 0, z + ' % ' + JSON.stringify(m));
  }
  ok(`zoom 75 %, 150 %, 100 % : ${pages} pages, aucune ligne hors des pages`);

  // Double page : chaque feuille montre exactement la page du mode avancé.
  await v(() => window.FTZoom.set(50));
  await frames(4);
  assert.ok(await v(() => document.getElementById('app').classList.contains('zoom-double')), 'double page');
  const spreads = Math.ceil(pages / 2);
  const got = [];
  for (let s = 0; s < spreads; s++) {
    await v((s) => window.FTZoom.showSpread(s), s);
    await frames(3);
    got.push(await spreadText());
  }
  await v(() => window.FTZoom.set(100));
  await frames(4);
  let bad = [];
  for (let p = 0; p < pages; p++) {
    await v((p) => window.FTVisibles.scrollToPage(p), p);
    await frames(3);
    const ref = await pageText(p);
    const d = got[p >> 1][p & 1] || [];
    // (Même premier et même dernier mot : la page est la même. Une ligne d'écart est admise : à 50 %, le
    // navigateur du banc d'essai coupe parfois un paragraphe une ligne plus tôt ou plus tard qu'à 100 %.)
    if (ref[0] !== d[0] || ref[1] !== d[1] || Math.abs(ref[2] - d[2]) > 1) bad.push({ page: p + 1, ref, d });
  }
  assert.deepStrictEqual(bad, []);
  ok(`double page : les ${pages} pages identiques à celles du mode avancé (premier et dernier mot, nombre de lignes à une près)`);

  // Saisie en double page : le texte est écrit, la vue suit le curseur ; au retour, tout est en place.
  await v(() => window.FTZoom.set(50));
  await frames(4);
  await v((s) => window.FTZoom.showSpread(s), 3);
  await frames(3);
  const before = await text();
  assert.ok(await caretIn('#editor > p:not([data-pm-far])'), 'curseur');
  await page.keyboard.type('Tomate ');
  await frames(4);
  let after = await text();
  assert.strictEqual(after.length, before.length + 7);
  assert.ok(after.includes('Tomate '));
  // Ctrl+Fin : la double page va à la fin du document.
  await page.keyboard.press('Control+End');
  await frames(6);
  const st = await v(() => window.FTZoom.state());
  assert.ok(st.spread >= Math.floor((st.pages - 1) / 2) - 1, JSON.stringify(st));
  await v(() => window.FTZoom.set(100));
  await frames(6);
  await page.waitForTimeout(300);
  for (const p of [0, Math.floor(pages / 2), pages - 1]) {
    await v((p) => window.FTVisibles.scrollToPage(p), p);
    await frames(4);
    const m = await misplaced();
    assert.ok(m.bad === 0, 'retour, page ' + (p + 1) + ' ' + JSON.stringify(m));
  }
  await v(() => window.FTMoteur.undo());
  await frames(3);
  ok('double page : saisie (le texte est écrit), Ctrl+Fin va à la dernière double page ; au retour au zoom 100 %, aucune ligne hors des pages');

  // Mode lecture : entrée et sortie, texte intact, saisie rétablie.
  await v(() => { window.FTApp.currentId = window.FTApp.currentId || (() => 'x'); });
  const t1 = await text();
  await v(() => window.FTReading.set(true));
  await frames(4);
  assert.ok(await v(() => document.getElementById('app').classList.contains('reading-mode')), 'lecture');
  assert.strictEqual(await v(() => window.FTMoteur.view.editable), false);
  await v(() => window.FTReading.set(false));
  await frames(4);
  assert.strictEqual(await v(() => window.FTMoteur.view.editable), true);
  assert.strictEqual(await text(), t1);
  const m2 = await misplaced();
  assert.ok(m2.bad === 0, JSON.stringify(m2));
  ok('mode lecture : texte non modifiable pendant la lecture, intact et de nouveau modifiable au retour');

  // Pages tournées : les blocs d'une page tournée en prennent la largeur ; saisie ; retour à la normale.
  await turn(3);
  await v(() => window.FTVisibles.scrollToPage(2));
  await frames(4);
  const wide = await v(() => [...document.querySelectorAll('#editor > p[data-pm-alt]')].map((e) => Math.round(e.getBoundingClientRect().width)));
  const narrow = await v(() => Math.round(document.querySelector('#editor > p:not([data-pm-far]):not([data-pm-alt])').getBoundingClientRect().width));
  assert.ok(wide.length > 2 && wide.every((w) => w > narrow * 1.3), JSON.stringify({ wide, narrow }));
  let m3 = await misplaced([1, 2, 3]);
  assert.ok(m3.lines > 40 && m3.bad === 0, JSON.stringify(m3));
  assert.ok(await caretIn('#editor > p[data-pm-alt]'), 'curseur sur la page tournée');
  const t2 = await text();
  await page.keyboard.type('abc');
  await frames(4);
  assert.strictEqual((await text()).length, t2.length + 3);
  m3 = await misplaced([1, 2, 3]);
  assert.ok(m3.bad === 0, JSON.stringify(m3));
  await v(() => window.FTMoteur.undo());
  await turn(3);
  assert.strictEqual(await v(() => document.querySelectorAll('#editor > [data-pm-alt]').length), 0);
  assert.strictEqual(await v(() => window.FTPages.pageCount()), pages);
  ok(`page tournée : ${wide.length} paragraphes à la largeur de la page (${wide[0]} px au lieu de ${narrow}), saisie, aucune ligne hors des pages ; retour à ${pages} pages`);

  // Export Word : une section par changement d'orientation, dans l'ordre des pages.
  await turn(3);
  await turn(4);
  await turn(9);
  const farCount = () => v(() => document.querySelectorAll('#editor > [data-pm-far]').length);
  const far0 = await farCount();
  const bytes = Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())));
  const xml = unzip(bytes, 'word/document.xml');
  assert.ok(xml, 'document.xml');
  const sections = [...xml.matchAll(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g)].map((m) => (/landscape/.test(m[0]) ? 'L' : 'P') + (/pgNumType w:start="(\d+)"/.exec(m[0]) || [, ''])[1]);
  assert.deepStrictEqual(sections.slice(0, 5), ['P1', 'L3', 'P5', 'L9', 'P10'], JSON.stringify(sections));
  assert.ok(!/data-pm-|ProseMirror/.test(xml));
  assert.strictEqual(await farCount(), far0, 'affichage partiel rétabli après l’export');
  for (const p of [3, 4, 9]) await turn(p);
  ok(`export Word avec les pages 3, 4 et 9 tournées : sections ${sections.join(', ')} (${Math.round(bytes.length / 1024)} Ko)`);

  // Export PDF : contenu enregistré (sans marques du moteur), classes du document sans celles de l'affichage.
  const job = await v(() => window.FTPdf.build());
  assert.ok(!/data-pm-|ProseMirror|pm-spread/.test(job.html.replace(/<style>[\s\S]*?<\/style>/g, '')));
  assert.ok(job.html.includes('Tomate') || job.html.includes('tomate'));
  ok('export PDF : page préparée sans marques ni classes du moteur');

  // ----- Très long document (300 pages) -----

  await load(small.repeat(21), 5000);
  const big = await v(() => window.FTPages.pageCount());
  assert.ok(big > 250, 'pages ' + big);
  await v(() => window.FTVisibles.scrollToPage(140));
  await frames(4);
  const zoomMs = [];
  for (const z of [75, 150, 100]) {
    zoomMs.push(await v((z) => { const s = performance.now(); window.FTZoom.set(z); document.body.offsetHeight; return Math.round(performance.now() - s); }, z));
    await frames(4);
    const m = await misplaced();
    assert.ok(m.bad === 0, z + ' % ' + JSON.stringify(m));
  }
  ok(`${big} pages : zoom ${zoomMs.join(' / ')} ms (75, 150, 100 %), aucune ligne hors des pages`);

  let t = Date.now();
  await v(() => window.FTZoom.set(50));
  await frames(2);
  const enter = Date.now() - t;
  const flips = [];
  for (const s of [10, 11, 70, 140]) {
    t = Date.now();
    await v((s) => window.FTZoom.showSpread(s), s);
    await frames(2);
    flips.push(Date.now() - t);
  }
  const shown = await v(() => document.querySelectorAll('#editor > :not([data-pm-far])').length);
  t = Date.now();
  await v(() => window.FTZoom.set(100));
  await frames(2);
  const leave = Date.now() - t;
  ok(`${big} pages, double page : entrée ${enter} ms, pages tournées en ${flips.join(' / ')} ms, ${shown} blocs affichés, sortie ${leave} ms`);
  assert.ok(enter < 1500 && Math.max(...flips) < 800 && leave < 1500, JSON.stringify({ enter, flips, leave }));

  await v(() => window.FTVisibles.scrollToPage(150));
  await frames(4);
  t = Date.now();
  await v(() => window.FTReading.set(true));
  await frames(2);
  const rIn = Date.now() - t;
  t = Date.now();
  await v(() => window.FTReading.set(false));
  await frames(2);
  const rOut = Date.now() - t;
  ok(`${big} pages, mode lecture : entrée ${rIn} ms, sortie ${rOut} ms`);
  assert.ok(rIn < 6000 && rOut < 2000, JSON.stringify({ rIn, rOut }));

  // Saisie sur une page tournée au milieu du document.
  await turn(150, 1500);
  await v(() => window.FTVisibles.scrollToPage(149));
  await frames(4);
  assert.ok(await caretIn('#editor > p[data-pm-alt]'), 'curseur sur la page tournée');
  await page.waitForTimeout(500);
  await v(() => { window.__lat = []; });
  for (let i = 0; i < 30; i++) { await page.keyboard.type(i % 6 === 5 ? ' ' : 'a'); await page.waitForTimeout(40); }
  await page.waitForTimeout(200);
  const lat = await v(() => window.__lat.slice());
  const m4 = await misplaced([148, 149, 150]);
  assert.ok(m4.bad === 0, JSON.stringify(m4));
  ok(`${big} pages, page 150 tournée : frappe ${median(lat)} ms par touche (médiane), aucune ligne hors des pages`);
  assert.ok(median(lat) < 80, 'frappe ' + median(lat));
};
