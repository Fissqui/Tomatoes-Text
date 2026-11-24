// Résumé d'un document entier par l'AAT : bouton à côté du nom de chaque document, dans la
// gestion des projets. Le résumé est gardé (resumes.json du projet) et réaffiché tant que le
// document n'a pas changé.
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const dialog = $('summary-dialog');
  const App = () => window.FTApp;

  let doc = null; // { id, title, text }
  let length = 'moyen';
  let running = 0;
  let saved = null; // résumés gardés : { 'docId|longueur': { hash, length, text, date, words } }

  try { length = localStorage.getItem('ft-summary-length') || 'moyen'; } catch { /* rien */ }

  function hashOf(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36) + ':' + text.length;
  }
  const wordsOf = (text) => (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;

  function setLength(v) {
    length = v;
    $('sum-length').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    try { localStorage.setItem('ft-summary-length', v); } catch { /* rien */ }
  }

  function showState({ progress, error, text, info, setup }) {
    $('sum-progress').hidden = !progress;
    $('sum-stop').hidden = !progress;
    $('sum-redo').hidden = !!progress;
    $('sum-error').hidden = !error;
    $('sum-error').textContent = error || '';
    $('sum-setup').hidden = !setup;
    $('sum-text').hidden = !text;
    $('sum-text').textContent = text || '';
    $('sum-info').textContent = info || '';
    $('sum-copy').hidden = !text;
    $('sum-insert').hidden = !text || !App().currentId();
    $('sum-length').querySelectorAll('button').forEach((b) => { b.disabled = !!progress; });
  }

  function setProgress({ done, total, step }) {
    const pct = step === 'final' ? 92 : Math.round(5 + (done / Math.max(1, total)) * 85);
    $('sum-progress').querySelector('.sum-bar span').style.width = pct + '%';
    $('sum-step').textContent = step === 'final' ? 'Rédaction du résumé…'
      : step === 'regroupement' ? `Regroupement des idées… (${done + 1} sur ${total})`
        : total > 1 ? `Lecture du document : partie ${done + 1} sur ${total}…` : 'Lecture du document…';
  }

  async function loadSaved() {
    if (saved) return saved;
    try { saved = (await api.loadSummaries()) || {}; } catch { saved = {}; }
    return saved;
  }

  function infoOf(entry) {
    const when = new Date(entry.date).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return `Résumé de ${entry.words.toLocaleString('fr-FR')} mots, fait le ${when}. Écrit par le modèle local de l'Aide au texte : relisez-le avant de l'utiliser.`;
  }

  async function open(id) {
    const data = await App().docText(id);
    if (!data) return;
    doc = data;
    $('sum-title').textContent = doc.title;
    setLength(length);
    if (!dialog.open) dialog.showModal();
    saved = null; // relus à chaque fois : le projet a pu changer
    const all = await loadSaved();
    const entry = all[id + '|' + length];
    if (entry && entry.hash === hashOf(doc.text)) {
      showState({ text: entry.text, info: infoOf(entry) });
      return;
    }
    run();
  }

  async function run() {
    if (!doc) return;
    const words = wordsOf(doc.text);
    if (!words) { showState({ error: 'Ce document est vide : il n’y a rien à résumer.' }); return; }
    const me = ++running;
    showState({ progress: true, info: `${words.toLocaleString('fr-FR')} mots à lire. Un long document peut demander quelques minutes.` });
    setProgress({ done: 0, total: 1, step: 'lecture' });
    // Le résumé est écrit dans la langue principale du texte (parmi celles du document ouvert).
    const L = window.FTLang;
    const lang = L ? await L.dominant(doc.text, doc.id === App().currentId() ? L.list() : undefined) : 'fr';
    if (me !== running) return;
    const res = await api.assistSummarize({ id: me, title: doc.title, text: doc.text, length, lang });
    if (me !== running) return;
    running = 0;
    if (res.cancelled) { showState({ info: 'Résumé arrêté.' }); return; }
    if (res.error) {
      showState({ error: res.needsSetup ? 'Le modèle de l’Aide au texte n’est pas encore installé. Ouvrez l’Aide au texte, puis « Réglages de l’Aide au texte » pour le télécharger ou choisir son dossier.' : res.error, setup: !!res.needsSetup });
      return;
    }
    const entry = { hash: hashOf(doc.text), length, text: res.text, date: new Date().toISOString(), words };
    const all = await loadSaved();
    all[doc.id + '|' + length] = entry;
    api.saveSummaries(all).catch(() => {});
    showState({ text: res.text, info: infoOf(entry) });
  }

  api.onSummaryProgress((p) => { if (p.id === running) setProgress(p); });

  function close() {
    if (running) { running = 0; api.assistSummaryCancel(); }
    if (dialog.open) dialog.close();
  }

  // Le résumé, écrit à l'endroit du curseur : un paragraphe par ligne, les points clés en liste.
  function insert() {
    const text = $('sum-text').textContent.trim();
    if (!text) return;
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const bullets = lines.every((l) => /^[–\-•*]\s*/.test(l));
    const html = bullets
      ? '<ul>' + lines.map((l) => `<li>${esc(l.replace(/^[–\-•*]\s*/, ''))}</li>`).join('') + '</ul>'
      : lines.map((l) => `<p>${esc(l)}</p>`).join('');
    dialog.close();
    // Moteur 2.0 : écrit par le nouveau moteur.
    const M = window.FTMoteur;
    if (M && M.view.dom === $('editor')) {
      M.view.focus();
      M.closeHistory();
      // Curseur à la fin d'une ligne écrite : le résumé commence sur la ligne suivante.
      const { $from, empty } = M.view.state.selection;
      if (empty && $from.parent.isTextblock && $from.parent.textContent && $from.parentOffset === $from.parent.content.size) {
        M.view.dispatch(M.view.state.tr.split($from.pos));
      }
      M.insertHtml(html);
      M.closeHistory();
      return;
    }
    const S = window.FTStructure;
    S.restoreSelection();
    const editor = $('editor');
    const sel = window.getSelection();
    editor.focus({ preventScroll: true });
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) S.placeCaret(editor.lastElementChild || editor, true);
    S.checkpoint();
    document.execCommand('insertHTML', false, html);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  $('sum-length').querySelectorAll('button').forEach((b) => b.addEventListener('click', async () => {
    setLength(b.dataset.v);
    if (!doc) return;
    const entry = (await loadSaved())[doc.id + '|' + length];
    if (entry && entry.hash === hashOf(doc.text)) showState({ text: entry.text, info: infoOf(entry) });
    else run();
  }));
  $('sum-redo').addEventListener('click', run);
  $('sum-stop').addEventListener('click', () => { api.assistSummaryCancel(); });
  $('sum-close').addEventListener('click', close);
  $('sum-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('sum-text').textContent); $('sum-info').textContent = 'Résumé copié.'; } catch { /* rien */ }
  });
  $('sum-insert').addEventListener('click', insert);
  $('sum-setup').addEventListener('click', () => { close(); window.FTAssistant.toggle(true); const d = $('assist-settings'); if (d) d.open = true; });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  $('assist-summary').addEventListener('click', () => { const id = App().currentId(); if (id) open(id); });

  window.FTSummary = { open };
})();
