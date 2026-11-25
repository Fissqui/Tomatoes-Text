// Images 2.5 : déplacement par ligne ou libre, ancrage mouvant ou fixe, centrage, superposition, encadrage.
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();
const zlib = require('zlib');

// Un fichier d'une archive zip (répertoire central), en texte.
function unzipText(buf, wanted) {
  let e = buf.length - 22;
  while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < buf.readUInt16LE(e + 10); i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return '';
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => window.FTLayout.setCapitalize(false));
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const para = (n) => '<p>' + LOREM.repeat(n) + '</p>';
  const reset = async (html, settings = {}) => {
    await page.evaluate(([h, s]) => {
      window.FTEditor.load({ content: { html: h }, settings: s });
      document.getElementById('page').hidden = false;
    }, [html, settings]);
    await page.waitForTimeout(200);
  };
  const saved = () => page.evaluate(() => window.FTEditor.getHtml().replace(/src="[^"]*"/g, 'src=""'));
  // Image de test (dessinée dans la page) insérée au curseur.
  const insert = (w = 320, h = 200, at = null) => page.evaluate(([w, h, at]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#7fa7c9'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, 7); g.fill();
    const el = window.FTLayout.makeImage(window.FTLayout.imageUrl(c.toDataURL('image/png')), w);
    el.style.width = Math.min(50, parseFloat(el.style.width)) + '%';
    return window.FTImages.insert(el, at);
  }, [w, h, at]);
  const caretIn = (sel, offset) => page.evaluate(([s, o]) => {
    const p = document.querySelector(s);
    const t = p.firstChild;
    const r = document.createRange();
    r.setStart(t, o); r.collapse(true);
    const ds = getSelection(); ds.removeAllRanges(); ds.addRange(r);
    document.getElementById('editor').focus();
  }, [sel, offset]);

  await reset(para(4) + para(3) + para(5));
  await caretIn('#editor > p:nth-child(2)', 5);
  await page.waitForTimeout(100);
  await insert();
  await page.waitForTimeout(400);
  let html = await saved();
  assert(/<p><span class="ft-image"[^>]*data-wrap="gauche"/.test(html), 'image libre accrochée au début du paragraphe');
  ok('insertion : déplacement libre, au début de la ligne du curseur');
  const bar = await page.locator('#image-tools').boundingBox();
  assert(bar, 'barre affichée');
  await page.screenshot({ path: SHOTS + '/barre-image.png', clip: { x: Math.max(0, bar.x - 260), y: Math.max(0, bar.y - 20), width: Math.min(900, bar.width + 400), height: 420 } });
  await page.click('#image-tools button[data-act="encadrage"]');
  await page.waitForTimeout(150);
  await page.click('#image-frame-pop .seg button:has-text("Dessous")');
  await page.waitForTimeout(150);
  await page.click('#image-frame-pop .seg button:has-text("Plein")');
  await page.waitForTimeout(150);
  assert(!(await page.locator('#image-frame-pop').isHidden()), 'le mini-menu reste ouvert après un changement');
  html = await saved();
  assert(/data-caption="bas"/.test(html) && /data-frame="plein"/.test(html), 'légende et cadre posés');
  await page.evaluate(() => { const c = document.querySelector('#editor .ft-image .ft-caption'); c.textContent = 'Vue d\'ensemble du projet'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: SHOTS + '/encadrage.png', clip: { x: 360, y: 300, width: 940, height: 550 } });
  ok('encadrage : légende dessous et cadre plein, mini-menu ouvert');
  await page.click('#image-frame-pop .pop-done');
  assert(await page.locator('#image-frame-pop').isHidden(), 'Terminé ferme le mini-menu');
  ok('encadrage : Terminé ferme le mini-menu');
  // (État pour la suite.)
  const info = () => page.evaluate(() => {
    const el = document.querySelector('#editor .ft-image');
    const r = el.getBoundingClientRect();
    const a = {};
    for (const at of el.attributes) a[at.name] = at.value;
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, a, parent: el.parentElement.tagName, idx: [...el.parentElement.parentElement.children].indexOf(el.parentElement) };
  });
  const undoDepth = () => page.evaluate(() => window.FTMoteur.undoDepth());
  const drag = async (x, y, dx, dy, steps = 6) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps); await page.waitForTimeout(30); }
    await page.mouse.up();
    await page.waitForTimeout(200);
  };

  await reset(para(4) + para(3) + para(5));
  await caretIn('#editor > p:nth-child(2)', 5);
  await insert();
  await page.waitForTimeout(300);
  let i0 = await info();
  let d0 = await undoDepth();
  await drag(i0.l + 40, i0.t + 40, 300, 120);
  let i1 = await info();
  await page.screenshot({ path: SHOTS + '/libre-deplacee.png' });
  assert.equal(i1.a['data-wrap'], 'droite', 'déplacée à droite : le texte passe à gauche');
  assert(Math.abs(i1.t - (i0.t + 120)) < 30, 'haut de l\'image suit la souris (' + (i1.t - i0.t) + ')');
  assert.equal(await undoDepth(), d0 + 1, 'un geste = une étape');
  ok('libre : déplacée à la souris, texte de l\'autre côté, une étape d\'annulation');

  // Sous la fin du texte : lignes vides créées ; remontée : elles disparaissent.
  const paras = () => page.evaluate(() => document.querySelectorAll('#editor > p').length);
  await reset(para(2) + para(1));
  await caretIn('#editor > p:nth-child(1)', 3);
  await insert(200, 120);
  await page.waitForTimeout(300);
  i0 = await info();
  const n0 = await paras();
  await drag(i0.l + 20, i0.t + 20, 40, 380);
  i1 = await info();
  const n1 = await paras();
  await page.screenshot({ path: SHOTS + '/sous-le-texte.png' });
  assert(n1 > n0, 'lignes vides créées sous le texte');
  assert(Math.abs(i1.t - (i0.t + 380)) < 40, 'image posée sous le texte, à l\'endroit visé (' + (i1.t - i0.t) + ')');
  await drag(i1.l + 20, i1.t + 20, 0, -(i1.t - i0.t));
  const n2 = await paras();
  assert.equal(n2, n0, 'remontée : les lignes vides restées vides sont retirées');
  ok('libre : sous le texte, lignes vides créées puis retirées en remontant');

  // Déplacement par ligne : entre deux lignes d'un paragraphe (coupé), puis ailleurs (recollé).
  await reset(para(4) + para(3) + para(5));
  await caretIn('#editor > p:nth-child(1)', 3);
  await insert(300, 150);
  await page.waitForTimeout(300);
  await page.click('#image-tools button[data-act="ligne"]');
  await page.waitForTimeout(200);
  html = await saved();
  assert(/^<span class="ft-image"[^>]*>/.test(html) && !/data-wrap/.test(html), 'par ligne : bloc avant le paragraphe');
  i0 = await info();
  const p3 = await page.evaluate(() => { const r = document.querySelector('#editor > p:nth-of-type(3)').getBoundingClientRect(); return { t: r.top, b: r.bottom }; });
  // Vers le milieu du troisième paragraphe.
  await drag(i0.l + 30, i0.t + 30, 0, (p3.t + p3.b) / 2 - (i0.t + 30));
  html = await saved();
  await page.screenshot({ path: SHOTS + '/par-ligne.png' });
  assert.equal(await page.evaluate(() => window.FTMoteur.view.state.selection.node && window.FTMoteur.view.state.selection.node.type.name), 'image', 'image déposée sélectionnée');
  assert(/data-coupe=""[^>]*>[^<]*<\/p><span class="ft-image"[^>]*><img[^>]*><\/span><p data-suite/.test(html), 'paragraphe coupé autour de l\'image');
  i1 = await info();
  // Au-dessus du deuxième paragraphe (entre deux paragraphes : rien à couper).
  i1 = await info();
  const p2 = await page.evaluate(() => document.querySelector('#editor > p:nth-of-type(2)').getBoundingClientRect().top);
  await drag(i1.l + 30, i1.t + 10, 0, p2 + 4 - (i1.t + 10));
  html = await saved();
  assert(!/data-coupe|data-suite/.test(html), 'image partie : paragraphe recollé');
  ok('par ligne : entre deux lignes (paragraphe coupé), recollé quand l\'image s\'en va');

  // Centrage : libre au niveau du texte.
  await reset(para(4) + para(3) + para(5));
  await caretIn('#editor > p:nth-child(2)', 5);
  await insert(300, 150);
  await page.waitForTimeout(300);
  const col = await page.evaluate(() => { const r = document.querySelector('#editor > p').getBoundingClientRect(); return { l: r.left, r: r.right }; });
  await page.click('#image-tools button[data-act="droite"]');
  await page.waitForTimeout(150);
  i1 = await info();
  assert(Math.abs(i1.r - col.r) < 2 && i1.a['data-wrap'] === 'droite', 'aligné à droite');
  await page.click('#image-tools button[data-act="centre"]');
  await page.waitForTimeout(150);
  i1 = await info();
  assert(Math.abs((i1.l + i1.r) / 2 - (col.l + col.r) / 2) < 3, 'centré (' + ((i1.l + i1.r) / 2 - (col.l + col.r) / 2) + ')');
  await page.click('#image-tools button[data-act="gauche"]');
  await page.waitForTimeout(150);
  i1 = await info();
  assert(Math.abs(i1.l - col.l) < 2, 'aligné à gauche');
  // Écart avec le texte à côté (avant la 2.5.11 : 0 après « Gauche » ou « Droite », le texte touchait l'image).
  const textGap = () => page.evaluate(() => {
    const im = document.querySelector('#editor .ft-image');
    const ir = im.getBoundingClientRect();
    const right = im.getAttribute('data-wrap') === 'droite';
    const w = document.createTreeWalker(im.parentElement, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    let gap = Infinity;
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (im.contains(t)) continue;
      r.selectNodeContents(t);
      for (const c of r.getClientRects()) {
        if (c.bottom < ir.top + 5 || c.top > ir.bottom - 5 || !c.width) continue;
        gap = Math.min(gap, right ? ir.left - c.right : c.left - ir.right);
      }
    }
    return { gap, em: parseFloat(getComputedStyle(im.parentElement).fontSize) };
  });
  let tg = await textGap();
  assert(tg.gap >= 1.4 * tg.em, 'à gauche : texte écarté de l\'image (' + JSON.stringify(tg) + ')');
  await page.click('#image-tools button[data-act="droite"]');
  await page.waitForTimeout(150);
  tg = await textGap();
  assert(tg.gap >= 1.4 * tg.em, 'à droite : texte écarté de l\'image (' + JSON.stringify(tg) + ')');
  await page.click('#image-tools button[data-act="gauche"]');
  await page.waitForTimeout(150);
  ok('centrage : gauche, centre, droite ; le texte à côté reste écarté de l\'image');

  // Superposition : devant le texte, déplacée au pixel près ; derrière ; retour au niveau du texte.
  i0 = await info();
  await page.click('#image-tools button[data-act="devant"]');
  await page.waitForTimeout(200);
  i1 = await info();
  assert.equal(i1.a['data-wrap'], 'devant');
  assert(Math.abs(i1.t - i0.t) < 3 && Math.abs(i1.l - i0.l) < 3, 'devant : l\'image ne bouge pas (' + (i1.t - i0.t) + ', ' + (i1.l - i0.l) + ')');
  d0 = await undoDepth();
  await drag(i1.l + 30, i1.t + 30, 137, 211);
  const i2 = await info();
  assert(Math.abs(i2.t - (i1.t + 211)) < 3 && Math.abs(i2.l - (i1.l + 137)) < 3, 'devant : déplacée au pixel près (' + (i2.t - i1.t) + ', ' + (i2.l - i1.l) + ')');
  assert.equal(await undoDepth(), d0 + 1, 'un geste = une étape');
  await page.screenshot({ path: SHOTS + '/devant.png' });
  await page.click('#image-tools button[data-act="derriere"]');
  await page.waitForTimeout(200);
  let i3 = await info();
  assert(Math.abs(i3.t - i2.t) < 3, 'derrière : même place');
  await page.click('#image-tools button[data-act="niveau"]');
  await page.waitForTimeout(200);
  i3 = await info();
  assert(/gauche|droite/.test(i3.a['data-wrap']), 'retour au niveau du texte');
  ok('superposition : devant (au pixel près), derrière, au niveau du texte');
  // Par ligne : superposition grisée.
  await page.click('#image-tools button[data-act="ligne"]');
  await page.waitForTimeout(200);
  assert(await page.locator('#image-tools button[data-act="devant"]').isDisabled(), 'superposition grisée par ligne');
  ok('superposition grisée en déplacement par ligne');

  // Taille : coin (proportions gardées), côté gauche d'une image libre à droite (le bord droit ne bouge pas).
  await reset(para(4) + para(3));
  await caretIn('#editor > p:nth-child(2)', 5);
  await insert(300, 150);
  await page.waitForTimeout(300);
  await page.click('#image-tools button[data-act="droite"]');
  await page.waitForTimeout(150);
  i0 = await info();
  const g = await page.locator('.ft-img-rz.ft-rz-w').boundingBox();
  d0 = await undoDepth();
  await drag(g.x + g.width / 2, g.y + g.height / 2, -80, 0);
  i1 = await info();
  assert(Math.abs(i1.r - i0.r) < 3 && i1.w > i0.w + 60, 'côté gauche tiré : plus large, bord droit fixe (' + (i1.r - i0.r) + ', ' + (i1.w - i0.w) + ')');
  assert.equal(await undoDepth(), d0 + 1);
  const gc = await page.locator('.ft-img-rz.ft-rz-se').boundingBox();
  await drag(gc.x + gc.width / 2, gc.y + gc.height / 2, -60, -10);
  const i4 = await info();
  assert(Math.abs(i4.w / i4.h - i1.w / i1.h) < 0.05, 'coin : proportions gardées');
  ok('taille : poignées des côtés et des coins, une étape par geste');

  // Annuler : retour à l'état d'avant le geste.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  i3 = await info();
  assert(Math.abs(i3.w - i1.w) < 2, 'Ctrl+Z défait la dernière taille');
  ok('annulation d\'un geste en une fois');

  // Ancrage fixe : du texte ajouté avant l'image, elle reste à sa place sur la page (le texte s'écoule autour).
  const mountTop = () => page.evaluate(() => document.getElementById('editor').getBoundingClientRect().top);
  for (const move of ['libre', 'ligne', 'devant']) {
    await reset(para(4) + para(3) + para(5) + para(4));
    await caretIn('#editor > p:nth-child(2)', 5);
    await insert(300, 150);
    await page.waitForTimeout(300);
    if (move !== 'libre') await page.click(`#image-tools button[data-act="${move}"]`);
    await page.waitForTimeout(200);
    await page.click('#image-tools button[data-act="fixe"]');
    await page.waitForTimeout(200);
    i0 = await info();
    const m0 = await mountTop();
    assert(i0.a['data-anchor'] === 'page' && i0.a['data-page'] === '1', 'ancrage fixe posé (' + move + ')');
    await caretIn('#editor > p:nth-child(1)', 0);
    await page.keyboard.type('Nouvelle ligne ajoutée au début. ');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Une autre ligne.');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    i1 = await info();
    const m1 = await mountTop();
    assert(Math.abs((i1.t - m1) - (i0.t - m0)) < 8, 'fixe (' + move + ') : même hauteur sur la page (' + ((i1.t - m1) - (i0.t - m0)) + ')');
    if (move === 'devant') assert(Math.abs(i1.l - i0.l) < 3, 'fixe devant : même place');
    await page.screenshot({ path: SHOTS + '/fixe-' + move + '.png' });
    // Annuler la frappe : l'image revient aussi.
  }
  ok('ancrage fixe : l\'image reste à sa place quand le texte avant elle change (libre, par ligne, devant)');

  // Mode avancé (pages) : une image passe d'une page à l'autre ; jamais à cheval sur deux pages.
  const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0)); f(n); }), n);
  await reset(para(4).repeat(10), { mode: 'avance' });
  await frames();
  // Page de l'image (à partir de 0) et image entière dans la zone de texte de cette page.
  const sheetOf = () => page.evaluate(() => {
    const V = window.FTVisibles;
    const m = document.getElementById('editor');
    const k = m.currentCSSZoom || 1;
    const mt = m.getBoundingClientRect().top;
    const r = document.querySelector('#editor .ft-image').getBoundingClientRect();
    const top = (r.top - mt) / k;
    const bottom = (r.bottom - mt) / k;
    const p = V.pageOfY(top);
    const f = V.pageFrame(p);
    return { i: p, inside: top >= f.ct - 1 && bottom <= f.cb + 1, top, bottom, f };
  });
  const scrollTo = (y) => page.evaluate((y) => { document.getElementById('workspace').scrollTop += y; }, y);
  await caretIn('#editor > p:nth-child(5)', 5);
  await insert(300, 180);
  await frames();
  let sh = await sheetOf();
  assert(sh.inside && sh.i === 0, 'image dans sa page : ' + JSON.stringify(sh));
  // Glissée tout en bas de la page 1, où elle ne tient pas : elle remonte et reste entière sur la page 1,
  // son bas au bas de la page (et non reportée à la page suivante).
  i0 = await info();
  await scrollTo(i0.t - 300);
  await frames();
  i0 = await info();
  const b0 = await page.evaluate(() => { const m = document.getElementById('editor'); const k = m.currentCSSZoom || 1; return m.getBoundingClientRect().top + window.FTVisibles.pageFrame(0).cb * k; });
  const html0 = await saved();
  d0 = await undoDepth();
  await drag(i0.l + 20, i0.t + 20, 120, b0 - 60 - i0.t);
  await frames(6);
  sh = await sheetOf();
  assert(sh.inside && sh.i === 0 && sh.bottom > sh.f.cb - 60, 'image restée en bas de la page 1, entière : ' + JSON.stringify(sh));
  assert.equal(await undoDepth(), d0 + 1, 'dépôt et correction : une seule étape');
  await page.keyboard.press('Control+z');
  await frames(4);
  assert.equal(await saved(), html0, 'Ctrl+Z : image revenue à sa place');
  await page.keyboard.press('Control+y');
  await frames(6);
  ok('pages : glissée en bas de page où elle ne tient pas, elle remonte et reste sur cette page');
  // Glissée en haut de la page 2 : elle y passe.
  i0 = await info();
  await scrollTo(i0.t - 300);
  await frames();
  i0 = await info();
  const t1 = await page.evaluate(() => { const m = document.getElementById('editor'); const k = m.currentCSSZoom || 1; return m.getBoundingClientRect().top + window.FTVisibles.pageFrame(1).ct * k; });
  await drag(i0.l + 20, i0.t + 10, 0, t1 + 12 - i0.t);
  await frames(6);
  sh = await sheetOf();
  assert(sh.inside && sh.i === 1 && sh.top < sh.f.ct + 80, 'image passée en haut de la page 2 : ' + JSON.stringify(sh));
  ok('pages : glissée en haut de la page suivante, elle y passe');
  i0 = await info();
  await scrollTo(i0.t - 450);
  await frames();
  await page.screenshot({ path: SHOTS + '/page-2.png' });
  i0 = await info();
  await scrollTo(i0.t - 650);
  await frames();
  await page.screenshot({ path: SHOTS + '/entre-deux-pages.png' });
  i0 = await info();
  await drag(i0.l + 20, i0.t + 20, -60, -520);
  await frames(6);
  sh = await sheetOf();
  assert(sh.inside && sh.i === 0, 'retour sur la page 1 : ' + JSON.stringify(sh));
  ok('pages : retour sur la page précédente');

  // Par ligne, pages : glissée en bas de la page 1 où elle ne tient pas, elle remonte et y reste.
  await reset(para(4).repeat(10), { mode: 'avance' });
  await frames();
  await caretIn('#editor > p:nth-child(4)', 5);
  await insert(300, 180);
  await frames();
  await page.click('#image-tools button[data-act="ligne"]');
  await frames();
  const pageBottom = () => page.evaluate(() => { const m = document.getElementById('editor'); const k = m.currentCSSZoom || 1; return m.getBoundingClientRect().top + window.FTVisibles.pageFrame(0).cb * k; });
  await scrollTo((await pageBottom()) - 760);
  await frames();
  i0 = await info();
  const b1 = await pageBottom();
  await drag(i0.l + 20, i0.t + 20, 0, b1 - 30 - (i0.t + 20));
  await frames(6);
  sh = await sheetOf();
  assert(sh.inside && sh.i === 0 && sh.bottom > sh.f.cb - 90, 'par ligne : restée en bas de la page 1 : ' + JSON.stringify(sh));
  ok('pages, par ligne : glissée en bas de page où elle ne tient pas, elle remonte et reste sur cette page');
  // Par ligne, sous la fin du texte : des lignes vides jusqu'à l'endroit visé.
  await reset(para(2) + para(1));
  await caretIn('#editor > p:nth-child(1)', 3);
  await insert(200, 120);
  await frames();
  await page.click('#image-tools button[data-act="ligne"]');
  await frames();
  i0 = await info();
  const bottom = await page.evaluate(() => { const ps = document.querySelectorAll('#editor > p'); return ps[ps.length - 1].getBoundingClientRect().bottom; });
  await drag(i0.l + 20, i0.t + 20, 0, bottom + 160 - i0.t);
  await frames(4);
  i1 = await info();
  html = await saved();
  assert(/data-ligne-image/.test(html) && Math.abs(i1.t - (bottom + 140)) < 40, 'par ligne : posée sous le texte, à l\'endroit visé (' + (i1.t - bottom) + ')');
  const p2top = await page.evaluate(() => document.querySelector('#editor > p:nth-of-type(2)').getBoundingClientRect().top);
  await drag(i1.l + 20, i1.t + 20, 0, p2top + 3 - (i1.t + 20));
  html = await saved();
  assert(!/data-ligne-image/.test(html), 'remontée : lignes vides retirées ' + html.replace(/Lorem[^<]*/g, 'L'));
  ok('par ligne : sous la fin du texte, lignes vides créées puis retirées en remontant');

  // Libre, pages : image en haut d'une page gardée (data-pg-start), la page d'avant finit par un tableau et un
  // bas de page blanc. Glissée dans ce blanc, elle y reste (avant la 2.5.10 : renvoyée à la page suivante).
  await reset(para(4) + para(3) + '<table class="ft-table"><tbody><tr><td>Figure 1. Légende en tableau</td></tr></tbody></table>'
    + '<p data-pg-start="essai1">' + LOREM.repeat(8) + '</p>' + para(4), { mode: 'avance' });
  await frames(4);
  await page.evaluate(() => document.querySelector('#editor > p[data-pg-start]').scrollIntoView({ block: 'center' }));
  await frames(4);
  await caretIn('#editor > p[data-pg-start]', 0);
  await insert(300, 180);
  await frames(6);
  sh = await sheetOf();
  assert.equal(sh.i, 1, 'image en haut de la page 2 : ' + JSON.stringify(sh));
  const keptLines = () => page.evaluate(() => window.FTDecoupage.linesOf(document.querySelector('#editor > p[data-pg-start]')).length);
  const keptPage = () => page.evaluate(() => {
    const m = document.getElementById('editor');
    const k = m.currentCSSZoom || 1;
    const r = document.querySelector('#editor > p[data-pg-start]').getBoundingClientRect();
    return window.FTVisibles.pageOfY((r.top - m.getBoundingClientRect().top) / k + 2);
  });
  // (Page 1 et haut de la page 2 visibles ensemble.)
  await page.setViewportSize({ width: 1300, height: 1400 });
  await page.evaluate(() => window.FTZoom.set(60));
  await frames(6);
  i0 = await info();
  await scrollTo(i0.t - 600);
  await frames(4);
  i0 = await info();
  const html1 = await saved();
  d0 = await undoDepth();
  const tableBottom = await page.evaluate(() => document.querySelector('#editor > table').getBoundingClientRect().bottom);
  await drag(i0.l + 20, i0.t + 20, 0, tableBottom + 60 - i0.t);
  await frames(6);
  sh = await sheetOf();
  html = await saved();
  assert(sh.inside && sh.i === 0, 'image remontée dans le blanc de la page 1 : ' + JSON.stringify(sh));
  assert(/<p data-ligne-image="seule"><span class="ft-image"/.test(html), "ligne vide créée sous le tableau pour elle " + html.replace(/(Lorem[^<]{0,20})[^<]*/g, '$1'));
  i1 = await info();
  assert(Math.abs(i1.t - (tableBottom + 60)) < 25, 'à la hauteur visée (' + (i1.t - tableBottom - 60) + ')');
  assert.equal(await keptPage(), 1, 'le paragraphe gardé reste en haut de la page 2');
  const linesWithout = await keptLines();
  await page.screenshot({ path: SHOTS + '/blanc-de-page.png' });
  assert.equal(await undoDepth(), d0 + 1, 'un geste = une étape');
  await page.keyboard.press('Control+z');
  await frames(4);
  assert.equal(await saved(), html1, 'Ctrl+Z : image revenue en haut de la page 2');
  await page.keyboard.press('Control+y');
  await frames(6);
  // Le texte de la page 2 n'est plus habillé par l'image restée sur la page 1 (pas de coupure trop tôt).
  const sheet2 = await page.evaluate(() => {
    const m = document.getElementById('editor');
    const k = m.currentCSSZoom || 1;
    const r = document.querySelector('#editor > p[data-pg-start]').getBoundingClientRect();
    return { bottom: (r.bottom - m.getBoundingClientRect().top) / k, f: window.FTVisibles.pageFrame(1) };
  });
  assert(sheet2.bottom <= sheet2.f.cb + 1, 'paragraphe gardé entier sur la page 2 : ' + JSON.stringify(sheet2) + ' lignes ' + linesWithout);
  ok('pages, libre : glissée dans le bas blanc d\'une page (suite gardée à la page suivante), elle y reste');
  // Retour en haut de la page 2 : la ligne vide créée pour elle est retirée.
  i0 = await info();
  const p2t = await page.evaluate(() => document.querySelector('#editor > p[data-pg-start]').getBoundingClientRect().top);
  await drag(i0.l + 20, i0.t + 20, 0, p2t + 4 - i0.t);
  await frames(6);
  sh = await sheetOf();
  html = await saved();
  assert(sh.i === 1 && !/data-ligne-image/.test(html), 'revenue en page 2, ligne vide retirée : ' + JSON.stringify(sh));
  ok('pages, libre : revenue sur la page suivante, la ligne vide créée pour elle est retirée');
  await page.evaluate(() => window.FTZoom.set(100));
  await page.setViewportSize({ width: 1300, height: 850 });
  await frames(4);

  // Libre, même page : lâchée dans un grand espace vide entre deux paragraphes, une ligne y est créée pour elle
  // (elle ne part pas habiller le paragraphe d'après).
  await reset(para(2) + '<p style="margin-top: 320px;">' + LOREM.repeat(3) + '</p>' + para(2));
  await caretIn('#editor > p:nth-child(1)', 3);
  await insert(200, 100);
  await frames(4);
  i0 = await info();
  const gapTop = await page.evaluate(() => document.querySelectorAll('#editor > p')[0].getBoundingClientRect().bottom);
  await drag(i0.l + 20, i0.t + 20, 0, gapTop + 120 - i0.t);
  await frames(4);
  i1 = await info();
  html = await saved();
  assert(/<p data-ligne-image="seule"><span class="ft-image"/.test(html), 'ligne créée dans l\'espace vide ' + html.replace(/(Lorem[^<]{0,20})[^<]*/g, '$1'));
  assert(Math.abs(i1.t - (gapTop + 120)) < 25, 'à la hauteur visée (' + (i1.t - gapTop - 120) + ')');
  ok('libre : lâchée dans un espace vide entre deux paragraphes, une ligne est créée pour elle');

  // Anciens documents (versions 1.6 à 2.4) : ouverts sans rien perdre.
  const IMG = (attrs) => `<span class="ft-image" contenteditable="false" ${attrs}><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt=""></span>`;
  await reset('<p>Un.</p>' + IMG('data-wrap="gauche" data-pos="fixe" style="width: 30%;"') + '<p>Deux deux deux.</p>'
    + '<p data-coupe="">Trois début</p>' + IMG('data-wrap="droite" style="width: 20%; --mx: 12px;"') + '<p data-suite="">et fin.</p>'
    + IMG('data-align="libre" style="width: 40%; --ml: 58%;"')
    + IMG('data-wrap="devant" data-pos="rigide" style="width: 20%; --x: 30px; --y: 10px;"') + '<p>Quatre.</p>'
    + IMG('data-wrap="derriere" data-anchor="page" style="width: 20%; --x: 40px; --y: 300px;"'));
  html = await saved();
  assert(/<p><span class="ft-image"[^>]*data-wrap="gauche"[^>]*>.*?<\/span>Deux/.test(html), 'image libre entre deux blocs : accrochée au paragraphe suivant');
  assert(!/data-pos/.test(html), 'mouvement fixe / position rigide retirés');
  assert(/<p>Trois début<span class="ft-image"[^>]*data-wrap="droite"[^>]*>.*?<\/span>et fin\.<\/p>/.test(html), 'paragraphe coupé autour d\'une image libre : recollé');
  assert(/data-align="droite"/.test(html) && !/--ml/.test(html), 'centrage libre des versions d\'avant : le plus proche (droite)');
  assert(/<p><span class="ft-image"[^>]*data-wrap="devant"[^>]*>.*?<\/span>Quatre/.test(html), 'devant le texte : accrochée au paragraphe suivant');
  assert(/Quatre\.<span class="ft-image"[^>]*data-wrap="derriere"/.test(html) && /data-anchor="page"/.test(html), 'fixe sur la page (ancien), en fin de texte : accrochée au dernier paragraphe');
  await page.waitForTimeout(400);
  const legacy = await page.evaluate(() => {
    const el = document.querySelector('#editor .ft-image[data-wrap="derriere"]');
    const m = document.getElementById('editor').getBoundingClientRect();
    return { page: el.getAttribute('data-page'), top: el.getBoundingClientRect().top - m.top };
  });
  assert(legacy.page === '1' && Math.abs(legacy.top - 300) < 3, 'fixé sur la page (ancien) : converti, même place ' + JSON.stringify(legacy));
  ok('anciens documents : images libres accrochées, paragraphes recollés, réglages retirés');

  // Collage d'un texte avec des images (page web, Word) : images gardées, à leur place, au bon format.
  const fs = require('fs');
  const path = require('path');
  const pngFile = path.join(require('os').tmpdir(), 'ft-essai-image-collee.png');
  const pngData = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 240; c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#2e86c1'; g.fillRect(0, 0, 240, 120); return c.toDataURL('image/png'); });
  fs.writeFileSync(pngFile, Buffer.from(pngData.split(',')[1], 'base64'));
  const fileUrl = require('url').pathToFileURL(pngFile).href;
  await reset('<p>Début du document.</p>');
  await caretIn('#editor > p', 18);
  const pasted = `<p>Texte avant.</p><p style="text-align:center"><img src="${pngData}" width="300" height="150"></p>`
    + `<p><img src="${fileUrl}" style="float:right" width="200">Paragraphe avec une image flottante venue de Word, qui passe à côté du texte. ${LOREM}</p>`
    + `<p>Une icône <img src="${pngData}" width="16" height="16"> dans la ligne.</p><p>Image perdue <img src="https://invalide.example/x.png"> retirée.</p>`;
  await page.evaluate(([html]) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', 'Texte avant.\nParagraphe avec une image\nUne icône dans la ligne.\nImage perdue retirée.');
    document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [pasted]);
  await page.waitForSelector('#paste-dialog[open]', { timeout: 15000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: SHOTS + '/collage-apercu.png' });
  await page.click('#ps-ok');
  await page.waitForTimeout(400);
  html = await saved();
  assert(/<\/p><span class="ft-image"[^>]*style="width: \d+%;"[^>]*><img[^>]*><\/span><p>/.test(html) && !/<span class="ft-image"[^>]*data-align[^>]*><img src=""[^>]*><\/span><p><span/.test(html.slice(0, 0)), 'image seule dans son paragraphe centré : par ligne, centrée ' + html);
  assert(/<p><span class="ft-image"[^>]*data-wrap="droite"[^>]*><img[^>]*><\/span>Paragraphe avec/.test(html), 'image flottante (fichier de Word) : libre, à droite ' + html);
  assert(/icône <span class="ft-image"[^>]*data-wrap="ligne"/.test(html), 'icône : dans la ligne du texte');
  assert(/Image perdue  ?retirée|Image perdue retirée/.test(html), 'image illisible retirée');
  assert.equal((html.match(/class="ft-image/g) || []).length, 3, 'trois images');
  ok('collage d\'un texte avec images : image centrée entre deux paragraphes, image flottante à droite, icône dans la ligne');

  // Exports : Word (image libre à droite, écartée du bord ; légende « Fig. 1 »), EPUB (feuille de style), PDF.
  await reset(para(3) + para(3));
  await caretIn('#editor > p:nth-child(2)', 5);
  await insert(300, 150);
  await page.waitForTimeout(300);
  i0 = await info();
  await drag(i0.l + 30, i0.t + 30, 260, 0);
  await page.click('#image-tools button[data-act="encadrage"]');
  await page.click('#image-frame-pop .seg button:has-text("Dessous")');
  await page.click('#image-frame-pop .seg button:has-text("Fig. 1")');
  await page.click('#image-frame-pop .pop-done');
  await page.keyboard.type('Une légende');
  await page.waitForTimeout(300);
  html = await saved();
  assert(/data-wrap="droite"/.test(html) && /--mx: [1-9]/.test(html), 'libre à droite, écartée du bord ' + html.slice(0, 300));
  const docXml = unzipText(Buffer.from(await page.evaluate(async () => Array.from(await window.FTWord.exportWord()))), 'word/document.xml');
  assert(/<wp:anchor[\s\S]*?<wp:positionH relativeFrom="column"><wp:posOffset>\d+<\/wp:posOffset>/.test(docXml), 'Word : image flottante placée à la même distance du bord');
  assert(/<w:t[^>]*>Fig\. 1 : <\/w:t>/.test(docXml), 'Word : légende « Fig. 1 : »');
  ok('Word : image libre écartée du bord, légende numérotée selon son style');
  const epubCss = await page.evaluate(() => window.FTEpub.stylesheet());
  assert(/data-wrap="droite"\] \{ float: right/.test(epubCss), 'EPUB : images à côté du texte');
  const job = await page.evaluate(() => window.FTPdf.build());
  assert(/data-wrap="droite"/.test(job.html) && /--mx/.test(job.html), 'PDF : image libre gardée telle quelle');
  ok('EPUB et PDF : images à côté du texte gardées');

  // Clic droit : les mêmes réglages, la largeur, l'encadrage.
  i0 = await info();
  await page.mouse.click(i0.l + 20, i0.t + 20, { button: 'right' });
  await page.waitForTimeout(150);
  const labels = await page.evaluate(() => [...document.querySelectorAll('.context-menu:not([hidden]) .menu-label')].map((l) => l.textContent));
  assert.deepStrictEqual(labels.slice(0, 5), ['Déplacement', 'Ancrage', 'Centrage', 'Superposition', 'Largeur'], labels.join());
  await page.click('.context-menu:not([hidden]) button:has-text("Encadrage…")');
  await page.waitForTimeout(150);
  assert(!(await page.locator('#image-frame-pop').isHidden()), 'mini-menu ouvert');
  await page.mouse.click(5, 400);
  await page.waitForTimeout(100);
  assert(await page.locator('#image-frame-pop').isHidden(), 'clic ailleurs : mini-menu fermé');
  await page.mouse.click(i0.l + 20, i0.t + 20, { button: 'right' });
  await page.waitForTimeout(150);
  await page.click('.context-menu:not([hidden]) .menu-icons button[title="Derrière le texte"]');
  await page.waitForTimeout(200);
  assert.equal((await info()).a['data-wrap'], 'derriere');
  ok('clic droit : déplacement, ancrage, centrage, superposition, largeur, encadrage ; clic ailleurs ferme le mini-menu');
};
