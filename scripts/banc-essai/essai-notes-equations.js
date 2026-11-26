// Notes de bas de page sur les équations (2.5.20) :
// - note ajoutée à une équation de la ligne choisie ou en cours de modification : l'appel se pose juste
//   après elle (et non en début de paragraphe) ;
// - note ajoutée à une équation sur sa propre ligne (choisie ou en cours de modification, numérotée ou non) :
//   l'appel est dans l'équation, après la formule ; il reste en modifiant l'équation, mène à sa note au clic,
//   suit l'équation passée dans la ligne et revient avec elle ;
// - copier-coller d'une équation avec sa note (sur sa propre ligne, ou de la ligne choisie seule) : la note
//   est copiée avec elle ;
// - note au pied de la page de l'équation ; export Word (appel de note après l'équation).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-notes-equations.js
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

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const L = '\\frac{a}{b}+1';
  const load = async (html) => {
    await page.keyboard.press('Escape');
    await v((h) => { window.FTEditor.load({ content: { html: h }, settings: { mode: 'avance' } }); document.getElementById('page').hidden = false; }, html);
    await page.waitForTimeout(400);
  };
  // Appels (numéro et place : « bloc » dans une équation sur sa ligne, « éq » juste après une équation de la
  // ligne, sinon le texte qui précède), notes, curseur dans une note, appels et notes d'accord.
  const state = () => v(() => {
    const ed = document.getElementById('editor');
    const w = window.FTMoteur.view;
    const where = (s) => {
      if (s.closest('div.ft-math')) return 'bloc';
      let p = s.previousSibling;
      while (p && p.nodeType === 1 && p.classList.contains('ProseMirror-separator')) p = p.previousSibling;
      if (p && p.nodeType === 1 && p.classList.contains('ft-math')) return 'éq';
      return p ? 'texte' : 'début';
    };
    const $f = w.state.selection.$from;
    return {
      refs: [...ed.querySelectorAll('sup.ft-fn-ref')].map((s) => s.textContent + ':' + where(s)),
      notes: [...ed.querySelectorAll('.ft-footnotes li')].map((l) => l.textContent.trim()),
      inNote: $f.depth > 1 && /ft-footnotes/.test($f.node(1).attrs.a ? $f.node(1).attrs.a.class || '' : ''),
      same: [...ed.querySelectorAll('sup.ft-fn-ref')].map((s) => s.dataset.fn).join() === [...ed.querySelectorAll('.ft-footnotes li')].map((l) => l.dataset.fn).join(),
      latex: [...ed.querySelectorAll('.ft-math')].map((m) => m.dataset.latex)
    };
  });
  const inline = (extra = '') => v(([L, x]) => '<p>Texte ' + window.FTFormules.html({ latex: L, block: false }) + x + ' suite.</p>', [L, extra]);
  const block = (o = {}) => v(([L, o]) => '<p>Avant.</p>' + window.FTFormules.html({ latex: L, block: true, ...o }) + '<p>Après.</p>', [L, o]);
  const select = () => v(() => {
    const w = window.FTMoteur.view;
    let p;
    w.state.doc.descendants((n, pos) => { if (p === undefined && window.FTFormuleVue.isMath(n)) p = pos; });
    w.dispatch(w.state.tr.setSelection(PM.state.NodeSelection.create(w.state.doc, p)));
    w.focus();
  });
  const click = async (sel) => {
    const b = await v((s) => { const el = document.querySelector(s); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
    await page.mouse.click(b[0], b[1]);
    await page.waitForTimeout(350);
  };
  const editing = () => v(() => !!window.FTFormuleVue.active());
  const addNote = async (text = 'Ma note') => {
    await page.click('#note-btn');
    await page.waitForTimeout(300);
    await page.keyboard.type(text);
    await page.waitForTimeout(200);
  };
  // Copie de la sélection, collage à la fin du paragraphe « at » (texte exact).
  const copyPaste = (at) => v((at) => {
    const w = window.FTMoteur.view;
    const dt = new DataTransfer();
    w.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    let end;
    w.state.doc.forEach((n, p) => { if (n.textContent === at) end = p + n.nodeSize - 1; });
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, end)));
    const d2 = new DataTransfer();
    d2.setData('text/html', dt.getData('text/html'));
    d2.setData('text/plain', dt.getData('text/plain'));
    w.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d2, bubbles: true, cancelable: true }));
  }, at);

  // 1. Équation de la ligne : choisie, puis en cours de modification.
  await load(await inline());
  await select();
  await addNote();
  let s = await state();
  assert.deepStrictEqual(s.refs, ['1:éq'], JSON.stringify(s));
  assert(s.inNote && s.same && s.notes[0] === 'Ma note', JSON.stringify(s));
  await load(await inline());
  await click('#editor span.ft-math');
  assert(await editing(), 'équation ouverte au clic');
  await addNote();
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:éq'], 'appel juste après l’équation en cours de modification : ' + JSON.stringify(s));
  assert(s.inNote && s.same && !(await editing()), JSON.stringify(s));
  ok('équation de la ligne choisie ou en cours de modification : appel de note juste après elle, curseur dans la note');

  // 2. Équation sur sa propre ligne : choisie (non numérotée), en cours de modification (numérotée).
  await load(await block());
  await select();
  await addNote();
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:bloc'], JSON.stringify(s));
  assert(s.inNote && s.same && s.notes[0] === 'Ma note', JSON.stringify(s));
  await load(await block({ numbered: true }));
  await click('#editor div.ft-math .ML__latex');
  assert(await editing(), 'équation sur sa ligne ouverte au clic');
  await addNote();
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:bloc'], JSON.stringify(s));
  assert(s.inNote && s.same, JSON.stringify(s));
  const geo = await v(() => {
    const m = document.querySelector('#editor div.ft-math');
    const f = m.querySelector('.ML__latex').getBoundingClientRect();
    const r = m.querySelector('sup.ft-fn-ref').getBoundingClientRect();
    return { gap: r.left - f.right, up: r.top < f.top + f.height / 2, num: getComputedStyle(m, '::after').content };
  });
  assert(geo.gap > -2 && geo.gap < 12 && geo.up && geo.num === '"(1)"', 'appel juste après la formule, en haut, numéro gardé : ' + JSON.stringify(geo));
  // Modifiée ensuite : l'appel reste ; un deuxième ajout mène à la même note.
  await click('#editor div.ft-math .ML__latex');
  await page.keyboard.type('+2');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:bloc'], JSON.stringify(s));
  assert(/\+2/.test(s.latex[0]) && s.notes[0] === 'Ma note', JSON.stringify(s));
  await select();
  await page.click('#note-btn');
  await page.waitForTimeout(300);
  s = await state();
  assert(s.refs.length === 1 && s.notes.length === 1 && s.inNote, 'une seule note par équation : ' + JSON.stringify(s));
  // Clic sur l'appel : la note, sans ouvrir l'équation.
  await v(() => { const w = window.FTMoteur.view; w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, 2))); });
  await click('#editor div.ft-math sup.ft-fn-ref');
  s = await state();
  assert(s.inNote && !(await editing()), 'clic sur l’appel : ' + JSON.stringify(s));
  // Clic droit sur la note > Revenir à l'appel : l'équation est choisie.
  await v(() => window.FTMoteur.view.dom.querySelector('.ft-footnotes li').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })));
  await page.waitForTimeout(150);
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => /Revenir/.test(b.textContent)).click());
  await page.waitForTimeout(150);
  assert(await v(() => { const sel = window.FTMoteur.view.state.selection; return !!sel.node && window.FTFormuleVue.isMath(sel.node); }), 'retour à l’appel : équation choisie');
  ok('équation sur sa propre ligne (choisie, ou en cours de modification et numérotée) : appel après la formule, gardé en la modifiant, une note par équation, clic vers la note et retour');

  // 3. Copier-coller : équation sur sa ligne avec sa note ; équation de la ligne choisie seule avec la sienne.
  await select();
  await copyPaste('Après.');
  await page.waitForTimeout(300);
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:bloc', '2:bloc'], JSON.stringify(s));
  assert.deepStrictEqual(s.notes, ['Ma note', 'Ma note'], JSON.stringify(s));
  assert(s.same, JSON.stringify(s));
  await load(await inline('<sup class="ft-fn-ref" data-fn="n1" contenteditable="false">1</sup>') + '<p>Ici :</p><div class="ft-footnotes"><ol><li data-fn="n1"><p>La note.</p></li></ol></div>');
  await select();
  await copyPaste('Ici :');
  await page.waitForTimeout(300);
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:éq', '2:éq'], JSON.stringify(s));
  assert.deepStrictEqual(s.notes, ['La note.', 'La note.'], JSON.stringify(s));
  ok('copier-coller d’une équation avec sa note : sur sa propre ligne, ou de la ligne choisie seule (son appel copié avec elle)');

  // 4. Disposition changée : l'appel suit l'équation (dans la ligne, puis sur sa ligne) ; annulation.
  await load(await block());
  await select();
  await addNote();
  await v(() => window.FTFormules.apply(document.querySelector('#editor div.ft-math'), { block: false }));
  await page.waitForTimeout(300);
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:éq'], JSON.stringify(s));
  await v(() => window.FTFormules.apply(document.querySelector('#editor span.ft-math'), { block: true }));
  await page.waitForTimeout(300);
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:bloc'], JSON.stringify(s));
  assert(s.notes[0] === 'Ma note' && s.same, JSON.stringify(s));
  await v(() => window.FTMoteur.undo());
  await page.waitForTimeout(200);
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:éq'], JSON.stringify(s));
  ok('équation passée dans la ligne puis sur sa ligne : l’appel et sa note la suivent ; annulation');

  // 5. Note au pied de la page de l'équation ; export Word.
  const filler = '<p>' + 'Le texte courant remplit la page de lignes successives. '.repeat(30) + '</p>';
  await load(filler.repeat(4) + await v((L) => window.FTFormules.html({ latex: L, block: true, numbered: true, ref: '<sup class="ft-fn-ref" data-fn="m1" contenteditable="false">1</sup>' }), L) + filler + '<div class="ft-footnotes"><ol><li data-fn="m1"><p>Note de l’équation.</p></li></ol></div>');
  await page.waitForTimeout(600);
  const pages = await v(() => {
    const pg = document.getElementById('page');
    const top = pg.getBoundingClientRect().top;
    const k = pg.currentCSSZoom || 1;
    const geo = window.FTPages._geo();
    const at = (el) => { const y = (el.getBoundingClientRect().top - top) / k; return geo.findIndex((g) => y >= g.top && y < g.top + g.h); };
    return { ref: at(document.querySelector('#editor div.ft-math sup.ft-fn-ref')), note: at(document.querySelector('#editor .ft-footnotes li')), n: geo.length };
  });
  assert(pages.n > 1 && pages.ref > 0 && pages.ref === pages.note, 'note sur la page de l’équation : ' + JSON.stringify(pages));
  const xml = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())))).get('word/document.xml');
  assert(/<m:oMath(?:Para)?\b(?:(?!<\/w:p>)[\s\S])*<w:footnoteReference w:id="1"\/>/.test(xml), 'appel de note après l’équation dans Word');
  ok(`note au pied de la page de l’équation (page ${pages.ref + 1}) ; export Word : appel de note après l’équation`);

  // 6. Collé depuis Word : équation dans la ligne et équation sur sa ligne, chacune suivie d'une note.
  const wref = (n) => `<a style='mso-footnote-id:ftn${n}' href="#_ftn${n}" name="_ftnref${n}" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><![if !supportFootnotes]><span class=MsoFootnoteReference>[${n}]</span><![endif]></span></span></a>`;
  const wnote = (n, t) => `<div style='mso-element:footnote' id=ftn${n}><p class=MsoFootnoteText><a style='mso-footnote-id:ftn${n}' href="#_ftnref${n}" name="_ftn${n}" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><![if !supportFootnotes]><span class=MsoFootnoteReference>[${n}]</span><![endif]></span></span></a> ${t}</p></div>`;
  const weq = (para) => `<!--[if gte msEquation 12]>${para ? '<m:oMathPara>' : ''}<m:oMath><i><span style='font-family:"Cambria Math"'><m:r>x</m:r></span></i><span style='font-family:"Cambria Math"'><m:r>=1</m:r></span></m:oMath>${para ? '</m:oMathPara>' : ''}<![endif]--><![if !msEquation]><img width=40 height=20 src="data:image/png;base64,iVBORw0KGgo="><![endif]>`;
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"><body lang=FR><!--StartFragment-->
<p class=MsoNormal>Texte ${weq(false)}${wref(1)} suite.</p>
<p class=MsoNormal align=center style='text-align:center'>${weq(true)}${wref(2)}</p>
<p class=MsoNormal>Fin.</p>
<div style='mso-element:footnote-list'><![if !supportFootnotes]><br clear=all><hr align=left size=1 width="33%"><![endif]>
${wnote(1, 'Note de la ligne.')}${wnote(2, 'Note du bloc.')}</div><!--EndFragment--></body></html>`;
  await load('<p>Début  fin.</p>');
  await v((h) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, 8)));
    w.focus();
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', 'Texte x=1[1] suite.\nx=1[2]\nFin.');
    w.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, word);
  await page.waitForTimeout(500);
  if (await v(() => document.getElementById('paste-dialog').open)) { await v(() => document.getElementById('ps-ok').click()); await page.waitForTimeout(400); }
  s = await state();
  assert.deepStrictEqual(s.refs, ['1:éq', '2:bloc'], JSON.stringify(s));
  assert.deepStrictEqual(s.notes, ['Note de la ligne.', 'Note du bloc.'], JSON.stringify(s));
  assert(await v(() => window.FTMoteur.view.state.doc.childCount) === 4, 'pas de ligne vide pour l’appel : ' + await v(() => window.FTMoteur.view.state.doc.content.toString()));
  ok('collé depuis Word : équation dans la ligne et équation sur sa ligne gardent leur note');
};
