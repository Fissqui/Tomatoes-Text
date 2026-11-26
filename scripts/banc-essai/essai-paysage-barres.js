// Essai des barres latérales (mode raccourcis) et du volet du mode maths avec une page tournée en
// paysage : quand la page plus large passe à leur hauteur, elles s'écartent pour ne pas la recouvrir ;
// devant les pages en portrait, elles reviennent contre la feuille.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => {
    document.getElementById('editor').innerHTML = '<p>Tomates anciennes, rendements et coûts de production.</p>'.repeat(160);
    window.FTPages.load({ mode: 'avance', pages: { turned: { 3: 'paysage' } } });
  });
  await page.waitForTimeout(800);

  // Feuille n centrée dans la zone visible.
  const show = async (n) => {
    await page.evaluate((i) => {
      const ws = document.getElementById('workspace');
      const s = document.querySelectorAll('#pg-sheets > .pg-sheet')[i];
      const r = s.getBoundingClientRect();
      const w = ws.getBoundingClientRect();
      ws.scrollTop += (r.top + r.bottom) / 2 - (w.top + w.bottom) / 2;
    }, n);
    await page.waitForTimeout(450);
  };
  const geo = (ids, n) => page.evaluate(([ids, i]) => {
    const r = (el) => el.getBoundingClientRect();
    const s = r(document.querySelectorAll('#pg-sheets > .pg-sheet')[i]);
    return { sheet: { left: s.left, right: s.right, w: s.width }, bars: ids.map((id) => { const b = r(document.getElementById(id)); return { left: b.left, right: b.right }; }) };
  }, [ids, n]);

  const widths = await page.evaluate(() => [...document.querySelectorAll('#pg-sheets > .pg-sheet')].slice(0, 5).map((s) => Math.round(s.getBoundingClientRect().width)));
  assert(widths[2] > widths[0] + 100 && widths[3] === widths[0], 'page 3 en paysage : ' + widths);

  // ----- Mode raccourcis -----
  await page.click('#sidemode-switch [data-side="on"]');
  await page.waitForTimeout(450);
  for (const [n, kind] of [[0, 'portrait'], [2, 'paysage'], [4, 'portrait']]) {
    await show(n);
    const g = await geo(['tb-side-l', 'tb-side-r'], n);
    const [l, r] = g.bars;
    assert(l.right <= g.sheet.left && g.sheet.left - l.right <= 10, `page ${n + 1} (${kind}), barre gauche : ` + JSON.stringify(g));
    assert(r.left >= g.sheet.right && r.left - g.sheet.right <= 10, `page ${n + 1} (${kind}), barre droite : ` + JSON.stringify(g));
    if (n === 2) await page.screenshot({ path: path.join(SHOTS, 'paysage-mode-raccourcis.png') });
  }
  ok('Mode raccourcis : barres contre la feuille, en portrait comme en paysage');
  await page.click('#sidemode-switch [data-side="off"]');
  await page.waitForTimeout(300);

  // ----- Mode maths -----
  // Le document se décale vers la gauche pour laisser la place au volet ; quand elle manque encore
  // (page en paysage dans une fenêtre de 1600 px), le volet se réduit et se rouvre ensuite.
  await page.click('#mathmode-switch button[data-maths="on"]');
  await page.waitForTimeout(450);
  const folded = () => page.evaluate(() => document.getElementById('maths-panel').classList.contains('folded'));
  for (const [width, plan] of [[1600, [[0, false], [2, true], [4, false]]], [1920, [[0, false], [2, false], [4, false]]]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(400);
    for (const [n, small] of plan) {
      await show(n);
      const g = await geo(['maths-panel'], n);
      const [p] = g.bars;
      assert(p.left >= g.sheet.right && p.left - g.sheet.right <= 24, `${width} px, page ${n + 1}, volet du mode maths : ` + JSON.stringify(g));
      assert.strictEqual(await folded(), small, `${width} px, page ${n + 1} : volet réduit ${small}`);
      if (n === 2 && width === 1600) await page.screenshot({ path: path.join(SHOTS, 'paysage-mode-maths.png') });
    }
  }
  ok('Mode maths : volet à droite de la feuille, réduit faute de place devant la page en paysage');
  // Rouvert à la main malgré le manque de place, puis réduit de nouveau.
  await page.setViewportSize({ width: 1600, height: 900 });
  await show(2);
  await page.click('#maths-panel .mp-fold');
  await page.waitForTimeout(200);
  assert.strictEqual(await folded(), false, 'rouvert à la main');
  await page.click('#maths-panel .mp-fold');
  await page.waitForTimeout(200);
  assert.strictEqual(await folded(), true, 'réduit à la main');
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('ft-maths-volet-reduit')), null, 'réglage « volet réduit » inchangé');
  await show(4);
  assert.strictEqual(await folded(), false, 'ouvert devant une page en portrait');
  ok('Volet rouvert et réduit à la main sans changer le réglage enregistré');
  await page.click('#mathmode-switch button[data-maths="off"]');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => document.getElementById('workspace').style.paddingRight), '', 'marge rendue à l\'arrêt');
  ok('Arrêt du mode maths : document recentré');
};
