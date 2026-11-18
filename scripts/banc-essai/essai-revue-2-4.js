// Revue de la version 2.4 : lancement sans erreur, message d'état rendu après un
// message temporaire, noms de fichiers réservés par Windows, fermeture pendant un enregistrement qui
// échoue, mode lecture (raccourcis d'édition neutralisés, sortie quand le document change), place du
// document quand plusieurs volets sont ouverts, page de titre en double page, réglages illisibles,
// erreurs inattendues gardées.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-revue-2-4.js
const assert = require('assert');

module.exports = async ({ page, errors, calls, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const menu = (a) => v((x) => window.FTApp.menu(x), a);
  const { handlers } = electron._test;

  // 1. Lancement : rien dans la console (un gestionnaire écrit dans la page était refusé à chaque lancement).
  assert.deepStrictEqual(errors, []);
  ok('lancement : aucune erreur dans la console');

  // 2. Message temporaire : l'état de l'enregistrement revient après lui, même si deux messages se suivent.
  await page.click('#editor');
  await page.keyboard.type('Un premier paragraphe pour la revue.');
  await page.waitForTimeout(1800);
  const status = () => v(() => document.getElementById('status-save').textContent);
  const saved = await status();
  assert.ok(saved && !/en cours/.test(saved), saved);
  await v(() => { window.FTApp.flash('Export PDF en cours…'); window.FTApp.flash('Export PDF terminé.'); });
  assert.strictEqual(await status(), 'Export PDF terminé.');
  await v(() => window.FTApp.flash(''));
  assert.strictEqual(await status(), saved);
  await v(() => { window.FTApp.flash('Export Word en cours…'); window.FTApp.flash('Document exporté.'); });
  await page.waitForTimeout(5300);
  assert.strictEqual(await status(), saved);
  ok(`message temporaire : « ${saved} » revient après deux messages de suite, effacés ou arrivés à leur terme`);

  // 3. Nom réservé par Windows : le fichier prend un autre nom, le document garde le sien.
  const fileOf = () => v(() => { const id = window.FTApp.currentId(); return window.FTApp.docs().find((d) => d.id === id).fileName; });
  for (const [name, file] of [['CON', '_CON.tmtx'], ['aux.2026', '_aux.2026.tmtx'], ['Lpt1', '_Lpt1.tmtx'], ['Conseil', 'Conseil.tmtx']]) {
    await v((n) => window.FTApp.setName(n), name);
    await page.waitForTimeout(1700);
    assert.strictEqual(await fileOf(), file);
    assert.strictEqual(await v(() => window.FTApp.docName()), name);
  }
  ok('noms réservés (CON, aux.2026, Lpt1) : fichier précédé de « _ », nom du document inchangé ; « Conseil » gardé tel quel');

  // 4. Fermeture pendant que l'enregistrement échoue : la fenêtre reste ouverte et le dit.
  const realSave = handlers.get('doc:save');
  handlers.set('doc:save', async () => { throw new Error("Error invoking remote method 'doc:save': Error: ENOSPC: no space left on device"); });
  await page.click('#editor');
  await page.keyboard.type(' Une phrase qui ne peut pas être enregistrée.');
  calls.length = 0;
  const closing = menu('before-close');
  await page.waitForTimeout(600);
  let st = await v(() => ({ open: document.getElementById('modal').open, text: document.getElementById('modal-message').textContent, ok: document.getElementById('modal-ok').textContent }));
  assert.ok(st.open && /L’enregistrement a échoué \(disque plein\)/.test(st.text) && st.ok === 'Quitter sans enregistrer', JSON.stringify(st));
  assert.ok(calls.includes('close-cancelled') && !calls.includes('ready-to-close'), calls.join(' '));
  await page.click('#modal-cancel');
  await closing;
  assert.ok(!calls.includes('ready-to-close'), calls.join(' '));
  // Le disque revient : l'enregistrement reprend, la fermeture passe sans question.
  handlers.set('doc:save', realSave);
  calls.length = 0;
  await menu('before-close');
  assert.ok(calls.includes('doc:save') && calls.includes('ready-to-close') && !(await v(() => document.getElementById('modal').open)), calls.join(' '));
  ok('fermeture avec un enregistrement en échec : question « Quitter sans enregistrer », fenêtre gardée sur « Annuler » ; fermeture normale ensuite');
  // (La console a reçu l'erreur voulue par l'essai.)
  errors.length = 0;

  // 5. Mode lecture : les raccourcis qui modifient le texte ou ouvrent un outil ne font rien.
  const text = () => v(() => window.FTMoteur.view.state.doc.textContent);
  await page.click('#editor');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Fin.');
  await page.waitForTimeout(300);
  const before = await text();
  await menu('focus');
  await page.waitForTimeout(700);
  assert.ok(await v(() => window.FTReading.isOn()), 'lecture');
  for (const k of ['Control+z', 'Control+y', 'Control+b', 'Control+k', 'Control+h', 'Control+f']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  }
  st = await v(() => ({ on: window.FTReading.isOn(), dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id), find: !document.getElementById('find-panel').hidden && !!document.getElementById('find-panel').offsetParent }));
  assert.strictEqual(await text(), before);
  assert.ok(st.on && !st.dialogs.length && !st.find, JSON.stringify(st));
  ok('mode lecture : Ctrl+Z, Ctrl+Y, Ctrl+B, Ctrl+K, Ctrl+H et Ctrl+F sans effet, texte intact');

  // 6. Mode lecture : une commande qui demande l'écriture le quitte d'abord ; un autre document aussi.
  await menu('find');
  await page.waitForTimeout(700);
  st = await v(() => ({ on: window.FTReading.isOn(), editable: window.FTMoteur.view.editable, find: !document.getElementById('find-panel').hidden }));
  assert.ok(!st.on && st.editable && st.find, JSON.stringify(st));
  await page.keyboard.press('Escape');
  const first = await v(() => window.FTApp.currentId());
  const created = v(() => window.FTApp.newDocument());
  await page.waitForTimeout(300);
  await page.fill('#modal-input', 'Deuxième document');
  await page.click('#modal-ok');
  assert.ok(await created, 'deuxième document');
  await page.waitForTimeout(500);
  await menu('focus');
  await page.waitForTimeout(700);
  assert.ok(await v(() => window.FTReading.isOn()), 'lecture du deuxième document');
  await v((id) => window.FTApp.openDocById(id), first);
  await page.waitForTimeout(800);
  st = await v(() => ({ on: window.FTReading.isOn(), cls: document.getElementById('app').classList.contains('reading-mode'), editable: window.FTMoteur.view.editable, id: window.FTApp.currentId() }));
  assert.ok(!st.on && !st.cls && st.editable && st.id === first, JSON.stringify(st));
  ok('mode lecture : « Rechercher » le quitte et s’ouvre ; un autre document ouvert le quitte, texte de nouveau modifiable');

  // 7. Volets : la zone du document garde au moins 360 px ; les volets ne sortent pas de la fenêtre.
  const widths = () => v(() => {
    const w = (id) => Math.round(document.getElementById(id).getBoundingClientRect().width);
    return { main: w('main'), nav: window.FTNav.isVisible(), side: !document.getElementById('app').classList.contains('sidebar-hidden'), pdf: w('pdfpane'), assist: w('assist'),
      over: document.getElementById('app').scrollWidth - window.innerWidth };
  });
  await v(() => { if (!window.FTNav.isVisible()) window.FTNav.toggle(); });
  await v(() => window.FTSourcePdf.toggle());
  await page.waitForTimeout(600);
  st = await widths();
  assert.ok(st.main >= 360 && st.nav && st.side && st.pdf >= 300 && st.over <= 0, JSON.stringify(st));
  await v(() => window.FTAssistant.toggle(true));
  await page.waitForTimeout(600);
  st = await widths();
  assert.ok(st.main >= 360 && st.assist === 340 && st.pdf >= 300 && !st.nav && st.over <= 0, JSON.stringify(st));
  await page.setViewportSize({ width: 800, height: 700 });
  await page.waitForTimeout(600);
  const narrow = await widths();
  assert.ok(narrow.main >= 360 && narrow.assist === 340 && narrow.over <= 0, JSON.stringify(narrow));
  await page.setViewportSize({ width: 1300, height: 850 });
  await v(() => window.FTAssistant.toggle(false));
  await page.waitForTimeout(400);
  ok(`volets : navigation + PDF + Aide au texte sur 1300 px, document ${st.main} px (volet de navigation refermé) ; fenêtre de 800 px, document ${narrow.main} px`);

  // 8. Page de titre tout juste insérée (son titre est en cours d'écriture), puis double page : la page de
  // titre couvre toute la feuille de gauche, le texte commence en haut de la feuille de droite.
  await v(() => { if (window.FTNav.isVisible()) window.FTNav.toggle(); if (document.getElementById('pdfpane').classList.contains('open')) window.FTSourcePdf.toggle(); });
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(900);
  await v(() => window.FTEditor.load({ content: { html: '<h1>Avant-propos</h1>' + '<p>Le raisonnement s’appuie sur les mesures et les observations du terrain.</p>'.repeat(45) }, settings: { mode: 'avance' } }));
  await page.waitForTimeout(700);
  await page.click('#cover-btn');
  await page.waitForTimeout(300);
  await page.click('#cv-models .cv-card[data-model="moderne"]');
  await page.click('#cv-ok');
  await page.waitForTimeout(600);
  assert.ok(await v(() => window.FTObjets.busy()), 'titre de la page de titre en cours d’écriture');
  await v(() => window.FTZoom.set(50));
  await page.waitForTimeout(700);
  st = await v(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const [left, right] = [...document.querySelectorAll('#dp-sheets .dp-sheet')].map(r);
    const k = document.getElementById('page').currentCSSZoom || 1;
    return { double: document.getElementById('app').classList.contains('zoom-double'), cover: r(document.querySelector('#editor > .ft-cover')), h1: r(document.querySelector('#editor h1')), left, right, ct: window.FTPages.frame().ct * k };
  });
  assert.ok(st.double && Math.abs(st.cover.x - st.left.x) < 1.5 && Math.abs(st.cover.y - st.left.y) < 1.5 && Math.abs(st.cover.h - st.left.h) < 1.5, JSON.stringify(st));
  assert.ok(st.h1.x > st.right.x && Math.abs(st.h1.y - (st.right.y + st.ct)) < 3, JSON.stringify(st));
  await v(() => window.FTZoom.set(100));
  await page.waitForTimeout(500);
  ok('page de titre tout juste insérée, double page : elle couvre la feuille de gauche, le texte commence en haut de la feuille de droite');

  // 9. Fichier des réglages devenu illisible : mis de côté, la copie précédente est reprise.
  const fs = require('fs');
  const path = require('path');
  const file = path.join(electron.app.getPath('userData'), 'reglages.json');
  const load = handlers.get('settings:load');
  const good = await load({});
  await page.waitForTimeout(300);
  assert.ok(good && good.lastFile && fs.existsSync(file.replace(/\.json$/, '.precedent.json')), 'copie des réglages');
  fs.writeFileSync(file, '{"theme": "jour", "lastFi');
  const back = await load({});
  assert.deepStrictEqual(back, good);
  const aside = fs.readdirSync(path.dirname(file)).filter((f) => /^reglages\.illisible-\d+\.json$/.test(f));
  assert.strictEqual(aside.length, 1);
  fs.rmSync(file, { force: true });
  assert.deepStrictEqual(await load({}), {});
  ok('réglages illisibles : fichier mis de côté, copie précédente reprise ; réglages absents : valeurs d’origine');

  // 10. Erreur inattendue dans la fenêtre : gardée pour les signalements et envoyée au journal.
  calls.length = 0;
  await v(() => { setTimeout(() => { throw new Error('Erreur voulue par l’essai'); }, 0); });
  await page.waitForTimeout(300);
  const kept = await v(() => window.FTErreurs.list().map((e) => e.text.split('\n')[0]));
  assert.ok(kept.includes('Error: Erreur voulue par l’essai') && calls.includes('journal'), JSON.stringify({ kept, calls }));
  errors.length = 0;
  ok('erreur inattendue de la fenêtre : gardée pour les signalements, écrite dans le journal');
};
