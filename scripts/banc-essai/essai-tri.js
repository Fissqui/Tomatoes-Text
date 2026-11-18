// Essai du tri : liste de A à Z / Z à A (accents, sous-liste qui suit sa ligne, cases cochées), par date
// (formats variés, lignes sans date à la fin), par nombre (milliers, virgule), lignes sélectionnées,
// rangée « Trier » du menu Structure, Ctrl+Z.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const load = (html) => page.evaluate((h) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = h;
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
    ed.focus();
  }, html);
  const items = (sel = '#editor > ul > li, #editor > ol > li') => page.evaluate((s) => [...document.querySelectorAll(s)].map((li) => li.firstChild.textContent.trim()), sel);
  const rightClick = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    await page.mouse.click(box.x + 5, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(100);
  };
  const menu = async (...labels) => {
    for (const l of labels) {
      await page.locator('.context-menu').getByText(l, { exact: true }).last().hover();
      await page.waitForTimeout(80);
    }
    await page.locator('.context-menu').getByText(labels[labels.length - 1], { exact: true }).last().click();
    await page.waitForTimeout(100);
  };

  await load('<ul class="ft-check"><li>poire</li><li data-checked="1">Écharpe</li><li>abricot<ul><li>sous-ligne</li></ul></li><li>Zèbre</li><li>école</li></ul>');
  await rightClick('#editor li >> nth=0');
  await page.screenshot({ path: path.join(SHOTS, 'tri-menu.png') });
  await menu('Trier la liste', 'De A à Z');
  assert.deepStrictEqual(await items('#editor > ul > li'), ['abricot', 'Écharpe', 'école', 'poire', 'Zèbre']);
  assert(await page.evaluate(() => document.querySelector('#editor > ul > li').querySelector('ul li').textContent === 'sous-ligne'), 'sous-liste suit');
  assert(await page.evaluate(() => [...document.querySelectorAll('#editor > ul > li')][1].dataset.checked === '1'), 'case cochée suit');
  ok('de A à Z : accents rangés à leur lettre, sous-liste et case cochée suivent');

  await rightClick('#editor li >> nth=0');
  await menu('Trier la liste', 'De Z à A');
  assert.deepStrictEqual(await items('#editor > ul > li'), ['Zèbre', 'poire', 'école', 'Écharpe', 'abricot']);
  ok('de Z à A');

  await page.keyboard.press('Control+z');
  assert.deepStrictEqual(await items('#editor > ul > li'), ['abricot', 'Écharpe', 'école', 'poire', 'Zèbre']);
  ok('Ctrl+Z revient à l’ordre précédent');

  await load('<ol><li>Rendu le 3 mars 2024</li><li>Sans date</li><li>Réunion 12/01/2024</li><li>Bilan 2023-11-30</li><li>Lancement en février 2024</li><li>1er janvier 2025 : voeux</li></ol>');
  await rightClick('#editor li >> nth=0');
  await menu('Trier la liste', 'Par date (plus ancienne en premier)');
  assert.deepStrictEqual(await items(), ['Bilan 2023-11-30', 'Réunion 12/01/2024', 'Lancement en février 2024', 'Rendu le 3 mars 2024', '1er janvier 2025 : voeux', 'Sans date']);
  await rightClick('#editor li >> nth=0');
  await menu('Trier la liste', 'Par date (plus récente en premier)');
  assert.deepStrictEqual((await items())[0], '1er janvier 2025 : voeux');
  assert.deepStrictEqual((await items())[5], 'Sans date');
  ok('par date (aaaa-mm-jj, jj/mm/aaaa, « 3 mars 2024 », « février 2024 », « 1er janvier ») ; sans date à la fin');

  await load('<ul><li>Lot B : 1 250,5 €</li><li>Lot A : 980 €</li><li>Lot C : 12 000 €</li><li>Lot D : -5</li><li>Lot sans prix</li></ul>');
  await rightClick('#editor li >> nth=0');
  await menu('Trier la liste', 'Par nombre (croissant)');
  assert.deepStrictEqual(await items(), ['Lot D : -5', 'Lot A : 980 €', 'Lot B : 1 250,5 €', 'Lot C : 12 000 €', 'Lot sans prix']);
  ok('par nombre : milliers, virgule, négatif ; sans nombre à la fin');

  // Lignes sélectionnées (paragraphes simples), par le menu Structure.
  await load('<h2>Titre</h2><p id="a">Charlie</p><p>alpha</p><p id="b">Bravo</p><p>Fin</p>');
  await page.evaluate(() => {
    const a = document.getElementById('a').firstChild;
    const b = document.getElementById('b').firstChild;
    getSelection().setBaseAndExtent(a, 0, b, 5);
  });
  await page.click('#structure-btn');
  await page.screenshot({ path: path.join(SHOTS, 'tri-structure.png') });
  await page.click('#structure-pop .sort-row button[title^="De A à Z"]');
  assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('#editor > *')].map((e) => e.textContent)), ['Titre', 'alpha', 'Bravo', 'Charlie', 'Fin']);
  ok('lignes sélectionnées triées par le menu Structure, le reste ne bouge pas');

  // Clic droit sur une sélection de lignes.
  await page.evaluate(() => {
    const ps = document.querySelectorAll('#editor > p');
    getSelection().setBaseAndExtent(ps[0].firstChild, 0, ps[2].firstChild, 3);
  });
  await rightClick('#editor > p >> nth=1');
  await menu('Trier les lignes sélectionnées', 'De Z à A');
  assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('#editor > *')].map((e) => e.textContent)), ['Titre', 'Charlie', 'Bravo', 'alpha', 'Fin']);
  ok('clic droit « Trier les lignes sélectionnées »');
};
