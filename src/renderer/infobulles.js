// Info-bulles aux couleurs du thème du logiciel (Thème du logiciel > Aspect > « Info-bulles »).
// Avec « Système », les infobulles natives (attribut title) restent. Sinon, le title de l'élément
// survolé est mis de côté le temps du survol et affiché dans #ui-tip, puis remis en place.
(function () {
  const root = document.documentElement;
  const DELAY = 450;
  let tip = null;
  let host = null; // élément dont le title est mis de côté
  let text = '';
  let timer = 0;

  const active = () => root.dataset.uiBulles && root.dataset.uiBulles !== 'systeme';

  function box() {
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'ui-tip';
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      tip.popover = 'manual';
      document.body.append(tip);
    }
    return tip;
  }

  function restore() {
    clearTimeout(timer);
    if (host && !host.hasAttribute('title') && text) host.setAttribute('title', text);
    host = null;
    text = '';
    if (tip) { tip.hidden = true; if (tip.hidePopover) try { tip.hidePopover(); } catch { /* déjà masquée */ } }
  }

  function show(x, y) {
    if (!host || !host.isConnected) return restore();
    const t = box();
    t.textContent = text;
    t.hidden = false;
    // Couche supérieure (popover) : au-dessus des fenêtres ouvertes.
    if (t.showPopover) { try { t.hidePopover(); } catch { /* déjà masquée */ } t.showPopover(); }
    const r = t.getBoundingClientRect();
    let left = Math.min(x + 12, innerWidth - r.width - 8);
    let tp = y + 20;
    if (tp + r.height > innerHeight - 6) tp = y - r.height - 10;
    t.style.left = Math.max(6, left) + 'px';
    t.style.top = Math.max(6, tp) + 'px';
  }

  document.addEventListener('mouseover', (e) => {
    if (!active()) return;
    const el = e.target.closest && e.target.closest('[title]');
    if (!el || el === host) return;
    restore();
    const value = el.getAttribute('title');
    if (!value || el.closest('#editor')) return;
    host = el;
    text = value;
    el.removeAttribute('title');
    const { clientX: x, clientY: y } = e;
    timer = setTimeout(() => show(x, y), DELAY);
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (host && !(e.relatedTarget && host.contains(e.relatedTarget))) restore();
  }, true);
  for (const type of ['mousedown', 'keydown', 'wheel', 'blur']) addEventListener(type, () => { if (host) restore(); }, true);
})();
