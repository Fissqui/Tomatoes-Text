// Essai du zoom de la page : Ctrl + molette, barre de zoom (curseur et valeur tapée), Ctrl 0 / Ctrl −,
// découpage en pages juste à 130 %, double page en mode avancé sous 60 % (pages côte à côte, la vue
// suit le curseur, la molette passe aux deux pages suivantes), retour à la vue normale, export Word
// identique quel que soit le zoom, zoom gardé dans les réglages.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page, calls }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  await page.evaluate((l) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = Array.from({ length: 40 }, (_, i) => (i % 8 === 0 ? `<h2>Partie ${i / 8 + 1}</h2>` : '') + `<p>${i + 1}. ${l.repeat(3)}</p>`).join('') + '<p id="fin">Dernière ligne du texte.</p>';
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
  }, LOREM);
  await page.waitForTimeout(300);
  const z = () => page.evaluate(() => ({ zoom: window.FTZoom.get(), css: document.getElementById('page').style.zoom, slider: document.getElementById('zoom-slider').value, field: document.getElementById('zoom-value').value }));

  // 1. Ctrl + molette sur la page.
  const ws = await page.locator('#workspace').boundingBox();
  await page.mouse.move(ws.x + ws.width / 2, ws.y + 200);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await page.waitForTimeout(150);
  let st = await z();
  assert.deepStrictEqual(st, { zoom: 110, css: '1.1', slider: '110', field: '110' });
  ok('Ctrl + molette vers le haut : 110 %, curseur et valeur à jour');

  // 2. Valeur tapée, Ctrl 0, Ctrl −.
  await page.fill('#zoom-value', '150');
  await page.press('#zoom-value', 'Enter');
  await page.waitForTimeout(150);
  assert.strictEqual((await z()).zoom, 150);
  await page.click('#editor p');
  await page.keyboard.press('Control+Digit0');
  assert.strictEqual((await z()).zoom, 100);
  await page.keyboard.press('Control+Minus');
  st = await z();
  assert.strictEqual(st.zoom, 90);
  assert.strictEqual(st.css, '0.9');
  ok('valeur tapée 150 %, Ctrl+0 : 100 %, Ctrl+− : 90 %');
  await page.click('#zoom-in');
  assert.strictEqual((await z()).zoom, 100);
  ok('bouton + : 100 %');

  // 3. Mode avancé à 130 % : les pages se coupent aux mêmes endroits qu'à 100 %.
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(800);
  const breaks = () => page.evaluate(() => [...document.querySelectorAll('#editor .ft-pg-gap')].map((g) => {
    let n = g.nextSibling || g.nextElementSibling;
    while (n && !(n.textContent || '').trim()) n = n.nextSibling;
    return (n ? n.textContent : '').trim().slice(0, 24);
  }));
  const b100 = await breaks();
  await page.evaluate(() => window.FTZoom.set(130));
  await page.waitForTimeout(600);
  const b130 = await breaks();
  const k = await page.evaluate(() => document.getElementById('page').currentCSSZoom);
  assert(b100.length >= 3 && Math.abs(k - 1.3) < 0.001, JSON.stringify({ b100, k }));
  assert.deepStrictEqual(b130, b100);
  ok(`mode avancé à 130 % : ${b100.length + 1} pages, coupées aux mêmes endroits qu'à 100 %`);

  // Export Word à 130 % : le même document qu'à 100 %.
  const docXml = async () => {
    const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
    const zip = await JSZip.loadAsync(Buffer.from(bytes));
    return zip.file('word/document.xml').async('string');
  };
  const at130 = await docXml();
  assert.strictEqual((await z()).zoom, 130, 'zoom remis après l’export');
  await page.evaluate(() => window.FTZoom.set(100));
  await page.waitForTimeout(300);
  const at100 = await docXml();
  assert.strictEqual(at130, at100);
  ok('export Word identique à 130 % et à 100 %, zoom remis ensuite');

  // 4. Sous 60 % : double page.
  await page.evaluate(() => window.FTZoom.set(50));
  await page.waitForTimeout(500);
  st = await page.evaluate(() => {
    const s = window.FTZoom.state();
    const sheets = [...document.querySelectorAll('#dp-sheets .dp-sheet')].slice(0, 2).map((e) => e.getBoundingClientRect());
    const p = document.getElementById('page').getBoundingClientRect();
    return {
      double: document.getElementById('app').classList.contains('zoom-double'), s,
      // (Moteur 2.0 : les intercalaires restent, sans hauteur, comme sauts de colonne.)
      gaps: [...document.querySelectorAll('#editor .ft-pg-gap')].filter((g) => g.getBoundingClientRect().height > 1).length,
      side: sheets.length === 2 && Math.abs(sheets[0].top - sheets[1].top) < 1 && sheets[1].left > sheets[0].right,
      inView: sheets.length === 2 && sheets[0].left >= p.left - 1 && sheets[1].right <= p.right + 1,
      label: document.getElementById('zoom-spread').textContent,
      first: (() => { const r = document.caretRangeFromPoint(p.left + 60, p.top + 60); return r && r.startContainer.textContent.slice(0, 8); })()
    };
  });
  assert(st.double && st.s && st.s.pages > 4 && st.s.spread === 0 && st.gaps === 0 && st.side && st.inView, JSON.stringify(st));
  assert(/^1–2 \/ \d+$/.test(st.label), st.label);
  ok(`50 % en mode avancé : double page (${st.s.pages} pages, « ${st.label} »), pages côte à côte`);
  await page.screenshot({ path: path.join(SHOTS, 'zoom-double-page.png') });

  // La molette passe aux deux pages suivantes.
  const box = await page.locator('#page').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(300);
  assert.strictEqual((await page.evaluate(() => window.FTZoom.state())).spread, 1);
  await page.click('#zoom-prev');
  assert.strictEqual((await page.evaluate(() => window.FTZoom.state())).spread, 0);
  ok('molette : pages 3–4 ; bouton ‹ : retour aux pages 1–2');

  // Le curseur au bout du texte : la dernière double page s'affiche, et on écrit dedans.
  await page.evaluate(() => {
    const fin = document.getElementById('fin');
    const r = document.createRange();
    r.selectNodeContents(fin);
    r.collapse(false);
    document.getElementById('editor').focus();
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.waitForTimeout(300);
  await page.keyboard.type(' Ajout.');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => {
    const s = window.FTZoom.state();
    const fin = document.getElementById('fin').getBoundingClientRect();
    const p = document.getElementById('page').getBoundingClientRect();
    return { s, text: document.getElementById('fin').textContent, inView: fin.left >= p.left && fin.right <= p.right };
  });
  assert(st.s.spread === Math.ceil(st.s.pages / 2) - 1 && st.inView && st.text.endsWith('Ajout.'), JSON.stringify(st));
  ok('curseur à la fin : la dernière double page suit, le texte s’écrit');
  await page.screenshot({ path: path.join(SHOTS, 'zoom-double-fin.png') });

  // 5. Retour au-dessus de 60 % : vue normale, pages refaites.
  await page.evaluate(() => window.FTZoom.set(75));
  await page.waitForTimeout(600);
  st = await page.evaluate(() => ({
    double: document.getElementById('app').classList.contains('zoom-double'),
    // (Moteur 2.0 : les intercalaires restent, sans hauteur, comme sauts de colonne.)
      gaps: [...document.querySelectorAll('#editor .ft-pg-gap')].filter((g) => g.getBoundingClientRect().height > 1).length,
    sheets: document.querySelectorAll('#dp-sheets').length,
    saved: (window.FTMoteur ? window.FTEditor.getHtml() : window.FTPages.clean(document.getElementById('editor').innerHTML)).includes('Ajout.')
  }));
  assert(!st.double && st.gaps >= 3 && st.sheets === 0 && st.saved, JSON.stringify(st));
  ok('75 % : vue normale, pages refaites, texte ajouté gardé');

  // En mode note, pas de double page même très petit.
  await page.click('#mode-switch button[data-mode="note"]');
  await page.evaluate(() => window.FTZoom.set(30));
  await page.waitForTimeout(300);
  assert(!(await page.evaluate(() => document.getElementById('app').classList.contains('zoom-double'))));
  ok('mode note à 30 % : une seule page, réduite');

  // 6. Le zoom est gardé dans les réglages.
  const saved = await page.evaluate(() => window.frameText.loadSettings());
  assert.strictEqual(saved.zoom, 30);
  assert(calls.includes('settings:save'));
  await page.evaluate(() => window.FTZoom.set(100));
  ok('zoom gardé dans les réglages du logiciel');
};
