// Tableaux qui débordent sur les marges et taille des équations (2.5.17).
// - Tableau de Word avancé dans les marges (retrait négatif) : collé, il déborde aussi, sans passer à moins
//   de 0,5 cm du bord de la feuille ; ses colonnes se calculent sur la largeur du texte affiché (et non sur
//   l'ancienne zone cachée, qui réduisait le texte des tableaux collés à 5 pt).
// - Barre « Tableau » et clic droit : « Déborder sur les marges » ; bord du tableau tiré dans la marge.
// - Export Word : retrait négatif et largeur gardés.
// - Équations : la taille choisie s'applique aux équations d'une colonne de cases, de tout le document,
//   d'une équation choisie (clic droit > Sélectionner l'équation) ou en cours de modification ; exportée en Word.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-tableaux-marges.js
const assert = require('assert');
const zlib = require('zlib');

function unzip(buf) {
  const out = new Map();
  let e = buf.length - 22;
  while (buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let n = buf.readUInt16LE(e + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8'));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

// Presse-papiers de Word : tableau de 570 pt avancé de 42,5 pt dans la marge, équations dans les cases.
const eq = (b, s) => `<!--[if gte msEquation 12]><m:oMathPara><m:oMath><m:sSub><m:sSubPr><span style='font-size:8.0pt;font-family:"Cambria Math"'><m:ctrlPr></m:ctrlPr></span></m:sSubPr><m:e><i><span style='font-size:8.0pt;font-family:"Cambria Math"'><m:r>${b}</m:r></span></i></m:e><m:sub><i><span style='font-size:8.0pt;font-family:"Cambria Math"'><m:r>${s}</m:r></span></i></m:sub></m:sSub></m:oMath></m:oMathPara><![endif]--><![if !msEquation]><span style='font-size:8.0pt'><img width=30 height=14 src="file:///C:/x/clip_image001.png"></span><![endif]>`;
const cell = (h, w) => `<td width=${w} valign=top style='width:${w * 0.75}pt;padding:0cm 5.4pt 0cm 5.4pt'><p class=MsoNormal align=center style='text-align:center'><span style='font-size:8.0pt'>${h}</span></p></td>`;
const row = (a, e, ...n) => `<tr>${cell(a, 80)}${cell(e, 60)}${n.map((x) => cell(x, 70)).join('')}</tr>`;
const WORD = (ml) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"><body><p class=MsoNormal>Avant.</p>
<table class=MsoTableGrid border=0 cellspacing=0 cellpadding=0 width=760 style='width:570.0pt;margin-left:${ml}pt;border-collapse:collapse;border:none'>
${row('', 'NOTATION', 'THÉORIQUE', 'NÉOCLASSIQUE HOMOGÈNE', 'NÉOCLASSIQUE HÉTÉROGÈNE', 'MODÈLE ERRATIQUE', 'INNOVATEUR-IMITATEUR')}
${row('ELASTICITÉ DEMANDE', eq('e', 'x1,p1'), '-0,93', '-0,93', '-0,93', '-0,94', '-0,97')}
${row('ELASTICITÉ DEMANDE', eq('e', 'x2,p2'), '-1,00', '-1,00', '-1,00', '-1,01', '-1,04')}
</table><p class=MsoNormal>Après.</p></body></html>`;

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const load = async (html, mode = 'avance') => {
    await page.keyboard.press('Escape');
    await v(([h, m]) => window.FTEditor.load({ content: { html: h }, settings: { mode: m } }), [html, mode]);
    await page.waitForTimeout(600);
  };
  const paste = async (html) => {
    await v((h) => {
      const w = window.FTMoteur.view;
      w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, 2)));
      w.focus();
      const dt = new DataTransfer();
      dt.setData('text/html', h);
      dt.setData('text/plain', 'x');
      w.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, html);
    await page.waitForTimeout(250);
    if (await v(() => document.getElementById('paste-dialog').open)) { await v(() => document.getElementById('ps-ok').click()); await page.waitForTimeout(400); }
  };
  const geo = () => v(() => {
    const t = document.querySelector('#editor table.ft-table');
    const r = t.getBoundingClientRect();
    const e = document.getElementById('editor').getBoundingClientRect();
    const p = document.getElementById('page').getBoundingClientRect();
    return { left: r.left - e.left, right: r.right - e.right, sheetL: p.left - e.left, sheetR: p.right - e.right, over: t.dataset.deborde || '', fsize: Number(t.dataset.fsize || 0), style: t.getAttribute('style') || '' };
  });
  const sizes = () => v(() => [...document.querySelectorAll('#editor .ft-math')].map((m) => Math.round(parseFloat(getComputedStyle(m).fontSize) * 0.75 * 4) / 4));
  const bar = () => v(() => {
    const t = document.getElementById('object-tools');
    return t.hidden ? [] : [...t.querySelectorAll('button')].map((b) => b.title + (b.classList.contains('on') ? ' [on]' : ''));
  });
  const clickCell = async (text) => {
    const b = await v((t) => {
      const c = [...document.querySelectorAll('#editor td')].find((x) => x.textContent.trim() === t);
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, text);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(200);
  };
  // Taille tapée dans le champ de la barre d'outils (il prend le clavier), validée par Entrée.
  const setSize = async (pt) => {
    const box = page.locator('.ft-num:has(#font-size) input').first();
    await box.click();
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(String(pt));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
  };
  const cm = 96 / 2.54;

  // 1. Collage : le tableau déborde dans les deux marges, à 0,5 cm au moins du bord de la feuille.
  await load('<p>X</p>');
  await paste(WORD(-42.5));
  let g = await geo();
  assert.strictEqual(g.over, 'oui', 'tableau collé qui déborde : ' + g.style);
  assert(g.left < -40 && g.right > 40, 'avancé dans les deux marges : ' + JSON.stringify(g));
  assert(g.left >= g.sheetL + 0.5 * cm - 1 && g.right <= g.sheetR - 0.5 * cm + 1, 'jamais à moins de 0,5 cm du bord : ' + JSON.stringify(g));
  assert(g.fsize >= 9, 'texte du tableau lisible (pas réduit à 5 pt) : ' + g.fsize);
  let s = await sizes();
  assert(s.length === 2 && s.every((x) => x >= 9), 'équations à la taille du tableau : ' + s);
  ok(`tableau de Word collé : déborde de ${Math.round(-g.left / cm * 10) / 10} cm à gauche et ${Math.round(g.right / cm * 10) / 10} cm à droite, texte à ${g.fsize} pt`);

  // Tableau ordinaire de Word (retrait de -5,4 pt) : reste dans la largeur du texte.
  await load('<p>X</p>');
  await paste(WORD(-5.4).replace(/570\.0pt/, '400.0pt'));
  g = await geo();
  assert(!g.over && Math.abs(g.left) < 2 && g.right <= 1, 'tableau ordinaire dans le texte : ' + JSON.stringify(g));
  ok('tableau ordinaire de Word : reste dans la largeur du texte');

  // 2. Barre « Tableau » : « Déborder sur les marges », marche et arrêt ; clic droit.
  await clickCell('-0,93');
  const t1 = (await bar()).find((x) => x.startsWith('Déborder sur les marges'));
  assert(t1 && !t1.endsWith('[on]'), 'bouton présent : ' + (await bar()).join(' | '));
  await page.click('#object-tools button[title^="Déborder sur les marges"]');
  await page.waitForTimeout(250);
  g = await geo();
  assert(g.over && g.left < -50 && g.right > 50, 'débord mis : ' + JSON.stringify(g));
  assert((await bar()).some((x) => x.startsWith('Déborder sur les marges') && x.endsWith('[on]')), 'bouton allumé');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  g = await geo();
  assert(!g.over && Math.abs(g.left) < 2, 'annulé : ' + JSON.stringify(g));
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(250);
  assert((await geo()).over, 'rétabli');
  await clickCell('-0,93');
  await v(() => {
    const c = [...document.querySelectorAll('#editor td')].find((x) => x.textContent.trim() === '-0,93');
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
  });
  await page.waitForTimeout(200);
  await page.locator('.context-menu:not([hidden]) button', { hasText: 'Déborder sur les marges' }).first().click();
  await page.waitForTimeout(250);
  g = await geo();
  assert(!g.over && Math.abs(g.left) < 2, 'retiré par le clic droit : ' + JSON.stringify(g));
  ok('« Déborder sur les marges » : barre du tableau et clic droit, annulation');

  // 3. Bord droit tiré dans la marge (comme dans Word), puis double-clic : toute la largeur du texte.
  g = await geo();
  const edge = await v(() => { const r = document.querySelector('#editor table.ft-table').getBoundingClientRect(); return { x: r.right, y: r.top + r.height / 2 }; });
  await page.mouse.move(edge.x - 30, edge.y);
  await page.mouse.move(edge.x, edge.y, { steps: 3 });
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.move(edge.x + 30, edge.y, { steps: 4 });
  await page.mouse.move(edge.x + 400, edge.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  g = await geo();
  assert(g.over && Math.abs(g.left) < 2 && g.right > 0.5 * cm && g.right <= g.sheetR - 0.5 * cm + 1, 'bord droit dans la marge : ' + JSON.stringify(g));
  const saved = await v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  assert(/data-deborde="oui"/.test(saved) && /--dd: [\d.]+cm/.test(saved), 'enregistré');
  ok(`bord droit tiré dans la marge : ${Math.round(g.right / cm * 10) / 10} cm (arrêté à 0,5 cm du bord de la feuille), enregistré`);

  // 4. Export Word : retrait négatif, largeur plus grande que le texte.
  await clickCell('-0,93');
  await page.click('#object-tools button[title^="Déborder sur les marges"]'); // retiré
  await page.click('#object-tools button[title^="Déborder sur les marges"]'); // remis, des deux côtés
  await page.waitForTimeout(250);
  g = await geo();
  let xml = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())))).get('word/document.xml');
  const ind = /<w:tblInd[^>]*w:w="(-\d+)"/.exec(xml);
  assert(ind && Number(ind[1]) < -500, 'retrait négatif dans Word : ' + (ind && ind[0]));
  // Export PDF : Chromium n'imprime rien hors de la zone de texte ; marges de 5 mm et retrait du texte.
  const pdf = await v(async () => { const j = await window.FTPdf.build({ typo: false }); return { m: j.page.margins, wide: /\.ft-print \{ box-sizing: content-box; padding: 0 20mm 0 20mm; \}/.test(j.html) }; });
  assert(pdf.m.left === 5 && pdf.m.right === 5 && pdf.wide, 'PDF : ' + JSON.stringify(pdf));
  ok(`exports : Word avec un retrait de ${ind[1]} twips ; PDF imprimé avec des marges de 5 mm, le texte à sa place`);

  // 5. Équations : taille d'une colonne de cases, de tout le document, d'une équation choisie ou modifiée.
  await load('<p>X</p>');
  await paste(WORD(-42.5));
  await v(() => {
    const w = window.FTMoteur.view;
    const cells = [];
    w.state.doc.descendants((n, pos) => { if (n.type.name === 'table_cell') cells.push(pos); });
    // Colonne « Notation » : 2e case des lignes 2 et 3 (7 cases par ligne).
    w.dispatch(w.state.tr.setSelection(PM.tables.CellSelection.create(w.state.doc, cells[8], cells[15])));
    w.focus();
  });
  await setSize(14);
  s = await sizes();
  assert.deepStrictEqual(s, [14, 14], 'colonne en 14 pt : ' + s);
  await v(() => { const w = window.FTMoteur.view; w.focus(); });
  await page.keyboard.press('Control+a');
  await setSize(11);
  assert.deepStrictEqual(await sizes(), [11, 11], 'tout le document');
  // Clic droit > Sélectionner l'équation, puis la taille.
  await v(() => {
    const m = document.querySelectorAll('#editor .ft-math')[1];
    const r = m.getBoundingClientRect();
    m.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 2, clientY: r.top + 2 }));
  });
  await page.waitForTimeout(200);
  await page.locator('.context-menu:not([hidden]) button', { hasText: 'Sélectionner l’équation' }).first().click();
  await page.waitForTimeout(200);
  assert(await v(() => { const s = window.FTMoteur.view.state.selection; return !!s.node && window.FTFormuleVue.isMath(s.node); }), 'équation choisie');
  await setSize(18);
  assert.deepStrictEqual(await sizes(), [11, 18], 'équation choisie en 18 pt');
  // Équation en cours de modification : la taille va à toute l'équation, la modification continue.
  const m0 = await v(() => { const r = document.querySelectorAll('#editor .ft-math')[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(m0.x, m0.y);
  await page.waitForTimeout(300);
  assert(await v(() => !!document.querySelector('#editor math-field')), 'équation ouverte');
  await setSize(16);
  assert(await v(() => !!document.querySelector('#editor math-field')), 'toujours en modification');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await sizes(), [16, 18], 'équation modifiée en 16 pt');
  const html = await v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  assert(/data-size="16"/.test(html) && /data-size="18"/.test(html), 'tailles enregistrées');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await sizes(), [11, 18], 'annulation');
  xml = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())))).get('word/document.xml');
  assert(/<m:r>(?:(?!<\/m:r>).)*<w:sz w:val="36"\/>/.test(xml), 'taille 18 pt dans l’équation Word');
  ok('équations : taille d’une colonne de cases, de tout le document, d’une équation choisie ou en cours de modification ; annulation ; export Word');

  // 6. Sélection à la souris (2.5.18) : du texte jusqu'à une équation sur sa ligne, puis jusqu'au bout d'une
  // équation dans la ligne ; les équations prises sont colorées comme le texte choisi.
  const eqs = await v(() => ({
    b: window.FTFormules.html({ latex: 'y=200,\\pi=0,50', block: true, align: 'gauche' }),
    i: window.FTFormules.html({ latex: 'x^2', block: false })
  }));
  await load(`<p>Note : Conditions initiales et valeurs des paramètres :</p>${eqs.b}<p>Après le texte ${eqs.i} suite.</p><p>Fin.</p>`);
  const box = (sel) => v((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { l: r.left, r: r.right, y: r.top + r.height / 2 }; }, sel);
  const p0 = await box('#editor p');
  const mb = await box('#editor div.ft-math');
  const mi = await box('#editor span.ft-math');
  const picked = () => v(() => {
    const st = window.FTMoteur.view.state;
    const s = st.selection;
    return { text: st.doc.textBetween(s.from, s.to, '|', (n) => (window.FTFormuleVue.isMath(n) ? '[EQ]' : '')), shown: document.querySelectorAll('#editor .ft-math.ft-math-sel').length };
  });
  await page.mouse.move(p0.l + 2, p0.y);
  await page.mouse.down();
  await page.mouse.move(mb.r - 5, mb.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  let pk = await picked();
  assert(pk.text.endsWith('[EQ]|') && pk.shown === 1, 'équation sur sa ligne prise et colorée : ' + JSON.stringify(pk));
  await page.mouse.click(p0.l + 5, p0.y + 300);
  await page.mouse.move(p0.l + 2, p0.y);
  await page.mouse.down();
  await page.mouse.move(mi.r - 3, mi.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  pk = await picked();
  assert(pk.text.endsWith('Après le texte [EQ]') && pk.shown === 2, 'équation dans la ligne prise en entier : ' + JSON.stringify(pk));
  assert(!(await v(() => !!document.querySelector('#editor math-field'))), 'aucune équation ouverte');
  ok('sélection à la souris : texte et équations (sur leur ligne ou dans la ligne) pris ensemble et colorés');

  // 7. Glisser depuis une équation d'un tableau (2.5.19) : les cases parcourues sont choisies (l'équation
  // ne s'ouvre pas) ; un simple clic l'ouvre toujours.
  await load('<p>X</p>');
  await paste(WORD(-42.5));
  const mpos = () => v(() => [...document.querySelectorAll('#editor .ft-math')].map((m) => { const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
  let mp = await mpos();
  await page.mouse.move(mp[0].x, mp[0].y);
  await page.mouse.down();
  await page.mouse.move(mp[1].x, mp[1].y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const cellSel = await v(() => { const s = window.FTMoteur.view.state.selection; let n = 0; if (s.forEachCell) s.forEachCell(() => n++); return { kind: s.constructor.name, n, open: !!document.querySelector('#editor math-field') }; });
  assert(cellSel.n === 2 && !cellSel.open, 'cases choisies depuis une équation : ' + JSON.stringify(cellSel));
  await setSize(13);
  assert.deepStrictEqual(await sizes(), [13, 13], 'taille de la colonne choisie au glissé');

  // 8. Gras, italique, souligné, barré, couleur, surlignage sur les équations choisies, et pendant la modification.
  await v(() => window.FTMoteur.view.focus());
  await page.click('[data-cmd="bold"]');
  await page.waitForTimeout(200);
  const looks = () => v(() => [...document.querySelectorAll('#editor .ft-math')].map((m) => ({ b: m.hasAttribute('data-gras'), i: m.hasAttribute('data-italique'), w: getComputedStyle(m.querySelector('.ML__latex *') || m).fontWeight, c: m.dataset.couleur || '' })));
  let lk = await looks();
  assert(lk.every((x) => x.b && Number(x.w) >= 700), 'gras sur les équations des cases : ' + JSON.stringify(lk));
  assert(await v(() => document.querySelector('[data-cmd="bold"]').classList.contains('on')), 'bouton Gras allumé');
  await page.click('[data-cmd="bold"]');
  await page.waitForTimeout(200);
  assert((await looks()).every((x) => !x.b), 'gras retiré');
  await page.click('#color-btn');
  await page.waitForTimeout(200);
  lk = await looks();
  assert(lk.every((x) => x.c), 'couleur : ' + JSON.stringify(lk));
  // Pendant la modification : Ctrl+I met toute l'équation en italique.
  mp = await mpos();
  await page.mouse.click(mp[0].x, mp[0].y);
  await page.waitForTimeout(300);
  assert(await v(() => !!document.querySelector('#editor math-field')), 'équation ouverte par un clic');
  await page.keyboard.press('Control+i');
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+u');
  await page.waitForTimeout(150);
  assert(await v(() => !!document.querySelector('#editor math-field')), 'toujours en modification');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  lk = await looks();
  assert(lk[0].i && !lk[1].i, 'italique de l’équation modifiée : ' + JSON.stringify(lk));
  const saved2 = await v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  assert(/data-italique/.test(saved2) && /data-souligne/.test(saved2) && /data-couleur=/.test(saved2), 'enregistré');
  xml = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())))).get('word/document.xml');
  assert(/<m:r>(?:(?!<\/m:r>).)*<w:i\/>(?:(?!<\/m:r>).)*<w:color w:val="[0-9A-F]{6}"\/>(?:(?!<\/m:r>).)*<w:u w:val="single"\/>/.test(xml), 'mise en forme dans l’équation Word');
  ok('glisser depuis une équation : cases choisies ; gras, couleur sur les équations choisies, italique et souligné pendant la modification ; export Word');
};
