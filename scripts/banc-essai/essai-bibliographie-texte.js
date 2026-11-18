// Bibliographie en texte ordinaire (2.4.3) : un titre puis un paragraphe par référence, modifiables et
// coupés entre les pages. Vérifie : insertion (une annulation), ordre et titre selon la norme, mise à jour
// automatique (citation ajoutée ou retirée) sans réécrire une référence retouchée ni rendre une référence
// effacée, style numérique ([n] devant), « Refaire la bibliographie depuis les sources », Entrée sur une
// ligne vide, ancien bloc fermé converti à l'ouverture, titre « Bibliographie » d'un modèle repris,
// longue bibliographie en mode avancé (aucune ligne hors d'une page), export Word.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-bibliographie-texte.js
const assert = require('assert');
const zlib = require('zlib');

// Un fichier d'une archive .docx (zip) : lu dans le répertoire central.
function unzip(buf, name) {
  let e = buf.length - 22;
  while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < buf.readUInt16LE(e + 10); i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 3) => page.evaluate((k) => new Promise((r) => { const f = (j) => (j ? requestAnimationFrame(() => f(j - 1)) : setTimeout(r, 0)); f(k); }), n);
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const select = (from, to = from) => v(([a, b]) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a, b)));
    w.focus();
  }, [from, to]);
  const undo = () => v(() => window.FTMoteur.undo());
  const setSel = (id, value) => v(([i, x]) => { const s = document.getElementById(i); s.value = x; s.dispatchEvent(new Event('change')); }, [id, value]);
  const bib = () => v(() => {
    const head = document.querySelector('#editor .ft-bib-title');
    return {
      head: head ? head.tagName + ' ' + head.textContent : null,
      items: [...document.querySelectorAll('#editor p.ft-bib')].map((p) => (p.dataset.n ? `[${p.dataset.n}] ` : '') + p.textContent.slice(0, 22))
    };
  });
  // Fin du document (ligne après la bibliographie).
  const endPos = () => v(() => window.FTMoteur.view.state.doc.content.size - 1);
  const posIn = (text) => v((t) => {
    let p = null;
    window.FTMoteur.view.state.doc.descendants((n, q) => { if (p === null && n.isText && n.text.includes(t)) p = q + n.text.indexOf(t); });
    return p;
  }, text);
  await v(() => { window.FTLayout.setCapitalize(false); });

  // Sources du projet.
  const ids = await v(() => {
    const C = window.FTCite;
    for (const s of [...C.sources()]) C.sources().splice(0);
    return [
      C.addSource({ authors: ['Marx, Karl'], title: 'Le capital', year: '2008', publisher: 'Gallimard' }).id,
      C.addSource({ authors: ['Lavoie, Marc'], title: 'Post-Keynesian Economics', year: '2015', publisher: 'Elgar' }).id,
      C.addSource({ authors: ['Shaikh, Anwar'], title: 'Capitalism', year: '2018', publisher: 'Oxford University Press' }).id,
      C.addSource({ authors: ['Mandel, Ernest'], title: 'Traité d’économie marxiste', year: '1986', publisher: 'C. Bourgois' }).id
    ];
  });
  const cite = (id) => `<span class="ft-cite" data-src="${id}" contenteditable="false">(…)</span>`;
  const load = async (html, settings = {}) => {
    await v(([h, s]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: 'note', ...s } });
      document.getElementById('page').hidden = false;
      return window.FTCite.load(s);
    }, [html, settings]);
    await frames();
  };

  // 1. Insertion : titre (sans numéro) et une référence par source citée, triées ; une seule annulation.
  await load(`<h1>Introduction</h1><p>Un${cite(ids[0])} deux${cite(ids[1])} trois${cite(ids[2])}.</p><h1>Conclusion</h1><p>Fin.</p><p><br></p>`);
  await select(await endPos());
  await page.click('#cite-btn');
  await page.selectOption('#src-scope', 'cites');
  await page.click('#src-biblio');
  let got = await bib();
  assert.strictEqual(got.head, 'H1 Bibliographie');
  assert.deepStrictEqual(got.items, ['LAVOIE, Marc. Post-Key', 'MARX, Karl. Le capital', 'SHAIKH, Anwar. Capital']);
  let html = await saved();
  assert.match(html, /<h1 class="ft-bib-title" data-nonum="oui" data-ids="[a-z0-9,]+">Bibliographie<\/h1><p class="ft-bib" data-src="\w+" data-h="\w+">LAVOIE, Marc\. <i>Post-Keynesian Economics<\/i>\. Elgar, 2015\.<\/p>/);
  assert.match(html, /<\/p><p><br><\/p>$/);
  assert.ok(await v(() => window.FTMoteur.view.state.selection.$from.parent.childCount === 0 && !window.FTMoteur.view.state.selection.$from.parent.attrs.a.class));
  await undo();
  assert.ok(!(await saved()).includes('ft-bib'));
  await v(() => window.FTMoteur.redo());
  assert.strictEqual((await bib()).items.length, 3);
  ok('insertion : titre de même niveau que les grands titres, sans numéro ; une référence par paragraphe, triées ; une annulation');

  // 2. Texte ordinaire : une référence se modifie ; elle reste telle quelle quand la bibliographie se met à jour.
  await select((await posIn('Le capital')) + 'Le capital'.length);
  await page.keyboard.type(', 2 vol');
  assert.match((await bib()).items[1], /^MARX, Karl\. Le capita/);
  assert.ok((await saved()).includes('<i>Le capital, 2 vol</i>'));
  // Citation ajoutée : sa référence arrive à sa place, la référence retouchée ne change pas.
  await select((await posIn('Fin.')) + 3);
  await v((h) => window.FTNotes.inline(h), cite(ids[3]));
  got = await bib();
  assert.deepStrictEqual(got.items, ['LAVOIE, Marc. Post-Key', 'MANDEL, Ernest. Traité', 'MARX, Karl. Le capital', 'SHAIKH, Anwar. Capital']);
  assert.ok((await saved()).includes('<i>Le capital, 2 vol</i>'));
  // Référence effacée à la main : elle ne revient pas à la mise à jour suivante.
  await v(() => {
    const w = window.FTMoteur.view;
    let at = null;
    w.state.doc.forEach((n, p) => { if (at === null && n.attrs.a && n.attrs.a['data-src'] && n.textContent.startsWith('SHAIKH')) at = [p, p + n.nodeSize]; });
    w.dispatch(w.state.tr.delete(at[0], at[1]));
  });
  await setSel('src-style', 'auteur-date');
  await v(() => window.FTNotes.sync());
  assert.deepStrictEqual((await bib()).items, ['LAVOIE, Marc. Post-Key', 'MANDEL, Ernest. Traité', 'MARX, Karl. Le capital']);
  // Citation retirée : sa référence part (sauf retouchée à la main).
  const c1 = await v((id) => { let p = null; window.FTMoteur.view.state.doc.descendants((n, q) => { if (p === null && n.type.name === 'raw_inline' && n.attrs.html.includes(id)) p = q; }); return p; }, ids[1]);
  await select(c1, c1 + 1);
  await page.keyboard.press('Backspace');
  assert.deepStrictEqual((await bib()).items, ['MANDEL, Ernest. Traité', 'MARX, Karl. Le capital']);
  ok('références modifiables ; mise à jour : citation ajoutée = référence ajoutée, retirée = référence retirée ; retouche gardée ; référence effacée gardée effacée');

  // 3. Norme et style : titre de la norme ; références réécrites sauf la retouchée ; [n] en style numérique.
  await setSel('src-norm', 'apa');
  got = await bib();
  assert.strictEqual(got.head, 'H1 Références');
  assert.deepStrictEqual(got.items, ['Mandel, E. (1986). Tra', 'MARX, Karl. Le capital']);
  await setSel('src-style', 'numerique');
  got = await bib();
  assert.deepStrictEqual(got.items, ['[1] MARX, Karl. Le capital', '[3] Mandel, E. (1986). Tra']);
  ok('norme APA : titre « Références », références réécrites (pas la retouchée) ; style numérique : [n] dans l’ordre des citations');

  // 4. « Refaire la bibliographie depuis les sources » : retouches et références effacées refaites.
  await setSel('src-style', 'auteur-date');
  await page.keyboard.press('Escape');
  await page.click('#editor p.ft-bib', { button: 'right' });
  await page.click('#context-menu >> text=Refaire la bibliographie depuis les sources');
  got = await bib();
  assert.deepStrictEqual(got.items, ['Mandel, E. (1986). Tra', 'Marx, K. (2008). Le ca', 'Shaikh, A. (2018). Cap']);
  assert.ok(!(await saved()).includes('2 vol'));
  await undo();
  assert.ok((await saved()).includes('2 vol'));
  await v(() => window.FTMoteur.redo());
  // Paragraphe ajouté à la main après une référence (Entrée à sa fin) : gardé à sa place, en retrait suspendu.
  await select((await posIn('Le capital')) + 'Le capital. Gallimard.'.length);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ajout à la main.');
  await setSel('src-norm', 'chicago');
  got = await bib();
  assert.strictEqual(got.head, 'H1 Bibliographie');
  assert.deepStrictEqual(got.items, ['Mandel, Ernest. 1986. T', 'Marx, Karl. 2008. Le ca', 'Ajout à la main.', 'Shaikh, Anwar. 2018. Ca'].map((x) => x.slice(0, 22)));
  const look = await v(() => [...document.querySelectorAll('#editor p.ft-bib')].map((p) => [getComputedStyle(p).textIndent, getComputedStyle(p).paddingLeft]));
  assert.ok(look.every(([ti, pl]) => parseFloat(ti) < 0 && parseFloat(pl) === -parseFloat(ti)), JSON.stringify(look));
  // Entrée sur la ligne vide qui suit : elle redevient du texte ordinaire.
  await select((await posIn('Ajout à la main.')) + 'Ajout à la main.'.length);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Suite');
  assert.match(await saved(), /<p class="ft-bib">Ajout à la main\.<\/p><p>Suite<\/p><p class="ft-bib" data-src/);
  ok('« Refaire la bibliographie depuis les sources » (une annulation) ; paragraphe ajouté à la main gardé à sa place, en retrait suspendu ; Entrée sur une ligne vide : texte ordinaire');

  // 5. Ancien bloc fermé : converti à l'ouverture (titre et références) ; sans les sources, références gardées.
  await load(`<p>A${cite(ids[0])}.</p><div class="ft-biblio" contenteditable="false"><div class="ft-biblio-title">Bibliographie</div><ul><li>ancien</li></ul></div><p><br></p>`);
  html = await saved();
  assert.match(html, /^<p>A<span[^>]*>\(Marx, 2008\)<\/span>\.<\/p><h2 class="ft-bib-title" data-nonum="oui" data-ids="\w+">Bibliographie<\/h2><p class="ft-bib" data-src="\w+" data-h="\w+">MARX, Karl\. <i>Le capital<\/i>\. Gallimard, 2008\.<\/p><p><br><\/p>$/);
  await load('<p>A<span class="ft-cite" data-src="inconnue" contenteditable="false">(X, 2000)</span>.</p><div class="ft-biblio" contenteditable="false"><div class="ft-biblio-title">Références</div><ol><li>DUPONT. <i>Livre</i>.</li><li>DURAND. Article.</li></ol></div>');
  html = await saved();
  assert.match(html, /<h2 class="ft-bib-title" data-nonum="oui">Bibliographie<\/h2><p class="ft-bib" data-n="1">DUPONT\. <i>Livre<\/i>\.<\/p><p class="ft-bib" data-n="2">DURAND\. Article\.<\/p>$/);
  ok('ancien bloc fermé converti à l’ouverture ; sources absentes : ses références gardées telles quelles');

  // 6. Modèle de mise en page : la ligne vide sous « Bibliographie » reçoit les références sous ce titre.
  await load(`<h1>Introduction</h1><p>Texte${cite(ids[2])}.</p><h1 data-nonum="oui">Bibliographie</h1><p><br></p><h1 data-nonum="oui">Annexes</h1><p><br></p>`);
  await select((await posIn('Annexes')) - 2);
  await page.click('#cite-btn');
  await page.click('#src-biblio');
  html = await saved();
  assert.match(html, /<h1 data-nonum="oui" class="ft-bib-title" data-ids="\w+">Bibliographie<\/h1><p class="ft-bib" data-src="\w+" data-h="\w+">SHAIKH, Anwar\. <i>Capitalism<\/i>\. Oxford University Press, 2018\.<\/p><p><br><\/p><h1 data-nonum="oui">Annexes<\/h1>/);
  ok('modèle : le titre « Bibliographie » déjà là devient celui de la bibliographie');

  // 7. Longue bibliographie en mode avancé : coupée entre les pages, aucune ligne hors d'une page.
  const many = await v(() => {
    const C = window.FTCite;
    const out = [];
    for (let i = 0; i < 70; i++) out.push(C.addSource({ authors: [`Auteur${String(i).padStart(2, '0')}, Jean`], title: `Un titre assez long pour tenir sur deux lignes dans la page, volume ${i}`, year: String(1950 + i), publisher: 'Éditions du Banc d’essai', url: 'https://catalogue.bnf.fr/ark:/12148/cb' + (40000000 + i) }).id);
    return out;
  });
  await load(`<h1>Texte</h1><p>${many.map(cite).join(' ')}</p><p><br></p>`, { mode: 'avance' });
  await select(await endPos());
  await page.click('#cite-btn');
  await page.click('#src-biblio');
  await frames(6);
  const geo = await v(() => {
    const pg = document.getElementById('page');
    const k = pg.currentCSSZoom || 1;
    const top = pg.getBoundingClientRect().top;
    const g = window.FTPages._geo();
    const out = { sheets: document.querySelectorAll('.pg-sheet').length, pages: new Set(), bad: [] };
    const r = document.createRange();
    for (const p of document.querySelectorAll('#editor p.ft-bib')) {
      if (p.closest('[data-pm-far]')) continue;
      r.selectNodeContents(p);
      for (const rc of r.getClientRects()) {
        if (!rc.height) continue;
        const y0 = (rc.top - top) / k;
        const y1 = (rc.bottom - top) / k;
        const i = g.findIndex((x) => y0 >= x.ct - 1 && y1 <= x.cb + 1);
        if (i < 0) out.bad.push(p.textContent.slice(0, 20)); else out.pages.add(i);
      }
    }
    return { sheets: out.sheets, pages: out.pages.size, bad: out.bad };
  });
  assert.deepStrictEqual(geo.bad, []);
  assert.ok(geo.pages >= 3, JSON.stringify(geo));
  ok(`longue bibliographie (70 références) en mode avancé : ${geo.pages} pages, aucune ligne hors d’une page`);

  // 8. Export Word : un paragraphe par référence, retrait suspendu, [n] devant en style numérique.
  await load(`<p>A${cite(ids[0])} B${cite(ids[3])}.</p><p><br></p>`, { citeStyle: 'numerique' });
  await select(await endPos());
  await page.click('#cite-btn');
  await page.click('#src-biblio');
  const paras = await v(() => [...document.querySelectorAll('#editor p.ft-bib')].map((p) => getComputedStyle(p, '::before').content + ' ' + p.textContent.slice(0, 12)));
  assert.deepStrictEqual(paras, ['"[1] " MARX, Karl. ', '"[2] " MANDEL, Erne']);
  const xml = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord()))), 'word/document.xml');
  const wp = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) => m[1]).filter((x) => /MARX|MANDEL/.test(x));
  assert.strictEqual(wp.length, 2);
  for (const x of wp) assert.match(x, /<w:ind [^>]*w:hanging="\d+"/);
  assert.match(wp[0].replace(/<[^>]+>/g, ''), /^\[1\] MARX, Karl\. Le capital/);
  assert.match(wp[1].replace(/<[^>]+>/g, ''), /^\[2\] MANDEL, Ernest/);
  ok('style numérique : numéros devant chaque référence ; Word : un paragraphe par référence, retrait suspendu, [n] devant');

  // 9. Thème justifié : la bibliographie est alignée à gauche ; « Aligner à gauche » est gardé.
  await v(() => {
    const st = document.createElement('style');
    st.id = 'essai-justifie';
    st.textContent = '#editor p { text-align: justify }';
    document.head.appendChild(st);
    window.__align = window.FTTheme.textAlign;
    window.FTTheme.textAlign = () => 'justify';
  });
  await load(`<p>Texte${cite(ids[0])}.</p><p><br></p>`);
  await select(await endPos());
  await page.click('#cite-btn');
  await page.click('#src-biblio');
  const align = () => v(() => [...document.querySelectorAll('#editor p')].slice(0, 2).map((p) => getComputedStyle(p).textAlign));
  assert.deepStrictEqual(await align(), ['justify', 'left']);
  await select(2);
  await page.click('#toolbar [data-align="left"]');
  assert.deepStrictEqual(await align(), ['left', 'left']);
  assert.match(await saved(), /^<p style="text-align: left;">Texte/);
  await select((await posIn('MARX')) + 2);
  await page.click('#toolbar [data-align="justify"]');
  assert.strictEqual(await v(() => getComputedStyle(document.querySelector('#editor p.ft-bib')).textAlign), 'justify');
  await page.click('#toolbar [data-align="left"]');
  assert.strictEqual(await v(() => getComputedStyle(document.querySelector('#editor p.ft-bib')).textAlign), 'left');
  assert.match(await saved(), /<p class="ft-bib" data-src="\w+" data-h="\w+">MARX/);
  await v(() => { document.getElementById('essai-justifie').remove(); window.FTTheme.textAlign = window.__align; });
  ok('thème justifié : bibliographie alignée à gauche ; « Aligner à gauche » gardé sur un paragraphe et sur une référence');
};
