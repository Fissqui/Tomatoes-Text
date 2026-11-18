// Essai des colonnes sur un passage : sélection au milieu d'un paragraphe, clic droit > Colonnes >
// « Passage en 2 colonnes » (seul le passage passe en colonnes, la ligne est coupée avant et après) ;
// sur plusieurs paragraphes ; trois colonnes ; Ctrl+Z ; mode avancé ; export Word (colonnes de section).
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const load = (html) => page.evaluate((h) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = h;
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
  }, html);
  // Sélectionne du mot a (dans #ia) au mot b (dans #ib), mots compris.
  const select = (ia, a, ib, b) => page.evaluate(([ia, a, ib, b]) => {
    const find = (id, w, end) => {
      const walk = document.createTreeWalker(document.getElementById(id), NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) { const i = t.data.indexOf(w); if (i >= 0) return [t, end ? i + w.length : i]; }
      return null;
    };
    document.getElementById('editor').focus();
    getSelection().setBaseAndExtent(...find(ia, a, false), ...find(ib, b, true));
  }, [ia, a, ib, b]);
  const columns = async (label) => {
    const r = await page.evaluate(() => { const b = getSelection().getRangeAt(0).getClientRects()[0]; return { x: b.left + 4, y: b.top + b.height / 2 }; });
    await page.mouse.click(r.x, r.y, { button: 'right' });
    await page.waitForTimeout(150);
    await page.locator('.context-menu').getByText('Colonnes', { exact: true }).hover();
    await page.waitForTimeout(150);
    await page.locator('#context-submenu').getByText(label).click();
    await page.waitForTimeout(200);
  };
  const shape = () => page.evaluate(() => [...document.getElementById('editor').children].map((b) =>
    b.classList.contains('ft-cols') ? { cols: b.dataset.cols, inner: [...b.children].map((c) => c.textContent) } : b.textContent));

  // 1. Au milieu d'un paragraphe.
  await load(`<p id="a">Avant le passage. Début du passage ${LOREM.repeat(3)}fin du passage. Après le passage.</p><p>Suite.</p>`);
  await select('a', 'Début', 'a', 'fin du passage.');
  await columns('Passage en 2 colonnes');
  let st = await shape();
  assert.strictEqual(st.length, 4, JSON.stringify(st));
  assert.strictEqual(st[0], 'Avant le passage.');
  assert.strictEqual(st[1].cols, '2');
  assert(st[1].inner.length === 1 && st[1].inner[0].startsWith('Début du passage') && st[1].inner[0].endsWith('fin du passage.'), JSON.stringify(st[1]));
  assert.strictEqual(st[2], 'Après le passage.');
  const cc = await page.evaluate(() => getComputedStyle(document.querySelector('#editor .ft-cols')).columnCount);
  assert.strictEqual(cc, '2');
  ok('passage au milieu d’un paragraphe : seul le passage en 2 colonnes, la ligne coupée avant et après');
  await page.screenshot({ path: path.join(SHOTS, 'colonnes-passage.png') });

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  st = await shape();
  assert.strictEqual(st.length, 2);
  assert(st[0].startsWith('Avant le passage. Début') && st[0].endsWith('Après le passage.'), st[0]);
  ok('Ctrl+Z : le paragraphe revient entier');

  // 2. Sur plusieurs paragraphes, en trois colonnes.
  await load(`<p id="p1">Un premier. Deux premier.</p><p id="p2">${LOREM}</p><p id="p3">Trois dernier. Quatre dernier.</p>`);
  await select('p1', 'Deux', 'p3', 'Trois dernier.');
  await columns('Passage en 3 colonnes');
  st = await shape();
  assert.deepStrictEqual(st[0], 'Un premier.');
  assert.strictEqual(st[1].cols, '3');
  assert.deepStrictEqual(st[1].inner, ['Deux premier.', LOREM, 'Trois dernier.']);
  assert.strictEqual(st[2], 'Quatre dernier.');
  ok('trois paragraphes, sélection du milieu du 1ᵉʳ au milieu du 3ᵉ : passage en 3 colonnes');

  // Paragraphes entiers : rien n'est coupé ; la sélection qui finit au début d'une ligne ne la prend pas.
  await load(`<p id="q1">Premier entier.</p><p id="q2">Second entier.</p><p id="q3">Hors zone.</p>`);
  await page.evaluate(() => {
    document.getElementById('editor').focus();
    getSelection().setBaseAndExtent(document.getElementById('q1').firstChild, 0, document.getElementById('q3').firstChild, 0);
  });
  await columns('Passage en 2 colonnes');
  st = await shape();
  assert.deepStrictEqual(st.slice(0, 2), [{ cols: '2', inner: ['Premier entier.', 'Second entier.'] }, 'Hors zone.']);
  ok('paragraphes entiers sélectionnés : en colonnes sans coupure ; la ligne suivante reste dehors');

  // Dans une zone, le clic droit propose les réglages de la zone (pas « Colonnes » à nouveau).
  await select('q1', 'Premier', 'q1', 'entier.');
  const r = await page.evaluate(() => { const b = getSelection().getRangeAt(0).getClientRects()[0]; return { x: b.left + 4, y: b.top + b.height / 2 }; });
  await page.mouse.click(r.x, r.y, { button: 'right' });
  await page.waitForTimeout(150);
  const items = await page.evaluate(() => [...document.querySelectorAll('.context-menu:not([hidden]) > button')].map((b) => b.textContent.trim()));
  assert(items.some((t) => /Trois colonnes/.test(t)) && !items.includes('Colonnes'), items.join(' | '));
  await page.keyboard.press('Escape');
  ok('dans une zone : réglages de la zone (deux, trois colonnes, ligne, retirer)');

  // 3. Mode avancé et export Word.
  await load(`<p id="a">Avant le passage. Début du passage ${LOREM.repeat(4)}fin du passage. Après le passage.</p>`);
  await select('a', 'Début', 'a', 'fin du passage.');
  await columns('Passage en 2 colonnes');
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(800);
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#editor .ft-cols')).columnCount), '2');
  ok('mode avancé : la zone reste en 2 colonnes');
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const xml = await zip.file('word/document.xml').async('string');
  assert(/<w:cols[^>]*w:num="2"/.test(xml), 'colonnes dans Word');
  ok('export Word : section en 2 colonnes autour du passage');

  // Zone plus longue qu'une page en mode avancé : elle continue sur la page suivante, toujours en colonnes,
  // et le texte enregistré n'a qu'une seule zone.
  await page.evaluate((l) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p>Avant la zone.</p><div class="ft-cols" data-cols="2">' + Array.from({ length: 30 }, (_, i) => `<p>${i + 1}. ${l.repeat(2)}</p>`).join('') + '<p id="z-fin">Fin de la zone.</p></div><p id="apres">Après la zone.</p>';
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
  }, LOREM);
  await page.waitForTimeout(800);
  st = await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const zones = [...ed.querySelectorAll(':scope > .ft-cols')];
    const over = zones.map((z) => {
      const r = z.getBoundingClientRect();
      const cs = getComputedStyle(z);
      return { cols: cs.columnCount, h: Math.round(r.height), sh: z.scrollWidth <= z.clientWidth + 1 };
    });
    const saved = window.FTMoteur ? window.FTEditor.getHtml() : window.FTPages.clean(ed.innerHTML);
    const tmp = document.createElement('div');
    tmp.innerHTML = saved;
    // (Moteur 2.0 : une seule zone, coupée par un intercalaire à chaque page.)
    const parts = zones.reduce((n, z) => n + 1 + z.querySelectorAll(':scope > .ft-pg-gap').length, 0);
    const pages = window.FTMoteur ? zones.flatMap((z) => [...z.querySelectorAll(':scope > .ft-pg-gap')].map((g) => {
      const r = g.getBoundingClientRect();
      const prev = g.previousElementSibling.getBoundingClientRect();
      const next = g.nextElementSibling.getBoundingClientRect();
      return { gap: Math.round(r.height), prevOk: prev.bottom <= r.top + 1, nextOk: next.top >= r.bottom - 1 };
    })) : [];
    return {
      zones: parts, over, pages,
      saved: tmp.querySelectorAll(':scope > .ft-cols').length,
      savedKids: tmp.querySelector('.ft-cols').children.length,
      cont: saved.includes('ft-pg-cont'),
      fin: !!document.getElementById('z-fin'), apres: document.getElementById('apres').getBoundingClientRect().top > zones[zones.length - 1].getBoundingClientRect().bottom - 1
    };
  });
  assert(st.zones >= 2 && st.over.every((o) => o.cols === '2' && o.sh) && st.saved === 1 && st.savedKids === 31 && !st.cont && st.fin && st.apres, JSON.stringify(st));
  ok(`mode avancé : zone longue sur ${st.zones} pages, en colonnes sur chacune ; une seule zone enregistrée`);
  await page.screenshot({ path: path.join(SHOTS, 'colonnes-zone-longue.png') });

  // On écrit dans la suite de la zone : le texte reste dans la zone.
  await page.evaluate(() => {
    const fin = document.getElementById('z-fin');
    const r = document.createRange();
    r.selectNodeContents(fin);
    r.collapse(false);
    document.getElementById('editor').focus();
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.keyboard.type(' Ajout.');
  await page.waitForTimeout(600);
  st = await page.evaluate(() => {
    const tmp = document.createElement('div');
    tmp.innerHTML = (window.FTMoteur ? window.FTEditor.getHtml() : window.FTPages.clean(document.getElementById('editor').innerHTML));
    return { last: tmp.querySelector('.ft-cols').lastElementChild.textContent, zones: tmp.querySelectorAll('.ft-cols').length, sel: getSelection().anchorNode.parentElement.id || getSelection().anchorNode.id };
  });
  assert.deepStrictEqual(st, { last: 'Fin de la zone. Ajout.', zones: 1, sel: 'z-fin' });
  ok('écrit dans la suite de la zone : texte gardé dans la zone, curseur en place');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => document.getElementById('z-fin').textContent), 'Fin de la zone.');
  ok('Ctrl+Z : retour au texte d’avant');
  await page.click('#mode-switch button[data-mode="note"]');
};
