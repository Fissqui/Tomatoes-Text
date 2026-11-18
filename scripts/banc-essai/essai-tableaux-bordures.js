// Essai des bordures de tableau et des cases fusionnées : clic droit > Bordures (toutes, extérieures,
// intérieures, aucune, chaque trait à part, épaisseur, retour au style) ; « Fusionner les cellules » sur
// une sélection, « Fractionner la cellule » ; lignes et colonnes ajoutées ou supprimées autour d'une case
// fusionnée ; largeur des colonnes à la souris ; découpage en pages jamais au milieu d'une case fusionnée ;
// export Word (traits, gridSpan, vMerge) ; Ctrl+Z.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const load = (html) => page.evaluate((h) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = h;
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
  }, html);
  const grid3 = (id = 't', style = 'quadrille') => `<p>Avant.</p><table class="ft-table" id="${id}" data-style="${style}" data-t="2"><tbody>` +
    ['1', '2', '3'].map((r) => '<tr>' + ['A', 'B', 'C'].map((c) => `<td>${c}${r}</td>`).join('') + '</tr>').join('') + '</tbody></table><p>Après.</p>';
  const cellBox = (text) => page.evaluate((t) => {
    const c = [...document.querySelectorAll('#editor td')].find((x) => x.textContent.trim().startsWith(t));
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom };
  }, text);
  const menu = async (text, path_) => {
    const b = await cellBox(text);
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.waitForTimeout(120);
    for (let i = 0; i < path_.length; i++) {
      const scope = i === 0 ? page.locator('.context-menu:not([hidden])').first() : page.locator('#context-submenu');
      await scope.getByText(path_[i], { exact: false }).first().click();
      await page.waitForTimeout(120);
    }
  };
  const items = async (text) => {
    const b = await cellBox(text);
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.waitForTimeout(120);
    const list = await page.evaluate(() => [...document.querySelectorAll('.context-menu:not([hidden]) > button')].map((x) => x.textContent.trim()));
    await page.keyboard.press('Escape');
    return list;
  };
  // Traits affichés : épaisseur de chaque côté du tableau et de deux cases du milieu.
  const lines = () => page.evaluate(() => {
    const t = document.getElementById('t');
    const w = (el, side) => parseFloat(getComputedStyle(el)[`border${side}Width`]) || 0;
    const style = (el, side) => getComputedStyle(el)[`border${side}Style`];
    const on = (el, side) => (style(el, side) !== 'none' && style(el, side) !== 'hidden' ? w(el, side) : 0);
    const b2 = t.rows[1].cells[1];
    return { top: on(t, 'Top'), bottom: on(t, 'Bottom'), left: on(t, 'Left'), right: on(t, 'Right'), h: on(b2, 'Top'), v: on(b2, 'Left'), attr: t.getAttribute('data-borders') };
  });

  // 1. Bordures.
  await load(grid3());
  let st = await items('B2');
  assert(st.includes('Bordures'), st.join(' | '));
  await menu('B2', ['Bordures', 'Bordures extérieures']);
  st = await lines();
  assert.deepStrictEqual(st, { top: 1, bottom: 1, left: 1, right: 1, h: 0, v: 0, attr: 'haut bas gauche droite' });
  ok('Bordures > « Bordures extérieures » : le tour seulement');
  await page.screenshot({ path: path.join(SHOTS, 'tableau-bordures-exterieures.png'), clip: { x: 260, y: 140, width: 1040, height: 260 } });
  await menu('B2', ['Bordures', 'Lignes intérieures horizontales']);
  st = await lines();
  assert.deepStrictEqual([st.h, st.v, st.attr], [1, 0, 'haut bas gauche droite h']);
  await menu('B2', ['Bordures', 'Bordure gauche']);
  await menu('B2', ['Bordures', 'Bordure droite']);
  st = await lines();
  assert.deepStrictEqual([st.left, st.right, st.attr], [0, 0, 'haut bas h']);
  ok('chaque trait à part : lignes horizontales ajoutées, bords gauche et droit retirés');
  await menu('B2', ['Bordures', 'Traits épais']);
  st = await lines();
  assert.deepStrictEqual([st.top, st.h], [3, 3]);
  await menu('B2', ['Bordures', 'Bordures intérieures']);
  st = await lines();
  assert.deepStrictEqual([st.top, st.left, st.h, st.v], [0, 0, 3, 3]);
  ok('« Traits épais », « Bordures intérieures »');

  // Word : le tour du tableau et les traits des cases.
  await menu('B2', ['Bordures', 'Traits fins']);
  await menu('B2', ['Bordures', 'Bordures extérieures']);
  let bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  let xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  const tbl = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'));
  const tb = /<w:tblBorders>([\s\S]*?)<\/w:tblBorders>/.exec(tbl);
  assert(tb && /<w:top w:val="single"/.test(tb[1]) && /<w:left w:val="single"/.test(tb[1]), 'tour du tableau dans Word');
  const inner = (tbl.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [])[4];
  assert(inner && !/<w:top w:val="single"/.test(inner) && !/<w:left w:val="single"/.test(inner), 'pas de trait intérieur dans Word');
  ok('export Word : tour du tableau, aucun trait intérieur');

  await menu('B2', ['Bordures', 'Aucune bordure']);
  st = await lines();
  assert.deepStrictEqual(st, { top: 0, bottom: 0, left: 0, right: 0, h: 0, v: 0, attr: '' });
  await menu('B2', ['Bordures', 'Bordures du style']);
  st = await lines();
  assert(st.attr === null && st.h === 1 && st.v === 1, JSON.stringify(st));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  assert.strictEqual((await lines()).attr, '');
  ok('« Aucune bordure », « Bordures du style » (retour au quadrillage), Ctrl+Z');

  // Partir du style : « Lignes » n'a que des traits horizontaux ; retirer celui du bas garde le reste.
  await load(grid3('t', 'lignes'));
  await menu('B2', ['Bordures', 'Bordure inférieure']);
  assert.strictEqual((await lines()).attr, 'h');
  ok('style « Lignes » : retirer la bordure inférieure garde les lignes intérieures');

  // 2. Fusionner.
  const shape = () => page.evaluate(() => {
    const t = document.getElementById('t');
    const rows = [...t.rows].filter((r) => !r.classList.contains('ft-pg-gap'));
    // Chaque ligne couverte une fois sur toute la largeur.
    const occ = rows.map(() => []);
    rows.forEach((tr, r) => {
      let c = 0;
      for (const cell of tr.cells) {
        while (occ[r][c]) c++;
        for (let i = 0; i < cell.rowSpan; i++) for (let j = 0; j < cell.colSpan; j++) {
          if (!occ[r + i]) throw new Error('case qui dépasse le tableau');
          if (occ[r + i][c + j]) throw new Error('cases qui se chevauchent');
          occ[r + i][c + j] = 1;
        }
        c += cell.colSpan;
      }
    });
    const widths = occ.map((o) => o.length);
    return {
      rows: rows.map((tr) => [...tr.cells].map((c) => (c.colSpan > 1 || c.rowSpan > 1 ? `${c.textContent.trim() || '·'}[${c.colSpan}×${c.rowSpan}]` : c.textContent.trim() || '·'))),
      even: widths.every((w) => w === widths[0] && occ.every((o) => o.every(Boolean))),
      width: widths[0]
    };
  });
  const selectCells = (a, b) => page.evaluate(([x, y]) => {
    const find = (t) => [...document.querySelectorAll('#editor td')].find((c) => c.textContent.trim().startsWith(t));
    const ca = find(x);
    const cb = find(y);
    document.getElementById('editor').focus();
    getSelection().setBaseAndExtent(ca.firstChild, 0, cb.firstChild, cb.firstChild.length);
  }, [a, b]);
  await load(grid3());
  await selectCells('A1', 'B2');
  st = await items('A1');
  assert(st.includes('Fusionner les cellules'), st.join(' | '));
  await selectCells('A1', 'B2');
  await menu('A1', ['Fusionner les cellules']);
  st = await shape();
  assert.deepStrictEqual(st.rows, [['A1B1A2B2[2×2]', 'C1'], ['C2'], ['A3', 'B3', 'C3']]);
  assert(st.even);
  const paras = await page.evaluate(() => [...document.querySelector('#t td[colspan]').children].map((p) => p.tagName + ':' + p.textContent));
  assert.deepStrictEqual(paras, ['P:A1', 'P:B1', 'P:A2', 'P:B2']);
  await page.screenshot({ path: path.join(SHOTS, 'tableau-fusion.png'), clip: { x: 260, y: 140, width: 1040, height: 260 } });
  ok('A1 à B2 sélectionnées > « Fusionner les cellules » : une case 2 × 2, un paragraphe par case réunie');

  // Ajouts et suppressions autour de la case fusionnée.
  await menu('A1B1', ['Lignes et colonnes', 'Ajouter une colonne à droite']);
  st = await shape();
  assert(st.even && st.width === 4, JSON.stringify(st));
  await menu('C1', ['Lignes et colonnes', 'Ajouter une ligne en dessous']);
  st = await shape();
  assert(st.even && st.rows[0][0] === 'A1B1A2B2[2×3]', JSON.stringify(st));
  ok('colonne ajoutée à droite de la case fusionnée, ligne ajoutée au travers : elle s’allonge');
  await menu('A3', ['Lignes et colonnes', 'Supprimer la ligne']);
  await menu('A1B1', ['Lignes et colonnes', 'Supprimer la colonne']);
  st = await shape();
  assert(st.even && st.width === 3 && st.rows[0][0] === 'A1B1A2B2[1×3]' && st.rows.length === 3, JSON.stringify(st));
  ok('ligne et colonne supprimées : la case fusionnée rétrécit, le tableau reste régulier');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  st = await shape();
  assert.deepStrictEqual(st.rows, [['A1B1A2B2[2×2]', 'C1'], ['C2'], ['A3', 'B3', 'C3']]);
  ok('Ctrl+Z : retour à la case 2 × 2');

  // Fractionner.
  await menu('A1B1', ['Fractionner la cellule']);
  st = await shape();
  assert(st.even && st.width === 3 && st.rows.every((r) => r.length === 3), JSON.stringify(st));
  assert.strictEqual(st.rows[0][0], 'A1B1A2B2');
  ok('« Fractionner la cellule » : 3 × 3 cases simples, le texte dans la première');

  // Une ligne entière réunie à la suivante : la ligne vide disparaît.
  await load(grid3());
  await selectCells('A2', 'C3');
  await menu('A2', ['Fusionner les cellules']);
  st = await shape();
  assert.deepStrictEqual(st.rows, [['A1', 'B1', 'C1'], ['A2B2C2A3B3C3[3×1]']]);
  ok('deux lignes entières fusionnées : une seule ligne, sans ligne vide');

  // Largeur des colonnes à la souris avec une case fusionnée en haut.
  await load(grid3());
  await selectCells('A1', 'C1');
  await menu('A1', ['Fusionner les cellules']);
  const a2 = await cellBox('A2');
  await page.mouse.move(a2.r - 1, a2.y);
  await page.mouse.down();
  await page.mouse.move(a2.r + 40, a2.y, { steps: 5 });
  await page.mouse.up();
  st = await page.evaluate(() => {
    const t = document.getElementById('t');
    const cols = [...t.querySelectorAll(':scope > colgroup > col')].map((c) => parseFloat(c.style.width));
    return { n: cols.length, cols, a: t.rows[1].cells[0].getBoundingClientRect().width, b: t.rows[1].cells[1].getBoundingClientRect().width };
  });
  assert(st.n === 3 && st.a > st.b + 50, JSON.stringify(st));
  ok('trait de colonne glissé sous une ligne fusionnée : 3 colonnes réglées, la première élargie');

  // 3. Export Word des cases fusionnées.
  await load(grid3());
  await selectCells('A1', 'B2');
  await menu('A1', ['Fusionner les cellules']);
  bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  assert(/<w:gridSpan w:val="2"\/>/.test(xml), 'gridSpan');
  assert(/<w:vMerge w:val="restart"\/>/.test(xml) && /<w:vMerge(?: w:val="continue")?\/>/.test(xml), 'vMerge');
  ok('export Word : case fusionnée sur 2 colonnes (gridSpan) et 2 lignes (vMerge)');

  // 4. Mode avancé : un long tableau aux cases fusionnées par 4 lignes n'est coupé qu'entre deux groupes.
  await page.evaluate(() => {
    const rows = Array.from({ length: 48 }, (_, i) => `<tr>${i % 4 === 0 ? `<td rowspan="4">Groupe ${i / 4 + 1}</td>` : ''}<td>Ligne ${i + 1}</td><td>Observation ${i + 1}</td></tr>`).join('');
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p>Avant.</p><table class="ft-table" id="t" data-style="quadrille" data-t="2"><tbody>' + rows + '</tbody></table><p>Après.</p>';
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
  });
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(900);
  st = await page.evaluate(() => {
    const t = document.getElementById('t');
    const all = [...t.rows];
    const breaks = [];
    let real = 0;
    for (const tr of all) {
      if (tr.classList.contains('ft-pg-gap')) { if (!tr.classList.contains('ft-pg-rhead')) breaks.push(real); } else real++;
    }
    return { breaks, pages: window.FTPages.pageNumberOf(all[all.length - 1]) };
  });
  assert(st.breaks.length >= 1 && st.breaks.every((k) => k % 4 === 0), JSON.stringify(st));
  ok(`mode avancé : tableau sur ${st.pages} pages, coupé seulement entre deux groupes de lignes fusionnées (lignes ${st.breaks.map((k) => k + 1).join(', ')})`);
  await page.click('#mode-switch button[data-mode="note"]');
};
