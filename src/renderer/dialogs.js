// Fenêtres déplaçables : chaque fenêtre (thème du document, raccourcis clavier, styles…) se déplace par
// un clic maintenu n'importe où en dehors des boutons et des champs, et se pose où l'on veut, pour voir
// le document pendant les réglages. Elle garde sa place jusqu'à la fermeture du logiciel ; un double-clic sur le titre la remet au centre.
(function () {
  let drag = null;

  function clamp(d, left, top) {
    const w = d.offsetWidth;
    const h = d.offsetHeight;
    // On peut la pousser en partie hors de l'écran sur les côtés ; en hauteur, elle reste entière
    // (ses boutons, comme « Fermer », restent visibles).
    left = Math.min(Math.max(left, 160 - w), window.innerWidth - 160);
    top = Math.min(Math.max(top, 0), Math.max(0, window.innerHeight - h));
    d.style.left = left + 'px';
    d.style.top = top + 'px';
    return h;
  }

  // Éléments qui gardent leur propre usage du clic : on ne déplace pas la fenêtre depuis eux.
  const ACTIVE = 'button, input, select, textarea, a, label, option, summary, canvas, img, [contenteditable="true"], [role="slider"], .ft-no-drag';

  // Clic sur la barre de défilement d'un élément : on fait défiler, on ne déplace pas.
  function onScrollbar(e) {
    for (let n = e.target; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight && getComputedStyle(n).overflowY !== 'visible') {
        const r = n.getBoundingClientRect();
        if (e.clientX > r.left + n.clientLeft + n.clientWidth) return true;
      }
      if (n.tagName === 'DIALOG') break;
    }
    return false;
  }

  function setup(d) {
    const handle = d.querySelector('h2');
    if (!handle || d.classList.contains('ft-movable')) return;
    d.classList.add('ft-movable');
    handle.classList.add('ft-drag-handle');
    handle.title = 'Maintenir le clic sur la fenêtre pour la déplacer (double-clic sur le titre : recentrer)';
    // Clic maintenu n'importe où dans la fenêtre, hors boutons, champs et listes de choix.
    d.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest(ACTIVE) || onScrollbar(e)) return;
      e.preventDefault();
      const r = d.getBoundingClientRect();
      d.classList.add('ft-moved', 'ft-dragging');
      clamp(d, r.left, r.top);
      drag = { d, dx: e.clientX - r.left, dy: e.clientY - r.top };
    });
    handle.addEventListener('dblclick', () => {
      d.classList.remove('ft-moved');
      d.style.left = '';
      d.style.top = '';
    });
  }

  window.addEventListener('mousemove', (e) => {
    if (drag) clamp(drag.d, e.clientX - drag.dx, e.clientY - drag.dy);
  });
  window.addEventListener('mouseup', () => {
    if (drag) drag.d.classList.remove('ft-dragging');
    drag = null;
  });
  // Fenêtre agrandie (redimensionnement du logiciel) : elle reste dans l'écran.
  window.addEventListener('resize', () => {
    document.querySelectorAll('dialog.ft-moved[open]').forEach((d) => clamp(d, parseFloat(d.style.left) || 0, parseFloat(d.style.top) || 0));
  });

  document.querySelectorAll('dialog').forEach((d) => { if (d.id !== 'modal' && d.id !== 'diagram-dialog') setup(d); });
})();
