// Annuler / Rétablir pour la zone d'écriture (nouveau moteur).
// Le moteur garde lui-même la liste des modifications (frappe groupée par pause, transformations une à
// une) : annuler ne recopie plus tout le texte, et reste instantané sur un long document.
(function () {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const M = window.FTMoteur;

  function refresh() {
    undoBtn.classList.toggle('inactive', M.undoDepth() === 0);
    redoBtn.classList.toggle('inactive', M.redoDepth() === 0);
  }

  M.onUpdate((tr) => { if (tr.docChanged || tr.getMeta('history$')) refresh(); });

  for (const [btn, fn] of [[undoBtn, M.undo], [redoBtn, M.redo]]) {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => fn());
  }

  // Ctrl+Z / Ctrl+Y aussi quand le curseur n'est pas dans le texte (après un clic sur un outil, dans une
  // fenêtre de réglages…) ; une case de saisie garde ses propres Annuler / Rétablir.
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || !e.ctrlKey || e.altKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const fn = key === 'z' ? (e.shiftKey ? M.redo : M.undo) : key === 'y' && !e.shiftKey ? M.redo : null;
    if (!fn) return;
    const t = e.target;
    if (t instanceof Element && (t.closest('input:not([type="checkbox"], [type="radio"], [type="button"], [type="range"], [type="color"]), textarea, [contenteditable]:not([contenteditable="false"])'))) return;
    e.preventDefault();
    fn();
  });

  window.FTHistory = {
    // Nouveau document : la liste repart de zéro (le moteur en crée une neuve à l'ouverture).
    reset: refresh,
    // Termine le groupe en cours : la modification suivante s'annulera à part.
    // (Pendant un outil appliqué d'un coup — objets.js — il forme déjà une étape à lui seul.)
    commit: () => { if (!(window.FTObjets && window.FTObjets.busy())) M.closeHistory(); },
    undo: M.undo,
    redo: M.redo,
    refresh
  };
})();
