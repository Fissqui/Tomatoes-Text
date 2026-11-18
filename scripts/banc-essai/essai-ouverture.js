// Essai de l'ouverture d'un document envoyé par Windows (double-clic sur un .tmtx dans l'Explorateur) :
// fichiers reçus au lancement (aucun ici), puis fichier passé par un second lancement du logiciel.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

module.exports = async ({ page, electron, emit }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const { handlers } = electron._test;
  const call = (ch, ...a) => handlers.get(ch)({ sender: { send() {} } }, ...a);

  assert.deepStrictEqual(await call('app:pendingFiles'), []);
  ok('lancement sans fichier : rien à ouvrir');

  // Deux documents ; le premier est ouvert.
  const docs = await page.evaluate(async () => {
    const a = await window.frameText.createDoc('Premier');
    const b = await window.frameText.createDoc('Second');
    b.doc.content = { ...b.doc.content, html: '<p id="mark">Texte du second.</p>' };
    await window.frameText.saveDoc(b.fileName, b.doc);
    return [a.fileName, b.fileName];
  });
  await emit('open-files', [[docs[0]]]);
  await page.waitForTimeout(800);
  assert(!/Texte du second/.test(await page.evaluate(() => document.getElementById('editor').textContent)));

  // Second lancement avec le second document : il s'ouvre dans la fenêtre déjà ouverte.
  await emit('open-files', [[docs[1]]]);
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ text: document.getElementById('editor').textContent, name: document.getElementById('doc-name').value || document.getElementById('doc-name').textContent }));
  assert(/Texte du second/.test(st.text), JSON.stringify(st));
  ok('fichier reçu d’un second lancement : « Second » ouvert dans la fenêtre');

  // Double-clic sur un .tmtx déjà rangé dans le stockage (ce projet ou un autre) : ouvert sur place, sans
  // copie dans « Non classés » ; rangement dans sa section gardé.
  const launch = async (file) => {
    for (const fn of electron.app._on['second-instance'] || []) await fn({}, ['Tomatoes Text.exe', file]);
    await page.waitForTimeout(900);
  };
  const lib0 = await page.evaluate(() => window.frameText.loadLibrary());
  const before = lib0.docs.length;
  await launch(path.join(lib0.folder, docs[0]));
  let lib1 = await page.evaluate(() => window.frameText.loadLibrary());
  assert.strictEqual(lib1.docs.length, before, 'pas de copie');
  assert(!/Texte du second/.test(await page.evaluate(() => document.getElementById('editor').textContent)));
  // Autre projet : le document y reste, ce projet s'ouvre.
  await page.evaluate(() => window.frameText.createProject('Autre'));
  const other = await page.evaluate(async () => {
    const lib = await window.frameText.loadLibrary('Autre');
    const c = await window.frameText.createDoc('Dans autre');
    c.doc.content = { ...c.doc.content, html: '<p>Texte de l’autre projet.</p>' };
    await window.frameText.saveDoc(c.fileName, c.doc);
    const back = await window.frameText.loadLibrary('Mes documents');
    return { file: lib.folder + '/' + c.fileName, mine: back.docs.length };
  });
  await page.evaluate(() => window.FTApp.menu('home')).catch(() => {});
  await launch(other.file.replace(/\//g, path.sep));
  const st2 = await page.evaluate(() => ({ text: document.getElementById('editor').textContent, project: document.getElementById('project-select').value }));
  assert(/Texte de l’autre projet/.test(st2.text) && st2.project === 'Autre', JSON.stringify(st2));
  const libs = await page.evaluate(async () => [(await window.frameText.loadLibrary('Mes documents')).docs.length, (await window.frameText.loadLibrary('Autre')).docs.length]);
  assert.deepStrictEqual(libs, [other.mine, 1]);
  ok('.tmtx déjà rangé : ouvert sur place (même projet ou projet « Autre »), aucune copie');

  // Classement propre au logiciel : un fichier ouvert depuis n'importe où n'est jamais copié. Il entre une
  // fois dans « Non classés », garde ensuite sa section où que soit son fichier, et revient à sa section
  // quand on le rouvre depuis un nouvel emplacement.
  const os = require('os');
  const lib = () => page.evaluate(() => window.frameText.loadLibrary());
  const made = await page.evaluate(async () => {
    const l = await window.frameText.loadLibrary();
    const c = await window.frameText.createDoc('Livre 2026');
    c.doc.content = { ...c.doc.content, html: '<p>Chapitre premier du livre.</p>' };
    await window.frameText.saveDoc(c.fileName, c.doc);
    return { folder: l.folder, fileName: c.fileName, id: c.doc.id, count: l.docs.length, section: l.sections[0].id };
  });
  const looseFile = path.join(path.dirname(made.folder), 'Livre 2026.tmtx');
  fs.renameSync(path.join(made.folder, made.fileName), looseFile);
  await launch(looseFile);
  let l = await lib();
  assert.strictEqual(l.docs.length, made.count + 1, 'aucune copie');
  assert(fs.existsSync(looseFile), 'fichier laissé à sa place');
  assert(!fs.readdirSync(made.folder).some((n) => /^Livre 2026/.test(n)), 'rien dans le dossier du projet');
  assert(!l.placement[made.id], 'non classé');
  assert(/Chapitre premier du livre/.test(await page.evaluate(() => document.getElementById('editor').textContent)));
  // Rangé dans une section, puis rouvert : pas de doublon, toujours dans sa section.
  // (Rangement écrit dans l'index, puis fenêtre rechargée pour que la barre latérale le reprenne.)
  const classify = async (id, sec) => {
    await page.evaluate(async ([i, s]) => { const x = await window.frameText.loadLibrary(); await window.frameText.saveLibraryIndex({ sections: x.sections, placement: { ...x.placement, [i]: s } }); }, [id, sec]);
    await page.reload();
    await page.waitForTimeout(1500);
  };
  await classify(made.id, made.section);
  await launch(looseFile);
  await launch(looseFile);
  l = await lib();
  assert.strictEqual(l.docs.length, made.count + 1);
  assert.strictEqual(l.placement[made.id], made.section);
  // Écrit dans le logiciel : enregistré dans son fichier, sans le renommer.
  await page.evaluate(async (f) => { const d = await window.frameText.readDoc(f); d.title = 'Livre 2026 (révisé)'; await window.frameText.saveDoc(f, d); }, looseFile);
  assert(fs.existsSync(looseFile));
  // Déplacé hors du logiciel : marqué introuvable, section gardée ; rouvert depuis sa nouvelle place : retrouvé.
  const away = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ailleurs-')), 'Mon livre.tmtx');
  fs.renameSync(looseFile, away);
  l = await lib();
  const lost = l.docs.find((d) => d.id === made.id);
  assert(lost && lost.missing && lost.title === 'Livre 2026 (révisé)' && l.placement[made.id] === made.section, JSON.stringify(lost));
  await launch(away);
  l = await lib();
  const back = l.docs.find((d) => d.id === made.id);
  assert(back && !back.missing && back.fileName === away && l.placement[made.id] === made.section && l.docs.length === made.count + 1, JSON.stringify(back));
  // Copie du même document ailleurs (l'original existe toujours) : l'original s'ouvre, sans doublon.
  const copy = path.join(path.dirname(away), 'Copie.tmtx');
  fs.copyFileSync(away, copy);
  await launch(copy);
  l = await lib();
  assert.strictEqual(l.docs.length, made.count + 1);
  assert.strictEqual(l.docs.find((d) => d.id === made.id).fileName, away);
  // Document créé dans le logiciel, sorti de son dossier : introuvable puis retrouvé, avec sa section.
  const inside = await page.evaluate(async () => {
    const c = await window.frameText.createDoc('Notes internes');
    return { fileName: c.fileName, id: c.doc.id };
  });
  await classify(inside.id, made.section);
  const out = path.join(path.dirname(away), 'Notes.tmtx');
  fs.renameSync(path.join(made.folder, inside.fileName), out);
  l = await lib();
  assert(l.docs.find((d) => d.id === inside.id).missing && l.placement[inside.id], 'introuvable, section gardée');
  await launch(out);
  l = await lib();
  assert(!l.docs.find((d) => d.id === inside.id).missing && l.placement[inside.id] === made.section);
  // Introuvable : affiché comme tel ; « Localiser le fichier… » (autre document refusé), « Retirer de la liste ».
  const gone = path.join(path.dirname(away), 'Notes déplacées.tmtx');
  fs.renameSync(out, gone);
  await page.reload();
  await page.waitForTimeout(1500);
  const miss = await page.evaluate((id) => { const el = [...document.querySelectorAll('.doc-item.missing')].find((e) => e.dataset.id === id || e.textContent.includes('Notes internes')); return el ? el.title : null; }, inside.id);
  assert(miss && miss.includes('Notes.tmtx'), 'affiché introuvable : ' + miss);
  const realOpen = electron.dialog.showOpenDialog;
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [away] });
  assert.deepStrictEqual(await page.evaluate((id) => window.frameText.locateDoc(id), inside.id), { error: 'Ce fichier contient un autre document.' });
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [gone] });
  assert.strictEqual((await page.evaluate((id) => window.frameText.locateDoc(id), inside.id)).fileName, gone);
  electron.dialog.showOpenDialog = realOpen;
  l = await lib();
  assert(!l.docs.find((d) => d.id === inside.id).missing && l.placement[inside.id] === made.section);
  fs.rmSync(gone);
  await page.evaluate((id) => window.frameText.forgetDoc(id), inside.id);
  l = await lib();
  assert(!l.docs.some((d) => d.id === inside.id) && !l.placement[inside.id]);
  ok('fichier ouvert depuis n\'importe où : jamais copié, « Non classés » une fois puis sa section gardée ; déplacé : introuvable puis retrouvé à sa nouvelle place ; copie : l\'original s\'ouvre');

  // L'icône des documents est livrée avec le logiciel.
  const ico = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'assets', 'tmtx.ico'));
  assert(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) >= 6, 'ico');
  ok(`icône des documents : src/assets/tmtx.ico (${ico.readUInt16LE(4)} tailles)`);
};
