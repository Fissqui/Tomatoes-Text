// Mode avancé du nouveau moteur (préversion 2.0) : découpage en pages calculé par le moteur.
// Vérifie : coupures attendues (titres gardés avec leur texte, pas de ligne seule) sur les documents du mode présentation ; aucune ligne
// hors de la zone de texte d'une page ; frappe et Entrée en bas de page ; flèches de part et d'autre
// d'une coupure ; tableau coupé avec l'en-tête répété ; page de titre ; réglages des pages ; texte
// enregistré sans intercalaires ; très long document (300 pages).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-pages-moteur.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function corpus() {
  const dir = path.join(process.env.FT_SRC || path.join(__dirname, '..', '..', 'src'), 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const frames = (n = 2) => page.evaluate((n) => new Promise((r) => {
    const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : setTimeout(r, 0));
    f(n);
  }), n);
  const load = async (html, mode = 'avance', pages) => {
    await page.evaluate(([h, m, p]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m, ...(p ? { pages: p } : {}) } });
      document.getElementById('page').hidden = false;
      // (Notes remises d'accord, comme à l'ouverture d'un document : app.js, FTCite.load.)
      window.FTNotes.sync();
    }, [html, mode, pages]);
    await frames(3);
    // Numéros des légendes et renvois refaits (un instant après l'ouverture), comme dans la version 1.7.
    await page.evaluate(() => window.FTGeneres && window.FTGeneres.now());
    await frames(3);
  };
  const sheets = () => page.evaluate(() => document.querySelectorAll('.pg-sheet').length);
  // Lignes de texte affichées hors de la zone de texte d'une page : { texte, haut, bas }.
  const misplaced = () => page.evaluate(() => {
    const pg = document.getElementById('page');
    const k = pg.currentCSSZoom || 1;
    const top = pg.getBoundingClientRect().top;
    const geo = window.FTPages._geo();
    const out = [];
    const w = document.createTreeWalker(document.getElementById('editor'), NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.data.trim() || t.parentElement.closest('[data-pm-far], .ft-pg-gap, .ft-cover')) continue;
      r.selectNodeContents(t);
      for (const rc of r.getClientRects()) {
        if (!rc.height) continue;
        const y0 = (rc.top - top) / k;
        const y1 = (rc.bottom - top) / k;
        if (!geo.some((g) => y0 >= g.ct - 1 && y1 <= g.cb + 1)) out.push({ text: t.data.slice(0, 30), y0: Math.round(y0), y1: Math.round(y1) });
      }
    }
    return out;
  });
  const html = corpus();

  // 1. Documents du mode présentation : mêmes coupures de page que la version 1.7.
  await load(html);
  assert.strictEqual(await sheets(), 14, 'pages');
  const firsts = await page.evaluate(async () => {
    const geo = window.FTPages._geo();
    const pg = document.getElementById('page');
    const ws = document.getElementById('workspace');
    const out = [];
    for (const g of geo) {
      ws.scrollTop += pg.getBoundingClientRect().top + g.ct - 300;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const r = pg.getBoundingClientRect();
      let s = '';
      for (const dy of [6, 14, 24]) {
        // Au début de la ligne (marge de gauche de 25 mm, un élément de liste un peu plus loin).
        const c = document.caretRangeFromPoint(r.left + g.left + 25 * 96 / 25.4 + 2, r.top + g.ct + dy) || document.caretRangeFromPoint(r.left + g.left + 140, r.top + g.ct + dy);
        if (c && c.startContainer.nodeType === 3) { s = c.startContainer.data.slice(c.startOffset, c.startOffset + 20); break; }
      }
      out.push(s);
    }
    return out;
  });
  // Débuts de page relevés avec la version 1.7 (les pages qui commencent par un objet sont sautées) :
  // { 2: 'Action', 3: 'des graines, compost', 5: 'Décision.', 6: 'Arrosage pendant l’é', 9: 'Repères pour la sais',
  // 11: 'Copeaux de bois', 13: '— Paul Girard, référ' }. Depuis la 2.0.5, un titre ne reste plus seul en bas
  // d'une page et un paragraphe ne laisse plus une ligne seule : les coupures suivent ces règles. Depuis la 2.2,
  // chaque note de bas de page est au pied de la page de son appel et y prend sa place (page 4 : la fin
  // passe à la page 5).
  // Depuis la 2.2.12, moins d'espace au-dessus des titres (comme dans Word) : les débuts de page avancent.
  const v17 = { 2: 'Nouveau document', 3: 'Partager les récolte', 4: 'Rapport moral', 5: 'Projets de la saison', 6: 'Catalogue des tomate', 8: 'Petits fruits en gra', 9: 'Du semis à la récolt', 10: 'Pendant l’été, l’arr', 11: 'Le calendrier de pai', 13: 'Paul Girard, référen', 14: 'Salade tricolore' };
  if (process.env.FT_DEBUTS) console.log(JSON.stringify(firsts));
  for (const [p, s] of Object.entries(v17)) assert(s.includes(firsts[p - 1].trim().slice(0, 8)) && firsts[p - 1].trim().length >= 4, `page ${p} : « ${firsts[p - 1]} » au lieu de « ${s} »`);
  ok('documents du mode présentation : 14 pages, débuts de page attendus');

  // 2. Aucune ligne hors de la zone de texte des pages (tout le document, en le parcourant).
  let bad = [];
  for (let y = 0; y < await page.evaluate(() => document.getElementById('workspace').scrollHeight); y += 500) {
    await page.evaluate((y) => { document.getElementById('workspace').scrollTop = y; }, y);
    await frames(2);
    bad = bad.concat(await misplaced());
  }
  assert.deepStrictEqual(bad, [], 'lignes hors des pages');
  ok('aucune ligne hors de la zone de texte d’une page');

  // 3. Frappe et Entrée en bas de page : la suite passe à la page suivante, toujours dans les pages.
  // (Un long paragraphe à cheval sur deux pages : depuis la 2.0.5, les documents du mode présentation n'ont
  // plus de paragraphe coupé. Seuls les blocs autour de l'écran sont affichés : on cherche la coupure en
  // descendant.)
  const longPara = 'Chaque idée tranquille dévoile plusieurs mots et écoute le livre. Les fenêtres étranges portent cette ville claire autour de la saison. '.repeat(30);
  await load(Array.from({ length: 30 }, (_, i) => `<p>Ligne ${i + 1} du texte.</p>`).join('') + `<p>${longPara}</p><p>Fin.</p>`);
  for (let y = 0; !(await page.evaluate(() => !!document.querySelector('#editor p > span.ft-pg-gap'))); y += 2000) {
    assert(y < 40000, 'aucun paragraphe coupé entre deux pages');
    await page.evaluate((y) => { document.getElementById('workspace').scrollTop = y; }, y);
    await frames(2);
  }
  const gapPara = await page.evaluate(() => {
    const g = document.querySelector('#editor p > span.ft-pg-gap');
    const p = g.closest('p');
    p.scrollIntoView({ block: 'center' });
    return [...p.parentNode.children].indexOf(p);
  });
  await frames(2);
  const before = await page.evaluate((i) => window.FTMoteur.view.state.doc.child(i).textContent, gapPara);
  await page.evaluate((i) => {
    const v = window.FTMoteur.view;
    let pos = 0;
    for (let k = 0; k < i; k++) pos += v.state.doc.child(k).nodeSize;
    v.focus();
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, pos + 1)));
  }, gapPara);
  await page.keyboard.type('Quelques mots ajoutés au début du paragraphe coupé entre deux pages. ');
  await frames(2);
  await page.keyboard.press('Enter');
  await frames(2);
  const after = await page.evaluate((i) => [window.FTMoteur.view.state.doc.child(i).textContent, window.FTMoteur.view.state.doc.child(i + 1).textContent], gapPara);
  assert.strictEqual(after[0], 'Quelques mots ajoutés au début du paragraphe coupé entre deux pages. ');
  assert.strictEqual(after[1], before, 'suite du paragraphe');
  assert.deepStrictEqual(await misplaced(), [], 'lignes hors des pages après la frappe');
  ok('frappe et Entrée dans un paragraphe coupé entre deux pages');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await frames(2);

  // 4. Flèches de part et d'autre de la coupure : le curseur avance d'un caractère à chaque fois.
  const gapPos = await page.evaluate(() => {
    const v = window.FTMoteur.view;
    const g = document.querySelector('#editor p > span.ft-pg-gap');
    const pos = v.posAtDOM(g.parentNode, [...g.parentNode.childNodes].indexOf(g) + 1);
    v.focus();
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, pos + 2)));
    return pos;
  });
  const heads = [];
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowLeft');
    await frames(1);
    heads.push(await page.evaluate(() => window.FTMoteur.view.state.selection.head));
  }
  assert.deepStrictEqual(heads, [gapPos + 1, gapPos, gapPos - 1, gapPos - 2], 'flèche gauche : ' + heads);
  const heads2 = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowRight');
    await frames(1);
    heads2.push(await page.evaluate(() => window.FTMoteur.view.state.selection.head));
  }
  assert.deepStrictEqual(heads2, [gapPos - 1, gapPos, gapPos + 1], 'flèche droite : ' + heads2);
  ok('flèches de part et d’autre d’une coupure de page');

  // 5. Texte enregistré sans intercalaires ni marques.
  const saved = await page.evaluate(() => window.FTEditor.getHtml());
  assert(!/ft-pg-gap|data-pm-(far|sp|sb|cs)/.test(saved), 'texte enregistré propre');
  ok('texte enregistré sans intercalaires ni marques');

  // 6. Tableau de 70 lignes, en-tête répété : coupé entre deux lignes, l'en-tête en haut de chaque page.
  const rows = Array.from({ length: 70 }, (_, i) => `<tr><td><p>Ligne ${i + 1}</p></td><td><p>${(i * 3.7).toFixed(1)}</p></td></tr>`).join('');
  await load(`<p>Avant le tableau.</p><table class="ft-table" data-style="grille" data-t="2" data-header="oui" data-repeat="oui"><tbody><tr><td><p>Nom</p></td><td><p>Valeur</p></td></tr>${rows}</tbody></table><p>Après.</p>`);
  const tbl = await page.evaluate(() => {
    const copies = [...document.querySelectorAll('#editor tr.ft-pg-rhead')];
    const head = document.querySelector('#editor table tr:not(.ft-pg-gap) td');
    const pg = document.getElementById('page').getBoundingClientRect().top;
    const geo = window.FTPages._geo();
    // Chaque copie est tout en haut de la zone de texte d'une page.
    const atTop = copies.every((c) => geo.some((g) => Math.abs(c.getBoundingClientRect().top - pg - g.ct) < 1.5));
    return { n: copies.length, atTop, text: copies.map((c) => c.textContent), bg: [getComputedStyle(head).backgroundColor, copies[0] && getComputedStyle(copies[0].cells[0]).backgroundColor], pages: geo.length };
  });
  assert(tbl.pages >= 3 && tbl.n >= 2 && tbl.atTop, JSON.stringify(tbl));
  assert(tbl.text.every((t) => t === 'NomValeur'), tbl.text.join('|'));
  assert.strictEqual(tbl.bg[1], tbl.bg[0], 'même fond que l’en-tête');
  assert.deepStrictEqual(await misplaced(), [], 'lignes du tableau hors des pages');
  const savedT = await page.evaluate(() => window.FTEditor.getHtml());
  assert(!/ft-pg/.test(savedT) && (savedT.match(/>Nom</g) || []).length === 1, 'en-tête jamais enregistré');
  ok(`tableau de 70 lignes sur ${tbl.pages} pages, en-tête répété ${tbl.n} fois, jamais enregistré`);

  // 7. Réglages des pages : marges étroites, puis format A5 : le découpage est refait.
  const n0 = await sheets();
  await page.evaluate(() => window.FTPages.setMargins({ top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 }));
  await frames(3);
  const n1 = await sheets();
  assert(n1 < n0, `marges étroites : ${n0} → ${n1} pages`);
  assert.deepStrictEqual(await misplaced(), [], 'lignes hors des pages (marges étroites)');
  ok(`réglages des pages : marges étroites, ${n0} → ${n1} pages`);

  // 8. Page de titre : seule sur la première page, le texte commence en haut de la deuxième.
  await load('<div class="ft-cover" contenteditable="false" data-model="classique"><div class="ft-cover-title">Rapport</div></div><p>Premier paragraphe.</p><p>Deuxième.</p>');
  const cover = await page.evaluate(() => {
    const geo = window.FTPages._geo();
    const pg = document.getElementById('page').getBoundingClientRect().top;
    const p = document.querySelector('#editor > p').getBoundingClientRect().top - pg;
    return { pages: geo.length, p: Math.round(p), ct2: Math.round(geo[1] && geo[1].ct) };
  });
  assert(cover.pages === 2 && Math.abs(cover.p - cover.ct2) <= 1, JSON.stringify(cover));
  ok('page de titre seule sur la première page');

  // 9. Pied de page écrit par double-clic : sur toutes les pages, numéros gardés ; un pied de page
  // de plusieurs lignes réduit la zone de texte, et le découpage suit.
  await load(html);
  const p0 = await sheets();
  const at = await page.evaluate(() => {
    const g = window.FTPages._geo()[1];
    const pg = document.getElementById('page');
    const ws = document.getElementById('workspace');
    ws.scrollTop += pg.getBoundingClientRect().top + g.top + g.h - 400;
    const r = pg.getBoundingClientRect();
    return { x: r.left + g.left + g.w / 2, y: r.top + g.top + g.h - 50 };
  });
  await frames(2);
  await page.mouse.dblclick(at.x, at.y);
  await frames(2);
  await page.keyboard.type('Rapport annuel');
  for (const line of ['Deuxième ligne', 'Troisième ligne', 'Quatrième ligne', 'Cinquième ligne', 'Sixième ligne']) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
  await frames(3);
  await page.keyboard.press('Escape');
  await frames(3);
  const hf = await page.evaluate(() => ({
    html: window.FTPages.getSettings().pages.footer.html,
    feet: [...document.querySelectorAll('.pg-foot')].filter((e) => !e.hidden && /Rapport annuel/.test(e.textContent)).length,
    num3: (document.querySelectorAll('.pg-num-row')[2] || {}).textContent
  }));
  const p1 = await sheets();
  assert(/Rapport annuel/.test(hf.html) && /Quatrième ligne/.test(hf.html), 'pied de page enregistré : ' + hf.html);
  assert.strictEqual(hf.feet, p1, 'pied de page sur chaque page');
  assert.strictEqual(hf.num3, '3', 'numéro de la page 3');
  assert(p1 > p0, `zone de texte réduite : ${p0} → ${p1} pages`);
  bad = [];
  for (let y = 0; y < await page.evaluate(() => document.getElementById('workspace').scrollHeight); y += 500) {
    await page.evaluate((y) => { document.getElementById('workspace').scrollTop = y; }, y);
    await frames(2);
    bad = bad.concat(await misplaced());
  }
  assert.deepStrictEqual(bad, [], 'lignes hors des pages (pied de page de quatre lignes)');
  ok(`pied de page écrit par double-clic : sur les ${p1} pages (${p0} avant), numéros gardés, aucune ligne hors des pages`);

  // 10. Pages qui restent en place : un paragraphe de la page 2 retiré, les pages d'après gardent leur
  // début (marque enregistrée avec le texte) ; Ctrl+Z retire les marques ; « Libérer » aussi.
  await load(html);
  const startsOf = () => page.evaluate(() => {
    const doc = window.FTMoteur.view.state.doc;
    // Pages qui commencent par un bloc entier : page → début du bloc.
    const out = {};
    for (const i of window.FTVisibles.pageStarts()) out[window.FTVisibles.pageOfBlock(i)] = doc.child(i).textContent.slice(0, 25);
    return out;
  });
  const s0 = await startsOf();
  const cut = await page.evaluate(() => {
    const v = window.FTMoteur.view;
    const doc = v.state.doc;
    let pos = 0;
    for (let i = 0; i < doc.childCount; pos += doc.child(i).nodeSize, i++) {
      const n = doc.child(i);
      // (Sans appel de note : effacer un appel renumérote toutes les notes d'après.)
      // (Le paragraphe est retiré en entier : depuis la 2.2, la note de bas de page de la page 2 y prend de
      // la place, et un paragraphe seulement vidé ne libère pas assez de place pour la page suivante.)
      if (window.FTVisibles.pageOfBlock(i) === 1 && n.type.name === 'paragraph' && n.textContent.length > 200 && !n.content.content.some((x) => x.type.name === 'raw_inline') && doc.child(i - 1).isTextblock) {
        v.focus();
        v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(doc, pos - 1, pos + n.nodeSize - 1)));
        return n.textContent.length;
      }
    }
    return 0;
  });
  assert(cut, 'paragraphe de la page 2');
  await page.keyboard.press('Backspace');
  await frames(3);
  const s1 = await startsOf();
  const kept = await page.evaluate(() => window.FTVisibles.keptCount());
  // (Les blocs d'après le paragraphe retiré gardent leur page.)
  // (Une page peut s'ajouter avant elles : un titre remonté qui ne tient plus avec ses lignes en bas de page.)
  const keptStarts = Object.keys(s0).filter((k) => +k >= 2).map((k) => s0[k]);
  const got = Object.keys(s1).sort((x, y) => x - y).map((k) => s1[k]);
  assert.deepStrictEqual(got.slice(got.indexOf(keptStarts[0])), keptStarts, `débuts des pages gardés : ${JSON.stringify({ s0, s1 })}`);
  assert.strictEqual(kept, Object.keys(s0).filter((k) => +k >= 2).length, 'pages gardées');
  assert(/data-pg-start/.test(await page.evaluate(() => window.FTEditor.getHtml())), 'marques enregistrées');
  assert.deepStrictEqual(await misplaced(), [], 'lignes hors des pages (pages gardées)');
  await page.keyboard.press('Control+z');
  await frames(3);
  assert.strictEqual(await page.evaluate(() => window.FTVisibles.keptCount()), 0, 'Ctrl+Z : marques retirées');
  assert.deepStrictEqual(await startsOf(), s0, 'Ctrl+Z : pages d’origine');
  await page.keyboard.press('Control+y');
  await frames(3);
  await page.evaluate(() => window.FTVisibles.releaseAll());
  await frames(3);
  assert.strictEqual(await page.evaluate(() => window.FTVisibles.keptCount()), 0, 'libérées');
  // (Texte remis à la suite : mêmes pages que le même document rouvert, sans marques.)
  const freed = await page.evaluate(() => window.FTEditor.getHtml());
  assert(!/data-pg-start/.test(freed), 'marques retirées du texte');
  // (La page de chaque bloc : une page qui commence par un titre après un objet n'est pas toujours
  // relevée par pageStarts juste après la libération.)
  const pagesOf = () => page.evaluate(() => { const n = window.FTMoteur.view.state.doc.childCount; return Array.from({ length: n }, (_, i) => window.FTVisibles.pageOfBlock(i)); });
  const freedPages = await pagesOf();
  await load(freed);
  assert.deepStrictEqual(freedPages, await pagesOf(), 'texte remis à la suite');
  ok(`pages qui restent en place : ${kept} débuts gardés après un paragraphe retiré, retirés par Ctrl+Z et « Libérer »`);

  // 11. Très long document : 300 pages, passage en mode avancé, frappe.
  await load(html.repeat(21), 'note');
  const t = await page.evaluate(() => {
    const t0 = performance.now();
    document.querySelector('#mode-switch button[data-mode="avance"]').click();
    document.body.offsetHeight;
    return performance.now() - t0;
  });
  await frames(3);
  const big = await sheets();
  assert(big > 250, 'pages : ' + big);
  await page.evaluate(() => { const w = document.getElementById('workspace'); w.scrollTop = w.scrollHeight / 2; });
  await frames(3);
  assert.deepStrictEqual(await misplaced(), [], 'lignes hors des pages (milieu du long document)');
  ok(`très long document : ${big} pages, passage en mode avancé en ${Math.round(t)} ms`);
};
