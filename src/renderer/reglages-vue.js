// Fenêtre de réglages d'une vue (Mindmap, Carte du temps) : des rangées de choix et de cases,
// ouverte par un bouton « Réglages », fermée par un clic ailleurs.
// rows : [{ key, label, choices: [[valeur, texte]…] }] ou [{ label, checks: [[clé, texte]…] }].
(function () {
  function build({ panel, button, title, rows, get, set, reset }) {
    panel.classList.add('vs-panel');
    panel.replaceChildren();
    const h = document.createElement('div');
    h.className = 'vs-title';
    h.textContent = title;
    panel.append(h);
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'vs-row';
      const l = document.createElement('span');
      l.textContent = row.label;
      line.append(l);
      const box = document.createElement('div');
      if (row.choices) {
        box.className = 'mm-seg';
        for (const [v, t] of row.choices) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = t;
          b.dataset.key = row.key;
          b.dataset.v = v;
          b.addEventListener('click', () => set(row.key, v));
          box.append(b);
        }
      } else {
        box.className = 'vs-checks';
        for (const [k, t] of row.checks) {
          const c = document.createElement('label');
          c.className = 'mm-check';
          const i = document.createElement('input');
          i.type = 'checkbox';
          i.dataset.key = k;
          i.addEventListener('change', () => set(k, i.checked));
          c.append(i, ' ' + t);
          box.append(c);
        }
      }
      line.append(box);
      panel.append(line);
    }
    const r = document.createElement('button');
    r.type = 'button';
    r.className = 'vs-reset';
    r.textContent = 'Rétablir les réglages par défaut';
    r.addEventListener('click', reset);
    panel.append(r);

    const sync = () => {
      const o = get();
      panel.querySelectorAll('button[data-key]').forEach((b) => b.setAttribute('aria-pressed', String(String(o[b.dataset.key]) === b.dataset.v)));
      panel.querySelectorAll('input[data-key]').forEach((i) => { i.checked = !!o[i.dataset.key]; });
    };
    const open = (on) => {
      panel.hidden = !on;
      button.setAttribute('aria-pressed', String(on));
      if (on) sync();
    };
    button.addEventListener('click', (e) => { e.stopPropagation(); open(panel.hidden); });
    document.addEventListener('pointerdown', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !button.contains(e.target) && !e.target.closest('.vs-keep')) open(false);
    });
    sync();
    return { sync, open };
  }

  window.FTViewSettings = { build };
})();
