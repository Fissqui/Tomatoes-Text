// Essai des documents aux noms proches (« fichier 1 », « fichier_1 ») et des copies : chaque fichier est un
// document distinct. Deux documents créés dans le logiciel ; copie faite dans l'Explorateur (même
// identifiant) réparée au chargement (l'original garde son identifiant, la copie en reçoit un et prend la
// même section) ; « Enregistrer une copie sous… » ; copie ouverte depuis ailleurs ; « Changer de projet » vers
// un projet qui a déjà la copie ; titre « fichier 1 » dans un fichier « fichier 1.5 ».
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const lib = (p) => page.evaluate((x) => window.frameText.loadLibrary(x), p);
  const text = () => page.evaluate(() => document.getElementById('editor').textContent);
  const idOf = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).id;
  const reload = async () => {
    await page.reload();
    await page.waitForTimeout(1500);
    if (await page.evaluate(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  };
  const make = async (name) => {
    await page.click('#new-doc');
    await page.waitForTimeout(300);
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await page.keyboard.type('Texte de ' + name);
    await page.waitForTimeout(2500);
  };
  const open = async (title) => {
    await page.locator('.doc-item', { hasText: title }).first().click();
    await page.waitForTimeout(700);
  };

  // 1. Deux documents créés dans le logiciel : deux fichiers, deux identifiants.
  await make('fichier 1');
  await make('fichier_1');
  let l = await lib();
  const a = l.docs.find((d) => d.title === 'fichier 1');
  const b = l.docs.find((d) => d.title === 'fichier_1');
  assert(a && b && a.id !== b.id && a.fileName === 'fichier 1.tmtx' && b.fileName === 'fichier_1.tmtx', JSON.stringify(l.docs));
  await open('fichier_1');
  assert(/Texte de fichier_1/.test(await text()));
  ok('« fichier 1 » et « fichier_1 » : deux fichiers, deux documents');

  // 2. Copie faite dans l'Explorateur (même identifiant), renommée et modifiée : réparée au chargement.
  const folder = l.folder;
  const section = l.sections[0].id;
  await page.evaluate(async ([id, s]) => { const x = await window.frameText.loadLibrary(); await window.frameText.saveLibraryIndex({ sections: x.sections, placement: { ...x.placement, [id]: s } }); }, [a.id, section]);
  const copyFile = path.join(folder, 'fichier-1.tmtx');
  const copied = JSON.parse(fs.readFileSync(path.join(folder, a.fileName), 'utf8'));
  copied.title = 'fichier-1';
  copied.content.html = copied.content.html.replace('Texte de fichier 1', 'Texte de la copie');
  fs.writeFileSync(copyFile, JSON.stringify(copied));
  assert.strictEqual(idOf(copyFile), a.id);
  await reload();
  l = await lib();
  const titles = l.docs.map((d) => d.title).sort();
  assert(titles.includes('fichier 1') && titles.includes('fichier-1') && titles.includes('fichier_1'), JSON.stringify(titles));
  const c = l.docs.find((d) => d.title === 'fichier-1');
  assert.strictEqual(idOf(path.join(folder, a.fileName)), a.id, 'original : même identifiant');
  assert(c.id !== a.id && idOf(copyFile) === c.id, 'copie : nouvel identifiant');
  assert.strictEqual(l.placement[c.id], section, 'copie dans la section de l’original');
  assert.strictEqual(await page.locator('.doc-item').count(), l.docs.length);
  await open('fichier-1');
  assert(/Texte de la copie/.test(await text()));
  await open('fichier 1');
  assert(/Texte de fichier 1/.test(await text()) && !/copie/.test(await text()));
  ok('copie de l’Explorateur (même identifiant) : les deux affichées, l’original garde son identifiant, la copie en reçoit un, même section');

  // 3. « Enregistrer une copie sous… » : la copie porte son propre identifiant.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-copies-'));
  const saveDialog = electron.dialog.showSaveDialog;
  electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(out, 'fichier 1 bis.tmtx') });
  await page.evaluate(async (f) => { const d = await window.frameText.readDoc(f); await window.frameText.exportDoc(d); }, a.fileName);
  electron.dialog.showSaveDialog = saveDialog;
  const bis = path.join(out, 'fichier 1 bis.tmtx');
  assert(fs.existsSync(bis) && idOf(bis) !== a.id);
  ok('« Enregistrer une copie sous… » : la copie est un autre document');

  // 4. Copie (même identifiant) ouverte depuis l'Explorateur : la copie s'ouvre, pas l'original.
  const ext = path.join(out, 'fichier 1 (copie).tmtx');
  const extDoc = JSON.parse(fs.readFileSync(path.join(folder, a.fileName), 'utf8'));
  extDoc.content.html = '<p>Copie posée ailleurs.</p>';
  fs.writeFileSync(ext, JSON.stringify(extDoc));
  for (const fn of electron.app._on['second-instance'] || []) await fn({}, ['Tomatoes Text.exe', ext]);
  await page.waitForTimeout(900);
  assert(/Copie posée ailleurs/.test(await text()));
  l = await lib();
  assert(idOf(ext) !== a.id && l.docs.some((d) => d.id === idOf(ext)) && l.docs.some((d) => d.id === a.id && d.fileName === a.fileName));
  // Rouvert : le même document (pas de nouvelle copie).
  const n = l.docs.length;
  for (const fn of electron.app._on['second-instance'] || []) await fn({}, ['Tomatoes Text.exe', ext]);
  await page.waitForTimeout(600);
  l = await lib();
  assert.strictEqual(l.docs.length, n);
  ok('copie ouverte depuis l’Explorateur : elle s’ouvre elle-même, l’original reste à part');

  // 5. « Changer de projet » vers un projet qui connaît déjà ce document (une copie) : deux documents.
  await page.evaluate(() => window.frameText.createProject('Autre'));
  let other = await lib('Autre');
  const twin = path.join(other.folder, 'fichier_1.tmtx');
  fs.copyFileSync(path.join(folder, b.fileName), twin);
  other = await lib('Autre');
  assert(other.docs.some((d) => d.id === b.id));
  l = await lib('Mes documents');
  await reload();
  const res = await page.evaluate((f) => window.frameText.changeDocProject(f, 'Autre'), b.fileName);
  assert(res && res.ok, JSON.stringify(res));
  other = await lib('Autre');
  assert.strictEqual(other.docs.length, 2);
  assert.strictEqual(new Set(other.docs.map((d) => d.id)).size, 2);
  assert(other.docs.some((d) => d.id === b.id && d.fileName === 'fichier_1.tmtx'));
  l = await lib('Mes documents');
  assert(!l.docs.some((d) => d.title === 'fichier_1'));
  ok('« Changer de projet » vers un projet qui a déjà la copie : deux documents distincts');
  await reload();

  // 6. Titre « fichier 1.5 » ramené à « fichier 1 » : le fichier est renommé (pas gardé sous « fichier 1.5 »).
  const r = await page.evaluate(async () => {
    const c = await window.frameText.createDoc('fichier 1.5');
    const s1 = await window.frameText.saveDoc(c.fileName, c.doc);
    c.doc.title = 'fichier 2';
    const s2 = await window.frameText.saveDoc(s1.fileName, c.doc);
    c.doc.title = 'fichier 2.5';
    const s3 = await window.frameText.saveDoc(s2.fileName, c.doc);
    c.doc.title = 'fichier 2';
    const s4 = await window.frameText.saveDoc(s3.fileName, c.doc);
    return [s1.fileName, s2.fileName, s3.fileName, s4.fileName];
  });
  assert.deepStrictEqual(r, ['fichier 1.5.tmtx', 'fichier 2.tmtx', 'fichier 2.5.tmtx', 'fichier 2.tmtx']);
  ok('nom de fichier toujours conforme au titre (« fichier 2.5 » → « fichier 2 » renomme le fichier)');
};
