// Essai des champs numériques (number.js) : taille de police tapée avec une virgule, flèches,
// liste des valeurs prêtes, champs des fenêtres (pages, thème du document, styles, faux texte, objectifs).
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page, errors }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const list = () => page.evaluate(() => [...document.querySelectorAll('.ft-num')].map((b) => {
    const lab = b.closest('label, .ds-field, .custom-field, .dg-field');
    const sel = b.querySelector('select');
    return (b.closest('dialog')?.id || b.closest('[id]')?.id || '?') + ' | ' + (lab ? lab.textContent.trim().slice(0, 30) : (b.dataset.tb || b.querySelector('input').id)) + (sel ? ' [liste]' : '');
  }));
  console.log((await list()).join('\n'));

  // Taille de police : 10,5 tapé.
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Essai</h1><p id="p1">Bonjour le monde.</p>';
    ed.dispatchEvent(new Event('input'));
    const r = document.createRange();
    r.selectNodeContents(document.getElementById('p1'));
    getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.focus();
  });
  await page.waitForTimeout(100);
  const sizeField = '[data-tb="size"] input';
  await page.click(sizeField);
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => !!document.querySelector('.ft-num-list:popover-open')), 'liste ouverte au clic');
  await page.screenshot({ path: path.join(SHOTS, 'num-liste.png'), clip: { x: 0, y: 0, width: 900, height: 420 } });
  await page.keyboard.type('10,5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  let fs = await page.evaluate(() => getComputedStyle(document.querySelector('#p1 span') || document.getElementById('p1')).fontSize);
  assert.strictEqual(fs, '14px', 'taille 10,5 pt appliquée : ' + fs);
  assert.strictEqual(await page.inputValue(sizeField), '10,5');
  ok('taille 10,5 tapée et appliquée');
  await page.click('[data-tb="size"] .ft-num-btn[title="Augmenter"]');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.inputValue(sizeField), '11');
  fs = await page.evaluate(() => getComputedStyle(document.querySelector('#p1 span')).fontSize);
  assert.strictEqual(Math.round(parseFloat(fs) * 0.75 * 10) / 10, 11, 'flèche haut : ' + fs);
  await page.click('[data-tb="size"] .ft-num-btn[title="Diminuer"]');
  await page.click('[data-tb="size"] .ft-num-btn[title="Diminuer"]');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.inputValue(sizeField), '9');
  ok('flèches : 11 puis 9');
  await page.screenshot({ path: path.join(SHOTS, 'num-barre.png'), clip: { x: 0, y: 0, width: 900, height: 140 } });

  // Sans sélection : la taille choisie reste affichée et vaut pour le texte tapé ensuite (1.5.2).
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    // (Moteur 2.0 : le texte est remis par le moteur, paragraphe vide compris.)
    if (window.FTMoteur) window.FTEditor.load({ content: { html: window.FTEditor.getHtml() + '<p id="p2"></p>' } });
    else ed.insertAdjacentHTML('beforeend', '<p id="p2"><br></p>');
    const r = document.createRange();
    r.setStart(document.getElementById('p2'), 0);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.focus();
  });
  await page.waitForTimeout(100);
  await page.click(sizeField);
  await page.keyboard.type('16,5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.inputValue(sizeField), '16,5', 'taille affichée sans sélection');
  await page.click('[data-tb="size"] .ft-num-btn[title="Augmenter"]');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.inputValue(sizeField), '18', 'flèche sans sélection');
  await page.keyboard.type('Suite');
  await page.waitForTimeout(100);
  fs = await page.evaluate(() => getComputedStyle([...document.querySelectorAll('#p2 *')].find((e) => e.textContent === 'Suite') || document.getElementById('p2')).fontSize);
  assert.strictEqual(fs, '24px', 'texte tapé en 18 pt : ' + fs);
  ok('sans sélection : 16,5 puis flèche 18, texte tapé ensuite en 18 pt');

  // Mise en page : marges.
  await page.evaluate(() => window.FTPages && window.FTPages.openDialog ? window.FTPages.openDialog() : document.getElementById('page-setup').click());
  await page.waitForTimeout(300);
  console.log((await list()).join('\n'));
  const top = '#pg-m-top';
  await page.fill(top, '12,5');
  await page.dispatchEvent(top, 'change');
  await page.waitForTimeout(100);
  console.log('  marge haut :', await page.inputValue(top));
  assert.strictEqual(await page.inputValue(top), '12,5');
  assert.strictEqual(await page.evaluate(() => document.getElementById('pg-m-top').value), '12.5', 'le code lit 12.5');
  await page.click('#pg-m-top + .ft-num-arrows [title="Augmenter"]');
  assert.strictEqual(await page.inputValue(top), '13,5');
  await page.fill(top, '500');
  await page.dispatchEvent(top, 'change');
  assert.strictEqual(await page.inputValue(top), '120', 'borné au maximum');
  await page.fill(top, 'abc');
  await page.dispatchEvent(top, 'change');
  assert.strictEqual(await page.inputValue(top), '120', 'saisie invalide refusée');
  ok('marges : 12,5 puis flèche 13,5, maximum 120, saisie invalide refusée');
  await page.screenshot({ path: path.join(SHOTS, 'num-pages.png') });
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  // Styles des tableaux : « Taille du texte » puis 10,5 tapé, puis 15,5 (absent de la liste).
  await page.evaluate(() => window.FTStyles.open('tableaux', null, 'doc'));
  await page.waitForTimeout(300);
  const tf = 'dialog[open] .ft-num-combo input';
  assert.strictEqual(await page.inputValue(tf), 'Taille du texte');
  await page.click('dialog[open] .ft-num-combo [title="Augmenter"]');
  await page.waitForTimeout(200);
  const mid = await page.inputValue(tf);
  assert(/^\d/.test(mid), 'flèche depuis « Taille du texte » : ' + mid);
  await page.click(tf);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('15,5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert.strictEqual(await page.inputValue(tf), '15,5');
  assert.strictEqual(await page.evaluate(() => window.FTTheme.current ? 1 : 1), 1);
  ok('tableaux : ' + mid + ' puis 15,5 tapé');
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));

  // Thème du document, onglet des réglages : interligne 1,7 et espace 0,45.
  await page.evaluate(() => window.FTTheme.open());
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].find((b) => /Régler ce thème/.test(b.textContent)).click());
  await page.waitForTimeout(300);
  const row = (label) => `dialog[open] label:has(> span:text-is("${label}")) .ft-num input`;
  for (const [label, v] of [['Taille', '11,25'], ['Interligne', '1,7'], ['Espace entre les paragraphes', '0,45']]) {
    await page.click(row(label));
    await page.keyboard.press('Control+A');
    await page.keyboard.type(v);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.inputValue(row(label)), v, label);
  }
  const lh = await page.evaluate(() => getComputedStyle(document.querySelector('#editor p')).lineHeight);
  console.log('  interligne du texte :', lh);
  ok('thème du document : taille 11,25, interligne 1,7, espace 0,45');
  await page.screenshot({ path: path.join(SHOTS, 'num-theme.png') });
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  assert(!errors.length, errors.join('\n'));
};
