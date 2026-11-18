// Essai des nettoyages de la 1.4.1 : plan, illustrations et index déplacés et supprimés comme des objets,
// page de titre réservée au mode avancé, numéros de page du plan retirés au retour en mode note,
// cadre d'une image sans sa légende, double-clic sous le texte pour y créer une ligne.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const fill = (t) => `<p>${t} ` + 'Les jours passent et les chapitres avancent lentement. '.repeat(8) + '</p>';
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Livre</h1><p id="top">Avant-propos.</p>' + '<h2>Un</h2>' + fill('A.') + '<h2>Deux</h2>' + fill('B.') + fill('C.') + '<p id="end">Fin.</p>';
    ed.dispatchEvent(new Event('input'));
    window.FTIndex.set([{ term: 'chapitres', variants: [], parent: '' }]);
    const r = document.createRange(); r.selectNodeContents(document.getElementById('end')); r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    window.FTIndex.insert();
  });
  await page.waitForTimeout(500);

  // 1. Index : poignée à gauche, déplacé (Alt+↑), supprimé (Suppr), Annuler.
  await page.evaluate(() => document.querySelector('#editor .ft-index').scrollIntoView({ block: 'center' }));
  let r = await page.evaluate(() => { const b = document.querySelector('#editor .ft-index').getBoundingClientRect(); return { x: b.left + 40, y: b.top + 30 }; });
  await page.mouse.move(r.x, r.y);
  await page.waitForTimeout(100);
  let st = await page.evaluate(() => !document.getElementById('block-handle').hidden);
  assert(st, 'poignée absente');
  const h = await page.evaluate(() => { const b = document.getElementById('block-handle').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.click(h.x, h.y);
  await page.waitForTimeout(100);
  st = await page.evaluate(() => document.getElementById('editor').classList.contains('object-selected') || !!document.querySelector('#editor > .ProseMirror-selectednode'));
  assert(st, 'index non sélectionné');
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => { const ix = document.querySelector('#editor .ft-index'); let n = ix.nextElementSibling; while (n && n.classList.contains('ft-pg-gap')) n = n.nextElementSibling; return n && n.id; });
  assert.strictEqual(st, 'end');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => document.querySelectorAll('#editor .ft-index').length);
  assert.strictEqual(st, 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => document.querySelectorAll('#editor .ft-index').length);
  assert.strictEqual(st, 1);
  ok('index : poignée, sélection, Alt+↑ le remonte au-dessus de « Fin. », Suppr le retire, Ctrl+Z le remet');

  // Le plan aussi : double-clic hors du titre du plan = sélection.
  await page.evaluate(() => {
    const r = document.createRange(); r.selectNodeContents(document.getElementById('top')); r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    window.FTToc.insert();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#editor .ft-toc').scrollIntoView({ block: 'center' }));
  r = await page.evaluate(() => { const b = document.querySelector('#editor .ft-toc').getBoundingClientRect(); return { x: b.right - 10, y: b.bottom - 6 }; });
  await page.mouse.dblclick(r.x, r.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => document.querySelectorAll('#editor .ft-toc').length);
  assert.strictEqual(st, 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ok('plan : double-clic le sélectionne, Suppr le retire');

  // 2. Page de titre : bouton et entrée du menu grisés en mode note ; disponibles en mode avancé.
  st = await page.evaluate(() => ({ disabled: document.getElementById('cover-btn').disabled, title: document.getElementById('cover-btn').title }));
  assert(st.disabled && /mode avancé/.test(st.title), JSON.stringify(st));
  r = await page.evaluate(() => { const e = document.getElementById('end'); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + 10, y: b.top + 5 }; });
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await page.waitForTimeout(100);
  await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent.startsWith('Insérer')).click());
  await page.waitForTimeout(100);
  st = await page.evaluate(() => [...document.querySelectorAll('.context-menu button')].map((b) => b.textContent + (b.disabled ? ' (grisé)' : '')));
  assert(st.includes('Page de titre… (grisé)') && st.some((t) => /Plan du document/.test(t)), st.join(' | '));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(1200);
  st = await page.evaluate(() => document.getElementById('cover-btn').disabled);
  assert.strictEqual(st, false);
  await page.evaluate(() => window.FTCover.apply('classique'));
  await page.waitForTimeout(800);
  st = await page.evaluate(() => getComputedStyle(document.querySelector('#editor .ft-cover')).display);
  assert.notStrictEqual(st, 'none');
  ok('page de titre : grisée et absente du menu Insérer en mode note, disponible en mode avancé');

  // 3. Retour en mode note : la page de titre est masquée, le plan perd ses numéros aussitôt.
  st = await page.evaluate(() => document.querySelectorAll('#editor .ft-toc-page').length);
  assert(st > 0, 'pas de numéros en mode avancé');
  await page.click('#mode-switch button[data-mode="note"]');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => ({
    nums: document.querySelectorAll('#editor .ft-toc-page, #editor .ft-index-pages').length,
    cover: getComputedStyle(document.querySelector('#editor .ft-cover')).display
  }));
  assert(st.nums === 0 && st.cover === 'none', JSON.stringify(st));
  const pdfJob = await page.evaluate(() => window.FTPages.exportInfo().cfg.firstDifferent);
  assert.strictEqual(pdfJob, false);
  ok('mode note : numéros de page du plan et de l’index retirés tout de suite, page de titre masquée');

  // 4. Cadre d'une image : autour de l'image seule, la légende en dehors.
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 100;
    const g = c.getContext('2d'); g.fillStyle = '#7a9'; g.fillRect(0, 0, 200, 100);
    document.getElementById('top').insertAdjacentHTML('afterend', `<p><span class="ft-image" id="img" data-frame="simple" data-caption-box="1" data-caption="bas" contenteditable="false" style="width: 40%; --fw: 3px"><img src="${c.toDataURL()}" alt=""><span class="ft-caption" contenteditable="true">Vue du jardin</span></span></p>`);
    document.getElementById('editor').dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(300);
  st = await page.evaluate(() => {
    const box = document.getElementById('img');
    const img = box.querySelector('img');
    const cap = box.querySelector('.ft-caption');
    const bi = getComputedStyle(img); const bb = getComputedStyle(box);
    return { imgBorder: bi.borderTopWidth, boxBorder: bb.borderTopWidth, capBelow: cap.getBoundingClientRect().top >= img.getBoundingClientRect().bottom };
  });
  assert(st.imgBorder === '3px' && st.boxBorder === '0px' && st.capBelow, JSON.stringify(st));
  await page.evaluate(() => document.getElementById('img').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(SHOTS, 'cadre-image.png') });
  ok('image encadrée : le cadre entoure l’image seule, la légende encadrée est en dessous, hors du cadre');

  // 5. Double-clic sous la dernière ligne : des lignes vides jusqu'à l'endroit cliqué, curseur dessus.
  await page.evaluate(() => {
    document.querySelector('#editor .ft-index').remove();
    document.getElementById('editor').dispatchEvent(new Event('input'));
    document.getElementById('workspace').scrollTop = 1e6;
  });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => document.querySelectorAll('#editor > p').length);
  r = await page.evaluate(() => { const e = document.getElementById('end').getBoundingClientRect(); return { x: e.left + 120, y: e.bottom + 110 }; });
  await page.mouse.dblclick(r.x, r.y);
  await page.waitForTimeout(200);
  await page.keyboard.type('Ici.');
  st = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('#editor > p')];
    const last = ps[ps.length - 1];
    return { added: ps.length, text: last.textContent, bottom: last.getBoundingClientRect().bottom };
  });
  assert(st.text === 'Ici.' && st.added - before >= 3 && Math.abs(st.bottom - r.y) < 40, JSON.stringify({ ...st, before, y: r.y }));
  ok(`double-clic 110 px sous « Fin. » : ${st.added - before} lignes créées, « Ici. » écrit à l’endroit cliqué`);

  // 6. Tags avec une page de titre (mode avancé) : en haut de la page 2, ou en page 1 au choix.
  await page.evaluate(() => { window.FTTags.setVisible(true); window.FTTags.load([{ name: 'roman', color: 'rouge' }, { name: 'brouillon', color: 'bleu' }]); });
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(1500);
  const where = () => page.evaluate(() => {
    const geo = window.FTPages._geo();
    const o = document.getElementById('page').getBoundingClientRect().top;
    const t = document.getElementById('doc-tags').getBoundingClientRect();
    const cover = document.querySelector('#editor > .ft-cover').getBoundingClientRect();
    let n = document.querySelector('#editor > .ft-cover').nextElementSibling;
    while (n && n.classList.contains('ft-pg-gap')) n = n.nextElementSibling;
    const next = n.getBoundingClientRect();
    return { tagsTop: t.top - o, tagsBottom: t.bottom - o, coverTop: cover.top - o, nextTop: next.top - o, p1: geo[0].top, p2: geo[1].top, p2ct: geo[1].ct, p1ct: geo[0].ct };
  });
  st = await where();
  // (Page de titre sur toute la feuille depuis la 2.0.1 : elle commence en haut de la page 1.)
  assert(st.tagsTop > st.p2 && st.tagsTop < st.p2ct && st.nextTop >= st.tagsBottom && Math.abs(st.coverTop - st.p1) < 3, JSON.stringify(st));
  await page.evaluate(() => document.getElementById('doc-tags').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(SHOTS, 'tags-page2.png') });
  ok('page de titre en mode avancé : tags en haut de la page 2, le texte commence dessous, page 1 entière pour le titre');
  await page.click('#tags-btn');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => ({ row: !document.getElementById('tags-pop-later-row').hidden, on: document.getElementById('tags-pop-later').checked }));
  assert(st.row && st.on, JSON.stringify(st));
  await page.click('#tags-pop-later');
  await page.waitForTimeout(800);
  st = await where();
  // (La page de titre couvre toute la feuille : les tags s'affichent dans sa marge du haut.)
  assert(st.tagsTop < st.p1ct + 30 && st.tagsTop >= st.coverTop, JSON.stringify(st));
  ok('bouton « Tags » > « Après la page de titre » décoché : tags en page 1, au-dessus de la page de titre');
  st = await page.evaluate(async () => (await window.FTApp.versionDoc()).settings.pages.tagsAfterCover);
  assert.strictEqual(st, false);
  await page.click('#tags-pop-later');
  await page.waitForTimeout(500);

  // 2.4.19 : barres rangées par étapes ; un rangement enregistré avant (v < 7) est oublié (seule la place
  // des barres est gardée), un rangement v: 7 est repris.
  const groupsOf = () => page.evaluate(() => [...document.querySelectorAll('#toolbar > .tb-group:not([hidden]), #toolbar2 > .tb-group:not([hidden])')]
    .map((g) => g.dataset.group + ':' + [...g.children].map((c) => c.dataset.tb).join(',')));
  const fresh = await groupsOf();
  assert.deepStrictEqual(fresh.map((g) => g.split(':')[0]), ['document', 'police', 'caracteres', 'paragraphe', 'saisie', 'relecture',
    'objets', 'blocs', 'symboles', 'notes', 'liens', 'parties', 'presentation', 'tags'], fresh.join(' | '));
  assert.ok(fresh.includes('relecture:comment,track,assist'), fresh.join(' | '));
  assert.ok(fresh.includes('notes:note,endnote,cite,pdf-source'), fresh.join(' | '));
  assert.ok(fresh.includes('presentation:modele,doctheme,docstyles,pages,pagenum,layout'), fresh.join(' | '));
  await page.evaluate(() => window.FTToolbar.apply({ v: 6, pos: 'bas', pos2: 'bas', linked: true, folded: false, groups: { relecture: ['cite', 'pdf-source', 'track'], renvois: ['note', 'comment'] } }));
  assert.deepStrictEqual(await groupsOf(), fresh);
  await page.evaluate(() => window.FTToolbar.apply({ v: 7, pos: 'haut', pos2: 'haut', linked: true, folded: false, groups: { relecture: ['comment', 'assist', 'track'] } }));
  assert.ok((await groupsOf()).includes('relecture:comment,assist,track'));
  await page.evaluate(() => window.FTToolbar.apply({ v: 7, pos: 'haut', pos2: 'haut', linked: true, folded: false }));
  assert.deepStrictEqual(await groupsOf(), fresh);
  ok('barres rangées par étapes ; rangement enregistré avant 2.4.19 oublié (place des barres gardée), rangement v: 7 repris');
  await page.screenshot({ path: path.join(SHOTS, 'barre-insertion.png'), clip: { x: 0, y: 0, width: 1300, height: 140 } });
  ok('barres : ' + fresh.map((g) => g.split(':')[0]).join(' · '));
};
