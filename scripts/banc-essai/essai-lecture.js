// Essai du mode lecture : entrée, pages tournées, zoom, sortie (mode note puis mode avancé).
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  // Texte modifiable ? (Préversion 2.0 : réglage du moteur.)
  await page.evaluate(() => {
    window.__ce = () => (window.FTMoteur ? String(window.FTMoteur.view.editable) : document.getElementById('editor').getAttribute('contenteditable'));
  });
  // Un long document : titres, paragraphes, liste, tableau, note.
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    let html = '<h1 class="ft-title">Le livre d’essai</h1>';
    for (let c = 1; c <= 6; c++) {
      html += `<h2>Chapitre ${c}</h2>`;
      for (let p = 0; p < 7; p++) html += `<p>Paragraphe ${c}.${p}. ` + 'Le texte se lit comme dans un livre, page après page, sans les outils qui encombrent l’écran. '.repeat(4) + '</p>';
      if (c === 2) html += '<ul><li>Premier point</li><li>Second point</li></ul><table class="ft-table"><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
    }
    window.FTEditor.load({ content: { html } });
    const M = window.FTMoteur;
    if (M) {
      // Préversion 2.0 : curseur posé par le moteur.
      const w = M.view;
      let pos = 0;
      w.state.doc.forEach((n, off) => { if (!pos && n.type.name === 'heading' && /Chapitre 1/.test(n.textContent)) pos = off + 1; });
      w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, pos)));
      w.focus();
    } else {
      const r = document.createRange(); r.setStart(ed.querySelector('h2'), 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    }
    window.FTToc.insert();
    window.FTToc.refresh();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__ftEmit('menu', ['focus']));
  await page.waitForTimeout(500);
  let st = await page.evaluate(() => ({ s: window.FTReading.state(), ce: window.__ce(), bar: document.getElementById('rd-counter').textContent }));
  assert(st.s && st.s.total > 4 && st.ce === 'false', JSON.stringify(st));
  ok(`mode lecture : ${st.s.total} pages, ${st.s.n} par vue, « ${st.bar} »`);
  await page.screenshot({ path: path.join(SHOTS, 'lecture-1.png') });

  // Les colonnes tombent juste sur les pages : chaque page visible commence en haut de sa zone.
  const fit = await page.evaluate(() => {
    const p = document.getElementById('page').getBoundingClientRect();
    const r = document.caretRangeFromPoint(p.left + 5, p.top + 5);
    return { left: p.left, w: p.width, node: r && r.startContainer.textContent.slice(0, 30) };
  });
  ok('début de la première page : « ' + fit.node + ' »');

  // Clic sur « Chapitre 5 » dans le plan : on va à sa page.
  await page.evaluate(() => [...document.querySelectorAll('#editor .ft-toc-item')].find((r) => /Chapitre 5/.test(r.textContent)).click());
  await page.waitForTimeout(400);
  const toc = await page.evaluate(() => { const p = document.getElementById('page').getBoundingClientRect(); const h = [...document.querySelectorAll('#editor h2')].find((x) => /Chapitre 5/.test(x.textContent)).getBoundingClientRect(); return { spread: window.FTReading.state().spread, inView: h.left >= p.left - 1 && h.right <= p.right + 1 }; });
  assert(toc.spread > 0 && toc.inView, JSON.stringify(toc));
  ok('plan : clic sur « Chapitre 5 » → vue ' + (toc.spread + 1) + ', titre visible');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ s: window.FTReading.state(), bar: document.getElementById('rd-counter').textContent, text: document.getElementById('editor').textContent.length }));
  assert.strictEqual(st.s.spread, 1);
  ok('flèche droite : « ' + st.bar + ' »');
  await page.screenshot({ path: path.join(SHOTS, 'lecture-2.png') });
  // Une touche de lettre n'écrit rien.
  await page.keyboard.type('zzz');
  assert.strictEqual(await page.evaluate(() => document.getElementById('editor').textContent.length), st.text);
  ok('les lettres tapées n’écrivent rien');
  await page.keyboard.press('End');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.FTReading.state());
  assert.strictEqual(st.spread, Math.ceil(st.total / st.n) - 1);
  ok('Fin : dernière vue');
  await page.mouse.click(300, 400);
  await page.waitForTimeout(400);
  assert.strictEqual((await page.evaluate(() => window.FTReading.state())).spread, st.spread - 1);
  ok('clic sur la page de gauche : vue précédente');
  await page.click('#rd-zoom-in', { force: true });
  await page.waitForTimeout(300);
  const z = await page.evaluate(() => window.FTReading.state());
  assert(z.total > st.total, `${z.total} > ${st.total}`);
  ok(`texte plus grand : ${st.total} → ${z.total} pages`);
  await page.click('#rd-zoom-out', { force: true });
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  // Fenêtre étroite : une seule page.
  await page.setViewportSize({ width: 800, height: 850 });
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.FTReading.state());
  assert.strictEqual(st.n, 1);
  ok(`fenêtre étroite : une page par vue (${st.total} pages)`);
  await page.screenshot({ path: path.join(SHOTS, 'lecture-etroite.png') });
  await page.setViewportSize({ width: 1300, height: 850 });
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  st = await page.evaluate(() => ({ on: window.FTReading.isOn(), ce: window.__ce(), top: document.getElementById('workspace').scrollTop, style: !!document.getElementById('rd-style') }));
  assert(!st.on && st.ce === 'true' && !st.style, JSON.stringify(st));
  assert(st.top > 200, 'retour à l’endroit lu : ' + st.top);
  ok('Échap : retour à l’écriture, à l’endroit lu (défilement ' + st.top + ' px)');

  // Mode avancé (version 2.3.12) : la lecture montre les pages exactes du document (double page du
  // moteur, à l'échelle de l'écran) ; à la sortie, les pages d'écriture reviennent.
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(800);
  const docPages = await page.evaluate(() => window.FTPages.pageCount());
  await page.click('#reading-btn');
  await page.waitForTimeout(800);
  // Page de chaque feuille affichée et page du premier bloc qui s'y trouve (doivent être les mêmes).
  const exactView = () => page.evaluate(() => {
    const V = window.FTVisibles;
    const w = window.FTMoteur.view;
    const sh = [...document.querySelectorAll('#dp-sheets .dp-sheet')].map((s) => ({ r: s.getBoundingClientRect(), void: s.classList.contains('dp-void') }));
    const veil = !document.getElementById('dp-veil').hidden;
    const out = sh.map(() => null);
    for (const el of document.querySelectorAll('#editor > :is(p, h1, h2, h3, ul, ol, table, div.ft-cover)')) {
      const r = el.getClientRects()[0];
      if (!r || !r.width) continue;
      const k = sh.findIndex((x) => r.left >= x.r.left - 1 && r.right <= x.r.right + 1 && r.top >= x.r.top - 1 && r.top < x.r.bottom);
      if (k < 0 || out[k] !== null || (veil && k === 0)) continue;
      out[k] = V.pageOfPos(w.posAtDOM(el, 0));
    }
    return { pages: out, void: sh.map((x) => x.void), veil, bar: document.getElementById('rd-counter').textContent, s: window.FTReading.state(), zoom: document.getElementById('page').currentCSSZoom };
  });
  let ex = await exactView();
  assert(ex.s.exact && ex.s.total === docPages, 'mode avancé → lecture : ' + JSON.stringify({ ex, docPages }));
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    ex = await exactView();
    const p0 = ex.s.spread * 2;
    assert(ex.pages[0] === p0 && (ex.pages[1] === p0 + 1 || p0 + 1 >= docPages), `vue ${ex.s.spread} : pages ${JSON.stringify(ex)}`);
  }
  ok(`mode avancé → lecture : pages du document (${docPages}), chacune avec les mêmes blocs ; « ${ex.bar} »`);
  await page.screenshot({ path: path.join(SHOTS, 'lecture-avance.png') });
  await page.evaluate(() => window.__ftEmit('menu', ['focus']));
  await page.waitForTimeout(800);
  st = await page.evaluate(() => ({ on: window.FTReading.isOn(), gaps: document.querySelectorAll('#editor .ft-pg-gap').length, mode: window.FTPages.getSettings().mode, dbl: window.FTZoom.isDouble(), sheets: !!document.getElementById('dp-sheets') }));
  assert(!st.on && st.gaps > 0 && st.mode === 'avance' && !st.dbl && !st.sheets, JSON.stringify(st));
  ok('sortie : pages d’écriture refaites (' + st.gaps + ' intercalaires), toujours en mode avancé');

  // Zoom de l'écriture à 130 % : la lecture garde ses pages entières à l'écran ; le zoom revient à la sortie.
  await page.evaluate(() => window.FTZoom.set(130));
  await page.waitForTimeout(400);
  await page.click('#reading-btn');
  await page.waitForTimeout(800);
  const zz = await page.evaluate(() => {
    const sh = [...document.querySelectorAll('#dp-sheets .dp-sheet')].map((s) => s.getBoundingClientRect());
    return { fits: sh.every((r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight), zoom: document.getElementById('page').currentCSSZoom };
  });
  assert(zz.fits && zz.zoom < 1.3, 'zoom 130 % : ' + JSON.stringify(zz));
  await page.click('#rd-zoom-in', { force: true });
  await page.waitForTimeout(400);
  const zin = await page.evaluate(() => ({ zoom: document.getElementById('page').currentCSSZoom, pages: window.FTReading.state().total }));
  assert(zin.zoom > zz.zoom && zin.pages === docPages, 'A+ : ' + JSON.stringify({ zin, zz }));
  await page.click('#rd-zoom-out', { force: true });
  await page.evaluate(() => window.__ftEmit('menu', ['focus']));
  await page.waitForTimeout(600);
  assert(Math.abs(await page.evaluate(() => document.getElementById('page').currentCSSZoom) - 1.3) < 0.01, 'zoom rendu');
  ok('zoom de l’écriture à 130 % : pages entières à l’écran ; A+ les agrandit sans changer les pages ; zoom rendu à la sortie');

  // Page de garde (versions 2.3.8, 2.3.9, 2.3.12) : comme un livre, la couverture seule à droite, puis son
  // verso blanc à gauche avec la page 2 à droite, puis 3–4, 5–6…
  await page.evaluate(() => {
    window.FTZoom.set(100);
    const cover = '<div class="ft-cover" contenteditable="false" data-model="bloc"><div class="ft-cover-main"><p class="ft-cover-field" data-field="titre" data-ph="Titre" contenteditable="true">Le livre d’essai</p></div></div>';
    let html = cover;
    for (let p = 0; p < 30; p++) html += `<p>Paragraphe ${p}. ` + 'Le texte se lit comme dans un livre, page après page. '.repeat(8) + '</p>';
    window.FTEditor.load({ content: { html }, settings: { mode: 'avance' } });
  });
  await page.waitForTimeout(800);
  const coverPages = await page.evaluate(() => window.FTPages.pageCount());
  await page.click('#reading-btn');
  await page.waitForTimeout(800);
  await page.keyboard.press('Home');
  await page.waitForTimeout(400);
  const cv = await exactView();
  const coverOnRight = await page.evaluate(() => {
    const sh = document.querySelectorAll('#dp-sheets .dp-sheet')[1].getBoundingClientRect();
    const c = document.querySelector('#editor .ft-cover').getBoundingClientRect();
    return c.left >= sh.left - 1 && c.right <= sh.right + 1;
  });
  assert(cv.void[0] && coverOnRight && /^Page 1 sur/.test(cv.bar), 'page de garde : ' + JSON.stringify(cv));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const cv2 = await exactView();
  assert(!cv2.void[0] && cv2.veil && cv2.pages[1] === 1 && /^Page 2 sur/.test(cv2.bar), 'verso de la couverture : ' + JSON.stringify(cv2));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const cv2b = await exactView();
  assert(!cv2b.veil && cv2b.pages[0] === 2 && cv2b.pages[1] === 3 && /^Pages 3–4 sur/.test(cv2b.bar), 'pages 3–4 : ' + JSON.stringify(cv2b));
  await page.keyboard.press('End');
  await page.waitForTimeout(400);
  const cv3 = await exactView();
  assert(cv3.s.total === coverPages && cv3.pages.includes(coverPages - 1) && new RegExp(`${coverPages} sur ${coverPages}$`).test(cv3.bar), 'fin : ' + JSON.stringify(cv3));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  ok(`page de garde : seule à droite comme une couverture, puis verso blanc et « ${cv2.bar} », « ${cv2b.bar} » … « ${cv3.bar} »`);

  // Mode note : la lecture coupe le texte en pages à la taille de l'écran ; une dernière page seule à
  // gauche est bien atteinte (version 2.3.11).
  await page.evaluate(() => {
    let html = '';
    for (let p = 0; p < 31; p++) html += `<p>Paragraphe ${p}. ` + 'Le texte se lit comme dans un livre, page après page. '.repeat(8) + '</p>';
    window.FTEditor.load({ content: { html }, settings: { mode: 'note' } });
  });
  await page.waitForTimeout(600);
  await page.click('#reading-btn');
  await page.waitForTimeout(600);
  let lastLeft = null;
  for (let tries = 0; tries < 6 && !lastLeft; tries++) {
    await page.keyboard.press('End');
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const sh = [...document.querySelectorAll('#rd-sheets .rd-sheet')].map((s) => s.getBoundingClientRect());
      const last = [...[...document.querySelectorAll('#editor > p')].pop().getClientRects()].pop();
      const st = window.FTReading.state();
      return { odd: st.total % 2 === 1, onLeft: last.left >= sh[0].left && last.right <= sh[0].right + 1, st };
    });
    if (r.odd) lastLeft = r;
    else { await page.click('#rd-zoom-in', { force: true }); await page.waitForTimeout(300); }
  }
  if (lastLeft) assert(lastLeft.onLeft, 'mode note, dernière page seule à gauche : ' + JSON.stringify(lastLeft));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  ok('mode note : ' + (lastLeft ? `dernière page (${lastLeft.st.total}) seule à gauche, bien affichée` : 'nombre de pages pair, rien à vérifier'));
};
