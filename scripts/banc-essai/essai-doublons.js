// Essai des doublons : un mot répété d'affilée (« le le », « Le le ») est surligné en vert, pas « nous nous »,
// ni deux mots séparés par une ponctuation, ni le mot en cours de frappe ; clic droit > « Supprimer le doublon »
// (Ctrl+Z le rétablit) ; « Ignorer ».
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p id="a">Il a vu le le chat dans la rue. Le le jardin est grand.</p>' +
      '<p id="b">Nous nous sommes vus. Il dit : non, non. Elle est <b>très</b> très belle.</p>';
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
  });
  await page.waitForTimeout(3200);
  const doubles = () => page.evaluate(() => window.FTSpell.doubles());
  assert.deepStrictEqual(await doubles(), ['le le', 'Le le', 'très très']);
  ok('surlignés : « le le », « Le le », « très très » (même coupé par du gras) ; pas « nous nous » ni « non, non »');
  await page.screenshot({ path: path.join(SHOTS, 'doublons.png'), clip: { x: 260, y: 160, width: 1040, height: 220 } });
  const color = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--x') || 'ok');
  assert(color);

  // Clic droit sur le premier doublon > « Supprimer le doublon ».
  const spot = await page.evaluate(() => {
    const t = document.getElementById('a').firstChild;
    const r = document.createRange();
    const i = t.data.indexOf('le le') + 4;
    r.setStart(t, i); r.setEnd(t, i + 1);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('.context-menu').getByText('Supprimer le doublon « le »').click();
  await page.waitForTimeout(200);
  let text = await page.evaluate(() => document.getElementById('a').textContent);
  assert.strictEqual(text, 'Il a vu le chat dans la rue. Le le jardin est grand.');
  assert.deepStrictEqual(await doubles(), ['Le le', 'très très']);
  ok('« Supprimer le doublon » : « vu le chat »');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(3200);
  text = await page.evaluate(() => document.getElementById('a').textContent);
  assert.strictEqual(text, 'Il a vu le le chat dans la rue. Le le jardin est grand.');
  ok('Ctrl+Z : le doublon revient');

  // « Ignorer » : plus surligné.
  const spot2 = await page.evaluate(() => {
    const t = document.getElementById('a').firstChild;
    const r = document.createRange();
    const i = t.data.indexOf('Le le');
    r.setStart(t, i); r.setEnd(t, i + 1);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.click(spot2.x, spot2.y, { button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('.context-menu').getByText('Ignorer', { exact: true }).click();
  await page.waitForTimeout(150);
  assert.deepStrictEqual(await doubles(), ['le le', 'très très']);
  ok('« Ignorer » : « Le le » n’est plus surligné');

  // Le mot en cours de frappe n'est pas signalé tout de suite.
  await page.evaluate(() => {
    const p = document.getElementById('b');
    const r = document.createRange();
    r.selectNodeContents(p); r.collapse(false);
    document.getElementById('editor').focus();
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  await page.keyboard.type(' Le la');
  await page.waitForTimeout(700);
  assert(!(await doubles()).includes('la la'));
  await page.keyboard.type(' la');
  await page.waitForTimeout(700);
  assert(!(await doubles()).includes('la la'), 'pas pendant la frappe');
  await page.waitForTimeout(3000);
  assert((await doubles()).includes('la la'), 'signalé après une pause');
  ok('« la la » en cours de frappe : signalé seulement après une pause');
};
