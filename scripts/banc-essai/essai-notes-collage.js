// Notes de bas de page et équations gardées au collage (2.4.42) : Word (notes de bas de page et de fin),
// LibreOffice, pages web (Wikipédia avec ou sans la liste des notes, Pandoc), texte d'un PDF, passage copié
// dans le logiciel même (copier-coller et couper-coller) ; équations de MathJax 2 copiées sans leur code.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-notes-collage.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const reset = async (html) => {
    await page.keyboard.press('Escape');
    await v((h) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: 'avance' } });
      document.getElementById('page').hidden = false;
    }, html);
    await page.waitForTimeout(250);
  };
  // Colle data au curseur (position pos), valide l'aperçu s'il s'ouvre.
  const paste = async (data, html = '<p>Début  fin.</p>', pos = 8) => {
    await reset(html);
    await v(([d, p]) => {
      const w = window.FTMoteur.view;
      w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, p)));
      w.focus();
      const dt = new DataTransfer();
      for (const [k, val] of Object.entries(d)) dt.setData(k, val);
      w.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [data, pos]);
    await page.waitForTimeout(250);
    if (await v(() => document.getElementById('paste-dialog').open)) { await v(() => document.getElementById('ps-ok').click()); await page.waitForTimeout(250); }
    await page.waitForTimeout(150);
    return state();
  };
  // Appels (numéro affiché) et notes (texte) du document.
  const state = () => v(() => {
    const ed = document.getElementById('editor');
    const refs = [...ed.querySelectorAll('sup.ft-fn-ref')].map((s) => s.textContent);
    const ends = [...ed.querySelectorAll('sup.ft-en-ref')].map((s) => s.textContent);
    const notes = [...ed.querySelectorAll('.ft-footnotes li')].map((li) => li.textContent.trim());
    const endNotes = [...ed.querySelectorAll('.ft-endnotes li')].map((li) => li.textContent.trim());
    const ids = [...ed.querySelectorAll('sup.ft-fn-ref')].map((s) => s.dataset.fn);
    const lis = [...ed.querySelectorAll('.ft-footnotes li')].map((li) => li.dataset.fn);
    const text = window.FTMoteur.view.state.doc.textContent;
    const boxes = ed.querySelectorAll('.ft-footnotes').length;
    return { refs, ends, notes, endNotes, same: ids.join() === lis.join(), text, boxes, html: window.FTSchema.serialize(window.FTMoteur.view.state.doc) };
  });

  // 1. Word : appels mso-footnote-id, notes du bloc footnote-list (deux paragraphes, italique), note de fin.
  const wordRef = (n, kind = 'ftn') => `<a style='mso-${kind === 'ftn' ? 'footnote' : 'endnote'}-id:${kind}${n}' href="#_${kind}${n}" name="_${kind}ref${n}" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><![if !supportFootnotes]><span class=MsoFootnoteReference>[${n}]</span><![endif]></span></span></a>`;
  const wordNote = (n, html, kind = 'ftn') => `<div style='mso-element:${kind === 'ftn' ? 'footnote' : 'endnote'}' id=${kind}${n}><p class=MsoFootnoteText><a style='mso-${kind === 'ftn' ? 'footnote' : 'endnote'}-id:${kind}${n}' href="#_${kind}ref${n}" name="_${kind}${n}" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><![if !supportFootnotes]><span class=MsoFootnoteReference>[${n}]</span><![endif]></span></span></a> ${html}</div>`;
  const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><body lang=FR><!--StartFragment-->
<p class=MsoNormal>La croissance a ralenti${wordRef(1)} au premier trimestre, puis repris${wordRef(2)}.</p>
<p class=MsoNormal>Les prix ont baissé${wordRef(1, 'edn')}.</p>
<div style='mso-element:footnote-list'><![if !supportFootnotes]><br clear=all><hr align=left size=1 width="33%"><![endif]>
${wordNote(1, 'Selon l’<i>Insee</i>, 2024.</p>')}
${wordNote(2, 'Premier paragraphe.</p><p class=MsoFootnoteText>Second paragraphe.</p>')}
</div><div style='mso-element:endnote-list'><![if !supportEndnotes]><br clear=all><hr align=left size=1 width="33%"><![endif]>
${wordNote(1, 'Note de fin de Word.</p>', 'edn')}
</div><!--EndFragment--></body></html>`;
  let s = await paste({ 'text/html': word, 'text/plain': 'La croissance a ralenti[1] au premier trimestre, puis repris[2].\nLes prix ont baissé[i].\n\n[1] Selon l’Insee, 2024.\n[2] Premier paragraphe.\nSecond paragraphe.' });
  assert.deepStrictEqual(s.refs, ['1', '2'], JSON.stringify(s));
  assert.deepStrictEqual(s.notes, ['Selon l’Insee, 2024.', 'Premier paragraphe.Second paragraphe.'], JSON.stringify(s.notes));
  assert.deepStrictEqual(s.ends, ['i']);
  assert.deepStrictEqual(s.endNotes, ['Note de fin de Word.']);
  assert(s.same && s.boxes === 1, JSON.stringify(s));
  assert(!/\[1\]|\[2\]|Selon|Second/.test(s.text.split('Selon')[0]) && !/<hr/.test(s.html), s.text);
  assert(/<i>Insee<\/i>|<em>Insee<\/em>/.test(s.html), s.html);
  ok('Word : appels devenus des notes de bas de page (texte, italique, deux paragraphes), note de fin gardée en note de fin, trait et « [1] » retirés');

  // Ctrl+Z : le collage et ses notes partent ensemble.
  await v(() => window.FTMoteur.undo());
  await page.waitForTimeout(150);
  s = await state();
  assert(s.refs.length === 0 && s.notes.length === 0 && s.ends.length === 0, JSON.stringify(s));
  ok('Ctrl+Z retire le texte collé et ses notes');

  // Collage au milieu d'un document qui a déjà des notes : numérotation suivie, notes à leur place.
  s = await paste({ 'text/html': word, 'text/plain': 'x\ny' },
    '<p>Avant<sup class="ft-fn-ref" data-fn="a1" contenteditable="false">1</sup> et  après<sup class="ft-fn-ref" data-fn="a2" contenteditable="false">2</sup>.</p><div class="ft-footnotes"><ol><li data-fn="a1"><p>Note A.</p></li><li data-fn="a2"><p>Note B.</p></li></ol></div>', 12);
  assert.deepStrictEqual(s.refs, ['1', '2', '3', '4'], JSON.stringify(s));
  assert.deepStrictEqual(s.notes, ['Note A.', 'Selon l’Insee, 2024.', 'Premier paragraphe.Second paragraphe.', 'Note B.']);
  assert(s.same && s.boxes === 1);
  ok('collé entre deux notes du document : notes 1 à 4 dans l’ordre, un seul bloc de notes');

  // 2. LibreOffice.
  const lo = '<p>Texte de Writer<a class="sdfootnoteanc" name="sdfootnote1anc" href="#sdfootnote1sym"><sup>1</sup></a> suivi.</p>'
    + '<div id="sdfootnote1"><p class="sdfootnote"><a class="sdfootnotesym" name="sdfootnote1sym" href="#sdfootnote1anc">1</a>Note de LibreOffice.</p></div>';
  s = await paste({ 'text/html': lo, 'text/plain': 'Texte de Writer1 suivi.\n1Note de LibreOffice.' });
  assert.deepStrictEqual([s.refs, s.notes], [['1'], ['Note de LibreOffice.']], JSON.stringify(s));
  assert(!/LibreOffice\./.test(s.text.replace(/Note de LibreOffice\.$/, '')));
  ok('LibreOffice : appel et note');

  // 3. Wikipédia, passage copié avec la liste des notes (liens absolus, comme les écrit le navigateur).
  const W = 'https://fr.wikipedia.org/wiki/Tomate';
  const wiki = `<p>La tomate vient d’Amérique<sup id="cite_ref-1" class="reference"><a href="${W}#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup> et fut longtemps crue toxique<sup id="cite_ref-b" class="reference"><a href="${W}#cite_note-b">[b]</a></sup>.</p>`
    + '<div class="mw-heading mw-heading2"><h2 id="Notes_et_références">Notes et références</h2><span class="mw-editsection">[modifier]</span></div>'
    + `<div class="reflist"><ol class="references"><li id="cite_note-1"><span class="mw-cite-backlink"><a href="${W}#cite_ref-1">↑</a></span> <span class="reference-text">Jean Dupont, <i>Histoire de la tomate</i>, 1999, p. 12.</span></li>`
    + `<li id="cite_note-b"><span class="mw-cite-backlink">↑ <a href="${W}#cite_ref-b"><sup>a</sup></a></span> <span class="reference-text">Voir la <a href="https://fr.wikipedia.org/wiki/Solanaceae">famille</a>.</span></li></ol></div>`;
  s = await paste({ 'text/html': wiki, 'text/plain': 'La tomate vient d’Amérique[1] et fut longtemps crue toxique[b].\nNotes et références\n↑ Jean Dupont…' });
  assert.deepStrictEqual(s.refs, ['1', '2']);
  assert.deepStrictEqual(s.notes, ['Jean Dupont, Histoire de la tomate, 1999, p. 12.', 'Voir la famille.'], JSON.stringify(s.notes));
  assert(!/Notes et références|↑|\[1\]/.test(s.text), s.text);
  ok('Wikipédia avec la liste : notes reprises, titre « Notes et références », flèches de retour et crochets retirés');

  // 4. Wikipédia, paragraphe copié seul : la note est relue sur la page.
  await v((w) => {
    window.__asked = [];
    window.frameText.pastePage = async (url) => {
      window.__asked.push(url);
      await new Promise((r) => setTimeout(r, 100));
      return `<html><body><p>Article.</p><ol class="references"><li id="cite_note-1"><span class="mw-cite-backlink"><a href="#cite_ref-1">↑</a></span> <span class="reference-text">Note relue sur la page.</span></li></ol></body></html>`;
    };
  }, W);
  s = await paste({ 'text/html': wiki.split('<div class="mw-heading')[0], 'text/plain': 'La tomate vient d’Amérique[1] et fut longtemps crue toxique[b].' });
  await page.waitForTimeout(400);
  s = await state();
  assert.deepStrictEqual(s.refs, ['1', '2']);
  assert.deepStrictEqual(s.notes, ['Note relue sur la page.', ''], JSON.stringify(s.notes));
  assert.deepStrictEqual(await v(() => window.__asked), [W]);
  ok('Wikipédia sans la liste : appels gardés, note relue sur la page (une seule lecture) ; note introuvable laissée vide à remplir');

  // 5. Pandoc / blogs : section.footnotes.
  const pandoc = '<p>Un blog<sup><a href="#fn1" class="footnote-ref" id="fnref1">1</a></sup>.</p><section class="footnotes"><hr><ol><li id="fn1"><p>Note du blog. <a href="#fnref1" class="footnote-back">↩︎</a></p></li></ol></section>';
  s = await paste({ 'text/html': pandoc, 'text/plain': 'Un blog1.\n\nNote du blog. ↩︎' });
  assert.deepStrictEqual([s.refs, s.notes], [['1'], ['Note du blog.']], JSON.stringify(s));
  ok('page de type Pandoc : note reprise, retour « ↩︎ » retiré');

  // 6. Texte d'un PDF : appels « mot1 », « mot² » et lignes de note en bas ; une liste numérotée reste une liste.
  const pdf = 'L’inflation a reculé en 2024 dans la zone euro1, selon les données\npubliées par Eurostat². Le chômage reste stable à 7 %.\n'
    + '1 Zone euro à vingt pays, hors Croatie avant 2023, ce qui modifie\nlégèrement les séries.\n2 Eurostat, communiqué du 3 janvier.';
  s = await paste({ 'text/plain': pdf });
  assert.deepStrictEqual(s.refs, ['1', '2'], JSON.stringify(s));
  assert.deepStrictEqual(s.notes, ['Zone euro à vingt pays, hors Croatie avant 2023, ce qui modifie légèrement les séries.', 'Eurostat, communiqué du 3 janvier.']);
  assert(/zone euro1?, selon/.test(s.text) && !/euro1|Eurostat²/.test(s.text) && /7 %/.test(s.text), s.text);
  s = await paste({ 'text/plain': 'Les étapes en 2024 :\n1. Semer les graines\n2. Arroser chaque jour' });
  assert(s.refs.length === 0 && /Semer/.test(s.text), JSON.stringify(s));
  ok('PDF : « euro1 », « Eurostat² » et lignes « 1 … » en bas deviennent des notes (ligne coupée recollée) ; liste « 1. 2. » intacte');

  // 7. Copié dans le logiciel : copier-coller garde le texte des notes (nouvelle note), couper-coller aussi.
  await reset('<p>Phrase<sup class="ft-fn-ref" data-fn="z1" contenteditable="false">1</sup> à copier.</p><p>Ici : </p><div class="ft-footnotes"><ol><li data-fn="z1"><p>Ma note.</p></li></ol></div>');
  const copyPaste = (cut) => v(async (c) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, 1, 18)));
    w.focus();
    const dt = new DataTransfer();
    w.dom.dispatchEvent(new ClipboardEvent(c ? 'cut' : 'copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    const end = w.state.doc.child(0).nodeSize + w.state.doc.child(1).nodeSize - 1;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, end)));
    const dt2 = new DataTransfer();
    for (const t of dt.types) dt2.setData(t, dt.getData(t));
    w.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true }));
  }, cut);
  await copyPaste(false);
  await page.waitForTimeout(250);
  s = await state();
  assert.deepStrictEqual([s.refs, s.notes], [['1', '2'], ['Ma note.', 'Ma note.']], JSON.stringify(s));
  assert(s.same && s.boxes === 1);
  await reset('<p>Phrase<sup class="ft-fn-ref" data-fn="z1" contenteditable="false">1</sup> à copier.</p><p>Ici : </p><div class="ft-footnotes"><ol><li data-fn="z1"><p>Ma note.</p></li></ol></div>');
  await copyPaste(true);
  await page.waitForTimeout(250);
  s = await state();
  assert.deepStrictEqual([s.refs, s.notes], [['1'], ['Ma note.']], JSON.stringify(s));
  ok('dans le logiciel : copier-coller (note dupliquée) et couper-coller (note déplacée) gardent le texte des notes');

  // 8. Équations : MathJax 2 copié depuis le navigateur (sans le code TeX, MathML d'accessibilité seul),
  // équation dans une note de Word.
  const mj2 = '<p>Soit <span class="MathJax_Preview" style="color: inherit;"></span><span class="MathJax" id="MathJax-Element-1-Frame" tabindex="0" style="position: relative;"><nobr><span class="math" id="MathJax-Span-1"><span>x</span><span>2</span></span></nobr><span class="MJX_Assistive_MathML" role="presentation"><math xmlns="http://www.w3.org/1998/Math/MathML"><msup><mi>x</mi><mn>2</mn></msup></math></span></span> et</p>'
    + '<div class="MathJax_Display" style="text-align: center;"><span class="MathJax" id="MathJax-Element-2-Frame" data-mathml="&lt;math xmlns=&quot;http://www.w3.org/1998/Math/MathML&quot; display=&quot;block&quot;&gt;&lt;mfrac&gt;&lt;mn&gt;1&lt;/mn&gt;&lt;mn&gt;2&lt;/mn&gt;&lt;/mfrac&gt;&lt;/math&gt;"><nobr><span class="math"><span>12</span></span></nobr></span></div><p>fin.</p>';
  await paste({ 'text/html': mj2, 'text/plain': 'Soit x2 et\n12\nfin.' });
  const lat = await v(() => [...document.querySelectorAll('#editor .ft-math')].map((m) => (m.tagName === 'DIV' ? 'B:' : 'I:') + m.dataset.latex));
  assert.deepStrictEqual(lat, ['I:x^2', 'B:\\frac{1}{2}'], JSON.stringify(lat));
  // Wikipédia copié depuis Chrome : le MathML caché n'est pas copié, seule l'image de l'équation (code dans alt).
  await paste({ 'text/html': '<p>Aire <span class="mwe-math-element mwe-math-element-inline"><img src="https://wikimedia.org/api/rest_v1/media/math/render/svg/abc" class="mwe-math-fallback-image-inline mw-invert skin-invert" aria-hidden="true" alt="{\\displaystyle \\pi r^{2}}"></span> du disque, et une longue phrase pour l’aperçu.</p>', 'text/plain': 'Aire πr2 du disque, et une longue phrase pour l’aperçu.' });
  await page.waitForTimeout(300);
  const wk = await v(() => [...document.querySelectorAll('#editor .ft-math')].map((m) => m.dataset.latex));
  assert.deepStrictEqual(wk, ['\\pi r^{2}'], JSON.stringify(wk));
  const wordMath = `<p class=MsoNormal>Énergie${wordRef(1)}.</p><div style='mso-element:footnote-list'>${wordNote(1, 'Avec <!--[if gte msEquation 12]><m:oMath><m:r>E</m:r><m:r>=</m:r><m:r>m</m:r><m:sSup><m:e><m:r>c</m:r></m:e><m:sup><m:r>2</m:r></m:sup></m:sSup></m:oMath><![endif]--><![if !msEquation]><img src="file:///C:/x/clip_image001.png"><![endif]> ici.</p>')}</div>`;
  s = await paste({ 'text/html': wordMath, 'text/plain': 'Énergie[1].\n[1] Avec E=mc2 ici.' });
  const inNote = await v(() => [...document.querySelectorAll('#editor .ft-footnotes .ft-math')].map((m) => m.dataset.latex));
  assert(s.refs.length === 1 && inNote.length === 1 && /mc\^\{?2\}?/.test(inNote[0]), JSON.stringify([s, inNote]));
  ok('équations : MathJax 2 copié sans son code (MathML d’accessibilité, data-mathml) ; Wikipédia copié avec la seule image de l’équation ; équation Word dans une note gardée dans la note');
};
