// Essai des remarques de grammaire au format LanguageTool (2.4.15), avec un faux moteur : plusieurs
// corrections proposées dans le menu, remarque sans correction, et relecture complète après
// l'installation d'un autre moteur (FTSpell.resetGrammar).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-languagetool.js
const assert = require('assert');

module.exports = async ({ page, emit }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    window.__asked = [];
    window.frameText.grammarCheck = async (text) => {
      window.__asked.push(text);
      await new Promise((r) => setTimeout(r, 100));
      const errors = [];
      const i = text.indexOf('a mangé');
      if (i >= 0) errors.push({ start: i, end: i + 7, correction: 'ont mangé', autres: ['avaient mangé'], explication: 'Accord du verbe avec le sujet.' });
      const j = text.indexOf('quand même');
      if (j >= 0) errors.push({ start: j, end: j + 10, correction: null, autres: [], explication: 'Remarque sans correction.' });
      return { errors, engine: 'languagetool' };
    };
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p id="a">Ce matin, les enfants a mangé des pommes au jardin.</p>' +
      '<p id="b">Il est venu quand même malgré la pluie battante.</p>';
    window.FTSpell.setGrammar(true);
  });
  await page.waitForTimeout(2500);
  const grammar = () => page.evaluate(() => window.FTSpell.grammar());
  assert.deepStrictEqual(await grammar(), ['a mangé', 'quand même']);
  ok('remarques affichées, avec ou sans correction');

  const at = (id, word) => page.evaluate(([id, word]) => {
    const t = document.getElementById(id).firstChild;
    const r = document.createRange();
    const i = t.data.indexOf(word);
    r.setStart(t, i + 1); r.setEnd(t, i + 3);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, [id, word]);

  // Remarque sans correction : seulement l'explication et « Ignorer ».
  let p = await at('b', 'quand');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(200);
  const items = await page.locator('#context-menu').innerText();
  assert(!items.includes('Remplacer par'), items);
  assert(items.includes('Remarque sans correction.') && items.includes('Ignorer cette remarque'), items);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  ok('remarque sans correction : explication et « Ignorer » seulement');

  // Plusieurs corrections : chacune est proposée ; la deuxième est appliquée.
  p = await at('a', 'mangé');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForTimeout(200);
  await page.locator('.context-menu').getByText('Remplacer par « ont mangé »').waitFor();
  await page.locator('.context-menu').getByText('Remplacer par « avaient mangé »').click();
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => document.getElementById('a').textContent), 'Ce matin, les enfants avaient mangé des pommes au jardin.');
  ok('plusieurs corrections proposées, la deuxième appliquée');

  // Nouveau moteur : tous les passages sont relus.
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => window.__asked.length);
  await page.evaluate(() => window.FTSpell.resetGrammar());
  await page.waitForTimeout(2500);
  const asked = await page.evaluate(() => window.__asked.slice());
  assert(asked.length >= before + 2, JSON.stringify(asked));
  assert(asked.slice(before).some((t) => t.startsWith('Il est venu')), JSON.stringify(asked));
  ok('resetGrammar : passages relus');

  // Installation : encadré d'avancement, puis échec visible avec sa raison.
  const box = () => page.evaluate(() => {
    const b = document.getElementById('lt-progress');
    return b && { hidden: b.hidden, step: b.querySelector('.lt-step').textContent, detail: b.querySelector('.lt-detail').textContent, close: !b.querySelector('.lt-close').hidden };
  });
  await emit('lt:progress', [{ step: 'download', pct: 42, detail: '120 Mo sur 287 Mo' }]);
  await page.waitForTimeout(100);
  let b = await box();
  assert.deepStrictEqual(b, { hidden: false, step: 'Téléchargement… 42 %', detail: '120 Mo sur 287 Mo', close: false });
  await emit('lt:progress', [{ step: 'extract', pct: 90, detail: '1200 fichiers sur 2410' }]);
  await page.waitForTimeout(100);
  assert.strictEqual((await box()).step, 'Installation des fichiers… 90 %');
  await emit('lt:progress', [{ step: 'error', pct: 0, detail: 'téléchargement interrompu' }]);
  await page.waitForTimeout(100);
  b = await box();
  assert.deepStrictEqual(b, { hidden: false, step: 'Installation impossible.', detail: 'téléchargement interrompu', close: true });
  await page.screenshot({ path: process.env.FT_CAPTURE || '/tmp/lt-progress.png', clip: { x: 900, y: 650, width: 400, height: 200 } });
  await page.click('#lt-progress .lt-close');
  assert.strictEqual((await box()).hidden, true);
  ok('installation : avancement affiché, échec visible avec sa raison');
};
