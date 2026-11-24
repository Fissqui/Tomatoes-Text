// Palette de commandes (version 2.2.5) : ouverture, recherche sans accents, icônes et raccourcis,
// commande appliquée à la sélection (Gras, Titre 1), outil de la barre, style, réglage, document du
// projet, « Utilisés récemment », Échap, accueil (commandes des menus et documents seulement),
// lien hypertexte passé à Ctrl+Maj+L.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-palette.js
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const t0 = Date.now();
  const ok = (m) => console.log('  OK  ' + m + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  const v = (fn, arg) => page.evaluate(fn, arg);
  const isOpen = () => v(() => document.getElementById('palette-dialog').open);
  const rows = () => v(() => [...document.querySelectorAll('#palette-list .palette-row')].map((r) => ({
    name: r.querySelector('.palette-name').textContent,
    meta: r.querySelector('.palette-meta').textContent,
    kbd: (r.querySelector('kbd') || {}).textContent || '',
    icon: !!r.querySelector('.palette-icon svg'),
    active: r.classList.contains('active')
  })));
  const sections = () => v(() => [...document.querySelectorAll('#palette-list .palette-section')].map((s) => s.textContent));
  const openPalette = async () => {
    await v(() => window.FTApp.menu('palette'));
    await page.waitForTimeout(80);
    assert(await isOpen(), 'palette ouverte');
  };
  const search = async (q) => {
    await page.fill('#palette-search', q);
    await page.waitForTimeout(40);
    return rows();
  };
  const load = (html) => v((h) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = h;
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
    ed.focus();
  }, html);
  const selectWord = (id, a, b) => v(([id, a, b]) => {
    const t = document.createTreeWalker(document.getElementById(id), NodeFilter.SHOW_TEXT).nextNode();
    getSelection().setBaseAndExtent(t, a, t, b);
  }, [id, a, b]);

  await page.waitForTimeout(1200);
  await load('<p id="a">Le marché des tomates progresse.</p><p id="b">Deuxième paragraphe.</p>');

  // 1. Ouverture : sans saisie, des commandes proposées ; Échap ferme.
  await openPalette();
  assert(await v(() => document.activeElement.id === 'palette-search'));
  let list = await rows();
  assert(list.length > 0 && list[0].active, JSON.stringify(list.slice(0, 3)));
  await page.keyboard.press('Escape');
  assert(!(await isOpen()), 'Échap ferme');
  ok('ouverture, première ligne active, Échap');

  // 2. Recherche sans accents ni majuscules, avec icône et raccourci.
  await openPalette();
  list = await search('gras');
  assert.strictEqual(list[0].name, 'Gras');
  assert.strictEqual(list[0].kbd, 'Ctrl+G');
  assert(list[0].icon === false || list[0].icon === true);
  list = await search('theme logiciel');
  assert(list.some((r) => r.name === 'Thème du logiciel'), JSON.stringify(list));
  assert(list.some((r) => r.name.startsWith('Thème du logiciel : ')), 'onglets du thème du logiciel');
  list = await search('note bas');
  assert(list[0].name === 'Note de bas de page' && list[0].icon, JSON.stringify(list[0]));
  await search('note');
  await page.screenshot({ path: path.join(SHOTS, 'palette-2-2-5-outils.png') });
  list = await search('zzqx');
  assert.strictEqual(list.length, 0);
  assert(await v(() => !document.getElementById('palette-none').hidden));
  ok('recherche : sans accents, icônes, raccourcis, aucun résultat');

  // 3. Gras appliqué au mot sélectionné.
  await page.keyboard.press('Escape');
  await selectWord('a', 3, 9);
  await openPalette();
  await search('gras');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert(!(await isOpen()));
  const bold = await v(() => [...document.querySelectorAll('#editor strong, #editor b')].map((b) => b.textContent).join('|'));
  assert.strictEqual(bold, 'marché', bold);
  ok('Gras sur la sélection');

  // 4. Flèches puis Entrée : Titre 1 sur le paragraphe du curseur.
  await selectWord('b', 2, 2);
  await openPalette();
  list = await search('titre 1');
  const i = list.findIndex((r) => r.name === 'Titre 1');
  assert(i >= 0, JSON.stringify(list));
  for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown');
  assert((await rows())[i].active);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert(await v(() => [...document.querySelectorAll('#editor h1')].some((h) => h.textContent === 'Deuxième paragraphe.')), 'Titre 1');
  ok('flèches, Entrée : Titre 1');

  // 5. Utilisés récemment, sans saisie.
  await openPalette();
  assert.strictEqual((await sections())[0], 'Utilisés récemment');
  list = await rows();
  assert.deepStrictEqual(list.slice(0, 2).map((r) => r.name), ['Titre 1', 'Gras']);
  await page.keyboard.press('Escape');
  ok('utilisés récemment');

  // 6. Outil de la barre, style, réglage.
  await openPalette();
  await search('styles tableaux');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert(await v(() => document.getElementById('docstyles-dialog').open), 'Styles du document');
  assert.strictEqual(await v(() => document.querySelector('#ds-tabs button.on, #ds-tabs button[aria-selected="true"]')?.textContent || document.querySelector('#docstyles-dialog h2, #docstyles-dialog .ds-title')?.textContent), 'Tableaux');
  await v(() => document.getElementById('docstyles-dialog').close());
  await openPalette();
  await search('thème du logiciel couleurs');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert(await v(() => document.getElementById('custom-dialog').open), 'Thème du logiciel');
  assert(await v(() => document.querySelector('#custom-dialog .styles-tabs [data-tab="couleurs"]').classList.contains('on')), 'onglet Couleurs');
  await v(() => document.getElementById('custom-dialog').close());
  await openPalette();
  list = await search('interface avancee');
  assert.strictEqual(list[0].name, 'Interface avancée');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert(await v(() => document.querySelector('#mode-switch [data-mode="avance"]').getAttribute('aria-pressed') === 'true'), 'mode avancé');
  await openPalette();
  list = await search('legende');
  assert(list.length > 0, 'outil des barres trouvé par son infobulle');
  await page.keyboard.press('Escape');
  ok('style (Tableaux), réglage (Couleurs), mode avancé, outils des barres');

  // 7. Document du projet.
  const made = await v(() => window.frameText.createDoc('Budget prévisionnel'));
  await v((c) => {
    c.doc.content = { ...c.doc.content, html: '<p>Recettes et dépenses.</p>' };
    return window.frameText.saveDoc(c.fileName, c.doc);
  }, made);
  await v(() => window.FTApp.menu('before-close'));
  await page.reload();
  await page.waitForTimeout(1800);
  await openPalette();
  list = await search('budget');
  const d = list.findIndex((r) => r.name === 'Budget prévisionnel');
  assert(d >= 0 && list[d].meta && list[d].icon, JSON.stringify(list));
  await page.screenshot({ path: path.join(SHOTS, 'palette-2-2-5-documents.png') });
  for (let k = 0; k < d; k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  assert(await v(() => document.getElementById('editor').textContent.includes('Recettes et dépenses.')), 'document ouvert');
  ok('document du projet ouvert depuis la palette');

  // 8. Accueil : commandes des menus et documents seulement.
  await v(() => window.FTApp.menu('home'));
  await page.waitForTimeout(300);
  await openPalette();
  list = await search('gras');
  assert(!list.some((r) => r.name === 'Gras'), 'pas de mise en forme sur l’accueil');
  list = await search('nouveau document');
  assert.strictEqual(list[0].name, 'Nouveau document');
  await page.keyboard.press('Escape');
  ok('accueil : menus et documents');

  // 9. Lien hypertexte : Ctrl+Maj+L.
  await openPalette();
  await search('budget');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await load('<p id="c">Voir le site.</p>');
  await selectWord('c', 7, 11);
  await page.keyboard.press('Control+Shift+L');
  await page.waitForTimeout(200);
  assert(await v(() => !!document.querySelector('dialog[open]')), 'fenêtre du lien');
  ok('lien hypertexte : Ctrl+Maj+L');
};
