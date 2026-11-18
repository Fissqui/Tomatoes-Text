// Essai complet : écriture, enregistrements simultanés, historique, dictionnaire, bibliothèque,
// réglages des pages, import Word, fermeture.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const docx = require('docx'); // module « docx » (npm) pour fabriquer un document Word d'essai

module.exports = async ({ page, electron, calls }) => {
  const { handlers, root } = electron._test;
  const ok = (m) => console.log('  OK  ' + m);
  const call = (ch, ...a) => handlers.get(ch)({ sender: { send() {} } }, ...a);

  // 1. Écrire, enregistrement automatique.
  await page.click('#editor');
  await page.keyboard.type('Bonjour le monde. Ceci est un essai de Tomatoes Text.');
  await page.waitForTimeout(2000);
  const lib = await call('library:load');
  const file = path.join(lib.folder, lib.docs[0].fileName);
  assert(fs.readFileSync(file, 'utf8').includes('Ceci est un essai'));
  ok('texte tapé puis enregistré sur le disque (' + lib.docs[0].fileName + ')');
  const status = await page.textContent('#status-count').catch(() => '');
  ok('barre d’état : ' + status);

  // 2. Réglages enregistrés vingt fois en même temps : le fichier reste lisible et complet.
  const settingsFile = path.join(electron.app.getPath('userData'), 'reglages.json');
  const base = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  await Promise.all(Array.from({ length: 20 }, (_, i) => call('settings:save', { ...base, essai: i, pad: 'x'.repeat(i % 2 ? 5000 : 10) })));
  const after = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  assert.strictEqual(after.essai, 19);
  ok('20 enregistrements simultanés des réglages : fichier intact, dernier gagnant');
  await call('settings:save', base);

  // 3. Historique : 10 copies à la main en même temps → 10 entrées.
  const doc = await call('doc:read', lib.docs[0].fileName);
  await Promise.all(Array.from({ length: 10 }, (_, i) => call('versions:save', { ...doc, title: doc.title + i, content: { html: '<p>v' + i + '</p>' } }, 'manuel', 'v' + i)));
  const versions = (await call('versions:list', doc.id)).filter((v) => v.kind === 'manuel');
  assert.strictEqual(versions.length, 10, 'versions: ' + versions.length);
  assert.strictEqual(new Set(versions.map((v) => v.file)).size, 10);
  ok('10 copies simultanées dans l’historique : 10 entrées gardées');
  await Promise.all(versions.slice(0, 4).map((v) => call('versions:delete', doc.id, v.file)));
  assert.strictEqual((await call('versions:list', doc.id)).filter((v) => v.kind === 'manuel').length, 6);
  ok('4 suppressions simultanées : 6 copies restantes');

  // 4. Dictionnaire personnel : deux mots ajoutés en même temps.
  await Promise.all([call('spell:add', 'Zorglubien'), call('spell:add', 'Tomatesque')]);
  const dictFile = path.join(path.dirname(lib.folder), '..', 'Dictionnaire personnel.txt');
  const dict = fs.readFileSync(dictFile, 'utf8');
  assert(dict.includes('Zorglubien') && dict.includes('Tomatesque'), dict);
  ok('deux mots ajoutés en même temps : les deux sont dans le dictionnaire personnel');
  const res = await call('spell:check', ['Zorglubien', 'Tomatesque', 'zorglubien', 'Zorglubienne']);
  console.log('      vérification :', res);
  assert(res[0] && res[1]);

  // 5. Bibliothèque : fiche relue quand le fichier change.
  const d2 = JSON.parse(fs.readFileSync(file, 'utf8'));
  d2.title = 'Titre changé dehors';
  fs.writeFileSync(file, JSON.stringify(d2));
  const lib2 = await call('library:load');
  assert.strictEqual(lib2.docs.find((d) => d.id === d2.id).title, 'Titre changé dehors');
  ok('bibliothèque : un document modifié hors du logiciel est relu');
  const t0 = Date.now(); for (let i = 0; i < 20; i++) await call('library:load'); ok('20 lectures de la bibliothèque : ' + (Date.now() - t0) + ' ms');

  // 6. Réglages des pages : le bouton « Ajouter » n'a qu'un écouteur, même après plusieurs mises à jour.
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(500);
  await page.click('#page-setup');
  await page.waitForTimeout(300);
  const tabs = await page.$$eval('#pages-dialog .styles-tabs button', (b) => b.map((x) => x.dataset.tab));
  const numTab = tabs.find((t) => /num/.test(t)) || tabs[tabs.length - 1];
  await page.click(`#pages-dialog .styles-tabs button[data-tab="${numTab}"]`);
  const cdp = await page.context().newCDPSession(page);
  const countListeners = async () => {
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.getElementById("pg-skip-add")' });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    return listeners.filter((l) => l.type === 'click').length;
  };
  for (const p of [3, 5, 7]) {
    await page.fill('#pg-skip-page', String(p));
    await page.click('#pg-skip-add');
    await page.waitForTimeout(150);
  }
  const rows = await page.$$eval('#pg-skip-list .pg-skip-row', (r) => r.length);
  const n = await countListeners();
  assert.strictEqual(rows, 3);
  assert.strictEqual(n, 1, 'écouteurs: ' + n);
  ok('pages exclues ajoutées : 3 lignes, 1 seul écouteur sur « Ajouter »');
  await page.click('#pg-close');

  // 7. Import Word : tableau dans un tableau avec des caractères spéciaux.
  const inner = new docx.Table({ rows: [new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph('a < b & <i>c</i>')] })] })] });
  const outer = new docx.Table({ rows: [new docx.TableRow({ children: [new docx.TableCell({ children: [new docx.Paragraph('Case'), inner] })] })] });
  const buf = await docx.Packer.toBuffer(new docx.Document({ sections: [{ children: [new docx.Paragraph('Avant'), outer] }] }));
  const out = await page.evaluate(async (b64) => {
    const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const r = await window.FTWordImport.convert(a.buffer, 'essai.docx');
    const box = document.createElement('div'); box.innerHTML = r.html;
    return { html: r.html, text: box.textContent, italic: !!box.querySelector('i') };
  }, buf.toString('base64'));
  assert(out.text.includes('a < b & <i>c</i>'), out.html);
  assert(!out.italic);
  ok('import Word : texte du tableau intérieur gardé tel quel (« a < b & <i>c</i> »)');

  // 8. Fermeture : le document est enregistré puis la fenêtre peut se fermer.
  await page.click('.ft-page, #editor').catch(() => {});
  await page.click('#mode-switch button[data-mode="note"]');
  await page.click('#editor');
  await page.keyboard.press('End');
  await page.keyboard.type(' Dernière phrase.');
  const before = calls.length;
  await page.evaluate(() => window.__ftEmit('menu', ['before-close']));
  await page.waitForTimeout(1500);
  assert(calls.slice(before).includes('ready-to-close'), calls.slice(before).join(','));
  const lib3 = await call('library:load');
  const saved = fs.readFileSync(path.join(lib3.folder, lib3.docs[0].fileName), 'utf8');
  assert(saved.includes('Dernière phrase'));
  ok('fermeture : dernière phrase enregistrée avant de fermer');
};
