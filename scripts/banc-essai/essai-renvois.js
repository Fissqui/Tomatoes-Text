// Essai des renvois : fenêtre « Renvoi » (recherche, formats, aperçu), mise à jour quand les numéros
// ou les pages changent, ci-dessus / ci-dessous en mode note, page en mode avancé, cible supprimée,
// modification par double-clic, Ctrl+clic, export Word, mode lecture.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 120;
    const g = c.getContext('2d');
    g.fillStyle = '#88a'; g.fillRect(0, 0, 200, 120);
    const src = c.toDataURL('image/png');
    const para = (t) => `<p>${t} ` + 'Le raisonnement s’appuie sur les mesures et les observations du terrain. '.repeat(8) + '</p>';
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Étude</h1><p id="here">Comme le montre </p>' + para('Contexte.') +
      '<h2 id="h-methode">Méthode</h2>' + para('Protocole.') + para('Échantillons.') +
      '<p class="ft-legend" data-kind="tableau">Mesures du pH</p><table class="ft-table" id="tab"><tbody><tr><td>Site</td><td>pH</td></tr><tr><td>Nord</td><td>6,2</td></tr></tbody></table>' +
      para('Lecture du tableau.') + para('Interprétation.') + para('Discussion.') +
      `<p><span class="ft-image" id="img" data-num="figure" data-wrap="ligne" contenteditable="false" style="width: 35%"><img src="${src}" alt=""><span class="ft-caption" contenteditable="true">Carte</span></span></p>` +
      '<h2>Résultats</h2><p data-bm="bmcle" data-bm-name="Point clé">Le point clé du raisonnement.</p>' + para('Fin.') + para('Annexe.');
    ed.dispatchEvent(new Event('input'));
    const p = document.getElementById('here');
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.focus();
  });
  await page.waitForTimeout(400);

  // 1. Fenêtre : cibles groupées, recherche, aperçu, insertion.
  await page.click('#xref-btn');
  await page.waitForTimeout(200);
  let st = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('#xr-list .xr-group')].map((g) => g.textContent),
    items: document.querySelectorAll('#xr-list .xr-item').length, ok: document.getElementById('xr-ok').disabled
  }));
  assert.deepStrictEqual(st.groups, ['Titres', 'Figures', 'Tableaux', 'Signets']);
  assert(st.items === 6 && st.ok, JSON.stringify(st));
  ok('fenêtre : titres, figures, tableaux, signets (6 cibles), « Insérer » grisé sans cible');
  await page.keyboard.type('pH');
  await page.waitForTimeout(100);
  st = await page.evaluate(() => [...document.querySelectorAll('#xr-list .xr-item')].map((b) => b.textContent));
  assert.deepStrictEqual(st, ['Tableau 1 : Mesures du pH']);
  await page.click('#xr-list .xr-item');
  st = await page.evaluate(() => ({ preview: document.getElementById('xr-preview').textContent, formats: [...document.querySelectorAll('#xr-formats input')].map((i) => i.value + (i.checked ? '*' : '')) }));
  assert(st.preview === 'voir tableau 1' && st.formats.join() === 'label*,page,label-page,text', JSON.stringify(st));
  await page.screenshot({ path: path.join(SHOTS, 'renvoi-fenetre.png') });
  await page.click('#xr-ok');
  await page.keyboard.type(', puis ');
  st = await page.evaluate(() => ({ html: document.getElementById('here').innerHTML, xid: document.querySelector('#editor p.ft-legend').dataset.xid }));
  assert(/<span class="ft-xref" contenteditable="false" data-target="x:[a-z0-9]+" data-show="label"[^>]*>tableau 1<\/span>, puis( |&nbsp;)/.test(st.html) && st.xid, st.html);
  ok('recherche « pH » → « Tableau 1 », aperçu « voir tableau 1 », renvoi inséré, le curseur continue la phrase');

  // 2. Renvoi vers un titre (page → ci-dessous en mode note) et vers un signet (nom et page).
  const insert = async (query, format, upper) => {
    await page.click('#xref-btn');
    await page.waitForTimeout(150);
    await page.keyboard.type(query);
    await page.click('#xr-list .xr-item');
    await page.evaluate((f) => { const i = document.querySelector(`#xr-formats input[value="${f}"]`); i.checked = true; i.dispatchEvent(new Event('change')); }, format);
    if (upper) await page.click('#xr-upper');
    const preview = await page.evaluate(() => document.getElementById('xr-preview').textContent);
    await page.click('#xr-ok');
    return preview;
  };
  let pv = await insert('Méthode', 'page');
  await page.keyboard.type(' et ');
  assert.strictEqual(pv, 'voir ci-dessous');
  pv = await insert('Point', 'label-page');
  await page.keyboard.type('.');
  assert.strictEqual(pv, 'voir « Point clé » ci-dessous');
  st = await page.evaluate(() => document.getElementById('here').textContent.replace(/\u00a0/g, ' '));
  assert.strictEqual(st, 'Comme le montre tableau 1, puis ci-dessous et « Point clé » ci-dessous.');
  ok('mode note : « ci-dessous » pour un titre, « « Point clé » ci-dessous » pour un signet');
  // Un renvoi placé après sa cible : « ci-dessus ».
  await page.evaluate(() => {
    const p = document.querySelectorAll('#editor p')[document.querySelectorAll('#editor p').length - 1];
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  pv = await insert('Carte', 'label-page', true);
  assert.strictEqual(pv, 'voir Figure 1 ci-dessus');
  ok('renvoi après sa cible, majuscule initiale : « Figure 1 ci-dessus »');

  // 3. Un tableau légendé ajouté avant : le renvoi devient « tableau 2 ».
  await page.evaluate(() => {
    const h = document.getElementById('h-methode');
    h.insertAdjacentHTML('afterend', '<p class="ft-legend" data-kind="tableau">Calendrier</p><table class="ft-table"><tbody><tr><td>a</td></tr></tbody></table>');
    document.getElementById('editor').dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(500);
  st = await page.evaluate(() => document.querySelector('#here .ft-xref').textContent);
  assert.strictEqual(st, 'tableau 2');
  ok('tableau légendé ajouté avant : « tableau 1 » devient « tableau 2 »');

  // 4. Mode avancé : numéros de page.
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(1000);
  st = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('#here .ft-xref')];
    return spans.map((s) => [s.textContent, window.FTPages.pageNumberOf(window.FTXref.targetOf(s))]);
  });
  assert(st[1][0] === 'page ' + st[1][1] && st[2][0] === `« Point clé », page ${st[2][1]}` && st[2][1] > 1, JSON.stringify(st));
  ok(`mode avancé : « ${st[1][0]} », « ${st[2][0]} »`);
  await page.screenshot({ path: path.join(SHOTS, 'renvoi-avance.png') });

  // 5. Cible supprimée : « renvoi introuvable » ; Annuler la remet.
  await page.evaluate(() => {
    if (window.FTHistory) window.FTHistory.commit();
    document.querySelector('[data-bm="bmcle"]').remove();
    document.getElementById('editor').dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(500);
  st = await page.evaluate(() => { const s = document.querySelectorAll('#here .ft-xref')[2]; return { text: s.textContent, broken: s.classList.contains('ft-xref-broken') }; });
  assert(st.text === 'renvoi introuvable' && st.broken, JSON.stringify(st));
  await page.evaluate(() => window.__ftEmit('menu', ['undo']));
  await page.waitForTimeout(600);
  st = await page.evaluate(() => { const s = document.querySelectorAll('#here .ft-xref')[2]; return { text: s.textContent, broken: s.classList.contains('ft-xref-broken') }; });
  assert(/Point clé/.test(st.text) && !st.broken, JSON.stringify(st));
  ok('signet supprimé : « renvoi introuvable » ; Annuler : renvoi rétabli');

  // 6. Double-clic : modifier (texte de la légende, majuscule).
  await page.evaluate(() => document.getElementById('workspace').scrollTo(0, 0));
  const pos = await page.evaluate(() => { const r = document.querySelector('#here .ft-xref').getBoundingClientRect(); return { x: r.left + 5, y: r.top + r.height / 2 }; });
  await page.mouse.dblclick(pos.x, pos.y);
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ ok: document.getElementById('xr-ok').textContent, sel: (document.querySelector('#xr-list [aria-selected="true"]') || {}).textContent }));
  assert(st.ok === 'Appliquer' && /Mesures du pH/.test(st.sel), JSON.stringify(st));
  await page.evaluate(() => { const i = document.querySelector('#xr-formats input[value="text"]'); i.checked = true; i.dispatchEvent(new Event('change')); });
  await page.click('#xr-ok');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ n: document.querySelectorAll('#here .ft-xref').length, text: document.querySelector('#here .ft-xref').textContent }));
  assert(st.n === 3 && st.text === 'Mesures du pH', JSON.stringify(st));
  ok('double-clic > « Texte de la légende » : « Mesures du pH »');

  // 7. Ctrl+clic : aller à la cible.
  await page.keyboard.down('Control');
  await page.mouse.click(pos.x, pos.y);
  await page.keyboard.up('Control');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => { const l = document.querySelectorAll('#editor p.ft-legend')[1]; const w = document.getElementById('workspace').getBoundingClientRect(); const r = l.getBoundingClientRect(); return { flash: l.classList.contains('ft-toc-flash') || !!document.querySelector('#page > .bm-glow'), top: r.top - w.top }; });
  assert(st.flash && st.top > 0 && st.top < 200, JSON.stringify(st));
  ok('Ctrl+clic : la légende du tableau s’affiche');

  // 8. Entrée au milieu d'un titre visé : l'identifiant reste sur la première partie.
  await page.evaluate(() => {
    const h = document.getElementById('h-methode');
    const copy = h.cloneNode(true);
    copy.removeAttribute('id');
    copy.textContent = 'suite';
    h.after(copy);
    window.FTXref.refresh();
  });
  st = await page.evaluate(() => { const id = document.getElementById('h-methode').dataset.xid; return { n: document.querySelectorAll(`#editor [data-xid="${id}"]`).length, first: document.querySelector(`#editor [data-xid="${id}"]`).id }; });
  assert(st.n === 1 && st.first === 'h-methode', JSON.stringify(st));
  await page.evaluate(() => { document.querySelector('#h-methode + h2').remove(); document.getElementById('editor').dispatchEvent(new Event('input')); });
  ok('identifiant de cible recopié par Entrée : un seul gardé');

  // 9. Export Word : le texte des renvois, dans la couleur du texte.
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  const plain = xml.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');
  assert(/Comme le montre Mesures du pH, puis page \d+ et « Point clé », page \d+\./.test(plain), plain.slice(0, 300));
  const at = xml.indexOf('Mesures du pH</w:t>');
  const run = xml.slice(xml.lastIndexOf('<w:r>', at), at);
  const color = /<w:color w:val="([0-9A-F]+)"/.exec(run);
  const textColor = /<w:color w:val="([0-9A-F]+)"/.exec(xml.slice(xml.lastIndexOf('<w:r>', xml.indexOf('Comme le montre')), xml.indexOf('Comme le montre')));
  assert(color && textColor && color[1] === textColor[1], `${color && color[1]} / ${textColor && textColor[1]}`);
  ok('Word : « Comme le montre Mesures du pH, puis page n et « Point clé », page n. »');

  // 10. Mode lecture : un vrai clic sur le renvoi mène à la page de la cible. (Le signet est repoussé
  // plus loin : la lecture montre deux pages à la fois, la cible doit être sur une autre vue.)
  await page.evaluate(() => {
    const view = window.FTMoteur.view;
    const { schema } = view.state;
    let at = null;
    view.state.doc.forEach((n, pos) => { if (n.type.name === 'heading' && n.textContent === 'Résultats') at = pos; });
    const filler = [];
    for (let i = 0; i < 16; i++) filler.push(schema.nodes.paragraph.create(null, schema.text('Développement. ' + 'Le raisonnement s’appuie sur les mesures et les observations du terrain. '.repeat(8))));
    view.dispatch(view.state.tr.insert(at, filler));
  });
  await page.waitForTimeout(600);
  await page.click('#reading-btn');
  await page.waitForTimeout(700);
  const ref = await page.evaluate(() => { const r = document.querySelectorAll('#here .ft-xref')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(ref.x, ref.y);
  await page.waitForTimeout(600);
  st = await page.evaluate(() => {
    const p = document.getElementById('page').getBoundingClientRect();
    const t = document.querySelector('[data-bm="bmcle"]').getBoundingClientRect();
    return { spread: window.FTReading.state().spread, visible: t.left >= p.left - 1 && t.right <= p.right + 1 };
  });
  assert(st.spread > 0 && st.visible, JSON.stringify(st));
  ok('mode lecture : clic sur le renvoi → page du signet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
};
