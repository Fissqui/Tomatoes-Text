// Outils d'écriture repris dans le nouveau moteur (préversion 2.0 n° 4) : casse, rechercher / remplacer,
// guillemets, majuscule automatique, point médian, caractères spéciaux, date, formules, lettrine, faux
// texte, raccourcis « Structure », largeur des colonnes et hauteur des lignes de tableau à la souris.
// Chaque outil : le texte du moteur change, une seule étape d'annulation, la sélection reste utile.
// Mesures sur un très long document (300 pages) : rechercher, mot suivant, tout remplacer.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-ecriture-moteur.js
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
  const reset = async (html, settings = { mode: 'note' }) => {
    await page.keyboard.press('Escape');
    await v(([h, s]) => {
      window.FTEditor.load({ content: { html: h }, settings: s });
      document.getElementById('page').hidden = false;
    }, [html, settings]);
    await page.waitForTimeout(150);
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const text = () => v(() => window.FTMoteur.view.state.doc.textContent);
  const select = (from, to = from) => v(([a, b]) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a, b)));
    w.focus();
  }, [from, to]);
  const selection = () => v(() => { const s = window.FTMoteur.view.state; return [s.selection.from, s.selection.to, s.doc.textBetween(s.selection.from, s.selection.to)]; });
  const undo = () => v(() => window.FTMoteur.undo());
  const frame = () => v(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));

  // 1. Casse : sélection sur deux morceaux de mise en forme, puis mot sous le curseur ; Maj+F3.
  await reset('<p>Bonjour le <b>monde entier</b> et la suite.</p>');
  await select(9, 18);
  await v(() => window.FTCase.apply('upper'));
  assert.strictEqual(await saved(), '<p>Bonjour LE <b>MONDE entier</b> et la suite.</p>');
  assert.deepStrictEqual(await selection(), [9, 18, 'LE MONDE ']);
  await select(30);
  await v(() => window.FTCase.apply('upper'));
  assert.deepStrictEqual(await selection(), [28, 30, 'LA']);
  await page.keyboard.press('Shift+F3');
  assert.strictEqual(await text(), 'Bonjour LE MONDE entier et La suite.');
  await undo();
  await undo();
  assert.strictEqual(await text(), 'Bonjour LE MONDE entier et la suite.');
  ok('casse : sélection gardée sur le passage (deux mises en forme), mot sous le curseur, Maj+F3, une annulation par changement');

  // 2. Saisie : guillemets, majuscule automatique, « i. » en minuscule, point médian.
  await reset('<p></p>');
  await v(() => { window.FTLayout.setCapitalize(true); window.FTInsert.setQuotes('francais'); window.FTInsert.setMedian(true); });
  await page.click('#editor');
  await page.keyboard.type('il dit "bonjour" puis part. ensuite "oui ".');
  assert.strictEqual(await text(), 'Il dit « bonjour » puis part. Ensuite « oui ».');
  await page.keyboard.press('Enter');
  await page.keyboard.type('i. premier');
  assert.match(await saved(), /<ol data-num="romain-min"><li>Premier<\/li><\/ol>/);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('les ami');
  await page.keyboard.press('NumpadMultiply');
  await page.keyboard.type('e');
  await page.keyboard.press('NumpadMultiply');
  await page.keyboard.type('s');
  assert.match(await text(), /Les ami·e·s$/);
  await v(() => window.FTInsert.setQuotes('anglais'));
  await page.keyboard.type(' "ok"');
  assert.match(await text(), /Les ami·e·s “ok”$/);
  ok('saisie : « » avec espaces insécables (et “ ”), majuscule en début de phrase, « i. » reste en minuscules, point médian');

  // 3. Caractères spéciaux et date : au curseur, une annulation chacun.
  await page.keyboard.type(' le');
  await v(() => document.getElementById('date-btn').click());
  const today = await v(() => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }));
  assert.ok((await text()).endsWith(' le ' + today), await text());
  await v(() => document.getElementById('chars-btn').click());
  await v(() => [...document.querySelectorAll('#chars-pop .char')].find((b) => b.textContent === '€').click());
  assert.ok((await text()).endsWith(today + '€'));
  await v(() => { document.getElementById('date-more').click(); document.getElementById('date-auto').checked = true; document.querySelectorAll('#date-pop .date-choice')[2].click(); });
  assert.match(await saved(), /€ <span class="ft-date" data-fmt="court" contenteditable="false"[^>]*>\d\d\/\d\d\/\d{4}<\/span><\/p>$/);
  await undo();
  await undo();
  assert.ok((await text()).endsWith(' le ' + today));
  ok('caractère spécial et date (texte, ou mise à jour à l’ouverture) au curseur ; une annulation chacun');

  // 4. Équations : dans la ligne, modifiée dans le texte (clic), rouverte par le clic droit et passée sur sa
  // propre ligne, menu du clic droit, suppression.
  await reset('<p>Avant et après.</p><p>Deux.</p>');
  await page.click('#editor');
  await select(7);
  await v(() => document.getElementById('math-btn').click());
  await page.waitForTimeout(200);
  await v(() => { document.getElementById('math-input').value = 'x^2'; document.getElementById('math-ok').click(); });
  assert.match(await saved(), /^<p>Avant <span class="ft-math" contenteditable="false" data-latex="x\^2">/);
  assert.strictEqual((await selection())[0], 8);
  await page.keyboard.type('Z');
  await page.click('#editor span.ft-math');
  await page.waitForTimeout(200);
  assert.ok(await v(() => !!document.querySelector('#editor span.ft-math math-field')), 'modification dans le texte');
  await page.keyboard.press('End');
  await page.keyboard.type('+1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.match(await saved(), /data-latex="x\^2\+1"/);
  const span = await page.locator('#editor span.ft-math').boundingBox();
  await page.mouse.click(span.x + span.width / 2, span.y + span.height / 2, { button: 'right' });
  let menu = await v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()));
  assert.deepStrictEqual(menu.slice(0, 2), ['Modifier l’équation', 'Disposition']);
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent.includes('Modifier')).click());
  await page.waitForTimeout(200);
  assert.ok(await v(() => document.getElementById('math-dialog').open));
  await v(() => { document.querySelector('input[name="math-mode"][value="block"]').checked = true; document.getElementById('math-input').value = 'y=1'; document.getElementById('math-ok').click(); });
  const tags = await v(() => [...window.FTMoteur.view.dom.children].map((e) => e.tagName + (e.classList.contains('ft-math') ? '.ft-math' : '')).join(' '));
  assert.strictEqual(tags, 'P DIV.ft-math P');
  const box = await page.locator('#editor > div.ft-math').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  menu = await v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()));
  assert.deepStrictEqual(menu.slice(0, 3), ['Modifier l’équation', 'Numéroter l’équation', 'Disposition']);
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent.includes('Supprimer')).click());
  assert.ok(!/ft-math/.test(await saved()));
  await undo();
  assert.match(await saved(), /<div class="ft-math"/);
  ok('équation : au curseur, modifiée dans le texte, rouverte par le clic droit et mise sur sa ligne, supprimée (Ctrl+Z la rend)');
  // Majuscules tapées : lettres normales (CC ne devient plus ℂ) ; symboles et fonctions gardés ; caractères
  // spéciaux dans leur catégorie de la palette.
  await reset('<p>Texte.</p>');
  await page.click('#editor');
  await v(() => window.FTFormules.open(null));
  await page.waitForTimeout(300);
  await page.keyboard.type('CC+AA+NN+alpha', { delay: 30 });
  let typed = await v(() => document.getElementById('math-input').value);
  assert.ok(!/\\/.test(typed) && /C.*C.*A.*A.*N.*N/.test(typed), typed);
  await v(() => { document.getElementById('math-input').value = ''; });
  await page.keyboard.type('x>=sin', { delay: 30 });
  typed = await v(() => document.getElementById('math-input').value);
  assert.ok(/\\ge/.test(typed) && /\\sin/.test(typed), typed);
  await v(() => { document.getElementById('math-input').value = ''; document.querySelector('#math-cats button[data-cat="speciaux"]').click(); });
  const special = await v(() => ({ n: document.querySelectorAll('#math-palette .math-grid button').length, err: document.querySelectorAll('#math-palette .ML__error').length }));
  assert.ok(special.n >= 25 && !special.err, JSON.stringify(special));
  await v(() => [...document.querySelectorAll('#math-palette button')].find((b) => b.title === 'C double barre').click());
  assert.strictEqual(await v(() => document.getElementById('math-input').value), '\\mathbb{C}');
  await v(() => document.getElementById('math-ok').click());
  assert.match(await saved(), /data-latex="\\mathbb\{C\}"/);
  ok(`équation : CC, AA, NN, alpha tapés restent des lettres ; >= et sin gardés ; catégorie « Caractères spéciaux » (${special.n} boutons), ℂ inséré`);

  // 5. Lettrine : posée, style choisi, frappe à part, retirée par l'annulation.
  await reset('<p>Il était une fois un long paragraphe qui continue sur plusieurs lignes.</p><p>Deux.</p>');
  await page.click('#editor');
  await select(10);
  await v(() => document.getElementById('lettrine-btn').click());
  assert.ok(await v(() => document.getElementById('lettrine-btn').classList.contains('on')));
  await v(() => { document.getElementById('lettrine-more').click(); [...document.querySelectorAll('#lettrine-pop .seg button')].find((b) => b.textContent === 'Ornée').click(); });
  assert.match(await saved(), /^<p data-lettrine="3" data-lettrine-style="ornee">Il était/);
  assert.strictEqual((await selection())[0], 10);
  await page.keyboard.type('X');
  await undo();
  await undo();
  assert.match(await saved(), /^<p data-lettrine="3">Il était une fois/);
  ok('lettrine : posée au paragraphe du curseur, style changé, curseur gardé ; frappe et réglages annulés à part');

  // 6. Faux texte et raccourcis « Structure ».
  await reset('<p>Un.</p><p>Deux.</p>');
  await page.click('#editor');
  await select(2);
  await v(() => window.FTLorem.open());
  await v(() => { document.getElementById('lr-insert').disabled = false; document.getElementById('lr-insert').click(); });
  const n = await v(() => window.FTMoteur.view.state.doc.childCount);
  assert.ok(n > 2, 'faux texte inséré');
  await select(2);
  await v(() => window.FTStructure.command('h2'));
  assert.match(await saved(), /^<h2>Un\.<\/h2>/);
  await undo();
  await undo();
  assert.strictEqual(await saved(), '<p>Un.</p><p>Deux.</p>');
  ok('faux texte inséré après le paragraphe du curseur ; raccourci « Titre 2 » ; chacun annulé à part');

  // 7. Tableau : largeur des colonnes et hauteur des lignes à la souris, double-clic, colonne ajoutée.
  await reset('<p>Avant</p><table class="ft-table"><tbody><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr></tbody></table><p>Après</p>');
  const c0 = await page.locator('#editor td').nth(0).boundingBox();
  await page.mouse.move(c0.x + c0.width - 1, c0.y + c0.height / 2);
  await frame();
  assert.ok(await v(() => !document.querySelector('.ft-grid-zone').hidden));
  await page.mouse.down();
  await page.mouse.move(c0.x + c0.width + 60, c0.y + c0.height / 2, { steps: 5 });
  await page.mouse.up();
  const cols = await saved();
  assert.match(cols, /<table class="ft-table"><colgroup><col style="width: [\d.]+%;"><col style="width: [\d.]+%;"><col style="width: [\d.]+%;"><\/colgroup>/);
  const w = await v(() => [...document.querySelectorAll('#editor tr:first-child td')].map((t) => Math.round(t.getBoundingClientRect().width)));
  assert.ok(w[0] - w[1] > 100 && Math.abs(w[0] + w[1] + w[2] - 3 * Math.round(c0.width)) < 6, JSON.stringify(w));
  const c4 = await page.locator('#editor td').nth(4).boundingBox();
  await page.mouse.move(c4.x + c4.width / 2, c4.y + c4.height - 1);
  await frame();
  await page.mouse.down();
  await page.mouse.move(c4.x + c4.width / 2, c4.y + c4.height + 40, { steps: 5 });
  await page.mouse.up();
  assert.match(await saved(), /<tr style="height: \d+px;"><td>d/);
  await undo();
  assert.strictEqual(await saved(), cols);
  // Colonne ajoutée : elle prend la moitié de sa voisine.
  await page.click('#editor td >> nth=1');
  await page.click('#editor td >> nth=1', { button: 'right' });
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent.includes('Lignes et colonnes')).click());
  await frame();
  await v(() => [...document.querySelectorAll('button')].find((b) => !b.closest('[hidden]') && b.textContent.includes('colonne à droite')).click());
  const four = await saved();
  assert.strictEqual((four.match(/<col /g) || []).length, 4, four);
  assert.strictEqual((four.match(/<td>/g) || []).length, 8);
  await undo();
  const d0 = await page.locator('#editor td').nth(0).boundingBox();
  await page.mouse.dblclick(d0.x + d0.width - 1, d0.y + d0.height / 2);
  assert.ok(!/colgroup/.test(await saved()));
  ok('tableau : colonnes à la souris (enregistrées), hauteur d’une ligne, colonne ajoutée (moitié de sa voisine), double-clic : colonnes égales');

  // 8. Rechercher et remplacer.
  await reset('<p>Une tomate, des Tomates et une autre tomate.</p><p>Sans rien.</p><p>La tomate encore.</p>');
  await page.click('#editor');
  await select(1);
  await v(() => window.FTApp.menu('replace'));
  await page.fill('#find-input', 'tomate');
  await frame();
  assert.strictEqual(await v(() => document.getElementById('find-count').textContent), '1 sur 4');
  await v(() => { document.getElementById('find-word').checked = true; document.getElementById('find-word').dispatchEvent(new Event('change')); });
  assert.strictEqual(await v(() => document.getElementById('find-count').textContent), '1 sur 3');
  assert.strictEqual(await v(() => CSS.highlights.get('ft-find').size), 3);
  await v(() => document.getElementById('find-next').click());
  assert.strictEqual(await v(() => document.getElementById('find-count').textContent), '2 sur 3');
  await page.fill('#find-replace', 'courgette');
  await v(() => document.getElementById('find-replace-one').click());
  assert.strictEqual(await text(), 'Une tomate, des Tomates et une autre courgette.Sans rien.La tomate encore.');
  await v(() => document.getElementById('find-replace-all').click());
  assert.strictEqual(await text(), 'Une courgette, des Tomates et une autre courgette.Sans rien.La courgette encore.');
  await undo();
  assert.strictEqual(await text(), 'Une tomate, des Tomates et une autre courgette.Sans rien.La tomate encore.');
  await v(() => window.FTFind.close());
  ok('rechercher : options « mot entier », mot suivant, remplacer (un, puis tous d’un coup : une annulation)');

  // 9. Très long document : rechercher, mot suivant, tout remplacer.
  await reset(corpus().repeat(21));
  await page.click('#editor');
  // Le clic peut tomber sur un lien vers un document : sélectionné, son texte remplit la case de recherche
  // à l'ouverture (comme une sélection de texte). La case est vidée après l'ouverture.
  await v(() => { document.getElementById('find-word').checked = false; window.FTApp.menu('find'); document.getElementById('find-input').value = ''; });
  const keys = [];
  for (const ch of 'tomate') {
    keys.push(await v(async (c) => {
      const i = document.getElementById('find-input');
      const t = performance.now();
      i.value += c;
      i.dispatchEvent(new Event('input'));
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      return performance.now() - t;
    }, ch));
  }
  const count = await v(() => document.getElementById('find-count').textContent);
  let next = 0;
  for (let k = 0; k < 20; k++) {
    next += await v(async () => {
      const t = performance.now();
      document.getElementById('find-next').click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      return performance.now() - t;
    });
  }
  await page.waitForTimeout(200);
  const shown = await v(() => { const r = [...CSS.highlights.get('ft-find-current')][0]; const b = r && r.getBoundingClientRect(); return { ok: !!b && b.top > 0 && b.bottom < innerHeight, b: b && [b.top, b.bottom], n: CSS.highlights.get('ft-find-current').size, c: document.getElementById('find-count').textContent }; });
  assert.ok(shown.ok, 'mot en cours à l’écran ' + JSON.stringify(shown));
  await page.fill('#find-replace', 'TOMATE');
  const all = await v(async () => {
    const t = performance.now();
    document.getElementById('find-replace-all').click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t;
  });
  const n2 = await v(() => (window.FTMoteur.view.state.doc.textContent.match(/TOMATE/g) || []).length);
  assert.strictEqual(String(n2), count.split(' sur ')[1]);
  const pages = await v(() => window.FTMoteur.view.state.doc.childCount);
  ok(`très long document (300 pages, ${pages} blocs, ${count.split(' sur ')[1]} mots trouvés) : lettre tapée ${Math.round(Math.max(...keys.slice(1)))} ms au pire, mot suivant ${Math.round(next / 20)} ms, tout remplacer ${Math.round(all)} ms`);
};
