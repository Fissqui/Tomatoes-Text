// Essai de « Changer de projet » (clic droit sur un document de la liste) : le fichier passe dans le dossier
// de l'autre projet, dans « Non classés », avec son historique des versions ; le document ouvert est fermé.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const api = (fn, ...a) => page.evaluate(([f, args]) => window.frameText[f](...args), [fn, a]);

  await api('createProject', 'Autre');
  await api('loadLibrary', 'Mes documents');
  const made = await page.evaluate(async () => {
    const c = await window.frameText.createDoc('À déplacer');
    c.doc.content = { ...c.doc.content, html: '<p>Texte à déplacer.</p>' };
    await window.frameText.saveDoc(c.fileName, c.doc);
    return { fileName: c.fileName, id: c.doc.id };
  });
  // Historique des versions : une copie à la main.
  await page.evaluate(async (f) => {
    const d = await window.frameText.readDoc(f);
    await window.frameText.saveVersion(d, 'manual', 'Avant');
  }, made.fileName);
  await page.reload();
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
  await page.selectOption('#project-select', 'Mes documents');
  await page.waitForTimeout(800);

  // Le document est ouvert, puis déplacé par le clic droit.
  await page.locator('.doc-item', { hasText: 'À déplacer' }).click();
  await page.waitForTimeout(600);
  await page.locator('.doc-item', { hasText: 'À déplacer' }).click({ button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('#context-menu').getByText('Changer de projet', { exact: true }).hover();
  await page.waitForTimeout(200);
  const sub = page.locator('.context-menu:not(#context-menu)');
  const list = await sub.locator('button').allTextContents();
  assert.deepStrictEqual(list, ['Autre']);
  await page.screenshot({ path: path.join(process.env.FT_SHOTS || require('os').tmpdir(), 'changer-de-projet.png'), clip: { x: 0, y: 60, width: 700, height: 500 } });
  await sub.getByText('Autre', { exact: true }).click();
  await page.waitForTimeout(900);
  const names = await page.evaluate(() => [...document.querySelectorAll('.doc-item .name')].map((n) => n.textContent));
  assert(!names.includes('À déplacer'), JSON.stringify(names));
  assert.notStrictEqual(await page.evaluate(() => window.FTApp.currentId()), made.id);
  const mine = await api('loadLibrary', 'Mes documents');
  const other = await api('loadLibrary', 'Autre');
  assert(!mine.docs.some((d) => d.id === made.id));
  assert(!fs.existsSync(path.join(mine.folder, made.fileName)));
  const moved = other.docs.find((d) => d.id === made.id);
  assert(moved && fs.existsSync(path.join(other.folder, moved.fileName)), JSON.stringify(other.docs));
  assert(!other.placement[made.id], 'Non classés');
  const versions = await api('listVersions', made.id);
  assert(versions.some((v) => v.label === 'Avant'), JSON.stringify(versions));
  ok('document ouvert déplacé dans « Autre » : fichier, Non classés, historique des versions ; fermé');

  // Retour dans le projet d'origine pour la suite.
  await api('loadLibrary', 'Mes documents');
};
