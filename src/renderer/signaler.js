// Signaler un défaut (Aide > Signaler un défaut…, Ctrl+Maj+F1). Le logiciel garde en mémoire les
// dernières actions faites dans le texte (touches, clics, collages) et le document tel qu'il était avant
// elles. Un signalement enregistre le tout, avec une capture de la fenêtre et une description, dans le
// dossier « Signalements » du dossier de stockage : le défaut est ensuite rejoué à l'identique au banc
// d'essai (CHASSE_REJOUER=<fichier> node scripts/banc-essai/run.js scripts/banc-essai/essai-chasse.js).
// Les états gardés sont ceux du moteur (rien n'est recopié pendant la frappe) : le coût est nul.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.frameText;
  const M = window.FTMoteur;
  const view = M.view;
  const { Plugin } = PM.state;

  const SLICE = 80;   // actions par tranche : de 80 à 160 actions gardées
  const QUIET = 400;  // ms : une modification sans action depuis ce délai vient d'un bouton, d'un menu…
  let start = null;   // { doc, sel } : état avant la première action gardée
  let mid = null;     // état au début de la seconde tranche
  let actions = [];
  let lastInput = 0;

  const selOf = (st) => [st.selection.anchor, st.selection.head];
  function reset() {
    start = { doc: view.state.doc, sel: selOf(view.state) };
    mid = null;
    actions = [];
  }
  function note(a) {
    if (!start) reset();
    if (actions.length === SLICE) mid = { doc: view.state.doc, sel: selOf(view.state) };
    if (actions.length === 2 * SLICE) {
      start = mid;
      actions = actions.slice(SLICE);
      mid = { doc: view.state.doc, sel: selOf(view.state) };
    }
    actions.push({ ...a, t: Date.now() });
    lastInput = Date.now();
  }

  // Nom d'une touche, comme le banc d'essai l'emploie (« Control+z », « Shift+Enter », « a »).
  function keyName(e) {
    if (/^(Control|Shift|Alt|Meta|AltGraph|CapsLock)$/.test(e.key)) return null;
    const mods = [];
    if (e.ctrlKey) mods.push('Control');
    if (e.altKey) mods.push('Alt');
    if (e.metaKey) mods.push('Meta');
    if (e.shiftKey && (e.key.length > 1 || mods.length)) mods.push('Shift');
    return [...mods, e.key].join('+');
  }

  M.addPlugin(new Plugin({
    props: {
      handleDOMEvents: {
        keydown(v, e) {
          if (v.composing || e.isComposing) return false;
          // (Curseur déplacé par la touche d'avant, flèche comprise : relu avant d'être noté.)
          if (e.isTrusted) v.domObserver.flush();
          const k = keyName(e);
          if (k && k !== 'Dead') note({ k, s: selOf(v.state) });
          return false;
        },
        compositionend(v, e) {
          if (e.data) note({ compose: e.data, s: selOf(v.state) });
          return false;
        },
        mouseup(v) {
          setTimeout(() => note({ clic: selOf(v.state) }), 0);
          return false;
        },
        paste(v, e) {
          const d = e.clipboardData;
          if (d) note({ coller: { html: (d.getData('text/html') || '').slice(0, 200000), text: (d.getData('text/plain') || '').slice(0, 50000) }, s: selOf(v.state) });
          return false;
        }
      }
    }
  }), true);

  // Gels : images de plus d'une demi-seconde (les 20 dernières), avec les scripts en cause et la
  // dernière action notée avant.
  const gels = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 500) continue;
        const a = actions[actions.length - 1];
        gels.push({
          t: new Date(performance.timeOrigin + e.startTime).toISOString(),
          ms: Math.round(e.duration),
          scripts: (e.scripts || []).filter((x) => x.duration >= 50).slice(0, 6)
            .map((x) => `${Math.round(x.duration)} ms ${x.invoker || ''} ${x.sourceFunctionName || ''} ${(x.sourceURL || '').split('/').pop()}:${x.sourceCharPosition}`.trim()),
          apres: a ? (a.k || (a.clic ? 'clic' : a.coller ? 'coller' : a.etat ? 'bouton ou menu' : 'saisie')) : null
        });
        if (gels.length > 20) gels.shift();
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* navigateur sans ce relevé */ }

  // Modification faite hors du texte (bouton, menu, fenêtre) : l'état obtenu est gardé tel quel.
  M.onUpdate((tr, state) => {
    if (!tr.docChanged || !start || tr.getMeta('ftQuiet') || Date.now() - lastInput < QUIET) return;
    note({ etat: state.doc, s: selOf(state) });
  });
  // Document ouvert : on repart de lui.
  M.onLoad(reset);

  // ----- Fenêtre -----

  const dlg = $('report-dialog');
  let shot = null;
  let pending = null;

  async function open() {
    if (dlg.open) return;
    // Capture et état pris avant que la fenêtre ne s'ouvre : ils montrent le défaut.
    const S = window.FTSchema;
    const html = (doc) => S.serialize(doc);
    if (!start) reset();
    pending = {
      format: 'tomatoes-text-signalement',
      version: await api.appVersion(),
      date: new Date().toISOString(),
      document: window.FTApp.docName ? window.FTApp.docName() : '',
      settings: window.FTApp.docSettings(),
      zoom: window.FTZoom && window.FTZoom.get ? window.FTZoom.get() : null,
      depart: { html: html(start.doc), sel: start.sel },
      actions: actions.map((a) => (a.etat ? { ...a, etat: html(a.etat) } : a)),
      fin: { html: html(view.state.doc), sel: selOf(view.state) },
      gels: gels.slice(),
      erreurs: window.FTErreurs ? window.FTErreurs.list() : []
    };
    shot = await api.reportCapture();
    $('rp-note').value = '';
    $('rp-info').textContent = `${pending.actions.length} action${pending.actions.length > 1 ? 's' : ''} enregistrée${pending.actions.length > 1 ? 's' : ''} avec le document et une capture de la fenêtre` +
      (gels.length ? `, ainsi que ${gels.length} gel${gels.length > 1 ? 's' : ''} relevé${gels.length > 1 ? 's' : ''}.` : '.');
    $('rp-save').hidden = false;
    $('rp-cancel').textContent = 'Annuler';
    dlg.showModal();
    $('rp-note').focus();
  }

  $('rp-save').addEventListener('click', async () => {
    if (!pending) return;
    pending.description = $('rp-note').value.trim();
    try {
      const res = await api.reportSave(pending, shot);
      $('rp-info').textContent = `Signalement enregistré : ${res.name}`;
      $('rp-save').hidden = true;
      $('rp-cancel').textContent = 'Fermer';
      pending = null;
      shot = null;
    } catch (err) {
      $('rp-info').textContent = 'Enregistrement impossible : ' + (err && err.message ? err.message : err);
    }
  });
  $('rp-cancel').addEventListener('click', () => { pending = null; shot = null; dlg.close(); view.focus(); });
  $('rp-folder').addEventListener('click', () => api.reportFolder());

  window.FTSignaler = { open, _actions: () => actions.length, _gels: () => gels.slice() };
})();
