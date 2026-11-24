// Essai de « Ouvrir le dossier du projet » (clic droit sur un document de la liste) : l'Explorateur s'ouvre
// sur le fichier du document, dans le dossier du projet ou là où le fichier se trouve réellement.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { shell } = require('electron'); // (faux-electron.js dans le banc d'essai)

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const shown = [];
  const opened = [];
  shell.showItemInFolder = (p) => shown.push(p);
  const openPath = shell.openPath;
  shell.openPath = async (p) => { opened.push(p); return ''; };
  const api = (fn, ...a) => page.evaluate(([f, args]) => window.frameText[f](...args), [fn, a]);
  const menuClick = async (title) => {
    await page.locator('.doc-item', { hasText: title }).click({ button: 'right' });
    await page.waitForTimeout(150);
    if (!shown.length) await page.screenshot({ path: path.join(process.env.FT_SHOTS || os.tmpdir(), 'ouvrir-le-dossier.png'), clip: { x: 0, y: 60, width: 640, height: 520 } });
    await page.locator('#context-menu').getByText('Ouvrir le dossier du projet', { exact: true }).click();
    await page.waitForTimeout(300);
  };

  // 1. Document du dossier du projet.
  const lib = await api('loadLibrary', 'Mes documents');
  const made = await page.evaluate(async () => {
    const c = await window.frameText.createDoc('Dans le projet');
    await window.frameText.saveDoc(c.fileName, c.doc);
    return { fileName: c.fileName, id: c.doc.id };
  });
  // 2. Document rangé ailleurs sur l'ordinateur.
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-ailleurs-'));
  const outFile = path.join(outDir, 'Ailleurs.tmtx');
  const doc = await api('readDoc', made.fileName);
  fs.writeFileSync(outFile, JSON.stringify({ ...doc, id: require('crypto').randomUUID(), title: 'Ailleurs' }));
  // (Enregistré dans l'index comme un fichier ouvert depuis l'Explorateur.)
  const idx = path.join(lib.folder, 'bibliotheque.json');
  const j = JSON.parse(fs.readFileSync(idx, 'utf8'));
  const outId = JSON.parse(fs.readFileSync(outFile, 'utf8')).id;
  j.files = { ...(j.files || {}), [outId]: { path: outFile, title: 'Ailleurs' } };
  fs.writeFileSync(idx, JSON.stringify(j));
  await page.reload();
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  await menuClick('Dans le projet');
  assert.deepStrictEqual(shown, [path.join(lib.folder, made.fileName)]);
  ok('document du projet : Explorateur sur ' + path.basename(shown[0]));

  await menuClick('Ailleurs');
  assert.strictEqual(shown[1], outFile, JSON.stringify(shown));
  ok('document rangé ailleurs : Explorateur dans son propre dossier');

  // 3. Fichier disparu entre-temps (liste pas encore rafraîchie) : son dossier s'ouvre.
  fs.rmSync(outFile);
  const res = await page.evaluate((f) => window.frameText.showDocInFolder(f), outFile);
  assert.strictEqual(res, false);
  assert.deepStrictEqual(opened, [outDir]);
  ok('fichier introuvable : dossier ouvert à la place');

  shell.openPath = openPath;
};
