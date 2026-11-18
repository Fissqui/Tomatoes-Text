// Notes de bas de page au pied de leur page (version 2.2) : en mode avancé, chaque note est posée au bas de
// la page de son appel, sous un filet, et le texte de la page s'arrête au-dessus ; une note trop longue
// laisse ses premières lignes sur sa page et sa suite en tête des notes de la page suivante. Vérifie aussi :
// clic sur l'appel et frappe dans la note, note ajoutée, double page, mode lecture et mode note (notes à la
// fin, comme avant), texte enregistré inchangé. Mesures sur un très long document (300 pages, 200 notes).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-notes-pages.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const LOREM = 'Le texte courant avance sur la page et la remplit de lignes successives pour que le découpage ait du travail à faire. ';

// Document de n paragraphes ; un appel de note tous les trois paragraphes (every) ; la note du paragraphe long
// (index long) est très longue.
function doc(n, long, every = 3) {
  let body = '';
  let notes = '';
  let k = 0;
  for (let i = 0; i < n; i++) {
    let p = LOREM.repeat(4);
    if (i % every === 0) {
      k++;
      p += `Appel<sup class="ft-fn-ref" data-fn="n${k}" contenteditable="false">${k}</sup> suite. `;
      notes += `<li data-fn="n${k}">Note ${k}. ${'Explication de la note. '.repeat(i === long ? 400 : i % 9 === 0 ? 40 : 3)}</li>`;
    }
    body += `<p>${p}${LOREM}</p>`;
  }
  return body + `<div class="ft-footnotes"><ol>${notes}</ol></div>`;
}

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => v((n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0)); f(n); }), n);
  const load = async (html, mode = 'avance') => {
    await v(([h, m]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m } });
      document.getElementById('page').hidden = false;
      window.FTNotes.sync();
    }, [html, mode]);
    await frames(6);
  };
  await v(() => { window.FTLayout.setCapitalize(false); });

  // Où sont les notes et le texte : page de chaque note et de son appel (à partir de 0), haut et bas de
  // chaque note, bas du texte de chaque page, suites des notes coupées.
  const layout = () => v(() => {
    const pg = document.getElementById('page');
    const k = pg.currentCSSZoom || 1;
    const top = pg.getBoundingClientRect().top;
    const geo = window.FTPages._geo();
    const y = (c) => (c - top) / k;
    const pageAt = (t) => geo.findIndex((g) => t >= g.top && t < g.top + g.h);
    const out = { geo: geo.map((g) => ({ ct: g.ct, cb: g.cb })), notes: [], conts: [], text: {} };
    for (const li of document.querySelectorAll('#editor .ft-footnotes li')) {
      const r = li.getBoundingClientRect();
      const ref = document.querySelector(`#editor sup.ft-fn-ref[data-fn="${li.dataset.fn}"]`);
      const rr = ref && !ref.closest('[data-pm-far]') ? ref.getBoundingClientRect() : null;
      const clip = /inset\([^ ]+ [^ ]+ ([\d.]+)px/.exec(li.style.clipPath || '');
      out.notes.push({ id: li.dataset.fn, n: li.dataset.pmN, h: r.height / k, top: y(r.top), bottom: y(r.bottom) - (clip ? +clip[1] : 0), page: pageAt(y(r.top)), refPage: rr ? pageAt(y(rr.top)) : null, clipped: !!clip, text: li.textContent.slice(0, 12) });
    }
    for (const c of document.querySelectorAll('#editor .pm-fn-cont')) {
      const r = c.getBoundingClientRect();
      out.conts.push({ top: y(r.top), bottom: y(r.bottom), page: pageAt(y(r.top)) });
    }
    const w = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.data.trim() || t.parentElement.closest('[data-pm-far], .ft-footnotes')) continue;
      rg.selectNodeContents(t);
      for (const rc of rg.getClientRects()) {
        if (!rc.height) continue;
        const p = pageAt(y(rc.top));
        out.text[p] = Math.max(out.text[p] || 0, y(rc.bottom));
      }
    }
    return out;
  });
  // Chaque note au pied de la page de son appel, dans la zone de texte, sous le texte de la page.
  const check = (L, what) => {
    const byPage = {};
    for (const nt of L.notes) {
      if (nt.refPage === null) continue;
      assert.strictEqual(nt.page, nt.refPage, `${what} : note ${nt.n} sur la page ${nt.page + 1}, appel sur la page ${nt.refPage + 1}`);
      const g = L.geo[nt.page];
      assert(nt.top >= g.ct - 1 && nt.bottom <= g.cb + 1, `${what} : note ${nt.n} hors de la zone de texte (${Math.round(nt.top)}–${Math.round(nt.bottom)}, zone ${Math.round(g.ct)}–${Math.round(g.cb)})`);
      byPage[nt.page] = Math.min(byPage[nt.page] ?? Infinity, nt.top);
    }
    for (const c of L.conts) byPage[c.page] = Math.min(byPage[c.page] ?? Infinity, c.top);
    for (const [p, t] of Object.entries(byPage)) assert(!(L.text[p] > t - 4), `${what} : texte de la page ${+p + 1} sous ses notes (${Math.round(L.text[p])} > ${Math.round(t)})`);
  };

  // 1. Notes au pied de leur page ; note très longue coupée sur plusieurs pages.
  const html = doc(40, 9);
  await load(html);
  let L = await layout();
  assert.strictEqual(L.notes.length, 14);
  assert(L.notes.every((nt) => nt.n === nt.id.slice(1)), 'numéros des notes');
  // (Toutes les pages parcourues : les appels loin de l'écran sont affichés le temps de la mesure.)
  for (let p = 0; p < L.geo.length; p++) {
    await v((p) => window.FTVisibles.scrollToPage(p), p);
    await frames(3);
    check(await layout(), `page ${p + 1}`);
  }
  L = await layout();
  const long = L.notes.find((nt) => nt.id === 'n4');
  assert(long.clipped && L.conts.length >= 2 && L.conts[0].page === long.page + 1, 'note longue coupée : ' + JSON.stringify({ long, conts: L.conts }));
  assert.match(await v(() => window.FTEditor.getHtml()), /<div class="ft-footnotes"><ol><li data-fn="n1">Note 1\./, 'texte enregistré : notes à la fin, comme avant');
  assert(!/pm-fn|data-pm-n/.test(await v(() => window.FTEditor.getHtml())), 'aucune marque enregistrée');
  ok(`${L.notes.length} notes sur ${L.geo.length} pages, chacune au pied de la page de son appel, sous le texte ; note longue sur ${L.conts.length + 1} pages`);

  // 2. Clic sur un appel : le curseur va dans la note ; ce qui y est écrit la fait grandir, la page s'ajuste.
  await v(() => window.FTVisibles.scrollToPage(0));
  await frames(3);
  await page.click('#editor sup.ft-fn-ref[data-fn="n2"]');
  await frames(2);
  assert.match(await v(() => window.FTMoteur.view.state.selection.$from.parent.textContent), /^Note 2\./);
  const h0 = (await layout()).notes.find((nt) => nt.id === 'n2');
  await page.keyboard.type(' Ajout. '.repeat(30));
  await frames(4);
  L = await layout();
  const h1 = L.notes.find((nt) => nt.id === 'n2');
  assert(h1.h > h0.h + 20, 'la note grandit');
  check(L, 'note agrandie');
  ok('clic sur l’appel : curseur dans la note ; la note grandit, le texte de sa page s’arrête plus haut');

  // 3. Double page : les notes de chaque page au pied de sa feuille.
  await v(() => window.FTZoom.set(50));
  await frames(4);
  await v(() => window.FTZoom.showSpread(1));
  await frames(6);
  const dp = await v(() => {
    const sheets = [...document.querySelectorAll('.dp-sheet')].map((s) => s.getBoundingClientRect());
    const out = [];
    for (const li of document.querySelectorAll('#editor .ft-footnotes :is(li[data-pm-n], .pm-fn-cont)')) {
      const r = li.getBoundingClientRect();
      if (!r.height || getComputedStyle(li).display === 'none') continue;
      const s = sheets.findIndex((x) => r.left >= x.left && r.right <= x.right + 1 && r.top >= x.top && r.top <= x.bottom);
      out.push({ n: li.dataset.pmN || 'suite', sheet: s, inside: s >= 0 && r.top > sheets[s].top + sheets[s].height / 4 });
    }
    return out;
  });
  if (process.env.ESSAI_SHOT) await page.screenshot({ path: process.env.ESSAI_SHOT });
  await v(() => window.FTZoom.set(100));
  await frames(4);
  assert(dp.some((x) => x.inside && x.sheet === 0) && dp.some((x) => x.inside && x.sheet === 1) && dp.filter((x) => x.sheet >= 0).every((x) => x.inside), 'double page : ' + JSON.stringify(dp));
  check(await layout(), 'retour de la double page');
  ok(`double page : notes au bas de leur feuille (${dp.filter((x) => x.inside).map((x) => x.n + ' p. ' + (x.sheet + 3)).join(', ')})`);

  // 4. Note ajoutée au bouton : numérotée, au pied de sa page ; Ctrl+Z la retire.
  const at = await v(() => {
    const d = window.FTMoteur.view.state.doc;
    let pos = null;
    d.forEach((n, p, i) => { if (pos === null && i === 7) pos = p + 30; });
    return pos;
  });
  await v((a) => { const w = window.FTMoteur.view; w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a))); w.focus(); }, at);
  await v(() => document.getElementById('note-btn').click());
  await page.keyboard.type('Nouvelle note.');
  await frames(4);
  L = await layout();
  const added = L.notes.find((nt) => nt.text.startsWith('Nouvelle'));
  assert(added && added.n === '4', 'nouvelle note n° 4 : ' + JSON.stringify(added));
  check(L, 'note ajoutée');
  await v(() => window.FTMoteur.undo());
  await v(() => window.FTMoteur.undo());
  await frames(4);
  L = await layout();
  assert.strictEqual(L.notes.length, 14);
  check(L, 'Ctrl+Z');
  ok('note ajoutée au bouton : n° 4, au pied de sa page ; Ctrl+Z la retire');

  // 5. Mode lecture : les pages exactes du mode avancé (notes au pied des pages) ; mode note : les notes
  // à la fin du texte, comme avant.
  await v(() => window.FTReading.set(true));
  await frames(4);
  const flowRead = await v(() => getComputedStyle(document.querySelector('#editor .ft-footnotes')).position);
  await v(() => window.FTReading.set(false));
  await frames(4);
  check(await layout(), 'retour du mode lecture');
  await load(html, 'note');
  const flowNote = await v(() => getComputedStyle(document.querySelector('#editor .ft-footnotes')).position);
  assert.deepStrictEqual([flowRead, flowNote], ['absolute', 'relative']);
  ok('mode lecture : pages exactes, notes au pied des pages ; mode note : notes à la fin du texte');

  // 6. Export PDF (mode avancé) : chaque note au pied de la page de son appel, sous le texte ; la note
  // longue continue en tête des notes des pages suivantes.
  electron.BrowserWindow.printer = page.context().browser();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-notes-'));
  electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(tmp, 'notes.pdf') });
  const pdfPages = (buf) => v(async (b64) => {
    if (!window.pdfjsLib) {
      const add = (src) => new Promise((ok2, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok2; s.onerror = ko; document.head.append(s); });
      await add('vendor/pdfjs/pdf.worker.js');
      await add('vendor/pdfjs/pdf.js');
    }
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = await window.pdfjsLib.getDocument({ data, verbosity: 0, isEvalSupported: false, useWorkerFetch: false }).promise;
    const out = [];
    for (let i = 1; i <= d.numPages; i++) {
      const tc = await (await d.getPage(i)).getTextContent();
      out.push(tc.items.filter((t) => t.str && t.str.trim()).map((t) => ({ s: t.str, y: t.transform[5], h: t.height })));
    }
    await d.destroy();
    return out;
  }, buf.toString('base64'));
  for (const typo of [false, true]) {
    await load(html);
    const e0 = (electron.BrowserWindow.printErrors || []).length;
    const file = await v(async (t) => window.frameText.exportPdf('Notes', await window.FTPdf.build({ typo: t })), typo);
    assert(file && fs.existsSync(file), 'PDF écrit');
    assert.strictEqual((electron.BrowserWindow.printErrors || []).length, e0, 'pas d\'erreur dans la page imprimée');
    const P = await pdfPages(fs.readFileSync(file));
    const what = typo ? 'PDF (typographie soignée)' : 'PDF';
    // Haut de la zone des notes de chaque page : première ligne « Note k. » ou suite de note en tête.
    const seen = [];
    let conts = 0;
    P.forEach((items, i) => {
      const isNote = (t) => /Note \d+\.|Explication de la note/.test(t.s);
      const notes = items.filter(isNote);
      if (!notes.length) return;
      const noteTop = Math.max(...notes.map((t) => t.y));
      const body = items.filter((t) => /Le texte courant|Appel/.test(t.s));
      assert(body.every((t) => t.y > noteTop + 2), `${what} : texte sous les notes, page ${i + 1}`);
      for (const t of items) { const m = /Note (\d+)\./.exec(t.s); if (m) seen.push({ n: +m[1], page: i }); }
      const first = notes.reduce((a, t) => (t.y > a.y ? t : a));
      if (!/Note \d+\./.test(first.s)) conts++;
    });
    assert.deepStrictEqual(seen.map((x) => x.n), Array.from({ length: 14 }, (_, k) => k + 1), `${what} : notes 1 à 14 dans l'ordre`);
    // Appel de chaque note sur la même page que la note (texte « Appel » puis numéro en exposant).
    for (const { n, page: i } of seen) {
      const calls = P[i].filter((t) => t.s.trim() === String(n) && t.h < 9);
      assert(calls.length, `${what} : appel ${n} sur la page ${i + 1} de sa note`);
    }
    assert(conts >= 2, `${what} : note longue continuée sur les pages suivantes (${conts})`);
    ok(`${what} : ${P.length} pages, 14 notes au pied de la page de leur appel, note longue continuée sur ${conts} page(s)`);
  }

  // 6 bis. Note nouvelle, vide, puis frappe dedans (version 2.3.4) : la première lettre remplaçait la note
  // sans lui rendre sa place au pied de page ; elle restait cachée et la vue remontait en haut du texte.
  await load(doc(8, -1, 99).replace(/Appel<sup[^]*?<\/sup> suite\. /, '').replace(/<div class="ft-footnotes">.*$/, ''));
  await v(() => {
    const p = document.querySelectorAll('#editor > p')[4];
    const w = window.FTMoteur.view;
    window.FTMoteur.placeCaret(w.posAtDOM(p, p.childNodes.length));
    w.focus();
    window.FTNotes.footnote();
  });
  await frames(4);
  const before = await v(() => ({ scroll: document.getElementById('workspace').scrollTop, n: document.querySelectorAll('#editor .ft-footnotes li[data-pm-n]').length }));
  await page.keyboard.type('Ffff');
  await frames(4);
  const after = await v(() => {
    const li = window.FTMoteur.view.domAtPos(window.FTMoteur.view.state.selection.from).node.parentElement.closest('li');
    return { scroll: document.getElementById('workspace').scrollTop, text: li && li.textContent, placed: !!(li && li.dataset.pmN), n: document.querySelectorAll('#editor .ft-footnotes li[data-pm-n]').length };
  });
  assert.strictEqual(after.text, 'Ffff', 'frappe dans la note nouvelle');
  assert(after.placed && after.n === before.n, 'note nouvelle à sa place après la frappe : ' + JSON.stringify({ before, after }));
  assert(Math.abs(after.scroll - before.scroll) < 40, 'la vue reste sur la note : ' + JSON.stringify({ before, after }));
  check(await layout(), 'note nouvelle');
  ok('note nouvelle : la frappe la garde au pied de sa page, la vue ne bouge pas');

  // 7. Très long document : 300 pages, 217 notes.
  await load(doc(1300, -1, 6), 'avance');
  await frames(10);
  const big = await v(() => window.FTPages._geo().length);
  await v(() => window.FTVisibles.scrollToPage(150));
  await frames(4);
  const mid = await v(() => {
    const ref = [...document.querySelectorAll('#editor sup.ft-fn-ref')].find((s) => !s.closest('[data-pm-far]'));
    return ref.getAttribute('data-fn');
  });
  check(await layout(), 'page 151');
  // Frappe dans le texte (au milieu), puis dans une note.
  const typeMs = async (n) => {
    const ms = [];
    for (let i = 0; i < n; i++) ms.push(await v(async () => {
      const t0 = performance.now();
      document.execCommand('insertText', false, 'x');
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      return performance.now() - t0;
    }));
    ms.sort((a, b) => a - b);
    return Math.round(ms[ms.length >> 1]);
  };
  await v((id) => {
    const w = window.FTMoteur.view;
    const el = document.querySelector(`#editor sup.ft-fn-ref[data-fn="${id}"]`);
    const pos = w.posAtDOM(el, 0) - 8;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, pos)));
    w.focus();
  }, mid);
  const inText = await typeMs(15);
  await page.click(`#editor sup.ft-fn-ref[data-fn="${mid}"]`);
  await frames(2);
  const inNote = await typeMs(15);
  await frames(4);
  check(await layout(), 'page 151 après la frappe');
  ok(`très long document (${big} pages, 217 notes) : frappe dans le texte ${inText} ms (médiane), dans une note ${inNote} ms`);
};
