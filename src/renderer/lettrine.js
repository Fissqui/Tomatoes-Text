// Lettrine : la première lettre d'un paragraphe, agrandie sur 2, 3 ou 4 lignes.
// Le bouton de la barre d'insertion met ou retire la lettrine du paragraphe où se trouve le curseur ;
// sa petite flèche ouvre les réglages (hauteur, style). Gardée sur le paragraphe :
// data-lettrine="2|3|4" et data-lettrine-style="couleur|encadree|ornee".
(function () {
  let editor = document.getElementById('editor');
  // Moteur 2.0 : paragraphe du moteur, relu d'un coup (moteur/objets.js).
  let bridge = null;
  const btn = document.getElementById('lettrine-btn');
  const more = document.getElementById('lettrine-more');
  const pop = document.getElementById('lettrine-pop');

  const LINES = [['2', '2 lignes'], ['3', '3 lignes'], ['4', '4 lignes']];
  const STYLES = [['', 'Simple', 'La lettre dans la couleur du texte'], ['couleur', 'Couleur', 'La lettre dans la couleur du thème'],
    ['ornee', 'Ornée', 'Lettre italique, à empattements, dans la couleur du thème'], ['encadree', 'Encadrée', 'La lettre dans un cadre fin, dans la couleur du thème']];
  // Réglages pour la prochaine lettrine (ceux de la dernière posée).
  let last = { lines: '3', style: '' };

  function paragraph() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    if (n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
    const p = n && n.closest && n.closest('p, div');
    if (!p || p === editor || !editor.contains(p) || p.closest('li, td, th, .ft-toc, .ft-footnotes, .ft-image, .ft-math')) return null;
    return p;
  }

  const change = (fn) => {
    if (bridge) {
      bridge.edit(fn);
      return refresh();
    }
    if (window.FTHistory) window.FTHistory.commit();
    fn();
    editor.dispatchEvent(new Event('input'));
    refresh();
  };

  function set(p, look) {
    p.dataset.lettrine = look.lines;
    if (look.style) p.dataset.lettrineStyle = look.style; else delete p.dataset.lettrineStyle;
  }
  function remove(p) {
    delete p.dataset.lettrine;
    delete p.dataset.lettrineStyle;
  }
  const lookOf = (p) => (p && p.dataset.lettrine
    ? { lines: p.dataset.lettrine, style: p.dataset.lettrineStyle || '' }
    : { ...last });

  function toggle() {
    const p = paragraph();
    if (!p) return;
    change(() => (p.dataset.lettrine ? remove(p) : set(p, last)));
  }

  // Un réglage du menu : appliqué au paragraphe (qui reçoit une lettrine s'il n'en a pas) et retenu.
  function choose(key, value) {
    const p = paragraph();
    last = { ...lookOf(p), [key]: value };
    if (p) change(() => set(p, last));
    render();
  }

  function seg(title, list, key, look) {
    const box = document.createElement('div');
    box.className = 'seg';
    for (const [value, label, tip] of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (tip) b.title = tip;
      b.classList.toggle('on', look[key] === value);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => choose(key, value));
      box.append(b);
    }
    const t = document.createElement('div');
    t.className = 'pop-title';
    t.textContent = title;
    return [t, box];
  }

  function render() {
    const p = paragraph();
    const look = lookOf(p);
    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'lettrine-off';
    off.textContent = 'Retirer la lettrine';
    off.disabled = !(p && p.dataset.lettrine);
    off.addEventListener('mousedown', (e) => e.preventDefault());
    off.addEventListener('click', () => { pop.hidden = true; if (p) change(() => remove(p)); });
    const help = document.createElement('p');
    help.className = 'lettrine-help';
    help.textContent = p ? 'Les réglages s’appliquent au paragraphe où se trouve le curseur.' : 'Placez le curseur dans un paragraphe pour lui donner une lettrine.';
    pop.replaceChildren(...seg('Hauteur', LINES, 'lines', look), ...seg('Style', STYLES, 'style', look), off, help);
  }

  function refresh() {
    const p = paragraph();
    btn.classList.toggle('on', !!(p && p.dataset.lettrine));
    btn.setAttribute('aria-pressed', String(!!(p && p.dataset.lettrine)));
  }

  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => { pop.hidden = true; toggle(); });
  more.addEventListener('mousedown', (e) => e.preventDefault());
  more.addEventListener('click', () => {
    if (!pop.hidden) { pop.hidden = true; return; }
    render();
    pop.hidden = false;
    window.FTToolbar.placePop(pop, btn);
  });
  document.addEventListener('mousedown', (e) => { if (!pop.hidden && !e.target.closest('.lettrine-tool')) pop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });
  document.addEventListener('selectionchange', () => { if (editor.contains(window.getSelection().anchorNode)) refresh(); });

  window.FTLettrine = {
    refresh,
    useEngine(mount, objets) {
      editor = mount;
      bridge = objets;
    }
  };
})();
