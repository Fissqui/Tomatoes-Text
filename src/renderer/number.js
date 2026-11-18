// Champs numériques : chaque réglage chiffré (taille de police, marges, interligne, nombre de lignes…)
// devient un champ où l'on tape sa valeur, virgule comprise (10,5), avec deux petites flèches l'une
// au-dessus de l'autre pour monter ou descendre d'un cran.
// - Liste de tailles (<select> aux valeurs chiffrées) : la liste reste cachée et garde la valeur ; le
//   champ la montre, propose les valeurs prêtes au clic, et une valeur tapée absente de la liste y est
//   ajoutée puis choisie (événement « change » comme avant). Les flèches passent à la valeur prête suivante.
// - Champ de saisie (type number, ou inputmode="decimal") : devient un champ texte ; sa propriété value
//   rend toujours un point (« 10.5 ») au code qui la lit et affiche une virgule. Les flèches ajoutent ou
//   retirent son pas (attribut step, 1 par défaut), entre min et max ; data-int : nombre entier.
// Tout champ de ce genre ajouté plus tard (fenêtres construites à l'ouverture) est transformé de lui-même.
// data-no-num sur un champ : il reste tel quel.
(function () {
  const NUM = /^-?\d+(\.\d+)?$/;
  const round = (n) => Math.round(n * 100) / 100;
  const show = (n) => String(round(n)).replace('.', ',');
  const parse = (s) => {
    const t = String(s ?? '').replace(/\s| /g, '').replace(',', '.').replace(/[^\d.\-]+$/, '');
    return NUM.test(t) || /^-?\.\d+$/.test(t) ? parseFloat(t) : NaN;
  };
  const inputProto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const selectProto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const indexProto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  const disabledProto = (el) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'disabled');

  const ARROW = (d) => `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="${d}"/></svg>`;

  function arrows(onStep) {
    const box = document.createElement('span');
    box.className = 'ft-num-arrows';
    for (const [dir, title, d] of [[-1, 'Diminuer', 'M2 3.5l3 3 3-3'], [1, 'Augmenter', 'M2 6.5l3-3 3 3']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.className = 'ft-num-btn';
      b.title = title;
      b.innerHTML = ARROW(d);
      // Le clic ne prend pas le focus : la sélection du document (taille de police) reste en place.
      b.addEventListener('mousedown', (e) => e.preventDefault());
      // Clic maintenu : la valeur continue de changer.
      let timer = null;
      const stop = () => { clearTimeout(timer); timer = null; };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || b.disabled) return;
        e.preventDefault();
        onStep(dir);
        const again = (delay) => { timer = setTimeout(() => { if (!b.isConnected || b.disabled) return stop(); onStep(dir); again(90); }, delay); };
        again(450);
        window.addEventListener('pointerup', stop, { once: true });
      });
      b.addEventListener('pointerleave', stop);
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStep(dir); } });
      box.append(b);
    }
    return box;
  }

  function wrap(el, field) {
    const box = document.createElement('span');
    box.className = 'ft-num';
    // La barre d'outils range ses boutons par data-tb, posé sur l'élément enfant direct du groupe.
    if (el.dataset.tb) { box.dataset.tb = el.dataset.tb; delete el.dataset.tb; }
    if (el.title && field !== el) field.title = el.title;
    el.replaceWith(box);
    box.append(field);
    if (field !== el) box.append(el);
    return box;
  }

  // L'état « désactivé » posé sur l'élément d'origine gagne le champ et les flèches.
  function mirrorDisabled(el, box) {
    const d = disabledProto(el);
    const apply = (on) => {
      box.classList.toggle('disabled', on);
      box.querySelectorAll('input, button').forEach((x) => { if (x !== el) x.disabled = on; });
    };
    Object.defineProperty(el, 'disabled', {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, v); apply(!!v); }
    });
    apply(el.disabled);
  }

  // ----- Champs de saisie -----

  function upgradeInput(input) {
    if (input.type === 'number') { input.type = 'text'; }
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.classList.add('ft-num-input');
    const attr = (k) => parse(input.getAttribute(k));
    const isInt = input.hasAttribute('data-int');
    const fmt = (v) => {
      if (v === '' || v == null) return '';
      const n = parse(v);
      return Number.isFinite(n) ? show(n) : String(v);
    };
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { const raw = inputProto.get.call(this).trim(); const n = parse(raw); return Number.isFinite(n) ? String(n) : raw; },
      set(v) { inputProto.set.call(this, fmt(v)); last = inputProto.get.call(this); }
    });
    let last = '';
    inputProto.set.call(input, fmt(inputProto.get.call(input)));
    last = inputProto.get.call(input);

    const clamp = (n) => {
      const min = attr('min');
      const max = attr('max');
      if (Number.isFinite(min)) n = Math.max(min, n);
      if (Number.isFinite(max)) n = Math.min(max, n);
      return isInt ? Math.round(n) : round(n);
    };
    // Valeur tapée : remise au propre avant que le code du réglage ne la lise.
    const tidy = () => {
      const raw = inputProto.get.call(input).trim();
      if (!raw) { last = ''; return; }
      const n = parse(raw);
      inputProto.set.call(input, Number.isFinite(n) ? show(clamp(n)) : last);
      last = inputProto.get.call(input);
    };
    const step = (dir) => {
      const s = attr('step') > 0 ? attr('step') : 1;
      const cur = parse(inputProto.get.call(input));
      let n;
      if (!Number.isFinite(cur)) n = Number.isFinite(attr('min')) && attr('min') > 0 ? attr('min') : (dir > 0 ? s : 0);
      else n = cur + dir * s;
      inputProto.set.call(input, show(clamp(n)));
      last = inputProto.get.call(input);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const box = wrap(input, input);
    box.append(arrows(step));
    box.addEventListener('change', (e) => { if (e.target === input && e.isTrusted) tidy(); }, true);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step(e.key === 'ArrowUp' ? 1 : -1); }
    });
    mirrorDisabled(input, box);
    size(input, [input.getAttribute('max') || '', input.placeholder || '', '0000']);
  }

  // ----- Listes de tailles -----

  // Choix chiffré : son nom est le nombre (« 12 », « 10,5 pt ») ou le cite entre parenthèses
  // (« Serré (1,15) ») ; les autres (« Taille du texte », « Titres 1 et 2 ») restent des choix nommés.
  const numericOption = (o) => {
    if (!NUM.test(o.value)) return false;
    const t = o.textContent.trim();
    const m = t.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:pt|mm|cm|px|%|em)?$/) || t.match(/\((-?\d+(?:[.,]\d+)?)\)$/);
    return !!m && Math.abs(parse(m[1]) - Number(o.value)) < 1e-9;
  };
  const isNumericSelect = (s) => !s.multiple && [...s.options].filter(numericOption).length >= 2;

  // Largeur du champ : assez pour la plus longue valeur à montrer.
  function size(field, texts) {
    const len = Math.max(3, ...texts.map((t) => String(t).length));
    field.style.width = `calc(${Math.min(len, 18) + 1}ch + 4px)`;
  }

  let openList = null;
  function closeList() {
    if (!openList) return;
    try { openList.hidePopover(); } catch { /* déjà fermée */ }
    openList.remove();
    openList = null;
  }
  document.addEventListener('pointerdown', (e) => {
    if (openList && !openList.contains(e.target) && !openList.owner.contains(e.target)) closeList();
  }, true);
  window.addEventListener('blur', closeList);
  window.addEventListener('resize', closeList);
  document.addEventListener('scroll', (e) => { if (openList && !openList.contains(e.target)) closeList(); }, true);

  function upgradeSelect(select) {
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'ft-num-input';
    field.inputMode = 'decimal';
    field.autocomplete = 'off';
    field.spellcheck = false;
    select.classList.add('ft-num-model');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    if (select.title) field.setAttribute('aria-label', select.title);

    // Unité affichée dans la liste (« pt ») : reprise des valeurs prêtes pour une valeur tapée.
    const unit = () => {
      const o = [...select.options].find((x) => numericOption(x) && !x.classList.contains('ft-num-custom'));
      const m = o && o.textContent.trim().match(/^[\d.,]+\s*([^\d\s(][^()]*)$/);
      return m ? ' ' + m[1].trim() : '';
    };
    const presets = () => [...new Set([...select.options]
      .filter((o) => numericOption(o) && !o.classList.contains('ft-num-custom') && !o.classList.contains('custom'))
      .map((o) => Number(o.value)))].sort((a, b) => a - b);
    const current = () => select.options[select.selectedIndex] || null;
    const text = (o) => (!o ? '' : numericOption(o) ? show(Number(o.value)) : o.textContent.trim());
    const refresh = () => {
      if (document.activeElement !== field || !field.dataset.typing) field.value = text(current());
      field.classList.toggle('special', !!current() && !numericOption(current()));
      size(field, [...select.options].map(text));
    };
    for (const [prop, desc] of [['value', selectProto], ['selectedIndex', indexProto]]) {
      Object.defineProperty(select, prop, {
        configurable: true,
        get() { return desc.get.call(this); },
        set(v) { desc.set.call(this, v); refresh(); }
      });
    }
    new MutationObserver(refresh).observe(select, { childList: true, subtree: true, characterData: true });

    const choose = (o) => {
      if (!o) return;
      const changed = o !== current();
      select.querySelectorAll('option.ft-num-custom').forEach((x) => { if (x !== o) x.remove(); });
      indexProto.set.call(select, o.index);
      delete field.dataset.typing;
      refresh();
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setNumber = (n) => {
      const list = presets();
      const min = parse(select.dataset.min);
      const max = parse(select.dataset.max);
      const same = (v) => [...select.options].find((x) => NUM.test(x.value) && Math.abs(Number(x.value) - v) < 1e-9);
      // Valeur déjà dans la liste (y compris un choix nommé, « Aucun » = 0) : choisie telle quelle.
      if (same(round(n))) return choose(same(round(n)));
      const lo = Number.isFinite(min) ? min : (list[0] > 0 ? list[0] / 4 : list[0]);
      const hi = Number.isFinite(max) ? max : list[list.length - 1] * 4;
      n = round(Math.min(hi, Math.max(lo, n)));
      let o = same(n);
      if (!o) {
        o = new Option(show(n) + unit(), String(n));
        o.className = 'ft-num-custom';
        select.append(o);
      }
      choose(o);
    };
    const commit = () => {
      if (!field.dataset.typing) return;
      const n = parse(field.value);
      delete field.dataset.typing;
      if (Number.isFinite(n)) setNumber(n);
      else refresh();
    };
    // Cran suivant : la valeur prête juste au-dessus ou au-dessous ; depuis un choix sans chiffre
    // (« Taille du texte »), le nombre qu'il cite, sinon le milieu de la liste.
    const step = (dir) => {
      commit();
      const list = presets();
      if (!list.length) return;
      const o = current();
      let cur = o && numericOption(o) ? Number(o.value) : NaN;
      if (!Number.isFinite(cur)) {
        const m = o && o.textContent.match(/(\d+(?:[.,]\d+)?)/);
        const base = m ? parse(m[1]) : NaN;
        if (!Number.isFinite(base)) return setNumber(list[Math.floor(list.length / 2)]);
        cur = base;
      }
      const next = dir > 0 ? list.find((v) => v > cur + 1e-9) : [...list].reverse().find((v) => v < cur - 1e-9);
      if (next !== undefined) setNumber(next);
    };

    function showList() {
      closeList();
      const pop = document.createElement('div');
      pop.className = 'ft-num-list';
      pop.popover = 'manual';
      pop.owner = box;
      const cur = current();
      for (const o of select.options) {
        if (o.disabled || o.hidden) continue;
        const item = document.createElement('div');
        item.className = 'ft-num-item' + (o === cur ? ' on' : '');
        item.textContent = o.textContent;
        item.addEventListener('pointerdown', (e) => e.preventDefault());
        item.addEventListener('click', () => { closeList(); choose(o); field.select(); });
        pop.append(item);
      }
      document.body.append(pop);
      pop.showPopover();
      const r = box.getBoundingClientRect();
      pop.style.minWidth = r.width + 'px';
      const h = pop.offsetHeight;
      const below = window.innerHeight - r.bottom - 6;
      pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 4) + 'px';
      pop.style.top = (below >= Math.min(h, 160) ? r.bottom + 2 : Math.max(4, r.top - h - 2)) + 'px';
      pop.style.maxHeight = Math.max(below, r.top - 8, 120) + 'px';
      openList = pop;
      pop.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    }

    const box = wrap(select, field);
    box.classList.add('ft-num-combo');
    box.insertBefore(arrows(step), select);
    field.addEventListener('pointerdown', () => {
      if (field.disabled) return;
      if (openList && openList.owner === box) closeList(); else showList();
    });
    // Premier clic : toute la valeur est sélectionnée tout de suite, la frappe la remplace.
    field.addEventListener('mousedown', (e) => {
      if (field.disabled || document.activeElement === field || e.button !== 0) return;
      e.preventDefault();
      field.focus();
      field.select();
    });
    field.addEventListener('input', () => { field.dataset.typing = '1'; });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); closeList(); commit(); if (!box.closest('.ft-toolbar')) field.select(); }
      else if (e.key === 'Escape') { if (openList) { e.preventDefault(); e.stopPropagation(); closeList(); } delete field.dataset.typing; refresh(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); closeList(); step(e.key === 'ArrowUp' ? 1 : -1); }
      else if (e.key === 'Tab') closeList();
    });
    field.addEventListener('blur', () => { commit(); setTimeout(() => { if (openList && openList.owner === box && document.activeElement !== field) closeList(); }, 150); });
    mirrorDisabled(select, box);
    refresh();
  }

  // ----- Repérage -----

  function upgrade(root) {
    const found = root.matches && root.matches('select, input') ? [root] : [...(root.querySelectorAll ? root.querySelectorAll('select, input') : [])];
    for (const el of found) {
      if (el.closest('.ft-num, [data-no-num], #editor, [contenteditable="true"]')) continue;
      if (el.tagName === 'INPUT') {
        if (el.type === 'number' || (el.type === 'text' && el.inputMode === 'decimal')) upgradeInput(el);
      } else if (isNumericSelect(el)) upgradeSelect(el);
    }
  }

  function start() {
    upgrade(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.target.closest && m.target.closest('#editor')) continue;
        for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains('ft-num-list')) upgrade(n);
        // Liste remplie après coup (options ajoutées à une liste déjà en place).
        if (m.target.tagName === 'SELECT' && !m.target.classList.contains('ft-num-model')) upgrade(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.FTNumber = { upgrade, parse, show };
})();
