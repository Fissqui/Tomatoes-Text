// Essai du lien vers un document depuis la liste de gauche : clic droit > « Insérer un lien dans le
// document ouvert » (au curseur), puis document glissé de la liste dans le texte (à l'endroit lâché).
const path = require('path');
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(async () => {
    for (const [title, html] of [['Cible', '<p>Texte cible.</p>'], ['Notes', '<p>Début. Fin du texte.</p>']]) {
      const c = await window.frameText.createDoc(title);
      c.doc.content = { ...c.doc.content, html };
      await window.frameText.saveDoc(c.fileName, c.doc);
    }
  });
  await page.reload();
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
  await page.locator('.doc-item', { hasText: 'Notes' }).click();
  await page.waitForTimeout(700);
  const target = await page.evaluate(() => window.FTApp.docs().find((d) => d.title === 'Cible').id);
  const links = () => page.evaluate(() => [...document.querySelectorAll('#editor a.ft-doclink')].map((a) => ({ text: a.textContent, doc: a.dataset.doc, before: a.previousSibling && a.previousSibling.textContent })));

  // Le document ouvert n'a pas l'entrée ; un autre l'a.
  await page.locator('.doc-item', { hasText: 'Notes' }).click({ button: 'right' });
  await page.waitForTimeout(150);
  assert.strictEqual(await page.locator('#context-menu').getByText('Insérer un lien dans le document ouvert').count(), 0);
  await page.keyboard.press('Escape');

  // Curseur après « Début. »
  await page.locator('#editor p', { hasText: 'Début.' }).click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await page.locator('.doc-item', { hasText: 'Cible' }).click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('#context-menu').getByText('Insérer un lien dans le document ouvert', { exact: true }).click();
  await page.waitForTimeout(300);
  let l = await links();
  assert.strictEqual(l.length, 1, JSON.stringify(l));
  assert.strictEqual(l[0].text, 'Cible');
  assert.strictEqual(l[0].doc, target);
  assert(/Début\. ?$/.test(l[0].before), JSON.stringify(l));
  ok('clic droit : lien « Cible » inséré au curseur, relié au document');
  // Une seule étape d'annulation.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert.strictEqual((await links()).length, 0);
  ok('Ctrl+Z retire le lien');

  // Glisser-déposer depuis la liste vers la fin du paragraphe.
  const box = await page.locator('#editor p', { hasText: 'Fin du texte.' }).boundingBox();
  await page.locator('.doc-item', { hasText: 'Cible' }).dragTo(page.locator('#editor p', { hasText: 'Fin du texte.' }), { targetPosition: { x: box.width - 2, y: box.height / 2 } });
  await page.waitForTimeout(400);
  l = await links();
  assert.strictEqual(l.length, 1, JSON.stringify(l));
  assert.strictEqual(l[0].doc, target);
  const text = await page.locator('#editor p', { hasText: 'Début.' }).textContent();
  assert(/Fin du texte\. ?Cible$/.test(text.trim()), text);
  await page.screenshot({ path: path.join(process.env.FT_SHOTS || require('os').tmpdir(), 'lien-depuis-liste.png'), clip: { x: 0, y: 60, width: 900, height: 400 } });
  ok('glisser-déposer : lien inséré à l\'endroit lâché');

  // Le document glissé reste à sa place dans la liste.
  const names = await page.evaluate(() => [...document.querySelectorAll('.doc-item .name')].map((n) => n.textContent));
  assert(names.includes('Cible'));
  ok('le document reste dans la liste');
};
