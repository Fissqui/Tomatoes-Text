// Essai de « Coller sans dégâts » : texte de PDF (lignes et mots coupés, puces), page web (polices,
// couleurs, gras, lien, titre, liste, tableau), Word (puces écrites à la main), aperçu et ses options,
// « Coller tel quel », court morceau sans aperçu, copie interne inchangée, Ctrl+Z.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const load = (html) => page.evaluate((h) => {
    const ed = document.getElementById('editor');
    if (window.FTMoteur) {
      window.FTEditor.load({ content: { html: h }, settings: {} });
    } else {
      ed.innerHTML = h;
      ed.dispatchEvent(new Event('input'));
      window.FTHistory.reset();
    }
    ed.focus();
    const p = document.getElementById('here');
    let t = p.firstChild || p;
    // Préversion 2.0 : le texte d'une case est dans un paragraphe ajouté par le moteur.
    if (t.nodeType === 1 && t.hasAttribute('data-pm-bare')) t = t.firstChild || t;
    const r = document.createRange();
    if (t.nodeType === 3) r.setStart(t, Number(p.dataset.at || t.data.length)); else r.setStart(p, 0);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }, html);
  const paste = (data) => page.evaluate((d) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(d)) dt.setData(k, v);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.getElementById('editor').dispatchEvent(ev);
  }, data);
  // Préversion 2.0 : le texte enregistré (la zone du moteur ajoute ses propres marques à l'écran).
  const body = () => page.evaluate(() => (window.FTMoteur ? window.FTEditor.getHtml() : document.getElementById('editor').innerHTML));
  const open = () => page.evaluate(() => document.getElementById('paste-dialog').open);

  // 1. PDF : lignes coupées à la largeur de la page, mot coupé, double espace, puces.
  const pdf = [
    'Le traitement de texte moderne permet de rédiger des documents longs et',
    'structurés sans se soucier de la mise en page, qui est calculée automa-',
    'tiquement par le logiciel  au fil de la frappe.',
    'Un second paragraphe commence ici, après une ligne plus courte que les',
    'autres, et il continue sur la ligne suivante.',
    '• premier point',
    '• second point'
  ].join('\n');
  await load('<p id="here">Avant</p><p>Après</p>');
  await paste({ 'text/plain': pdf });
  assert(await open(), 'aperçu ouvert');
  assert(await page.isChecked('#ps-lines'), 'lignes coupées détectées');
  await page.screenshot({ path: path.join(SHOTS, 'collage-pdf.png') });
  const pv = await page.evaluate(() => [...document.querySelectorAll('#ps-preview > *')].map((e) => e.tagName + ':' + e.textContent));
  assert.deepStrictEqual(pv, [
    'P:Le traitement de texte moderne permet de rédiger des documents longs et structurés sans se soucier de la mise en page, qui est calculée automatiquement par le logiciel au fil de la frappe.',
    'P:Un second paragraphe commence ici, après une ligne plus courte que les autres, et il continue sur la ligne suivante.',
    'UL:premier pointsecond point'
  ]);
  ok('PDF : lignes recollées, « automa-tiquement » recollé, espace double retiré, puces en liste');
  await page.click('#ps-ok');
  let html = await body();
  assert(/^<p id="here">AvantLe traitement/.test(html), html.slice(0, 80));
  assert(html.includes('<ul><li>premier point</li><li>second point</li></ul><p>Après</p>') || html.includes('<ul><li>premier point</li><li>second point</li></ul><p><br></p><p>Après</p>'), html);
  ok('collé au curseur : le premier paragraphe rejoint la ligne du curseur');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await body(), '<p id="here">Avant</p><p>Après</p>');
  ok('Ctrl+Z retire le collage');

  // Option décochée : lignes gardées telles quelles.
  await load('<p id="here"><br></p>');
  await paste({ 'text/plain': pdf });
  await page.uncheck('#ps-lines');
  const n = await page.evaluate(() => document.querySelectorAll('#ps-preview p').length);
  assert(n >= 5, 'une ligne par paragraphe : ' + n);
  await page.click('#ps-cancel');
  assert.strictEqual(await body(), '<p id="here"><br></p>');
  ok('« Recoller les lignes » décoché : aperçu ligne à ligne ; Annuler ne colle rien');

  // 2. Page web.
  const web = `<html><head><style>p{color:red}</style></head><body>
    <h2 style="font-family:Arial;color:#333">Un titre</h2>
    <p style="font-family:'Comic Sans MS';font-size:18px;color:rgb(200,0,0);background:yellow">Du texte <span style="font-weight:700">en gras</span>,
    <em>en italique</em> et <a href="https://exemple.org" style="color:blue">un lien</a>.</p>
    <ul><li>un</li><li>deux<ul><li>deux bis</li></ul></li></ul>
    <table><tr><th>Nom</th><th>Âge</th></tr><tr><td>Ana</td><td>31</td></tr></table>
    <script>alert(1)</script><img src="https://exemple.org/x.png"></body></html>`;
  await load('<p id="here"><br></p>');
  await paste({ 'text/html': web, 'text/plain': 'Un titre\nDu texte en gras, en italique et un lien.\nun\ndeux\ndeux bis\nNom Âge\nAna 31' });
  // (Version 2.5 : les images du texte collé sont lues d'abord ; celle-ci, introuvable, est retirée.)
  await page.waitForFunction(() => document.getElementById('paste-dialog').open, null, { timeout: 15000 });
  await page.screenshot({ path: path.join(SHOTS, 'collage-web.png') });
  await page.click('#ps-ok');
  html = await body();
  assert(!/style=|font-family|Comic|script|<img|<span/i.test(html.replace(/<table[^>]*>/, '<table>').replace(/<col style="width: [0-9.]+%;">/g, '<col>')), html);
  assert(html.includes('<h2>Un titre</h2>'), html);
  assert(html.includes('<p>Du texte <b>en gras</b>, <i>en italique</i> et <a href="https://exemple.org">un lien</a>.</p>'), html);
  assert(html.includes('<ul><li>un</li><li>deux<ul><li>deux bis</li></ul></li></ul>'), html);
  assert(await page.evaluate(() => { const t = document.querySelector('#editor table.ft-table'); return t && t.dataset.t === '2' && t.dataset.header === 'oui' && t.rows.length === 2; }), 'tableau du logiciel : ' + html.slice(html.indexOf('<table'), html.indexOf('<table') + 400));
  ok('web : polices, couleurs, fonds, scripts et images retirés ; titre, gras, italique, lien, liste imbriquée, tableau gardés');

  // Options « garder » décochées.
  await load('<p id="here"><br></p>');
  await paste({ 'text/html': web, 'text/plain': 'x\ny' });
  await page.uncheck('#ps-inline');
  await page.uncheck('#ps-structure');
  await page.click('#ps-ok');
  html = await body();
  assert(!/<(b|i|a|h2|ul|table)\b/.test(html), html);
  assert(html.includes('<p>Nom – Âge</p>'), html);
  ok('« Garder… » décochés : texte simple, tableau en lignes');
  // Les choix sont retenus pour le collage suivant.
  await load('<p id="here"><br></p>');
  await paste({ 'text/html': web, 'text/plain': 'x\ny' });
  assert(!(await page.isChecked('#ps-inline')) && !(await page.isChecked('#ps-structure')));
  await page.check('#ps-inline');
  await page.check('#ps-structure');
  await page.click('#ps-raw');
  html = await body();
  assert(/Comic Sans|<span|font-size/i.test(html), 'tel quel garde la mise en forme : ' + html.slice(0, 200));
  ok('choix retenus ; « Coller tel quel » garde la mise en forme d’origine');

  // 3. Word : puces écrites à la main.
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body>
    <p class="MsoNormal"><span style="font-family:Calibri;mso-bidi-font-family:Arial">Liste :</span></p>
    <p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>alpha</p>
    <p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>bêta</p></body></html>`;
  await load('<p id="here"><br></p>');
  await paste({ 'text/html': word, 'text/plain': 'Liste :\n· alpha\n· bêta' });
  assert.strictEqual(await page.textContent('#ps-from'), 'Texte venu de Word');
  await page.click('#ps-ok');
  html = await body();
  assert(html.includes('<p id="here">Liste :</p><ul><li>alpha</li><li>bêta</li></ul>'), html);
  ok('Word : puces de Word en vraie liste, styles mso retirés');

  // 4. Court morceau de web : nettoyé sans aperçu, au milieu d’une ligne.
  await load('<p id="here" data-at="3">abcdef</p>');
  await paste({ 'text/html': '<span style="font-family:Arial;color:red;font-size:30px">  mot   <b>fort</b> </span>', 'text/plain': ' mot fort ' });
  assert(!(await open()), 'pas d’aperçu');
  assert.strictEqual(await body(), '<p id="here" data-at="3">abcmot <b>fort</b>def</p>');
  ok('court morceau : nettoyé directement, au curseur');

  // 5. Dans une cellule de tableau : texte au curseur, lignes séparées par des retours à la ligne.
  await load('<table class="ft-table" data-t="2"><tbody><tr><td id="here">x</td></tr></tbody></table><p>fin</p>');
  await paste({ 'text/plain': 'Une première ligne assez longue pour un aperçu\nune seconde ligne' });
  await page.click('#ps-ok');
  const cellHtml = () => page.evaluate(() => {
    const td = document.getElementById('here');
    const bare = td.querySelector(':scope > [data-pm-bare]');
    return (bare || td).innerHTML;
  });
  assert.strictEqual(await cellHtml(), 'xUne première ligne assez longue pour un aperçu<br>une seconde ligne');
  ok('dans une cellule : lignes séparées par des retours à la ligne');

  // 6. Copie interne : collage habituel.
  await load('<p id="here">bonjour le monde</p>');
  await page.evaluate(() => { const t = document.getElementById('here').firstChild; getSelection().setBaseAndExtent(t, 0, t, 7); document.dispatchEvent(new Event('copy')); });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'bonjour');
    dt.setData('text/html', '<span style="color:red">bonjour</span>');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.getElementById('editor').dispatchEvent(ev);
    window.__prevented = ev.defaultPrevented;
  });
  if (await page.evaluate(() => !!window.FTMoteur)) {
    // Préversion 2.0 : le moteur reconnaît ce qu'il a copié lui-même (repère data-pm-slice) et le colle
    // tel quel, mise en forme comprise, sans aperçu.
    await load('<p id="here">bonjour le monde</p>');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'bonjour');
      dt.setData('text/html', '<p data-pm-slice="1 1 []"><span style="color: red;">bonjour</span></p>');
      document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    assert(!(await open()), 'pas d’aperçu');
    assert.strictEqual(await body(), '<p id="here">bonjour le monde<span style="color: red;">bonjour</span></p>');
  } else {
    assert.strictEqual(await page.evaluate(() => window.__prevented), false);
  }
  ok('passage copié dans le document : collage habituel');

  // 7. Tableau de Wikipédia (sondages) : cases fusionnées, photos, ligne de couleurs, appels de note,
  // liens « [archive] », 16 colonnes. Gardé tel quel, colonnes selon leur contenu, texte réduit pour tenir.
  const wiki = require('fs').readFileSync(path.join(__dirname, 'donnees-tableau-wikipedia.html'), 'utf8');
  await load('<p id="here">Avant</p><p>Après</p>');
  await paste({ 'text/html': wiki, 'text/plain': 'Sondeur\tDate\n'.repeat(8) });
  await page.click('#ps-ok');
  await page.waitForTimeout(400);
  const wt = await page.evaluate(() => {
    const t = document.querySelector('#editor table.ft-table');
    const cells = [...t.querySelectorAll('td, th')];
    const broken = cells.filter((c) => {
      // Mot coupé : une ligne de la case commence au milieu d'un mot.
      const r = document.createRange();
      r.selectNodeContents(c);
      const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)));
      const words = c.innerText.split(/\s+/).filter(Boolean).length;
      return tops.size > words + 1;
    }).map((c) => c.innerText);
    return {
      rows: t.rows.length,
      first: [...t.rows[0].cells].map((c) => c.innerText.replace(/\s+/g, ' ')).join('|'),
      spans: [...t.rows[1].cells].slice(0, 3).map((c) => c.rowSpan),
      cols: t.querySelectorAll('colgroup col').length,
      size: t.dataset.fsize,
      pad: t.dataset.pad,
      text: t.innerText,
      broken
    };
  });
  assert.strictEqual(wt.rows, 6, JSON.stringify(wt));
  assert.strictEqual(wt.first.split('|').length, 16);
  assert(wt.first.startsWith('Sondeur|Date|Échantillon|Arthaud (LO)|') && wt.first.includes('Glucksmann (PP)|'), wt.first);
  assert.deepStrictEqual(wt.spans, [4, 4, 4]);
  assert(wt.cols === 16 && wt.pad === 'serre' && Number(wt.size) >= 5 && Number(wt.size) < 12, JSON.stringify(wt));
  assert(!/archive|\[c\]/.test(wt.text), wt.text);
  assert.deepStrictEqual(wt.broken, []);
  const saved = await body();
  assert(/<td rowspan="4">/.test(saved) && /<colgroup>/.test(saved), saved.slice(0, 600));
  ok(`tableau de Wikipédia : 16 colonnes, 6 lignes (ligne de couleurs retirée), cases fusionnées gardées, sans « [archive] » ni appel de note, colonnes selon leur contenu, texte ${wt.size} pt, aucun mot coupé`);
};
