// Annuler / Rétablir pour toutes les actions (version 2.2.10) : réglages du document (pages, retrait
// automatique, styles et thème du document) annulés et rétablis avec le texte, dans l'ordre ; Ctrl+Z,
// Ctrl+Y et Ctrl+Maj+Z aussi quand le curseur n'est pas dans le texte.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-annuler.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const k = page.keyboard;
  const state = () => v(() => ({
    text: document.getElementById('editor').textContent,
    size: (JSON.stringify(window.FTPages.getSettings()).match(/"size":"(\w+)"/) || [])[1],
    indent: window.FTEditor.getAutoIndent(),
    h2: window.FTTheme.part('titres').headings[1].size,
    theme: window.FTTheme.get().name
  }));
  await page.click('#editor');
  await k.type('## Titre');
  await page.waitForTimeout(700);
  const steps = [await state()];
  await v(() => { const s = document.getElementById('pg-size'); s.value = 'A5'; s.dispatchEvent(new Event('change')); });
  steps.push(await state());
  await page.click('#auto-indent');
  steps.push(await state());
  await v(() => { const p = window.FTTheme.part('titres'); p.headings[1].size = 30; window.FTTheme.setPart('titres', p); });
  steps.push(await state());
  await v(() => window.FTTheme.apply(window.FTTheme.builtins()[2]));
  steps.push(await state());
  await page.click('#editor');
  await k.press('End');
  await k.type(' final');
  await page.waitForTimeout(700);
  steps.push(await state());
  assert(steps[1].size === 'A5' && steps[2].indent && steps[3].h2 === 30 && steps[4].theme !== steps[3].theme, JSON.stringify(steps));
  for (let i = steps.length - 2; i >= 0; i--) {
    await k.press('Control+z');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await state(), steps[i], 'Ctrl+Z vers l’étape ' + i);
  }
  ok('Ctrl+Z : texte, thème du document, style des titres, retrait automatique, taille des pages annulés dans l’ordre');
  for (let i = 1; i < steps.length; i++) {
    await k.press('Control+y');
    await page.waitForTimeout(150);
    assert.deepStrictEqual(await state(), steps[i], 'Ctrl+Y vers l’étape ' + i);
  }
  ok('Ctrl+Y : tout rétabli dans l’ordre');
  // Hors du texte (après un clic sur un outil).
  await page.click('#auto-indent');
  await v(() => document.activeElement.blur());
  await k.press('Control+z');
  assert.strictEqual(await v(() => window.FTEditor.getAutoIndent()), true);
  await k.press('Control+Shift+Z');
  assert.strictEqual(await v(() => window.FTEditor.getAutoIndent()), false);
  ok('Ctrl+Z et Ctrl+Maj+Z marchent aussi quand le curseur n’est pas dans le texte');
};
