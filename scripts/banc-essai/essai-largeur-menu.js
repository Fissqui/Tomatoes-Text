// Essai de la largeur du menu de gauche : réglée en tirant son bord, mémorisée d'un lancement à l'autre,
// rétablie par un double-clic ; côté droit, le bord à tirer passe à gauche.
const path = require('path');
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const width = () => page.evaluate(() => document.getElementById('sidebar').offsetWidth);
  if (await page.evaluate(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
  const w0 = await width();
  const grip = page.locator('#sidebar .sb-resize');
  const drag = async (dx) => {
    const b = await grip.boundingBox();
    await page.mouse.move(b.x + 3, b.y + 200);
    await page.mouse.down();
    await page.mouse.move(b.x + 3 + dx / 2, b.y + 200);
    await page.mouse.move(b.x + 3 + dx, b.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  await drag(150);
  const w1 = await width();
  assert.ok(Math.abs(w1 - (w0 + 150)) <= 2, `largeur ${w1}, attendu ${w0 + 150}`);
  ok(`bord tiré : ${w0} → ${w1} px`);
  await page.screenshot({ path: path.join(process.env.FT_SHOTS || require('os').tmpdir(), 'largeur-menu.png'), clip: { x: 0, y: 0, width: 900, height: 500 } });

  await drag(-1000);
  assert.strictEqual(await width(), 200);
  ok('largeur minimale 200 px');
  await drag(250);
  const w2 = await width();

  await page.reload();
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
  assert.strictEqual(await width(), w2);
  ok(`largeur gardée après relance (${w2} px)`);

  // Menu masqué puis réaffiché : même largeur.
  await page.keyboard.press('Control+Shift+B');
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+Shift+B');
  await page.waitForTimeout(400);
  assert.strictEqual(await width(), w2);
  ok('masqué puis réaffiché : même largeur');

  await grip.dblclick();
  await page.waitForTimeout(300);
  assert.strictEqual(await width(), w0);
  const saved = await page.evaluate(async () => (await window.frameText.loadSettings()).sidebarWidth);
  assert.strictEqual(saved, undefined);
  ok('double-clic : largeur d\'origine');

  // Menu à droite : tirer vers la gauche élargit.
  await page.evaluate(() => { document.documentElement.dataset.uiCote = 'droite'; });
  await page.waitForTimeout(300);
  await drag(-120);
  assert.ok(Math.abs((await width()) - (w0 + 120)) <= 2);
  ok('menu à droite : bord gauche tiré vers la gauche');
};
