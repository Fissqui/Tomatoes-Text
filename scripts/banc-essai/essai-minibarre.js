// Essai de la mini-barre de mise en forme (minibarre.js) : elle apparaît après une sélection à la
// souris, au-dessus du texte ; gras, taille, police, couleur et surlignage passent par les outils de la
// barre principale ; elle disparaît quand on écrit, clique ailleurs, ou si le menu Affichage la coupe.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page, emit }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p>Le premier paragraphe parle du marché des tomates anciennes en Italie.</p><p>Le second paragraphe conclut sur les prix.</p>';
    ed.focus();
  });
  await page.waitForTimeout(200);
  // Coordonnées à l'écran d'un mot du premier paragraphe.
  const word = (w) => page.evaluate((w) => {
    const walk = document.createTreeWalker(document.querySelector('#editor p'), NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walk.nextNode()) && !t.data.includes(w));
    const i = t.data.indexOf(w);
    const r = document.createRange();
    r.setStart(t, i); r.setEnd(t, i + w.length);
    const b = r.getBoundingClientRect();
    return { x1: b.left + 1, x2: b.right - 1, y: b.top + b.height / 2 };
  }, w);
  const drag = async (w) => {
    const c = await word(w);
    await page.mouse.move(c.x1, c.y);
    await page.mouse.down();
    await page.mouse.move((c.x1 + c.x2) / 2, c.y, { steps: 3 });
    await page.mouse.move(c.x2, c.y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  const shown = () => page.isVisible('#minibar');
  const markOf = (w) => page.evaluate((w) => {
    const el = [...document.querySelectorAll('#editor *')].find((e) => e.textContent === w);
    return el ? el.outerHTML : null;
  }, w);

  assert(!(await shown()), 'cachée au départ');
  await drag('marché');
  assert(await shown(), 'affichée après la sélection');
  const pos = await page.evaluate(() => {
    const b = document.getElementById('minibar').getBoundingClientRect();
    const t = document.querySelector('#editor p').getBoundingClientRect();
    return { bottom: b.bottom, top: t.top };
  });
  assert(pos.bottom <= pos.top + 2, 'au-dessus de la ligne : ' + JSON.stringify(pos));
  ok('affichée au-dessus de la sélection');
  await page.screenshot({ path: path.join(SHOTS, 'minibarre-jour.png'), clip: { x: 0, y: 0, width: 1300, height: 420 } });

  await page.click('#minibar [data-mb="bold"]');
  await page.waitForTimeout(350);
  assert(/^<(strong|b)\b/.test(await markOf('marché') || ''), 'gras : ' + await markOf('marché'));
  assert(await page.evaluate(() => document.querySelector('#minibar [data-mb="bold"]').classList.contains('on')), 'bouton gras allumé');
  assert(await shown(), 'reste affichée');
  ok('Gras appliqué, bouton allumé, barre gardée');

  const before = await page.evaluate(() => Number(document.getElementById('font-size').value));
  await page.click('#minibar .ft-num-btn[title="Augmenter"]');
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => Number(document.getElementById('font-size').value));
  assert(after > before, `taille ${before} -> ${after}`);
  assert.strictEqual(await page.evaluate(() => document.querySelector('#minibar .mb-size').value), String(after));
  ok(`Flèche de la taille : ${before} → ${after}`);

  await page.click('#minibar .ft-num-input', { clickCount: 3 });
  await page.keyboard.type('24');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  assert(/font-size:\s*24pt/.test(await page.evaluate(() => document.querySelector('#editor p').innerHTML)), 'taille 24');
  assert(await shown(), 'reste affichée après la saisie');
  ok('Taille tapée : 24');

  await page.selectOption('#minibar .mb-font', 'Arial').catch(async () => {
    const f = await page.evaluate(() => [...document.querySelectorAll('#minibar .mb-font option')].map((o) => o.value).filter(Boolean)[2]);
    await page.selectOption('#minibar .mb-font', f);
  });
  await page.waitForTimeout(350);
  assert(/font-family/.test(await page.evaluate(() => document.querySelector('#editor p').innerHTML)), 'police');
  ok('Police choisie');

  await page.click('#minibar [data-mb="color-more"]');
  assert(await page.isVisible('#color-pop'), 'palette ouverte');
  await page.click('#color-pop [data-color="#2e86c1"]');
  await page.waitForTimeout(350);
  assert(/color:\s*(#2e86c1|rgb\(46, 134, 193\))/.test(await page.evaluate(() => document.querySelector('#editor p').innerHTML)), 'couleur bleue');
  ok('Couleur choisie dans la palette');

  await page.click('#minibar [data-mb="highlight"]');
  await page.waitForTimeout(350);
  assert(/background-color/.test(await page.evaluate(() => document.querySelector('#editor p').innerHTML)), 'surlignage');
  ok('Surlignage');

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  assert(!/background-color/.test(await page.evaluate(() => document.querySelector('#editor p').innerHTML)), 'Ctrl+Z retire le surlignage');
  ok('Ctrl+Z annule la dernière action');

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  assert(!(await shown()), 'cachée après une touche');
  ok('Disparaît à la frappe');

  await drag('tomates');
  assert(await shown());
  await page.mouse.move(1250, 800, { steps: 4 });
  assert(!(await shown()), 'cachée quand la souris part loin');
  ok('Disparaît quand la souris s\'éloigne');

  // Mode nuit (capture).
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await drag('anciennes');
  await page.screenshot({ path: path.join(SHOTS, 'minibarre-nuit.png'), clip: { x: 0, y: 0, width: 1300, height: 420 } });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

  // Menu Affichage : la mini-barre coupée.
  await emit('menu', ['minibar-off']);
  await page.waitForTimeout(100);
  await drag('Italie');
  assert(!(await shown()), 'coupée par le menu');
  await emit('menu', ['minibar-on']);
  await page.waitForTimeout(100);
  await drag('premier');
  assert(await shown(), 'remise par le menu');
  ok('Menu Affichage : marche / arrêt');
};
