// Essai de la largeur libre des tableaux et encadrés : bord tiré à la souris (seul ce bord bouge),
// marge libre, accroche à toute la largeur, alignement par les icônes de l'objet, poignées de côté,
// double-clic sur le bord, Ctrl+Z, largeur gardée à l'enregistrement.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  // Outil de position : dans la barre de l'objet, ou (tableau, 2.4.18) dans son menu « Position et habillage ».
  const pickTool = async (title) => {
    if (await page.locator(`#object-tools button[title="${title}"]`).count()) return page.click(`#object-tools button[title="${title}"]`);
    await page.click('#object-tools button[title="Position et habillage"]');
    await page.click(`.context-menu:not([hidden]) .menu-icons button[title="${title}"]`);
  };
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p>Avant</p><table class="ft-table" data-style="quadrille" data-t="2"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>'
      + '<p>Entre</p><blockquote class="ft-callout"><p>Un encadré</p></blockquote><p>Après</p>';
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
  });
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; }, sel);
  const text = await rect('#editor > p');
  const drag = async (x, y, dx) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 3 });
    await page.mouse.move(x + dx, y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  };

  // Bord droit du tableau, tiré de 100 px vers la gauche : seul ce bord bouge, le tableau reste calé à gauche.
  let t = await rect('#editor table');
  assert(Math.abs(t.w - text.w) < 2, 'pleine largeur au départ');
  await page.mouse.move(t.r - 1, (t.t + t.b) / 2);
  // (Moteur 2.0 : une bande de réglage posée sur le bord, sans toucher à la zone d'écriture.)
  assert(await page.evaluate(() => document.getElementById('editor').classList.contains('resize-side') || !!document.querySelector('.ft-side-zone:not([hidden])')), 'curseur de largeur sur le bord');
  await drag(t.r - 1, (t.t + t.b) / 2, -100);
  t = await rect('#editor table');
  assert(Math.abs(t.w - (text.w - 100)) < 6, 'largeur ' + t.w + ' ' + text.w);
  assert(Math.abs(t.l - text.l) < 2, 'bord gauche immobile');
  ok(`tableau : bord droit tiré, ${Math.round(t.w)} px, bord gauche immobile`);
  // Bord gauche tiré de 60 px : marge libre.
  await drag(t.l + 1, (t.t + t.b) / 2, 60);
  let t2 = await rect('#editor table');
  assert(Math.abs(t2.l - (text.l + 60)) < 3 && Math.abs(t2.r - t.r) < 2, 'marge libre ' + JSON.stringify([text, t, t2]));
  assert.strictEqual(await page.evaluate(() => document.querySelector('#editor table').dataset.align), 'libre');
  ok('bord gauche tiré : marge libre, le bord droit ne bouge pas');
  await page.screenshot({ path: path.join(SHOTS, 'largeur-tableau.png') });

  // Centrer, puis caler à gauche, par les icônes de l'objet sélectionné.
  await page.click('#editor table td');
  await page.waitForTimeout(100);
  assert(await page.isVisible('#object-tools'), 'outils de l’objet');
  await pickTool('Centrer');
  t = await rect('#editor table');
  assert(Math.abs((t.l - text.l) - (text.r - t.r)) < 2, 'centré');
  await pickTool('Aligner à gauche');
  t = await rect('#editor table');
  assert(Math.abs(t.l - text.l) < 2, 'à gauche');
  // Poignée droite : seul le côté droit bouge.
  const g = await page.locator('.ft-rz-e:not(.ft-img-rz)').boundingBox();
  await drag(g.x + 3, g.y + 11, 50);
  t2 = await rect('#editor table');
  assert(Math.abs(t2.l - text.l) < 2 && Math.abs(t2.w - (t.w + 50)) < 6, 'élargi à droite ' + t2.w);
  ok('centré puis aligné à gauche ; la poignée droite élargit d’un seul côté');
  await page.click('#editor table td');
  await page.waitForTimeout(100);
  await pickTool('Aligner à droite');
  t = await rect('#editor table');
  assert(Math.abs(t.r - text.r) < 2, 'à droite');
  ok('aligné à droite');

  // Encadré : bord gauche tiré vers la droite, puis accroche à toute la largeur.
  let c = await rect('#editor .ft-callout');
  await drag(c.l + 1, (c.t + c.b) / 2, 80);
  c = await rect('#editor .ft-callout');
  assert(Math.abs(c.w - (text.w - 80)) < 6 && Math.abs(c.r - text.r) < 2, 'encadré ' + c.w);
  ok(`encadré : bord gauche tiré, ${Math.round(c.w)} px, calé à droite`);
  await drag(c.l + 1, (c.t + c.b) / 2, -78);
  assert.strictEqual(await page.evaluate(() => document.querySelector('#editor .ft-callout').getAttribute('style')), null);
  ok('près de toute la largeur : accroché, sans largeur propre');

  await page.keyboard.press('Control+z');
  c = await rect('#editor .ft-callout');
  assert(Math.abs(c.w - (text.w - 80)) < 6, 'Ctrl+Z ' + c.w);
  ok('Ctrl+Z revient à la largeur précédente');

  // Double-clic sur le bord : toute la largeur.
  await page.mouse.dblclick(c.r - 1, (c.t + c.b) / 2);
  await page.waitForTimeout(100);
  c = await rect('#editor .ft-callout');
  assert(Math.abs(c.w - text.w) < 2, 'double-clic ' + c.w);
  ok('double-clic sur le bord : toute la largeur');

  const html = await page.evaluate(() => (window.FTMoteur ? window.FTEditor.getHtml() : window.FTPages.clean(document.getElementById('editor').innerHTML)));
  assert(/<table[^>]*data-align="droite"[^>]*style="width: [\d.]+%;"|<table[^>]*style="width: [\d.]+%;"[^>]*data-align="droite"/.test(html), html.slice(0, 300));
  ok('largeur (en %) et alignement gardés dans le texte enregistré');
};
