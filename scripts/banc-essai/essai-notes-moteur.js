// Notes, citations et styles dans le nouveau moteur (préversion 2.0 n° 5) : notes de bas de page et de fin,
// « Sourcer » (citations, styles de citation, bibliographie), thème du document et « Styles du document ».
// Chaque outil : le texte du moteur change, une seule étape d'annulation, l'enregistrement reste celui des
// versions 1.x. Mesures sur un très long document (300 pages, 200 notes) : frappe dans le texte et dans une
// note, note ajoutée au début (toutes renumérotées), ouverture.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-notes-moteur.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function corpus() {
  const dir = path.join(process.env.FT_SRC || path.join(__dirname, '..', '..', 'src'), 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const reset = async (html) => {
    await page.keyboard.press('Escape');
    await v((h) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: 'note' } });
      document.getElementById('page').hidden = false;
    }, html);
    await page.waitForTimeout(150);
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const select = (from, to = from) => v(([a, b]) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a, b)));
    w.focus();
  }, [from, to]);
  const caret = () => v(() => { const s = window.FTMoteur.view.state.selection; return [s.from, s.$from.parent.textContent]; });
  const undo = () => v(() => window.FTMoteur.undo());
  const posOf = (needle) => v((n) => { let p = null; window.FTMoteur.view.state.doc.descendants((x, q) => { if (p === null && x.type.name === 'raw_inline' && x.attrs.html.includes(n)) p = q; }); return p; }, needle);
  const strip = (html) => html.replace(/data-(fn|en)="[a-z0-9]+"/g, 'data-$1="?"').replace(/data-src="[a-z0-9]+"/g, 'data-src="?"');
  await v(() => { window.FTLayout.setCapitalize(false); });

  // 1. Notes de bas de page : bouton, « ^^ », renumérotées dans l'ordre du texte ; Entrée ramène au texte.
  await reset('<p>Premier texte.</p><p>Deuxième.</p>');
  await select(14);
  await v(() => document.getElementById('note-btn').click());
  assert.strictEqual(strip(await saved()), '<p>Premier texte<sup class="ft-fn-ref" data-fn="?" contenteditable="false">1</sup>.</p><p>Deuxième.</p><div class="ft-footnotes"><ol><li data-fn="?" class="empty"><br></li></ol></div>');
  assert.deepStrictEqual((await caret())[1], '');
  await page.keyboard.type('Une note.');
  await page.keyboard.press('Enter');
  assert.deepStrictEqual(await caret(), [15, 'Premier texte.']);
  await select(26);
  await page.keyboard.type('^^Seconde');
  await select(3);
  await v(() => document.getElementById('note-btn').click());
  await page.keyboard.type('Avant');
  assert.strictEqual(strip(await saved()), '<p>Pr<sup class="ft-fn-ref" data-fn="?" contenteditable="false">1</sup>emier texte<sup class="ft-fn-ref" data-fn="?" contenteditable="false">2</sup>.</p>'
    + '<p>Deuxième<sup class="ft-fn-ref" data-fn="?" contenteditable="false">3</sup>.</p><div class="ft-footnotes"><ol><li data-fn="?">Avant</li><li data-fn="?">Une note.</li><li data-fn="?">Seconde</li></ol></div>');
  await undo();
  await undo();
  assert.match(await saved(), /^<p>Premier texte<sup[^>]*>1<\/sup>\.<\/p><p>Deuxième<sup[^>]*>2<\/sup>\.<\/p><div class="ft-footnotes"><ol><li data-fn="\w+">Une note\.<\/li><li data-fn="\w+">Seconde<\/li><\/ol><\/div>$/);
  // Appel effacé : sa note part avec lui (et revient avec Ctrl+Z).
  const ref1 = await posOf('ft-fn-ref');
  await select(ref1, ref1 + 1);
  await page.keyboard.press('Backspace');
  assert.match(await saved(), /^<p>Premier texte\.<\/p><p>Deuxième<sup[^>]*>1<\/sup>\.<\/p><div class="ft-footnotes"><ol><li data-fn="\w+">Seconde<\/li><\/ol><\/div>$/);
  await undo();
  assert.match(await saved(), /<li data-fn="\w+">Une note\.<\/li><li data-fn="\w+">Seconde<\/li>/);
  // Clic sur l'appel : le curseur va dans la note ; la note ne se fusionne pas avec la suivante.
  await select(1);
  await page.click('#editor sup.ft-fn-ref');
  assert.strictEqual((await caret())[1], 'Une note.');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  assert.match(await saved(), /<li data-fn="\w+">ne note\.<\/li><li data-fn="\w+">Seconde<\/li>/);
  ok('notes de bas de page : bouton et « ^^ », renumérotées dans l’ordre du texte, Entrée ramène à l’appel, appel effacé = note effacée, une annulation');

  // 2. Notes de fin : avant les notes de bas de page ; menu du clic droit « Supprimer la note ».
  await reset('<p>Un texte assez long ici.</p>');
  await select(4);
  await v(() => document.getElementById('endnote-btn').click());
  await page.keyboard.type('Fin un.');
  await select(4);
  await v(() => document.getElementById('note-btn').click());
  await page.keyboard.type('Bas.');
  assert.strictEqual(strip(await saved()), '<p>Un <sup class="ft-fn-ref" data-fn="?" contenteditable="false">1</sup><sup class="ft-en-ref" data-en="?" contenteditable="false">i</sup>texte assez long ici.</p>'
    + '<div class="ft-endnotes"><div class="ft-endnotes-title" contenteditable="false">Notes</div><ol><li data-en="?">Fin un.</li></ol></div><div class="ft-footnotes"><ol><li data-fn="?">Bas.</li></ol></div>');
  await page.click('#editor sup.ft-en-ref', { button: 'right' });
  await page.click('#context-menu >> text=Supprimer la note');
  assert.strictEqual(strip(await saved()), '<p>Un <sup class="ft-fn-ref" data-fn="?" contenteditable="false">1</sup>texte assez long ici.</p><div class="ft-footnotes"><ol><li data-fn="?">Bas.</li></ol></div>');
  ok('notes de fin : numérotées i, ii…, placées avant les notes de bas de page ; « Supprimer la note » au clic droit');

  // 3. « Sourcer » : nouvelle source, citation au curseur, style numérique puis « note », bibliographie,
  //    citation rouverte d'un clic et changée.
  await reset('<p>Comme le dit l’auteur.</p><p>Suite.</p>');
  await select(22);
  await page.click('#cite-btn');
  await page.click('#src-new');
  await page.fill('#src-authors', 'Dupont, Jean');
  await page.fill('#src-title', 'Le livre');
  await page.fill('#src-year', '2020');
  await page.fill('#src-publisher', 'Seuil');
  await page.fill('#src-page', '12');
  await page.click('#src-cite');
  assert.strictEqual(strip(await saved()), '<p>Comme le dit l’auteur<span class="ft-cite" data-src="?" data-page="12" contenteditable="false">(Dupont, 2020, p. 12)</span>.</p><p>Suite.</p>');
  await undo();
  assert.strictEqual(await saved(), '<p>Comme le dit l’auteur.</p><p>Suite.</p>');
  await v(() => window.FTMoteur.redo());
  await v(() => { const s = document.getElementById('src-style'); s.value = 'numerique'; s.dispatchEvent(new Event('change')); });
  assert.match(await saved(), /contenteditable="false">\[1, p\. 12\]<\/span>/);
  await select(30);
  await page.click('#cite-btn');
  await page.selectOption('#src-scope', 'cites');
  await page.click('#src-biblio');
  assert.match(await saved(), /<p>Suite\.<\/p><h2 class="ft-bib-title" data-nonum="oui" data-ids="\w+">Bibliographie<\/h2><p class="ft-bib" data-src="\w+" data-h="\w+" data-n="1">DUPONT, Jean\. <i>Le livre<\/i>\. Seuil, 2020\.<\/p><p><br><\/p>$/);
  await v(() => { const s = document.getElementById('src-style'); s.value = 'note'; s.dispatchEvent(new Event('change')); });
  assert.match(strip(await saved()), /<span class="ft-cite as-note" data-src="\?" data-page="12" contenteditable="false" data-en="\?">i<\/span>.*<div class="ft-endnotes"><div class="ft-endnotes-title" contenteditable="false">Notes<\/div><ol><li data-en="\?" data-cite="oui" contenteditable="false">DUPONT, Jean\. <i>Le livre<\/i>\. Seuil, 2020, p\. 12\.<\/li><\/ol><\/div>$/);
  await v(() => { const s = document.getElementById('src-style'); s.value = 'auteur-date'; s.dispatchEvent(new Event('change')); });
  assert.ok(!(await saved()).includes('ft-endnotes'));
  await page.click('#editor span.ft-cite');
  assert.ok(await v(() => document.getElementById('sources-dialog').open));
  await page.fill('#src-page', '40');
  await page.click('#src-cite');
  assert.match(await saved(), /data-page="40" contenteditable="false"[^>]*>\(Dupont, 2020, p\. 40\)<\/span>/);
  ok('« Sourcer » : citation au curseur, styles auteur-date, numérique et note (note de fin avec la référence), bibliographie, citation changée d’un clic');

  // 4. Ouverture : numéros et notes remis d'accord, sans étape d'annulation.
  await reset('<p>A<sup class="ft-fn-ref" data-fn="a" contenteditable="false">7</sup> B<sup class="ft-fn-ref" data-fn="b" contenteditable="false">3</sup></p><div class="ft-footnotes"><ol><li data-fn="b">note b</li><li data-fn="a" class="empty">note a</li></ol></div>');
  await v(() => window.FTCite.load({}));
  assert.strictEqual(await saved(), '<p>A<sup class="ft-fn-ref" data-fn="a" contenteditable="false">1</sup> B<sup class="ft-fn-ref" data-fn="b" contenteditable="false">2</sup></p><div class="ft-footnotes"><ol><li data-fn="a">note a</li><li data-fn="b">note b</li></ol></div>');
  assert.strictEqual(await v(() => window.FTMoteur.undoDepth()), 0);
  ok('ouverture : numéros et ordre des notes remis d’accord, sans étape d’annulation');

  // 5. Thème du document appliqué aux éléments existants ; « Styles du document » (tableaux) : une annulation.
  const styled = '<h1>Titre</h1><p>Texte.</p><table class="ft-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table><blockquote class="ft-callout"><p>Encadré</p></blockquote><p>Fin.</p>';
  await reset(styled);
  await select(2);
  const before = await saved();
  await v(() => window.FTApp.menu('doc-theme'));
  await page.waitForTimeout(200);
  const cards = await page.$$('.th-card');
  assert.ok(cards.length > 2, 'thèmes proposés');
  await cards[2].click();
  await page.waitForTimeout(200);
  const themed = await saved();
  assert.notStrictEqual(themed, before);
  await page.keyboard.press('Escape');
  await undo();
  assert.strictEqual(await saved(), before);
  ok('thème du document : appliqué aux éléments existants (titres, tableau, encadré), une annulation');

  // 6. Très long document (300 pages, 200 notes) : frappe dans le texte et dans une note, note ajoutée au début.
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
  const big = corpus().repeat(21);
  const tOpen = await v((h) => {
    // 200 appels de note répartis dans le texte, leurs notes à la fin.
    const box = new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html').body;
    box.querySelectorAll('sup.ft-fn-ref, sup.ft-en-ref, span.ft-cite, .ft-footnotes, .ft-endnotes, .ft-biblio').forEach((x) => x.remove());
    const ps = [...box.querySelectorAll(':scope > p')].filter((p) => p.textContent.length > 60);
    const notes = [];
    for (let i = 0; i < 200; i++) {
      const p = ps[Math.floor((i * ps.length) / 200)];
      const id = 'n' + i;
      p.insertAdjacentHTML('beforeend', `<sup class="ft-fn-ref" data-fn="${id}" contenteditable="false">${i + 1}</sup>`);
      notes.push(`<li data-fn="${id}">Note numéro ${i + 1}, avec un peu de texte.</li>`);
    }
    const html = box.innerHTML + '<div class="ft-footnotes"><ol>' + notes.join('') + '</ol></div>';
    const t = performance.now();
    window.FTEditor.load({ content: { html }, settings: { mode: 'note' } });
    window.FTNotes.sync();
    document.body.offsetHeight;
    return performance.now() - t;
  }, big);
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
  const typeAt = async (pos) => {
    await select(pos);
    await v((p) => { const w = window.FTMoteur.view; const d = w.nodeDOM(w.state.doc.resolve(p).before(1)); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'center' }); window.__lat = []; }, pos);
    await page.waitForTimeout(300);
    await page.keyboard.type('quelques mots tapés ', { delay: 50 });
    await page.waitForTimeout(300);
    return v(() => window.__lat.splice(0));
  };
  const mid = await v(() => {
    const d = window.FTMoteur.view.state.doc;
    let pos = 0;
    let i = 0;
    for (; i < d.childCount / 2 || d.child(i).type.name !== 'paragraph' || d.child(i).content.size < 40; i++) pos += d.child(i).nodeSize;
    return pos + 1;
  });
  const body = await typeAt(mid);
  const inNote = await v(() => { const d = window.FTMoteur.view.state.doc; return d.content.size - d.lastChild.nodeSize + 6; });
  const note = await typeAt(inNote);
  await select(3);
  const add = await v(async () => {
    const t = performance.now();
    document.getElementById('note-btn').click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t;
  });
  const check = await v(() => {
    const d = window.FTMoteur.view.state.doc;
    const ol = d.lastChild.firstChild;
    let first = null;
    let last = null;
    d.descendants((n) => { if (n.type.name === 'raw_inline' && n.attrs.html.includes('ft-fn-ref')) { if (!first) first = n.attrs.html; last = n.attrs.html; } });
    return { count: ol.childCount, first: />1</.test(first), last: />201</.test(last), blocks: d.childCount };
  });
  assert.deepStrictEqual([check.count, check.first, check.last], [201, true, true]);
  ok(`très long document (300 pages, ${check.blocks} blocs, 200 notes) : ouverture ${Math.round(tOpen)} ms, frappe dans le texte ${Math.round(median(body))} ms (médiane), dans une note ${Math.round(median(note))} ms, note ajoutée au début (201 renumérotées) ${Math.round(add)} ms`);
};
