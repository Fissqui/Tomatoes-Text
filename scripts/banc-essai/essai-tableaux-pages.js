// Essai des tableaux qui débordent : ligne d'en-tête répétée en haut de chaque page (mode avancé),
// même apparence que l'originale, jamais enregistrée ; clic droit « Répéter l'en-tête sur chaque page »
// (allume aussi la ligne d'en-tête) ; tableau ajusté à la largeur de la page (mots longs coupés) ;
// export Word (en-tête répété) et PDF (<thead>).
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const rows = Array.from({ length: 70 }, (_, i) => `<tr><td>Ligne ${i + 1}</td><td>${(i * 3.7).toFixed(1)}</td><td>Observation</td></tr>`).join('');
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p>Avant le tableau.</p><table class="ft-table" id="t" data-style="grille" data-t="2"><tbody><tr><td>Nom</td><td>Valeur</td><td>Note</td></tr>' + rows + '</tbody></table><p>Après.</p>'
      + '<table class="ft-table" id="w" data-t="2" data-width="auto"><tbody><tr><td>https://exemple.org/un/tres/long/chemin/sans/espace/aucun/pour/couper/la/ligne/vraiment/vraiment</td><td>b</td></tr></tbody></table><p>Fin.</p>';
    ed.dispatchEvent(new Event('input'));
  });
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(900);
  const heads = () => page.evaluate(() => document.querySelectorAll('#t tr.ft-pg-rhead').length);
  assert.strictEqual(await heads(), 0, 'pas de répétition sans l’option');

  // Clic droit dans le tableau > « Répéter l'en-tête sur chaque page ».
  await page.evaluate(() => document.querySelector('#t td').scrollIntoView({ block: 'center' }));
  const cell = await page.locator('#t td').nth(4).boundingBox();
  await page.mouse.click(cell.x + 10, cell.y + cell.height / 2, { button: 'right' });
  await page.locator('.context-menu').getByText("Répéter l'en-tête sur chaque page").click();
  await page.waitForTimeout(900);
  const st = await page.evaluate(() => {
    const t = document.getElementById('t');
    const copies = [...t.querySelectorAll('tr.ft-pg-rhead')];
    const first = t.rows[0].cells[0];
    const pages = copies.map((c) => window.FTPages.pageNumberOf(c));
    const nextRow = (c) => { let n = c.nextElementSibling; while (n && n.classList.contains('ft-pg-gap')) n = n.nextElementSibling; return n; };
    return {
      header: t.dataset.header, repeat: t.dataset.repeat, n: copies.length, pages,
      text: copies.map((c) => c.textContent),
      bg: [getComputedStyle(first).backgroundColor, copies[0] && getComputedStyle(copies[0].cells[0]).backgroundColor],
      // La copie est juste au-dessus de la première ligne de la page, en haut de cette page.
      sameTop: copies.every((c) => window.FTPages.pageNumberOf(c) === window.FTPages.pageNumberOf(nextRow(c))),
      saved: (window.FTMoteur ? window.FTEditor.getHtml() : window.FTPages.clean(document.getElementById('editor').innerHTML))
    };
  });
  assert.strictEqual(st.header, 'oui');
  assert.strictEqual(st.repeat, 'oui');
  assert(st.n >= 1, 'copies : ' + st.n);
  assert(st.text.every((t) => t === 'NomValeurNote'), st.text.join('|'));
  assert.strictEqual(st.bg[1], st.bg[0], 'même fond que l’en-tête');
  assert(st.sameTop, 'copie sur la même page que la ligne qui suit');
  assert.deepStrictEqual(st.pages, st.pages.map((_, i) => i + 2), 'une copie par page suivante : ' + st.pages);
  assert(!/ft-pg-rhead|Nom<\/td><td>Valeur<\/td><td>Note<\/td><\/tr><tr><td>Nom/.test(st.saved) && (st.saved.match(/>Nom</g) || []).length === 1, 'jamais enregistrée');
  await page.evaluate(() => { const c = document.querySelector('#t tr.ft-pg-rhead'); c.scrollIntoView({ block: 'center' }); });
  await page.screenshot({ path: path.join(SHOTS, 'tableau-entete-repete.png') });
  ok(`en-tête répété en haut des pages ${st.pages.join(', ')}, même apparence, jamais enregistré`);

  // Le tableau trop large reste dans la page.
  const fit = await page.evaluate(() => {
    const w = document.getElementById('w').getBoundingClientRect();
    const p = document.querySelector('#editor > p').getBoundingClientRect();
    return [w.width, p.width];
  });
  assert(fit[0] <= fit[1] + 1, 'tableau ajusté : ' + fit);
  ok('adresse très longue : le tableau reste dans la largeur de la page');

  // Word : en-tête répété ; PDF : <thead>.
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  assert.strictEqual((xml.match(/<w:tblHeader\/>/g) || []).length, 1, 'tblHeader');
  assert.strictEqual((xml.match(/>Nom</g) || []).length, 1, 'copies absentes du Word');
  ok('Word : en-tête répété par Word, copies d’affichage absentes');
  const pdf = await page.evaluate(async () => (await window.FTPdf.build()).html);
  assert(/<thead><tr><td>Nom<\/td>/.test(pdf), 'thead');
  ok('PDF : ligne d’en-tête dans un <thead>');

  // Option retirée : plus de copies.
  await page.evaluate(() => document.querySelector('#t td').scrollIntoView({ block: 'center' }));
  const c2 = await page.locator('#t td').nth(4).boundingBox();
  await page.mouse.click(c2.x + 10, c2.y + c2.height / 2, { button: 'right' });
  await page.locator('.context-menu').getByText("Répéter l'en-tête sur chaque page").click();
  await page.waitForTimeout(900);
  assert.strictEqual(await heads(), 0);
  assert.strictEqual(await page.evaluate(() => document.getElementById('t').dataset.header), 'oui');
  ok('option retirée : plus de copies, la ligne d’en-tête reste');
};
