// Essai des statistiques de lisibilité : phrases, abréviations, syllabes, mots rares, fenêtre et surlignage.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const cut = await page.evaluate(() => {
    const t = 'M. Dupont arrive. Il voit J. Martin, etc. et repart ! Est-ce fini ? « Oui. » Voir p. 12 pour la suite… Fin';
    return window.FTReadability._sentences(t).map(([s, e]) => t.slice(s, e).trim());
  });
  assert.deepStrictEqual(cut, ['M. Dupont arrive.', 'Il voit J. Martin, etc. et repart !', 'Est-ce fini ?', '« Oui. »', 'Voir p. 12 pour la suite…', 'Fin']);
  ok('phrases coupées au bon endroit (abréviations, initiales, guillemets) : ' + cut.length);
  const syl = await page.evaluate(() => ['chat', 'maison', 'table', 'épistémologique', 'mangeaient', 'aéroport', 'élégantes'].map((w) => window.FTReadability._syllables(w)));
  ok('syllabes chat, maison, table, épistémologique, mangeaient, aéroport, élégantes : ' + syl.join(', '));

  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Essai de lisibilité</h1>' +
      '<p>Le chat dort. Il fait beau aujourd’hui. Nous mangeaient des pommes.</p>' +
      '<p>Cette phrase, qui est volontairement très longue et sinueuse, accumule les propositions subordonnées, les détails et les compléments variés jusqu’à dépasser largement la limite raisonnable de trente mots que recommandent la plupart des guides de rédaction claire.</p>' +
      '<p>L’épistémologique paupérisation du fétichisme téléologique demeure une synecdoque. Karl Marx l’explique.</p>' +
      '<table><tbody><tr><td>Idiosyncrasie dans un tableau</td></tr></tbody></table>';
    ed.dispatchEvent(new Event('input'));
  });
  const a = await page.evaluate(async () => {
    const r = await window.FTReadability.analyze();
    return { n: r.sentences.length, words: r.sentences.map((s) => s.words), rare: r.rare.map((x) => x.word), score: Math.round(r.score), buckets: r.buckets };
  });
  assert.strictEqual(a.n, 6, JSON.stringify(a));
  assert.deepStrictEqual(a.rare.sort(), ['fétichisme', 'paupérisation', 'synecdoque', 'téléologique', 'épistémologique'].sort());
  assert.strictEqual(a.buckets[3], 1);
  ok(`analyse : ${a.n} phrases (${a.words.join(', ')} mots), score ${a.score}, mots rares : ${a.rare.join(', ')} (titres, tableaux et noms propres exclus)`);

  await page.evaluate(() => window.__ftEmit('menu', ['readability']));
  await page.waitForTimeout(500);
  await page.check('#rl-mark-long');
  await page.check('#rl-mark-rare');
  const ui = await page.evaluate(() => ({
    open: document.getElementById('read-dialog').open,
    score: document.querySelector('#rl-score .rl-score').textContent,
    level: document.querySelector('#rl-score .rl-level').textContent,
    rare: document.querySelectorAll('#rl-rare .rl-word').length,
    long: document.querySelectorAll('#rl-long .rl-sentence').length,
    hl: [...CSS.highlights.get('ft-read-vlong')].length + [...CSS.highlights.get('ft-read-rare')].length
  }));
  assert(ui.open && ui.rare === 5 && ui.long === 1 && ui.hl === 6, JSON.stringify(ui));
  ok(`fenêtre : score ${ui.score} « ${ui.level} », ${ui.long} phrase longue, ${ui.rare} mots rares, ${ui.hl} surlignages`);
  await page.click('#rl-long .rl-sentence');
  const sel = await page.evaluate(() => getSelection().toString());
  assert(/^Cette phrase/.test(sel) && /claire\.$/.test(sel), sel);
  ok('clic sur la phrase longue : sélectionnée dans le texte');
  await page.screenshot({ path: path.join(SHOTS, 'lisibilite.png') });
  // Le texte change : l'analyse suit.
  await page.evaluate(() => { const p = document.querySelector('#editor p'); p.append(' Une phrase de plus.'); document.getElementById('editor').dispatchEvent(new Event('input')); });
  await page.waitForTimeout(1200);
  const n = await page.evaluate(() => document.querySelector('#rl-stats dd:nth-of-type(2)').textContent);
  assert.strictEqual(n, '7');
  ok('analyse refaite après une modification : 7 phrases');
  await page.keyboard.press('Escape');
  await page.click('#rl-close').catch(() => {});
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => [...CSS.highlights.get('ft-read-rare')].length), 0);
  ok('fenêtre fermée : surlignages retirés');
};
