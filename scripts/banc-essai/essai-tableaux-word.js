// Essai des tableaux modifiables comme dans Word (2.4.18) : barre « Tableau » affichée quand le curseur est
// dans un tableau (lignes et colonnes, suppression, fusion, fractionnement, couleur de fond des cellules,
// bordures, alignement vertical, répartition, en-tête, position) ; clic droit > Sélectionner ; couleur
// exportée dans Word ; Ctrl+Z ; tableau collé dans un tableau (ses cases remplissent celles du tableau,
// qui s'agrandit) ; tableau collé au début d'une ligne (la ligne reste hors du tableau) ; la mini-barre
// d'une sélection de cases ne cache pas la barre du tableau.
const assert = require('assert');
const JSZip = require('jszip');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const load = async (html) => {
    await page.evaluate((h) => window.FTEditor.load({ content: { html: h }, settings: { mode: 'note' } }), html);
    await page.waitForTimeout(600);
  };
  const doc2x3 = '<h1>Essai</h1><p>Avant.</p><table class="ft-table"><tbody>'
    + ['1', '2'].map((r) => '<tr>' + ['a', 'b', 'c'].map((c) => `<td><p>${c}${r}</p></td>`).join('') + '</tr>').join('')
    + '</tbody></table><p>Après.</p>';
  const clickIn = async (text, opts) => {
    const b = await page.evaluate((t) => {
      const c = [...document.querySelectorAll('#editor td, #editor th')].find((x) => x.textContent.trim() === t);
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, text);
    await page.mouse.click(b.x, b.y, opts);
    await page.waitForTimeout(150);
    return b;
  };
  const bar = () => page.evaluate(() => {
    const t = document.getElementById('object-tools');
    return t.hidden ? null : [...t.querySelectorAll('button')].map((b) => b.title + (b.disabled ? ' [off]' : '') + (b.classList.contains('on') ? ' [on]' : ''));
  });
  const btn = async (title) => { await page.click(`#object-tools button[title^="${title}"]`); await page.waitForTimeout(150); };
  const menuClick = async (text) => { await page.locator('.context-menu:not([hidden]) button', { hasText: text }).first().click(); await page.waitForTimeout(150); };
  const grid = () => page.evaluate(() => [...document.querySelectorAll('#editor table')].map((t) => [...t.rows].map((r) => [...r.cells].map((c) => c.textContent).join(',')).join(' / ')));
  const undo = async () => { await page.keyboard.press('Control+z'); await page.waitForTimeout(200); };

  // 1. Barre du tableau.
  await load(doc2x3);
  await page.click('#editor p');
  assert.strictEqual(await bar(), null, 'pas de barre hors du tableau');
  await clickIn('b1');
  let tools = await bar();
  for (const t of ['Insérer une ligne au-dessus', 'Insérer une ligne en dessous', 'Insérer une colonne à gauche', 'Insérer une colonne à droite',
    'Supprimer une ligne ou une colonne', 'Fusionner les cellules (choisies à la souris) [off]', 'Fractionner la cellule [off]', 'Couleur de fond des cellules',
    'Bordures', 'Alignement vertical du texte dans les cellules', 'Position et habillage', 'Supprimer le tableau']) {
    assert(tools.some((x) => x.startsWith(t)), t + ' absent : ' + tools.join(' | '));
  }
  ok(`barre « Tableau » au curseur dans un tableau (${tools.length} outils), absente hors du tableau`);

  // 2. Lignes et colonnes.
  await btn('Insérer une ligne en dessous');
  await btn('Insérer une colonne à gauche');
  assert.deepStrictEqual(await grid(), ['a1,,b1,c1 / ,,, / a2,,b2,c2']);
  await undo();
  await undo();
  assert.deepStrictEqual(await grid(), ['a1,b1,c1 / a2,b2,c2']);
  await clickIn('c1');
  await btn('Supprimer une ligne ou une colonne');
  await menuClick('Supprimer la colonne');
  await clickIn('a2');
  await btn('Supprimer une ligne ou une colonne');
  await menuClick('Supprimer la ligne');
  assert.deepStrictEqual(await grid(), ['a1,b1']);
  ok('lignes et colonnes ajoutées et supprimées depuis la barre');

  // 3. Fusion à la souris, fractionnement ; la mini-barre ne cache pas la barre du tableau.
  await load(doc2x3);
  const a = await clickIn('a1');
  const b = await page.evaluate(() => { const r = [...document.querySelectorAll('#editor td')][1].getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const overlap = await page.evaluate(() => {
    const m = document.getElementById('minibar');
    const t = document.getElementById('object-tools');
    if (!m || m.hidden || t.hidden) return false;
    const x = m.getBoundingClientRect(); const y = t.getBoundingClientRect();
    return !(x.bottom <= y.top || y.bottom <= x.top || x.right <= y.left || y.right <= x.left);
  });
  assert(!overlap, 'la mini-barre recouvre la barre du tableau');
  tools = await bar();
  assert(tools.includes('Fusionner les cellules (choisies à la souris)'), tools.join(' | '));
  await btn('Fusionner');
  let spans = await page.evaluate(() => [...document.querySelector('#editor table').rows[0].cells].map((c) => c.colSpan));
  assert.deepStrictEqual(spans, [2, 1]);
  await btn('Fractionner');
  spans = await page.evaluate(() => [...document.querySelector('#editor table').rows[0].cells].map((c) => c.colSpan));
  assert.deepStrictEqual(spans, [1, 1, 1]);
  ok('cases choisies à la souris : fusion puis fractionnement depuis la barre ; mini-barre sous les cases');

  // 4. Couleur de fond des cellules (une colonne choisie par le clic droit), Ctrl+Z, export Word.
  await load(doc2x3);
  await clickIn('b2', { button: 'right' });
  await page.locator('.context-menu:not([hidden]) button', { hasText: 'Sélectionner' }).first().hover();
  await page.waitForTimeout(250);
  await page.locator('#context-submenu button', { hasText: 'La colonne' }).click();
  await page.waitForTimeout(150);
  await btn('Couleur de fond');
  await page.click('.context-menu:not([hidden]) button[title="Bleu clair"]');
  await page.waitForTimeout(200);
  const fills = () => page.evaluate(() => [...document.querySelectorAll('#editor td')].map((c) => getComputedStyle(c).backgroundColor));
  let f = await fills();
  assert.strictEqual(f.filter((x) => x === 'rgb(222, 234, 246)').length, 2, f.join(' | '));
  assert.strictEqual(f[1], 'rgb(222, 234, 246)');
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  assert((xml.match(/w:fill="DEEAF6"/gi) || []).length >= 2, 'couleur absente de l’export Word');
  await undo();
  f = await fills();
  assert(!f.includes('rgb(222, 234, 246)'), 'Ctrl+Z n’a pas retiré la couleur');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(200);
  await clickIn('b1');
  await btn('Couleur de fond');
  await menuClick('Aucune couleur');
  f = await fills();
  assert.strictEqual(f.filter((x) => x === 'rgb(222, 234, 246)').length, 1, f.join(' | '));
  ok('couleur de fond sur une colonne choisie (clic droit > Sélectionner), exportée dans Word, Ctrl+Z, « Aucune couleur »');

  // 5. Alignement vertical, bordures, répartition, en-tête.
  await btn('Alignement vertical'); await menuClick('En bas');
  assert.strictEqual(await page.evaluate(() => [...document.querySelectorAll('#editor td')][1].dataset.valign), 'bas');
  await btn('Bordures'); await menuClick('Aucune bordure');
  assert.strictEqual(await page.evaluate(() => document.querySelector('#editor table').dataset.borders), '');
  await page.evaluate(() => {
    const v = window.FTMoteur.view;
    let pos = -1;
    v.state.doc.descendants((n, p) => { if (n.type.name === 'table') pos = p; });
    const t = v.state.doc.nodeAt(pos);
    v.dispatch(v.state.tr.setNodeMarkup(pos, null, { ...t.attrs, cols: [{ style: 'width: 60%' }, { style: 'width: 25%' }, { style: 'width: 15%' }] }));
  });
  await page.waitForTimeout(200);
  await clickIn('b1');
  await btn('Répartir'); await menuClick('Colonnes de même largeur');
  const widths = await page.evaluate(() => [...document.querySelector('#editor table').rows[0].cells].map((c) => Math.round(c.getBoundingClientRect().width)));
  assert(Math.max(...widths) - Math.min(...widths) <= 1, widths.join(' '));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('deux lignes');
  await btn('Répartir'); await menuClick('Lignes de même hauteur');
  const heights = await page.evaluate(() => [...document.querySelector('#editor table').rows].map((r) => Math.round(r.getBoundingClientRect().height)));
  assert(heights[0] > 30 && Math.abs(heights[0] - heights[1]) <= 1, heights.join(' '));
  const header = (await bar()).find((x) => x.startsWith("Ligne d'en-tête"));
  await btn("Ligne d'en-tête");
  const header2 = (await bar()).find((x) => x.startsWith("Ligne d'en-tête"));
  assert.notStrictEqual(header, header2);
  ok('alignement vertical, bordures, colonnes de même largeur, lignes de même hauteur, ligne d’en-tête depuis la barre');

  // 6. Tableau collé dans un tableau : les cases se remplissent à partir du curseur, le tableau s'agrandit.
  const paste = async (html, text) => {
    await page.evaluate(({ html, text }) => {
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      dt.setData('text/plain', text);
      window.FTMoteur.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, { html, text });
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.getElementById('paste-dialog').open)) { await page.click('#ps-ok'); await page.waitForTimeout(300); }
  };
  await load('<h1>Essai</h1><p>Avant.</p><table class="ft-table"><tbody><tr><td><p>a1</p></td><td><p>b1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td></tr></tbody></table><p>Après.</p>');
  await clickIn('b1');
  await paste('<table><tr><td>x1</td><td>y1</td><td>z1</td></tr><tr><td>x2</td><td>y2</td><td>z2</td></tr><tr><td>x3</td><td>y3</td><td>z3</td></tr></table>', 'x1\ty1\tz1\nx2\ty2\tz2\nx3\ty3\tz3');
  assert.deepStrictEqual(await grid(), ['a1,x1,y1,z1 / a2,x2,y2,z2 / ,x3,y3,z3']);
  await undo();
  assert.deepStrictEqual(await grid(), ['a1,b1 / a2,b2']);
  await clickIn('a2');
  await paste('<table><tr><td>p</td><td>q</td></tr></table>', 'p\tq');
  assert.deepStrictEqual(await grid(), ['a1,b1 / p,q']);
  ok('tableau collé dans un tableau : cases remplies à partir du curseur, tableau agrandi, Ctrl+Z');

  // 7. Tableau collé au début d'une ligne : la ligne reste après le tableau, entière.
  await page.evaluate(() => {
    const v = window.FTMoteur.view;
    let pos = -1;
    v.state.doc.descendants((n, p) => { if (pos < 0 && n.isTextblock && n.textContent === 'Après.') pos = p + 1; });
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, pos)));
    v.focus();
  });
  await paste('<table><tr><td>m</td><td>n</td></tr></table>', 'm\tn');
  const after = await page.evaluate(() => window.FTMoteur.view.state.doc.toString());
  assert(/table_cell\(paragraph\("n"\)\)\)\), paragraph\("Après\."\)/.test(after), after);
  ok('tableau collé au début d’une ligne : posé avant elle, la ligne reste entière');
};
