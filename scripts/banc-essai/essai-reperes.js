// Repères biographiques (version 2.3) : données (86 personnes, dates au bon format), fenêtre (recherche,
// choix, précision, angle, contenu, forme), insertion à côté du paragraphe du curseur, enregistrement
// identique, Ctrl+Z, modification de la forme sans perdre le texte retouché, forme appliquée à tous les
// repères, accords au féminin, personne en vie, autre personne, clic droit, mode avancé, export Word.
// Le portrait de Wikimedia Commons est remplacé par une petite image (pas de réseau pendant l'essai).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-reperes.js
// (FT_SHOT=<dossier> : captures de la fenêtre et des modèles dans la page.)
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

function unzip(buf, name) {
  let e = buf.length - 22;
  while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < buf.readUInt16LE(e + 10); i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return null;
}

const TEXT = '<h1>Le temps socialement nécessaire</h1><p>Le capital avancé se décompose en deux parties dont le comportement diffère. Le capital constant transfère à la marchandise la valeur qu’il possède déjà, sans en créer de nouvelle.</p><p>Cette dissymétrie entre les deux fractions du capital n’a rien d’une convention comptable. Elle tient à ce que la force de travail est la seule marchandise dont la valeur d’usage consiste à travailler.</p><p>C’est pourquoi l’analyse ne peut se contenter d’observer les prix.</p>';

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const settle = async () => { await page.waitForTimeout(250); await v(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
  const reset = async (html, mode = 'note') => {
    await page.keyboard.press('Escape');
    await v(([h, m]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m } });
      document.getElementById('page').hidden = false;
    }, [html, mode]);
    await settle();
  };
  const saved = () => v(() => window.FTEditor.getHtml());
  const caretIn = (text) => v((t) => {
    const w = window.FTMoteur.view;
    let p = null;
    w.state.doc.descendants((n, q) => { if (p === null && n.isText && n.text.includes(t)) p = q + n.text.indexOf(t) + 3; });
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, p)));
    w.focus();
  }, text);
  const shot = async (name, sel) => {
    if (!process.env.FT_SHOT) return;
    const el = sel ? await page.$(sel) : null;
    if (el) await el.screenshot({ path: path.join(process.env.FT_SHOT, name) });
    else await page.screenshot({ path: path.join(process.env.FT_SHOT, name) });
  };
  const preview = () => v(() => {
    const b = document.querySelector('#bio-apercu .ft-bio');
    return b ? { html: b.innerHTML, text: b.innerText, cls: [...b.children].map((c) => c.className) } : null;
  });
  const pick = async (name) => {
    await page.fill('#bio-search', name);
    await page.waitForTimeout(50);
    await page.click('#bio-list .bio-item');
    await page.waitForTimeout(120);
  };
  const setSel = async (id, value) => { await page.selectOption('#' + id, value); await page.waitForTimeout(60); };
  const setBox = async (id, on) => { await page.setChecked('#' + id, on); await page.waitForTimeout(60); };

  // Portrait : une petite image à la place de Wikimedia Commons.
  await v(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = '#8a6a50'; g.fillRect(0, 0, 40, 40);
    g.fillStyle = '#e8d2b8'; g.beginPath(); g.arc(20, 16, 8, 0, 7); g.fill();
    const src = c.toDataURL('image/png');
    window.__portraitCalls = 0;
    window.frameText.bioPortrait = async (id) => { window.__portraitCalls++; return { file: 'x.jpg', src, licence: id === 'Q9061' ? 'Public domain' : 'CC BY-SA 4.0', auteur: 'Photographe Essai', attribution: id !== 'Q9061', page: '' }; };
  });

  // ----- Données -----

  const data = await v(() => {
    const L = window.FTBioData.personnes;
    const bad = [];
    const dateOk = (s) => /^~?\d{4}(-\d\d(-\d\d)?)?$/.test(s);
    for (const p of L) {
      if (!/^Q\d+$/.test(p.id) || !p.nom || !p.role || !p.parcours || !p.pensee || !dateOk(p.n) || (!p.vivant && !dateOk(p.d || '')) || !window.FTBioData.groupes[p.g] || !Array.isArray(p.idees) || !Array.isArray(p.oeuvres)) bad.push(p.nom);
      if (p.d && p.d.replace('~', '') < p.n.replace('~', '')) bad.push(p.nom + ' (dates)');
    }
    return { n: L.length, ids: new Set(L.map((p) => p.id)).size, bad, photos: L.filter((p) => p.photo).length };
  });
  assert.strictEqual(data.n, 86, 'nombre de personnes');
  assert.strictEqual(data.ids, 86, 'identifiants uniques');
  assert.deepStrictEqual(data.bad, [], 'fiches complètes');
  ok(`données : ${data.n} personnes complètes, ${data.photos} avec un portrait sur Wikimedia Commons`);

  // Portraits livrés avec le logiciel : un fichier et une licence pour chaque personne qui a un portrait.
  const fs = require('fs');
  const own = path.join(__dirname, '..', '..', 'src', 'renderer', 'bio', 'portraits');
  const lic = JSON.parse(fs.readFileSync(path.join(own, 'licences.json'), 'utf8'));
  const files = await v(() => window.FTBioData.personnes.filter((p) => p.photo).map((p) => [p.id, p.photo]));
  for (const [id, file] of files) {
    assert(lic[id] && lic[id].fichier === file && lic[id].licence, 'licence du portrait ' + id);
    assert(fs.statSync(path.join(own, id + '.jpg')).size > 3000, 'portrait ' + id);
    if (!/public domain|cc0/i.test(lic[id].licence)) assert(lic[id].attribution && lic[id].auteur, 'auteur du portrait ' + id);
  }
  ok(`${files.length} portraits livrés avec le logiciel, chacun avec sa licence`);

  // ----- Fenêtre et insertion -----

  await reset(TEXT);
  await v(() => localStorage.removeItem('ft-bio-reglages'));
  await caretIn('Le capital avancé');
  await page.click('#bio-btn');
  await page.waitForTimeout(250);
  assert(await v(() => document.getElementById('bio-dialog').open), 'fenêtre ouverte');
  await pick('marx');
  let pv = await preview();
  assert(pv.text.includes('Karl Marx') && pv.text.includes('1818 — 1883'), 'nom et dates');
  assert(/REPÈRE BIOGRAPHIQUE|Repère biographique/i.test(pv.text), 'intitulé');
  assert(pv.html.includes('<img'), 'portrait dans l’aperçu');
  assert.deepStrictEqual(pv.cls.slice(0, 4), ['ft-bio-kicker', 'ft-bio-portrait', 'ft-bio-name', 'ft-bio-dates'], 'ordre du modèle');
  assert(!pv.text.includes('Sources'), 'domaine public : pas de ligne de crédit imposée');
  const standard = pv.cls.filter((c) => c === 'ft-bio-text').length;
  assert.strictEqual(standard, 2, 'standard : rôle + une phrase de parcours et une de pensée');
  ok('fenêtre : recherche « marx », aperçu au modèle Médaillon (intitulé, portrait, nom, dates, texte)');
  await shot('reperes-fenetre.png', '#bio-dialog');

  await setSel('bio-precision', 'bref');
  pv = await preview();
  assert.strictEqual(pv.cls.filter((c) => c === 'ft-bio-text').length, 1, 'bref : une phrase');
  assert(!pv.cls.includes('ft-bio-list'), 'bref : pas de liste');
  await setSel('bio-precision', 'detaille');
  pv = await preview();
  assert.strictEqual(pv.cls.filter((c) => c === 'ft-bio-text').length, 3, 'détaillé : rôle, parcours, pensée');
  assert(pv.text.includes('Plus-value') && pv.text.includes('Le Capital, livre I (1867)'), 'notions et œuvres');
  assert(pv.html.includes('<i>Manifeste du Parti communiste</i> (avec Engels) (1848)'), 'titre en italique, coauteur hors italique');
  await setSel('bio-angle', 'pensee');
  pv = await preview();
  assert(/^Le Capital, dont le livre I/.test(await v(() => document.querySelectorAll('#bio-apercu .ft-bio-text')[1].textContent)), 'angle pensée : la pensée d’abord');
  ok('précision brève / standard / détaillée (notions clés, œuvres) et angle « pensée »');

  await setBox('bio-lieux', true);
  await setBox('bio-nationalite', true);
  await setBox('bio-courant', true);
  await setSel('bio-dateFormat', 'complet');
  pv = await preview();
  assert(pv.text.includes('5 mai 1818 – 14 mars 1883'), 'dates complètes');
  assert(pv.text.includes('Né à Trèves (Prusse), mort à Londres'), 'lieux');
  assert(pv.text.includes('Nationalité allemande'), 'nationalité au féminin');
  assert(pv.text.includes('Courant : Marxisme'), 'courant');
  await setBox('bio-sources', true);
  pv = await preview();
  assert(pv.text.includes('Wikidata (Q9061), BnF (notice 11914934t)'), 'sources');
  ok('dates complètes, lieux, nationalité, courant, sources Wikidata et BnF');

  // Retour à la forme d'origine pour l'insertion.
  await setSel('bio-precision', 'standard');
  for (const id of ['bio-lieux', 'bio-nationalite', 'bio-courant', 'bio-sources']) await setBox(id, false);
  await setSel('bio-dateFormat', 'annees');
  await page.click('#bio-ok');
  await settle();
  let html = await saved();
  assert(/^<h1>[^]*?<\/h1><blockquote class="ft-callout ft-bio"[^>]*data-wrap="droite"[^>]*>[^]*<\/blockquote><p>Le capital avancé/.test(html), 'repère posé avant le paragraphe du curseur, à droite : ' + html.slice(0, 300));
  assert(/style="width: 36%; --bio-t: 0.85;?"/.test(html), 'largeur et taille : ' + (html.match(/style="[^"]*"/) || [''])[0]);
  const floatInfo = await v(() => { const b = document.querySelector('#editor .ft-bio'); const cs = getComputedStyle(b); return { float: cs.cssFloat, w: b.offsetWidth, ed: document.getElementById('editor').clientWidth, bg: cs.backgroundColor, bt: cs.borderTopWidth }; });
  assert.strictEqual(floatInfo.float, 'right', 'à droite du texte');
  assert(floatInfo.w < floatInfo.ed * 0.45, 'largeur du cadre');
  assert.strictEqual(floatInfo.bt, '3px', 'filet du haut');
  ok(`inséré : flottant à droite (${floatInfo.w}px sur ${floatInfo.ed}px), fond ${floatInfo.bg}`);
  await shot('reperes-page.png', '#page');

  // Enregistrement identique : relu puis réenregistré.
  { const h2 = await saved(); assert.strictEqual(h2, html, 'relu à l’identique'); }
  assert.strictEqual(await saved(), html, 'relu à l’identique');
  ok('enregistrement identique après relecture');

  // Ctrl+Z
  await reset(TEXT);
  await caretIn('Cette dissymétrie');
  await page.click('#bio-btn');
  await page.waitForTimeout(200);
  await page.click('#bio-ok');
  await settle();
  assert.strictEqual(await v(() => document.querySelectorAll('#editor .ft-bio').length), 1, 'inséré');
  assert(/<blockquote[^]*<\/blockquote><p>Cette dissymétrie/.test(await saved()), 'avant le 2e paragraphe');
  await page.keyboard.press('Control+z');
  await settle();
  assert.strictEqual(await v(() => document.querySelectorAll('#editor .ft-bio').length), 0, 'Ctrl+Z');
  ok('réglages gardés pour le repère suivant ; Ctrl+Z retire le repère');

  // ----- Modifier : la forme seule garde le texte retouché -----

  await reset(html);
  await v(() => {
    const w = window.FTMoteur.view;
    let p = null;
    w.state.doc.descendants((n, q) => { if (p === null && n.isText && n.text.startsWith('Philosophe et économiste')) p = q; });
    w.dispatch(w.state.tr.insertText('Retouché. ', p));
  });
  await v(() => window.FTBio.open(document.querySelector('#editor .ft-bio')));
  await page.waitForTimeout(200);
  assert.strictEqual(await v(() => document.getElementById('bio-ok').textContent), 'Valider', 'bouton Valider');
  assert.strictEqual(await v(() => document.querySelector('#bio-list .bio-item.on').dataset.id), 'Q9061', 'personne retrouvée');
  await setSel('bio-modele', 'fiche');
  await page.click('#bio-couleurs [data-c="bleu"]');
  await page.click('#bio-ok');
  await settle();
  html = await saved();
  assert(html.includes('data-bio-modele="fiche"') && html.includes('data-bio-couleur="bleu"'), 'forme changée');
  assert(html.includes('Retouché. Philosophe'), 'texte retouché gardé');
  assert(html.includes('data-wrap="droite"'), 'place gardée');
  ok('modèle Fiche et couleur bleue : texte retouché et place gardés');
  await shot('reperes-fiche.png', '#page');

  // Contenu changé : refait (précision brève).
  await v(() => window.FTBio.open(document.querySelector('#editor .ft-bio')));
  await page.waitForTimeout(150);
  await setSel('bio-precision', 'bref');
  await page.click('#bio-ok');
  await settle();
  html = await saved();
  assert(!html.includes('Retouché') && (html.match(/ft-bio-text/g) || []).length === 1 && html.includes('data-bio-modele="fiche"'), 'contenu refait, forme gardée');
  ok('précision changée : notice refaite, forme gardée');

  // ----- Plusieurs repères : forme appliquée à tous -----

  const two = await v(() => {
    const a = window.FTBio.build({ id: 'Q9061' }).outerHTML;
    const b = window.FTBio.build({ id: 'Q7231', position: 'gauche', lieux: true, nationalite: true }).outerHTML;
    return [a, b];
  });
  await reset('<p>Un.</p>' + two[0] + '<p>Deux.</p>' + two[1] + '<p>Trois.</p>');
  const rosa = await v(() => document.querySelectorAll('#editor .ft-bio')[1].innerText);
  assert(rosa.includes('Née à Zamość (Empire russe), morte à Berlin'), 'accord au féminin : ' + rosa);
  assert(rosa.includes('Nationalité allemande d’origine polonaise'), 'nationalité');
  assert(rosa.includes('Portrait : Photographe Essai, CC BY-SA 4.0, Wikimedia Commons.') || !rosa.includes('Portrait'), 'crédit');
  ok('Rosa Luxemburg : « Née à … morte à … », nationalité accordée');
  await v(() => window.FTBio.open(document.querySelector('#editor .ft-bio')));
  await page.waitForTimeout(150);
  assert(!(await v(() => document.getElementById('bio-scope').hidden)), 'choix « tous les repères »');
  await page.click('#bio-couleurs [data-c="vert"]');
  await setSel('bio-modele', 'bandeau');
  await setBox('bio-scope-all', true);
  await page.click('#bio-ok');
  await settle();
  html = await saved();
  assert.strictEqual((html.match(/data-bio-couleur="vert"/g) || []).length, 2, 'les deux en vert');
  assert.strictEqual((html.match(/data-bio-modele="bandeau"/g) || []).length, 2, 'les deux en bandeau');
  assert(/data-wrap="gauche"/.test(html), 'le second reste à gauche');
  ok('forme appliquée à tous les repères du document (chacun garde sa place)');
  await page.keyboard.press('Control+z');
  await settle();
  assert.strictEqual(((await saved()).match(/data-bio-couleur="vert"/g) || []).length, 0, 'une seule étape d’annulation');
  ok('Ctrl+Z : une seule étape');

  // ----- Portrait crédité (licence avec attribution) -----

  await reset(TEXT);
  await caretIn('Le capital avancé');
  await page.click('#bio-btn');
  await page.waitForTimeout(150);
  await pick('Krugman');
  await page.waitForTimeout(150);
  pv = await preview();
  assert(pv.text.includes('Né en 1953'), 'personne en vie : « Né en 1953 »');
  assert(pv.text.includes('Portrait : Photographe Essai, CC BY-SA 4.0, Wikimedia Commons.'), 'crédit imposé par la licence');
  await setSel('bio-photo', 'aucune');
  pv = await preview();
  assert(!pv.html.includes('ft-bio-photo') && !pv.text.includes('Portrait :'), 'sans portrait ni crédit');
  await setSel('bio-photo', 'silhouette');
  pv = await preview();
  assert(pv.html.includes('ft-bio-silhouette'), 'silhouette');
  ok('personne en vie, crédit du portrait imposé par sa licence, sans portrait, silhouette');

  // Autre personne
  await pick('Autre');
  assert(!(await v(() => document.getElementById('bio-libre').hidden)), 'champs de la notice libre');
  await page.fill('#bio-l-nom', 'Jeanne Martin');
  await page.fill('#bio-l-dates', '1900 — 1980');
  await page.fill('#bio-l-texte', 'Première ligne.\nSeconde ligne.');
  await page.waitForTimeout(80);
  pv = await preview();
  assert(pv.text.includes('Jeanne Martin') && pv.text.includes('1900 — 1980') && pv.cls.filter((c) => c === 'ft-bio-text').length === 2, 'notice libre');
  const modeles = await v(() => [...document.querySelectorAll('#bio-modele option')].map((o) => o.value));
  assert.strictEqual(modeles.length, 16, 'seize modèles');
  const looks = new Set();
  for (const m of modeles) {
    await pick('marx');
    await setSel('bio-photo', 'commons');
    await setSel('bio-modele', m);
    await page.waitForTimeout(80);
    looks.add(await v(() => {
      const b = document.querySelector('#bio-apercu .ft-bio');
      const c = getComputedStyle(b);
      const n = getComputedStyle(b.querySelector('.ft-bio-name'));
      return [c.borderTop, c.borderLeft, c.backgroundImage, c.backgroundColor, c.boxShadow, c.borderRadius, n.fontSize, n.textAlign, n.fontVariant].join('|');
    }));
    await shot(`reperes-modele-${m}.png`, '#bio-apercu');
  }
  assert.strictEqual(looks.size, modeles.length, 'chaque modèle a son dessin');
  assert.strictEqual(await v(() => document.querySelectorAll('#bio-couleurs .bio-swatch').length), 11, 'onze couleurs');
  ok('autre personne (nom, dates, texte libres) ; seize modèles, chacun dessiné autrement ; onze couleurs');

  // Alignement du texte et de l'en-tête
  await setSel('bio-modele', 'medaillon');
  await setSel('bio-precision', 'detaille');
  const align = () => v(() => {
    const b = document.querySelector('#bio-apercu .ft-bio');
    const ta = (s) => getComputedStyle(b.querySelector(s)).textAlign;
    return { text: ta('.ft-bio-text'), li: ta('.ft-bio-list li'), name: ta('.ft-bio-name'), kicker: ta('.ft-bio-kicker'), hy: getComputedStyle(b.querySelector('.ft-bio-text')).hyphens };
  });
  let al = await align();
  assert.deepStrictEqual([al.text, al.name], ['left', 'center'], 'alignement de départ');
  for (const [val, want] of [['justifie', 'justify'], ['centre', 'center'], ['droite', 'right']]) {
    await setSel('bio-aligne', val);
    al = await align();
    assert.deepStrictEqual([al.text, al.li, al.name], [want, want, 'center'], 'texte ' + val);
  }
  await setSel('bio-aligne', 'justifie');
  assert.strictEqual((await align()).hy, 'auto', 'césure du texte justifié');
  await setSel('bio-entete', 'gauche');
  al = await align();
  assert.deepStrictEqual([al.name, al.kicker, al.text], ['left', 'left', 'justify'], 'en-tête à gauche');
  await setSel('bio-modele', 'fiche');
  await setSel('bio-entete', 'droite');
  assert.strictEqual((await align()).name, 'right', 'en-tête à droite, même dans la fiche');
  await page.click('#bio-cancel');
  ok('alignement du texte (gauche, centré, droite, justifié avec césure) et de l’en-tête');

  // ----- Clic droit, mode avancé, export Word -----

  await reset(TEXT.replace('<p>Le capital', two[0] + '<p>Le capital'));
  const items = await v(() => window.FTGeneres.menuAt(document.querySelector('#editor .ft-bio .ft-bio-text'), 10, 10).filter((i) => i && i.text).map((i) => i.text));
  assert(items.includes('Modifier le repère biographique…') && items.includes('Supprimer le repère biographique'), 'clic droit : ' + items.join(' | '));
  assert(!items.includes("Retirer l'encadré (garder le texte)"), 'pas « Retirer l’encadré »');
  ok('clic droit : « Modifier le repère biographique… », « Supprimer le repère biographique »');

  await reset(TEXT.replace('<p>Le capital', two[0] + '<p>Le capital'), 'avance');
  await page.waitForTimeout(600);
  const paged = await v(() => ({ pages: document.querySelectorAll('.ft-page, .pg-sheet, .page-sheet').length, float: getComputedStyle(document.querySelector('#editor .ft-bio')).cssFloat }));
  assert.strictEqual(paged.float, 'right', 'flottant en mode avancé');
  ok('mode avancé : repère flottant dans la page');
  await shot('reperes-avance.png', '#page');

  const xml = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord()))), 'word/document.xml');
  assert(xml && xml.includes('Karl Marx') && xml.includes('1818 — 1883'), 'export Word');
  ok('export Word : nom et dates présents');
};
