// Essai des légendes numérotées et de la table des illustrations : légende d'image (Figure n),
// de schéma (Schéma n), de tableau (Tableau n), renumérotation, table des illustrations
// (insertion, contenu, pages en mode avancé, clic), export Word, suppression d'une légende.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 140;
    const g = c.getContext('2d');
    g.fillStyle = '#c9a36b'; g.fillRect(0, 0, 240, 140);
    g.fillStyle = '#5a7d4f'; g.fillRect(20, 30, 120, 80);
    const src = c.toDataURL('image/png');
    const img = (id) => `<p><span class="ft-image" id="${id}" data-wrap="ligne" contenteditable="false" style="width: 40%"><img src="${src}" alt=""></span></p>`;
    const para = (t) => `<p>${t} ` + 'Le texte décrit les illustrations et renvoie à leur numéro. '.repeat(6) + '</p>';
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Rapport de terrain</h1><p id="lof-here"><br></p>' + para('Introduction.') + img('img-a') + para('Suite.') +
      '<table class="ft-table" id="tab-a"><tbody><tr><td>Site</td><td>pH</td></tr><tr><td>Nord</td><td>6,2</td></tr></tbody></table>' +
      para('Analyse.') + img('img-b') + para('Fin.');
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(300);

  const caption = async (id, kind) => {
    const box = await page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); document.getElementById(i).scrollIntoView({ block: 'center' }); const q = document.getElementById(i).getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, id);
    await page.mouse.click(box.x, box.y, { button: 'right' });
    await page.waitForTimeout(150);
    // (2.5 : mini-menu « Encadrage » ; le curseur passe dans la légende quand il se ferme.)
    await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent === 'Encadrage…').click());
    await page.waitForTimeout(150);
    await page.click('#image-frame-pop .seg button:text-is("Dessous")');
    await page.waitForTimeout(150);
    if (kind) {
      await page.click(`#image-frame-pop .seg button:text-is("${kind}")`);
      await page.waitForTimeout(150);
    }
    await page.click('#image-frame-pop .pop-done');
    await page.waitForTimeout(150);
  };

  // 1. Légende d'image : numérotée « Figure 1 » d'office.
  await caption('img-a');
  await page.keyboard.type('Carte des sols');
  await page.waitForTimeout(100);
  let st = await page.evaluate(() => {
    const c = document.querySelector('#img-a > .ft-caption');
    return { num: c.parentElement.dataset.num, cap: c.dataset.cap, text: c.textContent, before: getComputedStyle(c, '::before').content };
  });
  assert(st.num === 'figure' && st.cap === 'Figure 1' && st.text === 'Carte des sols' && /Figure 1/.test(st.before), JSON.stringify(st));
  ok('légende d’image : « Figure 1 : Carte des sols »');

  // 2. Deuxième image en schéma : « Schéma 1 ».
  await caption('img-b', 'Schéma 1');
  await page.keyboard.type('Coupe du terrain');
  await page.waitForTimeout(400); // (moteur 2.0 : numéros remis à jour après une pause de la frappe)
  st = await page.evaluate(() => { const c = document.querySelector('#img-b > .ft-caption'); return { num: c.parentElement.dataset.num, cap: c.dataset.cap, text: c.textContent }; });
  assert(st.num === 'schema' && st.cap === 'Schéma 1' && st.text === 'Coupe du terrain', JSON.stringify(st));
  ok('numérotation « Schéma n » : « Schéma 1 : Coupe du terrain »');

  // 3. Légende de tableau (clic droit dans le tableau), au-dessus ; Entrée passe dans le tableau.
  const cell = await page.evaluate(() => { const td = document.querySelector('#tab-a td'); td.scrollIntoView({ block: 'center' }); const r = td.getBoundingClientRect(); return { x: r.left + 10, y: r.top + 8 }; });
  await page.mouse.click(cell.x, cell.y, { button: 'right' });
  await page.waitForTimeout(150);
  await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent === 'Ajouter une légende (Tableau n)').click());
  await page.keyboard.type('Mesures du pH');
  await page.keyboard.press('Enter');
  await page.keyboard.type('X');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => {
    const t = document.getElementById('tab-a');
    const l = t.previousElementSibling;
    return { cls: l.className, kind: l.dataset.kind, cap: l.dataset.cap, text: l.textContent, cell: t.rows[0].cells[0].textContent, legends: document.querySelectorAll('#editor p.ft-legend').length };
  });
  assert(st.cls === 'ft-legend' && st.kind === 'tableau' && st.cap === 'Tableau 1' && st.text === 'Mesures du pH' && st.legends === 1 && /X/.test(st.cell), JSON.stringify(st));
  await page.keyboard.press('Backspace');
  ok('légende de tableau au-dessus : « Tableau 1 : Mesures du pH », Entrée → première case');

  // 4. Une figure ajoutée avant : les numéros suivent l'ordre du texte.
  await page.evaluate(() => {
    const a = document.getElementById('img-a').closest('p');
    const p = document.createElement('p');
    p.innerHTML = a.innerHTML.replace('id="img-a"', 'id="img-0"');
    p.querySelector('.ft-caption').textContent = 'Plan du site';
    a.before(p);
    document.getElementById('editor').dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(400);
  st = await page.evaluate(() => [...document.querySelectorAll('#editor [data-cap]')].map((e) => e.dataset.cap));
  assert.deepStrictEqual(st, ['Figure 1', 'Figure 2', 'Tableau 1', 'Schéma 1']);
  ok('renumérotation : ' + st.join(', '));

  // 5. Table des illustrations, par le bouton de la barre d'insertion.
  await page.evaluate(() => { const p = document.getElementById('lof-here'); p.scrollIntoView(); const r = document.createRange(); r.setStart(p, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.click('#lof-btn');
  await page.waitForTimeout(150);
  await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent === 'Table des illustrations').click());
  await page.waitForTimeout(400);
  st = await page.evaluate(() => {
    const lof = document.querySelector('#editor .ft-lof');
    return { kind: lof.dataset.kind, ce: lof.getAttribute('contenteditable'), label: lof.querySelector('.ft-lof-label').textContent,
      rows: [...lof.querySelectorAll('.ft-lof-item')].map((r) => r.textContent), prev: lof.previousElementSibling.className };
  });
  assert(st.kind === 'tout' && st.ce === 'false' && st.label === 'Table des illustrations' && st.prev === 'ft-title', JSON.stringify(st));
  assert.deepStrictEqual(st.rows, ['Figure 1 : Plan du site', 'Figure 2 : Carte des sols', 'Tableau 1 : Mesures du pH', 'Schéma 1 : Coupe du terrain']);
  ok('table des illustrations : 4 lignes dans l’ordre du texte');
  // Le texte d'une légende change : la table suit.
  // (Écrite au clavier : le moteur 2.0 relit une légende quand on la quitte.)
  const capBox = await page.evaluate(() => { const c = document.querySelector('#img-b > .ft-caption'); c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(capBox.x, capBox.y);
  await page.evaluate(() => window.__ftEmit('menu', ['select-all'])); // Ctrl+A (menu) : le texte de la légende
  await page.keyboard.type('Coupe nord-sud');
  await page.evaluate(() => document.querySelector('#editor .ft-title').scrollIntoView({ block: 'center' }));
  await page.click('#editor .ft-title');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => document.querySelectorAll('#editor .ft-lof-item')[3].textContent);
  assert.strictEqual(st, 'Schéma 1 : Coupe nord-sud');
  ok('légende modifiée : table mise à jour');
  await page.screenshot({ path: path.join(SHOTS, 'illustrations-note.png') });

  // 6. Clic sur une ligne : on va au tableau.
  await page.evaluate(() => { document.getElementById('workspace').scrollTop = 0; });
  await page.evaluate(() => document.querySelectorAll('#editor .ft-lof-item')[2].click());
  await page.waitForTimeout(200);
  st = await page.evaluate(() => { const l = document.querySelector('#editor p.ft-legend'); const w = document.getElementById('workspace').getBoundingClientRect(); const r = l.getBoundingClientRect(); return { flash: l.classList.contains('ft-toc-flash') || !!document.querySelector('#page > .bm-glow'), top: r.top - w.top }; });
  assert(st.flash && st.top > 0 && st.top < 200, JSON.stringify(st));
  ok('clic sur « Tableau 1 » : la légende du tableau s’affiche et clignote');

  // 7. Mode avancé : numéros de page, égaux à ceux des légendes.
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(900);
  st = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#editor .ft-lof-item')];
    const list = window.FTCaptions.list();
    return rows.map((r, i) => [r.querySelector('.ft-lof-page') && r.querySelector('.ft-lof-page').textContent, String(window.FTPages.pageNumberOf(list[i].box))]);
  });
  assert(st.every(([a, b]) => a && a === b), JSON.stringify(st));
  ok('mode avancé : pages ' + st.map((x) => x[0]).join(', '));
  await page.screenshot({ path: path.join(SHOTS, 'illustrations-avance.png') });

  // 8. La légende d'un tableau ne reste pas seule en bas de page.
  // (Moteur 2.0 : le texte passe par le moteur, les pages sont celles de son découpage.)
  const keptEngine = () => page.evaluate(() => {
    const v = window.FTMoteur.view;
    const V = window.FTVisibles;
    const doc0 = v.state.doc;
    // Légende : le paragraphe juste avant le tableau.
    let li = -1;
    let pos = 0;
    for (let i = 0; i < doc0.childCount; pos += doc0.child(i).nodeSize, i++) if (doc0.child(i).type.name === 'table') { li = i - 1; pos -= doc0.child(i - 1).nodeSize; break; }
    const padPos = pos;
    v.dispatch(v.state.tr.insert(padPos, v.state.schema.nodes.paragraph.create()));
    let atBottom = 0;
    for (let k = 0; k < 700; k += 3) {
      const pad = v.state.doc.nodeAt(padPos);
      v.dispatch(v.state.tr.replaceWith(padPos + 1, padPos + pad.nodeSize - 1, v.state.schema.text('mot '.repeat(1 + k * 3).trim())));
      V.update();
      const lp = V.pageOfBlock(li + 1);
      const tp = V.pageOfBlock(li + 2);
      if (lp !== null && tp !== null && tp !== lp) return { same: false, lp, tp, k };
    }
    const pad = v.state.doc.nodeAt(padPos);
    v.dispatch(v.state.tr.delete(padPos, padPos + pad.nodeSize));
    return { same: true, lp: V.pageOfBlock(li + 1), atBottom };
  });
  const kept = await page.evaluate(() => !!window.FTMoteur) ? await keptEngine() : await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const legend = ed.querySelector('p.ft-legend');
    const table = document.getElementById('tab-a');
    const o = () => document.getElementById('page').getBoundingClientRect().top;
    const pageOf = (el) => { const y = el.getBoundingClientRect().top - o(); return window.FTPages._geo().findIndex((g) => y < g.top + g.h); };
    // Texte ajouté avant la légende, mot par mot, sur plus d'une page : la légende passe par le bas de page.
    const pad = document.createElement('p');
    pad.id = 'pad';
    legend.before(pad);
    let atBottom = 0;
    for (let k = 0; k < 700; k++) {
      pad.textContent = 'mot '.repeat(1 + k * 3);
      window.FTPages.refresh();
      const lp = pageOf(legend);
      const g = window.FTPages._geo()[lp];
      if (g && g.cb - (legend.getBoundingClientRect().bottom - o()) < 30) atBottom++;
      const tp = pageOf(table.rows[0]);
      if (tp !== lp) return { same: false, lp, tp, k };
    }
    return { same: true, lp: pageOf(legend), atBottom };
  });
  assert(kept.same, JSON.stringify(kept));
  if (!await page.evaluate(() => !!window.FTMoteur)) await page.evaluate(() => { document.getElementById('pad').remove(); document.getElementById('editor').dispatchEvent(new Event('input')); window.FTPages.refresh(); });
  ok("légende jamais séparée de son tableau (700 longueurs de texte essayées avant elle)");

  // 9. Contenu de la table : liste des tableaux seulement (clic droit).
  const lofBox = await page.evaluate(() => { const l = document.querySelector('#editor .ft-lof'); l.scrollIntoView({ block: 'center' }); const r = l.getBoundingClientRect(); return { x: r.right - 30, y: r.top + 10 }; });
  await page.mouse.click(lofBox.x, lofBox.y, { button: 'right' });
  await page.waitForTimeout(150);
  await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent === 'Contenu').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => [...document.querySelectorAll('.context-menu button')].find((b) => /Liste des tableaux/.test(b.textContent)).click());
  await page.waitForTimeout(300);
  st = await page.evaluate(() => ({ label: document.querySelector('#editor .ft-lof-label').textContent, rows: document.querySelectorAll('#editor .ft-lof-item').length }));
  assert(st.label === 'Liste des tableaux' && st.rows === 1, JSON.stringify(st));
  ok('clic droit > Contenu > Liste des tableaux : 1 ligne');
  await page.evaluate(() => { const l = document.querySelector('#editor .ft-lof'); l.dataset.kind = 'tout'; window.FTCaptions.refresh(); });

  // 10. Export Word : numéros devant les légendes, table avec points de conduite.
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  const plain = xml.replace(/<[^>]+>/g, '');
  assert(/Figure 2 : Carte des sols/.test(plain), 'Figure 2 dans Word');
  assert(/Tableau 1 : Mesures du pH/.test(plain), 'Tableau 1 dans Word');
  assert(/Schéma 1 : Coupe nord-sud/.test(plain), 'Schéma 1 dans Word');
  assert(/Table des illustrations/.test(plain) && /w:leader="dot"/.test(xml), 'table');
  const at = xml.lastIndexOf('Mesures du pH');
  const legendXml = xml.slice(xml.lastIndexOf('<w:p>', at), at);
  assert(/<w:keepNext\/>/.test(legendXml), 'keepNext');
  ok('Word : « Figure 2 : », « Tableau 1 : », « Schéma 1 : », table avec points de conduite, légende liée au tableau');

  // 11. Numérotation retirée (fenêtre de la légende) : les autres numéros suivent.
  await page.click('#mode-switch button[data-mode="note"]');
  await page.waitForTimeout(400);
  const box0 = await page.evaluate(() => { const o = document.querySelector('#img-0 > img'); o.scrollIntoView({ block: 'center' }); const r = o.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(box0.x, box0.y, { button: 'right' });
  await page.waitForTimeout(150);
  await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent === 'Encadrage…').click());
  await page.waitForTimeout(150);
  await page.click('#image-frame-pop .seg button:text-is("Sans numéro")');
  await page.click('#image-frame-pop .pop-done');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ caps: [...document.querySelectorAll('#editor [data-cap]')].map((e) => e.dataset.cap), rows: document.querySelectorAll('#editor .ft-lof-item').length }));
  assert(st.caps[0] === 'Figure 1' && st.rows === 3, JSON.stringify(st));
  ok('légende sans numéro : sortie de la table, « Carte des sols » redevient Figure 1');

  // 12. Retour arrière dans une légende de tableau vide : elle disparaît.
  await page.evaluate(() => { const l = document.querySelector('#editor p.ft-legend'); l.innerHTML = '<br>'; const r = document.createRange(); r.setStart(l, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); document.getElementById('editor').focus(); });
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ legends: document.querySelectorAll('#editor p.ft-legend').length, rows: document.querySelectorAll('#editor .ft-lof-item').length, table: !!document.getElementById('tab-a') }));
  assert(st.legends === 0 && st.rows === 2 && st.table, JSON.stringify(st));
  ok('légende vide effacée : le tableau reste, la table des illustrations suit');
};
