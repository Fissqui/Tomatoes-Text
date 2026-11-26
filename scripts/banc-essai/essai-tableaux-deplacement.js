// Tableaux déplacés comme les images, débord sur les marges à côté du texte, pages en paysage (2.5.22).
// - Saisi par sa poignée, un tableau se déplace comme une image : le texte ne bouge pas pendant le geste (le
//   tableau reste pâli à sa place, un double suit la souris, un trait montre où il ira par ligne) ; par
//   ligne, il peut aller entre deux lignes d'un paragraphe (coupé, recollé quand il s'en va) ; en bas d'une
//   page où il ne tient pas, il remonte au lieu d'être coupé ou reporté ; sous la fin du texte, des lignes
//   vides vont jusque-là ; libre, il va dans le bas blanc d'une page et y reste. Un geste = une étape.
// - À côté du texte (déplacement libre), un tableau peut déborder sur la marge de son côté (bouton, poignée).
// - Sur une page en paysage, un tableau prend la largeur de la page (largeur choisie en % comprise, débord
//   compris), aussi quand il continue sur d'autres pages en paysage.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-tableaux-deplacement.js
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => window.FTLayout.setCapitalize(false));
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const para = (n) => '<p>' + LOREM.repeat(n) + '</p>';
  const TABLE = (extra = '', n = 4, cols = '<td>a</td><td>b</td><td>c</td>') => `<table class="ft-table" id="mv"${extra}><tbody>` + `<tr>${cols}</tr>`.repeat(n) + '</tbody></table>';
  const reset = async (html, settings = {}) => {
    await page.evaluate(([h, s]) => { window.FTEditor.load({ content: { html: h }, settings: s }); document.getElementById('page').hidden = false; }, [html, settings]);
    await page.waitForTimeout(300);
  };
  const frames = (n = 3) => page.evaluate((n) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0)); f(n); }), n);
  const saved = () => page.evaluate(() => window.FTEditor.getHtml().replace(/(Lorem[^<]{0,12})[^<]*/g, '$1').replace(/<tbody>.*?<\/tbody>/g, '…'));
  const undoDepth = () => page.evaluate(() => PM.history.undoDepth(window.FTMoteur.view.state));
  const tbox = (sel = '#editor > #mv') => page.evaluate((sel) => {
    const t = document.querySelector(sel);
    const r = t.getBoundingClientRect();
    const m = document.getElementById('editor');
    const k = m.currentCSSZoom || 1;
    const mt = m.getBoundingClientRect().top;
    const V = window.FTVisibles;
    const paged = window.FTPages.isPaged();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, page: paged ? V.pageOfY((r.top - mt) / k + 2) : 0, pageEnd: paged ? V.pageOfY((r.bottom - mt) / k - 2) : 0 };
  }, sel);
  const grab = async (sel) => {
    const b = await tbox(sel);
    await page.mouse.move(b.l + 30, b.t + 5);
    await frames(2);
    const h = await page.locator('#block-handle').boundingBox();
    assert(h, 'poignée affichée');
    return h;
  };
  // Glisser de la poignée jusqu'à (x, y) ; during(ev) : mesures pendant le geste, avant de lâcher.
  const drag = async (from, x, y, during) => {
    const x0 = from.x + 5;
    const y0 = from.y + 5;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x0 + ((x - x0) * i) / 8, y0 + ((y - y0) * i) / 8); await page.waitForTimeout(35); }
    await frames(2);
    const out = during ? await during() : null;
    await page.mouse.up();
    await frames(8);
    return out;
  };
  const pageBottom = (i) => page.evaluate((i) => { const m = document.getElementById('editor'); const f = window.FTVisibles.pageFrame(i); return m.getBoundingClientRect().top + f.cb * (m.currentCSSZoom || 1); }, i);
  await page.setViewportSize({ width: 1300, height: 1400 });

  // 1. Par ligne, au milieu d'un paragraphe : le texte ne bouge pas pendant le geste ; double et trait.
  await reset(para(4) + para(3) + TABLE() + para(5) + para(6) + para(6), { mode: 'avance' });
  await page.evaluate(() => window.FTZoom.set(60));
  await frames(8);
  let hb = await grab();
  let d0 = await undoDepth();
  const p1 = await page.evaluate(() => { const r = document.querySelector('#editor > p').getBoundingClientRect(); return { t: r.top, h: r.height }; });
  const textBefore = await page.evaluate(() => [...document.querySelectorAll('#editor > p')].map((p) => Math.round(p.getBoundingClientRect().top)).join());
  const mid = await drag(hb, hb.x, p1.t + p1.h / 2, () => page.evaluate(() => ({
    ghost: !!document.querySelector('#page > .ft-box-ghost table'),
    dim: getComputedStyle(document.querySelector('#editor > #mv')).opacity,
    mark: !document.querySelector('.ft-img-mark').hidden,
    tops: [...document.querySelectorAll('#editor > p')].map((p) => Math.round(p.getBoundingClientRect().top)).join()
  })));
  assert(mid.ghost && mid.mark && Number(mid.dim) < 0.5, 'double, trait, tableau pâli : ' + JSON.stringify(mid));
  assert.strictEqual(mid.tops, textBefore, 'le texte ne bouge pas pendant le geste');
  let html = await saved();
  assert(/^<p data-coupe="">Lorem ipsum dolor<\/p><table class="ft-table" id="mv">…<\/table><p data-suite="">/.test(html), 'entre deux lignes du premier paragraphe : ' + html);
  assert.strictEqual(await undoDepth(), d0 + 1, 'un geste = une étape');
  ok('par ligne : texte immobile pendant le geste (double, trait), posé entre deux lignes d\'un paragraphe');
  // Ressorti du paragraphe : les deux morceaux se recollent.
  hb = await grab();
  const p3 = await page.evaluate(() => document.querySelector('#editor > p:nth-of-type(4)').getBoundingClientRect().top);
  await drag(hb, hb.x, p3 - 2);
  html = await saved();
  assert(!/data-coupe|data-suite/.test(html) && /^<p>Lorem ipsum dolor<\/p><p>Lorem ipsum dolor<\/p><table/.test(html), 'paragraphe recollé : ' + html);
  ok('par ligne : ressorti, le paragraphe coupé se recolle');

  // 2. Par ligne, en bas de page : un tableau qui tient sur une page remonte au lieu d'être coupé.
  hb = await grab();
  const pb = await pageBottom(0);
  await drag(hb, hb.x, pb - 30);
  let b = await tbox();
  assert(b.page === 0 && b.pageEnd === 0, 'entier sur la page 1 : ' + JSON.stringify(b));
  ok('par ligne : visé en bas de page, il remonte et reste entier sur la page');
  // Plus long qu'une page : il se coupe là où il est posé (comme dans Word).
  await reset(para(4) + para(3) + TABLE('', 70) + para(3), { mode: 'avance' });
  await page.evaluate(() => window.FTZoom.set(60));
  await frames(8);
  hb = await grab();
  const p2 = await page.evaluate(() => { const r = document.querySelector('#editor > p:nth-of-type(2)').getBoundingClientRect(); return r.top + 3; });
  await drag(hb, hb.x, p2);
  b = await tbox();
  html = await saved();
  assert(/^<p>Lorem ipsum dolor<\/p><table/.test(html) && b.page === 0 && b.pageEnd > 0, 'long tableau posé à la place visée, coupé : ' + html + JSON.stringify(b));
  ok('par ligne : plus long qu\'une page, posé à la place visée et coupé sur les pages suivantes');

  // 3. Sous la fin du texte : lignes vides jusque-là (par ligne et libre), retirées quand il remonte.
  for (const wrap of ['', ' data-wrap="gauche" style="width: 40%"']) {
    await reset(para(4) + TABLE(wrap) + para(3), { mode: 'avance' });
    await page.evaluate(() => window.FTZoom.set(60));
    await frames(8);
    hb = await grab();
    const end = await page.evaluate(() => document.querySelector('#editor > p:last-of-type').getBoundingClientRect().bottom);
    await drag(hb, hb.x, end + 120);
    b = await tbox();
    html = await saved();
    assert(/data-ligne-image=""/.test(html) && Math.abs(b.t - (end + 120)) < 40, 'lignes vides jusqu\'à la hauteur visée : ' + JSON.stringify(b) + ' ' + (end + 120));
    hb = await grab();
    const top = await page.evaluate(() => document.querySelector('#editor > p').getBoundingClientRect().top);
    await drag(hb, hb.x, top + 2);
    html = await saved();
    assert(!/data-ligne-image/.test(html), 'lignes vides retirées en remontant : ' + html);
  }
  ok('sous la fin du texte : lignes vides jusqu\'à la hauteur visée (par ligne et libre), retirées en remontant');

  // 4. Bas de page blanc (la suite est gardée en haut de la page 2) : le tableau y reste, par ligne et libre ;
  //    libre, le paragraphe de la page 2 n'est pas coupé trop tôt (mesuré sans être habillé par le tableau).
  for (const wrap of ['', ' data-wrap="gauche" style="width: 45%"']) {
    await reset(para(4) + para(3) + '<table class="ft-table"><tbody><tr><td>Autre tableau</td></tr></tbody></table>' + TABLE(wrap) + '<p data-pg-start="e1">' + LOREM.repeat(40) + '</p>' + para(4), { mode: 'avance' });
    await page.evaluate(() => window.FTZoom.set(60));
    await frames(8);
    const breakOf = () => page.evaluate(() => {
      const p = document.querySelector('#editor > p[data-pg-start]');
      const gap = p.querySelector('.ft-pg-gap');
      return gap ? Math.round(gap.getBoundingClientRect().top) : null;
    });
    const kept = await page.evaluate(() => document.querySelector('#editor > p[data-pg-start]').getBoundingClientRect().top);
    hb = await grab();
    await drag(hb, hb.x + 10, kept + 30);
    b = await tbox();
    assert.strictEqual(b.page, 1, 'posé en haut de la page 2');
    const before = await saved();
    const other = await page.evaluate(() => document.querySelector('#editor > table:not(#mv)').getBoundingClientRect().bottom);
    // (Coupure de page dans le paragraphe gardé, quand le tableau n'est pas à côté de lui.)
    hb = await grab();
    d0 = await undoDepth();
    await drag(hb, hb.x + 10, other + 40);
    b = await tbox();
    html = await saved();
    assert(b.page === 0 && b.pageEnd === 0, (wrap ? 'libre' : 'par ligne') + ' : resté dans le blanc de la page 1 : ' + JSON.stringify(b) + html);
    assert(/<\/table><table class="ft-table" id="mv"[^>]*>…<\/table><p data-pg-start="e1">/.test(html), 'après l\'autre tableau : ' + html);
    assert.strictEqual(await undoDepth(), d0 + 1, 'un geste = une étape');
    const brk = await breakOf();
    const pb2 = await pageBottom(1);
    const lh = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#editor > p[data-pg-start]')).lineHeight) * (document.getElementById('editor').currentCSSZoom || 1));
    assert(brk !== null && brk > pb2 - 1.5 * lh, 'paragraphe de la page 2 coupé au bas de la page (non habillé par le tableau) : ' + brk + ' / ' + pb2);
    await page.keyboard.press('Control+z');
    await frames(8);
    assert.strictEqual(await saved(), before, 'Ctrl+Z : revenu en haut de la page 2');
  }
  ok('bas de page blanc : le tableau y reste (par ligne et libre), sans faire couper trop tôt la page suivante');

  // 5. Libre : visé en bas de page, remonté ; texte à côté à 1,6 em ; au début de la ligne visée.
  await reset(para(4) + para(3) + TABLE(' data-wrap="gauche" style="width: 40%"') + para(5) + para(6) + para(6), { mode: 'avance' });
  await page.evaluate(() => window.FTZoom.set(60));
  await frames(8);
  hb = await grab();
  const pb1 = await pageBottom(0);
  await drag(hb, hb.x + 300, pb1 - 50);
  b = await tbox();
  html = await saved();
  assert(b.page === 0 && b.pageEnd === 0 && b.b <= pb1 + 1, 'libre remonté, entier sur la page 1 : ' + JSON.stringify(b) + ' ' + pb1);
  assert(/<\/p><table class="ft-table" id="mv" data-wrap="droite"/.test(html), 'à droite, au début d\'une ligne : ' + html);
  const gap = await page.evaluate(() => {
    const t = document.querySelector('#editor > #mv');
    return parseFloat(getComputedStyle(t).marginLeft) / parseFloat(getComputedStyle(t).fontSize);
  });
  assert(Math.abs(gap - 1.6) < 0.05, 'écart avec le texte : ' + gap + ' em');
  ok('libre : visé en bas de page, remonté pour tenir ; à droite, texte à 1,6 em');

  // 6. Interface note (sans pages) et encadré : même déplacement.
  await reset(para(3) + '<blockquote class="ft-callout" id="mv"><p>Encadré</p></blockquote>' + para(3) + para(3));
  await frames(6);
  hb = await grab();
  const p3n = await page.evaluate(() => document.querySelector('#editor > p:nth-of-type(3)').getBoundingClientRect().top);
  await drag(hb, hb.x, p3n + 2);
  html = await saved();
  assert(/<p>Lorem ipsum dolor<\/p><p>Lorem ipsum dolor<\/p><blockquote class="ft-callout" id="mv">/.test(html), 'encadré déplacé : ' + html);
  // Clic sur la poignée sans bouger : l'encadré est sélectionné.
  hb = await grab();
  await page.mouse.click(hb.x + 5, hb.y + 5);
  await frames(3);
  assert(await page.evaluate(() => window.FTMoteur.view.state.selection.node && window.FTMoteur.view.state.selection.node.type.name === 'blockquote'), 'clic sur la poignée : sélectionné');
  ok('interface note : encadré déplacé de la même façon ; clic sur la poignée : sélection');

  // 7. Libre : débord sur la marge de son côté (bouton, poignée), le bord du côté du texte ne bouge pas.
  for (const side of ['gauche', 'droite']) {
    await reset(para(2) + `<table class="ft-table" data-wrap="${side}" style="width: 40%"><tbody>` + '<tr><td>a</td><td>b</td></tr>'.repeat(3) + '</tbody></table>' + para(4), { mode: 'avance' });
    await frames(6);
    const geo = () => page.evaluate(() => {
      const r = document.querySelector('#editor > table').getBoundingClientRect();
      const q = document.querySelector('#editor > p').getBoundingClientRect();
      return { tl: r.left, tr: r.right, pl: q.left, pr: q.right, cm: (96 / 2.54) * (document.getElementById('editor').currentCSSZoom || 1) };
    });
    const g0 = await geo();
    const cell = await page.locator('#editor > table td').first().boundingBox();
    await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2);
    await frames(4);
    const btn = page.locator('#object-tools button[title^="Déborder sur les marges"]');
    await btn.click();
    await frames(6);
    let g1 = await geo();
    const out = side === 'gauche' ? g1.pl - g1.tl : g1.tr - g1.pr;
    const inner = side === 'gauche' ? g1.tr - g0.tr : g1.tl - g0.tl;
    assert(Math.abs(out - 1.5 * g1.cm) < 2 && Math.abs(inner) < 2, side + ' : 1,5 cm dans la marge, bord intérieur fixe : ' + JSON.stringify([g0, g1]));
    await btn.click();
    await frames(6);
    g1 = await geo();
    assert(Math.abs(g1.tl - g0.tl) < 2 && Math.abs(g1.tr - g0.tr) < 2, side + ' : débord retiré, largeur d\'avant');
    const grip = page.locator(side === 'gauche' ? '#page > .ft-rz-w:not(.ft-img-rz)' : '#page > .ft-rz-e:not(.ft-img-rz)');
    const gb = await grip.boundingBox();
    const dx = (side === 'gauche' ? -1 : 1) * g1.cm;
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) { await page.mouse.move(gb.x + gb.width / 2 + (dx * i) / 5, gb.y + gb.height / 2); await page.waitForTimeout(30); }
    await page.mouse.up();
    await frames(6);
    g1 = await geo();
    html = await saved();
    const out2 = side === 'gauche' ? g1.pl - g1.tl : g1.tr - g1.pr;
    assert(/data-deborde="oui"/.test(html) && Math.abs(out2 - g1.cm) < 4, side + ' : poignée tirée d\'1 cm dans la marge : ' + out2 + ' ' + html);
  }
  ok('libre : débord sur la marge de son côté, par le bouton et par la poignée (bord intérieur fixe)');

  // 8. Pages en paysage : largeur de la page tournée (pleine, en %, avec débord), aussi sur plusieurs pages.
  const rows = '<tr><td>a</td><td>b</td><td>c</td></tr>'.repeat(4);
  await reset(para(4) + para(5) + para(5) + para(6) + para(6) + para(6)
    + '<table class="ft-table" id="t1"><tbody>' + rows + '</tbody></table>'
    + '<table class="ft-table" id="t2" style="width: 50%"><tbody>' + rows + '</tbody></table>'
    + '<table class="ft-table" id="t3" data-deborde="oui" style="--dg: 1.5cm; --dd: 1.5cm"><tbody>' + rows + '</tbody></table>'
    + '<table class="ft-table" id="t4" data-align="gauche" style="width: 40%"><tbody>' + rows + '</tbody></table>' + para(3),
  { mode: 'avance', pages: { turned: { 2: 'paysage', 3: 'paysage' } } });
  await page.evaluate(() => window.FTZoom.set(100));
  await frames(10);
  const land = await page.evaluate(() => {
    const p = document.querySelector('#editor > p').getBoundingClientRect();
    const shift = parseFloat(getComputedStyle(document.getElementById('page')).getPropertyValue('--pg-shift')) * (document.getElementById('editor').currentCSSZoom || 1);
    const out = { L: p.left + shift, W: p.width - 2 * shift, cm: (96 / 2.54) * (document.getElementById('editor').currentCSSZoom || 1) };
    for (const t of document.querySelectorAll('#editor > table')) { const r = t.getBoundingClientRect(); out[t.id] = { l: r.left, w: r.width, alt: t.getAttribute('data-pm-alt') }; }
    return out;
  });
  const near = (a, b2) => Math.abs(a - b2) < 2;
  assert(land.W > 800, 'page en paysage plus large : ' + JSON.stringify(land));
  assert(near(land.t1.l, land.L) && near(land.t1.w, land.W), 'pleine largeur : ' + JSON.stringify(land));
  assert(near(land.t2.w, land.W / 2) && near(land.t2.l, land.L + land.W / 4), '50 % centré : ' + JSON.stringify(land));
  assert(near(land.t3.l, land.L - 1.5 * land.cm) && near(land.t3.w, land.W + 3 * land.cm), 'débord de 1,5 cm de chaque côté : ' + JSON.stringify(land));
  assert(near(land.t4.l, land.L) && near(land.t4.w, land.W * 0.4), '40 % à gauche : ' + JSON.stringify(land));
  await page.evaluate(() => document.querySelector('#t1').scrollIntoView({ block: 'start' }));
  await frames(4);
  await page.screenshot({ path: SHOTS + '/tableaux-paysage.png' });
  // Long tableau sur trois pages en paysage : il en garde la largeur ; une seule page en paysage : non.
  for (const [turned, wide] of [[{ 2: 'paysage', 3: 'paysage', 4: 'paysage' }, true], [{ 2: 'paysage' }, false]]) {
    await reset(para(4) + para(5) + para(5) + para(6) + para(6) + para(6) + TABLE('', 40) + para(3), { mode: 'avance', pages: { turned } });
    await frames(10);
    const t = await page.evaluate(() => { const t = document.querySelector('#mv'); return { alt: t.hasAttribute('data-pm-alt'), w: t.getBoundingClientRect().width, p: document.querySelector('#editor > p').getBoundingClientRect().width }; });
    assert.strictEqual(t.alt, wide, 'long tableau, pages en paysage ' + Object.keys(turned) + ' : ' + JSON.stringify(t));
    assert(wide ? t.w > t.p * 1.3 : near(t.w, t.p), 'largeur : ' + JSON.stringify(t));
  }
  ok('pages en paysage : tableaux à la largeur de la page (pleine, 50 %, à gauche, débord), long tableau sur plusieurs pages en paysage');
};
