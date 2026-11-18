// Essai des ordinaux : « 19ème » devient 19ᵉ dès l'espace (1er, 1re, 2nd, 2de, XIXe, Ier, 21st),
// sans toucher aux mots ordinaires (Le, De, Ce, 3,5e) ; Ctrl+Z revient au texte tapé ; clic droit :
// chiffres romains / arabes, sans exposant, chiffres romains par défaut ; export Word en exposant.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const start = async () => {
    await page.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.innerHTML = '<p id="p"><br></p>';
      ed.dispatchEvent(new Event('input'));
      window.FTHistory.reset();
      ed.focus();
      const r = document.createRange();
      r.setStart(document.getElementById('p'), 0);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
    });
  };
  const html = () => page.evaluate(() => document.getElementById('p').innerHTML.replace(/ /g, '~'));
  const sups = () => page.evaluate(() => [...document.querySelectorAll('#p sup.ft-ord')].map((s) => (s.previousSibling ? (/(\d+|[IVXLCDM]+)$/.exec(s.previousSibling.data) || [''])[0] : '') + '^' + s.textContent));

  await start();
  await page.keyboard.type('Au 19ème siècle, le 1er mai et la 1ère fois, la 2nde guerre, le 3e rang. Louis XIVe et François Ier régnaient. ');
  assert.deepStrictEqual(await sups(), ['19^e', '1^er', '1^re', '2^de', '3^e', 'XIV^e', 'I^er']);
  let text = await page.evaluate(() => document.getElementById('p').textContent.replace(/ /g, ' '));
  assert.strictEqual(text, 'Au 19e siècle, le 1er mai et la 1re fois, la 2de guerre, le 3e rang. Louis XIVe et François Ier régnaient. ');
  ok('19ème → 19ᵉ, 1er, 1ère → 1ʳᵉ, 2nde → 2ᵈᵉ, 3e, XIVe, Ier : exposants posés à la fin du mot');
  await page.screenshot({ path: path.join(SHOTS, 'ordinaux.png'), clip: { x: 260, y: 160, width: 1040, height: 200 } });

  await start();
  await page.keyboard.type('Le chat. De plus, Ce jour, Me Dupont, 3,5e essai, v2.3e, le 0e, les 12es et 21st century. ');
  assert.deepStrictEqual(await sups(), ['12^es', '21^st']);
  ok('Le, De, Ce, Me, 3,5e, v2.3e, 0e laissés tels quels ; 12es → 12ᵉˢ ; 21st → 21ˢᵗ');

  // Ctrl+Z : on retrouve « 19ème » tel qu'il a été tapé.
  await start();
  await page.keyboard.type('Au 19ème');
  await page.waitForTimeout(700);
  await page.keyboard.type(' ');
  assert.deepStrictEqual(await sups(), ['19^e']);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  text = await page.evaluate(() => document.getElementById('p').textContent);
  assert(/^Au 19ème/.test(text) && !(await sups()).length, text);
  ok('Ctrl+Z : retour à « 19ème »');

  // Entrée après l'ordinal.
  await start();
  await page.keyboard.type('Chapitre 4e');
  await page.keyboard.press('Enter');
  assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('#editor sup.ft-ord')].map((s) => s.textContent)), ['e']);
  ok('Entrée après « 4e » : exposant posé');

  // Clic droit : chiffres romains, puis arabes, puis sans exposant.
  await start();
  await page.keyboard.type('Au 19e siècle, tout change.');
  const menu = async (re) => {
    const sup = await page.locator('#p sup.ft-ord').boundingBox();
    await page.mouse.click(sup.x - 6, sup.y + sup.height, { button: 'right' });
    await page.waitForTimeout(150);
    const items = await page.evaluate(() => [...document.querySelectorAll('.context-menu:not([hidden]) button, .context-menu:not([hidden]) .menu-item')].map((b) => b.textContent.trim()));
    const item = page.locator('.context-menu').getByText(re).first();
    await item.click();
    await page.waitForTimeout(150);
    return items;
  };
  const items = await menu(/^Chiffres romains/);
  assert(items.some((t) => /^Chiffres romains \(XIXe\)/.test(t)) && items.includes('Sans exposant'), items.join(' | '));
  assert.deepStrictEqual(await sups(), ['XIX^e']);
  ok('clic droit > « Chiffres romains (XIXᵉ) » : XIXᵉ siècle');
  await menu(/^Chiffres arabes/);
  assert.deepStrictEqual(await sups(), ['19^e']);
  ok('clic droit > « Chiffres arabes (19ᵉ) » : 19ᵉ');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  assert.deepStrictEqual(await sups(), ['XIX^e']);
  await page.keyboard.press('Control+y');
  await menu(/^Sans exposant$/);
  assert.strictEqual(await html(), 'Au 19e siècle, tout change.');
  ok('Ctrl+Z / Ctrl+Y ; « Sans exposant » : 19e en texte ordinaire');

  // Chiffres romains par défaut (réglage gardé).
  await page.evaluate(() => window.FTApp.menu && 0);
  await start();
  await page.keyboard.type('Au 20e ');
  await menu(/^Ordinaux$/).catch(() => {});
  await page.locator('#context-submenu').getByText(/Chiffres romains par défaut/).click();
  await page.waitForTimeout(150);
  const saved = await page.evaluate(() => window.frameText.loadSettings());
  assert.deepStrictEqual(saved.ordinals, { auto: true, roman: true });
  await start();
  await page.keyboard.type('Au 18ème siècle et le 1er mai, la 2de fois. ');
  assert.deepStrictEqual(await sups(), ['XVIII^e', 'I^er', '2^de']);
  ok('« Chiffres romains par défaut » : 18ème → XVIIIᵉ (2de reste en chiffres), réglage enregistré');
  await page.evaluate(() => window.FTOrdinals.init({ auto: true, roman: false }, () => {}));

  // Export Word : l'exposant reste un exposant.
  await start();
  await page.keyboard.type('Le 19e siècle. ');
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const xml = await zip.file('word/document.xml').async('string');
  assert(/<w:vertAlign w:val="superscript"\/><\/w:rPr><w:t[^>]*>e<\/w:t>/.test(xml), 'exposant dans Word');
  ok('export Word : « e » en exposant');
};
