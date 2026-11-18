// Essai du faux texte (AAT) : fenêtre, quantités par paragraphes, phrases, mots et lignes (lignes
// mesurées dans le document une fois insérées), titres et listes, insertion au curseur, Ctrl+Z.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Essai</h1><p id="start">Début.</p><p id="end">Fin.</p>';
    ed.dispatchEvent(new Event('input'));
    const r = document.createRange();
    r.selectNodeContents(document.getElementById('start'));
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.focus();
  });
  await page.keyboard.press('End');
  await page.click('#assist-toggle');
  await page.waitForTimeout(300);
  await page.click('#assist-lorem');
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.getElementById('lorem-dialog').open), 'fenêtre ouverte');

  const set = async (unit, count, extra = {}) => {
    await page.selectOption('#lr-unit', unit);
    await page.fill('#lr-count', String(count));
    await page.dispatchEvent('#lr-count', 'change');
    for (const [id, v] of Object.entries(extra)) {
      if (typeof v === 'boolean') await page.setChecked('#' + id, v);
      else await page.selectOption('#' + id, v);
    }
    await page.waitForTimeout(100);
    return page.evaluate(() => {
      const box = document.getElementById('lr-preview');
      const text = box.innerText;
      return {
        paras: box.querySelectorAll('p').length,
        h2: box.querySelectorAll('h2').length,
        ul: box.querySelectorAll('ul').length,
        words: window.FTLorem.countWords([...box.children].map((e) => e.textContent).join(' ')),
        sentences: [...box.querySelectorAll('p')].reduce((n, p) => n + (p.textContent.match(/[.](?=\s|$)/g) || []).length, 0),
        text
      };
    });
  };

  let r = await set('paragraphes', 4, { 'lr-headings': true, 'lr-lists': true });
  assert.strictEqual(r.paras, 4);
  assert.strictEqual(r.h2, 2);
  assert.strictEqual(r.ul, 1);
  await page.screenshot({ path: path.join(SHOTS, 'faux-texte.png') });
  ok(`4 paragraphes, 2 titres, 1 liste (${r.words} mots)`);

  r = await set('phrases', 12);
  assert.strictEqual(r.sentences, 12, r.text);
  assert.strictEqual(r.h2 + r.ul, 0);
  ok('12 phrases');

  r = await set('mots', 237);
  assert.strictEqual(r.words, 237);
  ok('237 mots exactement');

  // Vocabulaire professionnel, puis un lot de phrases relues à la recherche de fautes d'assemblage.
  await page.selectOption('#lr-vocab', 'pro');
  const bad = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 400; i++) {
      for (const v of ['general', 'pro']) {
        const s = window.FTLorem.sentence(v);
        if (/(^|\s)(de le|de les|à le|à les|de des)\s|(^|\s)(le|la|ce|sa|ne) [aeiouéèêh]|\s{2}|’ |undefined/i.test(s)) out.push(s);
      }
    }
    return out;
  });
  assert.deepStrictEqual(bad, []);
  const samples = await page.evaluate(() => [window.FTLorem.sentence('general'), window.FTLorem.sentence('general'), window.FTLorem.sentence('pro')]);
  samples.forEach((s) => console.log('      « ' + s + ' »'));
  ok('800 phrases sans contraction ni élision oubliée');

  // Lignes : insérées dans le document, chaque paragraphe garde le nombre de lignes voulu.
  await page.selectOption('#lr-vocab', 'general');
  r = await set('lignes', 9, { 'lr-length': 'court' });
  assert.strictEqual(r.paras, 2);
  await page.click('#lr-insert');
  await page.waitForTimeout(300);
  const lines = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const start = document.getElementById('start');
    const out = [];
    for (let p = start.nextElementSibling; p && p.id !== 'end'; p = p.nextElementSibling) {
      const lh = parseFloat(getComputedStyle(p).lineHeight);
      const range = document.createRange();
      range.selectNodeContents(p);
      const tops = new Set([...range.getClientRects()].map((x) => Math.round(x.top)));
      out.push({ tag: p.tagName, lines: tops.size, lh });
    }
    return { out, html: ed.innerHTML.length };
  });
  assert.deepStrictEqual(lines.out.map((x) => x.tag + x.lines), ['P4', 'P5']);
  ok('9 lignes à la largeur du document : 4 + 5, insérées entre « Début. » et « Fin. »');

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => document.getElementById('start').nextElementSibling.id);
  assert.strictEqual(after, 'end');
  ok('Ctrl+Z retire le faux texte');
};
