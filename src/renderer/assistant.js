// Aide au texte : tiroir à droite en deux onglets. « Rédaction » propose une reformulation dès qu'un passage
// est sélectionné ; « Lisibilité » affiche les statistiques de lisibilité (readability.js).
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const panel = $('assist');
  const source = $('assist-source');
  const status = $('assist-status');
  const proposals = $('assist-proposals');
  const synonymsBox = $('assist-synonyms');
  const MIN_LENGTH = 12; // en dessous, on ne propose rien (un mot seul, une sélection accidentelle)
  const DELAY = 700; // on attend que la sélection soit stable avant de lancer le modèle

  let open = false;
  let tab = 'redaction'; // onglet affiché : 'redaction' ou 'lisibilite'
  let settings = null;
  let timer = null;
  let requestId = 0;
  let lastKey = '';
  // Passage du document à remplacer : celui qui était sélectionné quand les propositions ont été demandées.
  let targetRange = null;

  function setStatus(text, isError) {
    status.textContent = text || '';
    status.classList.toggle('error', !!isError);
  }

  function modelReady() {
    const m = settings && settings.models.find((x) => x.id === settings.localModel);
    return !!(m && m.downloaded);
  }

  // Prévient readability.js : onglet Lisibilité visible ou non.
  const announce = () => document.dispatchEvent(new CustomEvent('ft-assist-view', { detail: { open, tab } }));

  function startRedaction() {
    refreshSettings().then(() => {
      if (!open || tab !== 'redaction') return;
      if (modelReady()) api.assistWarmUp();
      const range = window.FTEditor.captureSelection();
      onSelection(range ? range.toString() : '');
    });
  }

  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    $('assist-toggle').classList.toggle('on', open);
    if (open && tab === 'redaction') startRedaction();
    if (!open) {
      clearTimeout(timer);
      api.assistCancel();
    }
    announce();
  }

  function showTab(name) {
    tab = name === 'lisibilite' ? 'lisibilite' : 'redaction';
    for (const b of panel.querySelectorAll('.assist-tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    $('assist-pane-redaction').hidden = tab !== 'redaction';
    $('assist-pane-lisibilite').hidden = tab !== 'lisibilite';
    if (tab === 'redaction') {
      if (open) startRedaction();
    } else {
      clearTimeout(timer);
      api.assistCancel();
    }
    if (!open) toggle(true);
    else announce();
  }

  // ----- Propositions automatiques -----

  function onSelection(text) {
    if (!open || tab !== 'redaction') return;
    source.value = text;
    clearTimeout(timer);
    // Un à trois mots : des synonymes plutôt qu'une reformulation.
    const few = fewWords(text);
    if (few) {
      timer = setTimeout(() => synonymsFor(few), DELAY);
      return;
    }
    if (text.trim()) showSynonymHint();
    if (text.trim().length < MIN_LENGTH) return;
    timer = setTimeout(() => request(false), DELAY);
  }

  // ----- Synonymes (un à trois mots sélectionnés) -----

  const HINT = 'Sélectionnez un à trois mots : des synonymes apparaîtront ici.';
  const ELISION = /^((?:[ldjmtsnc]|qu|jusqu|lorsqu|puisqu|quoiqu)['’])(?=\p{L})/iu;
  let synRequest = 0;
  let synKey = '';
  let synTarget = null;

  function showSynonymHint(text = HINT) {
    synKey = '';
    synonymsBox.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'assist-hint';
    p.textContent = text;
    synonymsBox.append(p);
  }

  // « l’arbre fruitier, » → { lead: 'l’', word: 'arbre fruitier', tail: ',' } ; null au-delà de trois mots.
  function fewWords(text) {
    const m = /^(\s*)(.*?)([\s.,;:!?…»«"“”()]*)$/su.exec(text);
    let lead = m[1];
    let word = m[2].replace(/^[«"“(\s]+/, (x) => { lead += x; return ''; });
    if (!word || word.length > 40 || /[\n.,;:!?…]/.test(word)) return null;
    const el = ELISION.exec(word);
    if (el) { lead += el[1]; word = word.slice(el[1].length); }
    const words = word.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 3 || !words.every((w) => /\p{L}/u.test(w))) return null;
    // Le chinois s'écrit sans espaces : au-delà de quatre caractères, c'est une phrase.
    if ((word.match(/\p{Script=Han}/gu) || []).length > 4) return null;
    return { lead, word: words.join(' '), tail: m[3] };
  }

  // Le texte du paragraphe autour de la sélection : le sens d'un mot dépend de sa phrase.
  function contextOf(range) {
    // Moteur 2.0 : passage du nouveau moteur ({ from, to }).
    if (range.from !== undefined) return window.FTSpell.contextAt(range.from, range.to);
    const node = range.startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block = el.closest('.ft-caption, p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, div:not(#editor)') || $('editor');
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.setStart(range.endContainer, range.endOffset);
    after.setEnd(block, block.childNodes.length);
    return { before: before.toString().slice(-400), after: after.toString().slice(0, 400) };
  }

  // Langue du passage sélectionné : celle reconnue dans le texte, sinon celle du paragraphe.
  function langOfRange(range) {
    const S = window.FTSpell;
    const at = !range || !S ? null
      : range.from !== undefined ? (S.langAtPos ? S.langAtPos(range.from) : null)
      : S.langAt ? S.langAt(range.startContainer, range.startOffset) : null;
    return at || (window.FTLang ? window.FTLang.principal() : 'fr');
  }

  async function synonymsFor(few) {
    const range = window.FTEditor.captureSelection();
    if (!range) return;
    const key = few.word + '\u0000' + range.toString();
    if (key === synKey) return;
    synKey = key;
    synTarget = { range, few };
    const id = ++synRequest;
    synonymsBox.innerHTML = '<div class="assist-pending">Recherche de synonymes…</div>';
    const ctx = contextOf(range);
    ctx.before += few.lead;
    ctx.after = few.tail + ctx.after;
    let list = [];
    try { list = await api.synonyms(few.word, ctx, langOfRange(range)); } catch { /* aucune proposition */ }
    if (id !== synRequest) return;
    if (!list.length) {
      showSynonymHint(`Pas de synonyme trouvé pour « ${few.word} ».`);
      synKey = key;
      return;
    }
    synonymsBox.innerHTML = '';
    for (const s of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'synonym';
      b.textContent = s;
      b.title = `Remplacer « ${few.word} » par « ${s} »`;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => useSynonym(s));
      synonymsBox.append(b);
    }
  }

  function useSynonym(s) {
    if (!synTarget) return;
    const { range, few } = synTarget;
    if (window.FTEditor.replaceRange(range, few.lead + s + few.tail)) {
      setStatus(`« ${few.word} » remplacé par « ${s} ». Ctrl+Z pour annuler.`);
      synTarget = null;
      synonymsBox.querySelectorAll('.synonym').forEach((b) => { b.disabled = true; });
    } else {
      setStatus('Le mot d’origine a changé : sélectionnez-le à nouveau.', true);
    }
  }

  window.FTEditor.onSelectionText(onSelection);

  const PREFS_KEY = 'aat-choix';

  // Style et intensité retenus d'une fois sur l'autre (confort seulement).
  function restorePrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (p.style && $('assist-style').querySelector(`option[value="${p.style}"]`)) $('assist-style').value = p.style;
      if (p.intensity && $('assist-intensity').querySelector(`option[value="${p.intensity}"]`)) $('assist-intensity').value = p.intensity;
    } catch { /* préférences indisponibles */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ style: $('assist-style').value, intensity: $('assist-intensity').value }));
    } catch { /* préférences indisponibles */ }
  }

  restorePrefs();

  async function request(force) {
    const text = source.value.trim();
    if (!text) return;
    const style = $('assist-style').value;
    const intensity = $('assist-intensity').value;
    const key = [text, style, intensity].join('\u0000');
    if (!force && key === lastKey) return;
    if (!modelReady()) await refreshSettings(); // le téléchargement a pu se terminer entre-temps
    if (!modelReady()) {
      setStatus('Le modèle n’est pas encore installé : voir « Réglages de l’Aide au texte » en bas.', true);
      $('assist-settings').open = true;
      return;
    }
    lastKey = key;
    targetRange = window.FTEditor.captureSelection();
    const id = ++requestId;
    setStatus('');
    proposals.innerHTML = '<div class="assist-pending">Rédaction en cours…</div>';
    const lang = window.FTLang ? await window.FTLang.detectText(text, langOfRange(targetRange)) : 'fr';
    if (id !== requestId) return;
    const res = await api.assistSuggest({ id, text, style, intensity, lang });
    if (id !== requestId) return; // une demande plus récente a pris le relais
    proposals.innerHTML = '';
    if (res.error) {
      setStatus(res.error, true);
      if (res.needsSetup) $('assist-settings').open = true;
      lastKey = '';
    } else if (res.text) {
      showProposal(res.text);
    }
  }

  function showProposal(text) {
    const el = document.createElement('div');
    el.className = 'proposal';
    el.innerHTML = `<div class="proposal-text"></div>
      <div class="assist-actions"><button class="use">Remplacer dans le texte</button><button class="copy">Copier</button></div>`;
    el.querySelector('.proposal-text').textContent = text;
    el.querySelector('.use').addEventListener('click', () => replace(el));
    el.querySelector('.copy').addEventListener('click', () => copy(el));
    proposals.appendChild(el);
  }

  function replace(el) {
    const text = el.querySelector('.proposal-text').textContent.trim();
    if (!text) return;
    if (window.FTEditor.replaceRange(targetRange, text)) {
      setStatus('Passage remplacé. Ctrl+Z pour annuler.');
      targetRange = null;
      proposals.querySelectorAll('.use').forEach((b) => { b.disabled = true; });
    } else {
      setStatus('Le passage d’origine a changé : sélectionnez-le à nouveau.', true);
    }
  }

  async function copy(el) {
    try {
      await navigator.clipboard.writeText(el.querySelector('.proposal-text').textContent);
      setStatus('Proposition copiée.');
    } catch {
      setStatus('Impossible de copier.', true);
    }
  }

  // ----- Réglages : dossier et téléchargement du modèle -----

  function renderSettings() {
    if (!settings) return;
    const m = settings.models.find((x) => x.id === settings.localModel);
    const downloading = !!(m && m.downloading);
    const select = $('assist-model');
    select.replaceChildren(...settings.models.map((x) => {
      const o = new Option(x.label + (x.downloaded ? '' : x.custom ? ' (introuvable)' : ' (non téléchargé)'), x.id);
      o.selected = x.id === settings.localModel;
      return o;
    }));
    select.disabled = settings.models.some((x) => x.downloading);
    $('assist-folder').textContent = settings.modelsDir;
    $('assist-model-status').textContent = downloading
      ? 'Téléchargement en cours…'
      : m && m.custom && m.downloaded ? `${m.label} : prêt (${m.file}).`
      : m && m.custom ? `${m.label} : fichier introuvable (${m.file}).`
      : m && m.downloaded ? `${m.label} : prêt.`
      : m && m.partial ? `${m.label} : le fichier est incomplet (téléchargement en cours ou interrompu).`
      : `${m ? m.label : 'Le modèle'} n’est pas encore téléchargé.`;
    $('assist-model-download').hidden = downloading || !!(m && (m.downloaded || m.custom));
    $('assist-model-cancel').hidden = !downloading;
    $('assist-model-progress').hidden = !downloading;
    // Modèle indiqué par l'utilisateur : retiré de la liste, jamais effacé.
    $('assist-model-delete').hidden = downloading || !(m && (m.downloaded || m.custom));
    $('assist-model-delete').textContent = m && m.custom ? 'Retirer ce modèle' : 'Supprimer le modèle';
    $('assist-folder-change').disabled = downloading;
    $('assist-model-locate').disabled = downloading;
    if (!modelReady()) $('assist-settings').open = true;
  }

  async function refreshSettings() {
    settings = await api.assistGetSettings();
    renderSettings();
  }

  $('assist-model').addEventListener('change', async (e) => {
    settings = await api.assistSetModel(e.target.value);
    renderSettings();
    if (modelReady()) api.assistWarmUp();
    lastKey = '';
    if (modelReady()) onSelection(source.value);
  });
  $('assist-folder-change').addEventListener('click', async () => {
    settings = await api.assistChooseFolder();
    renderSettings();
  });
  $('assist-model-locate').addEventListener('click', async () => {
    const res = await api.assistLocateModel();
    if (!res || res.cancelled) return;
    if (res.error) {
      $('assist-model-status').textContent = res.error;
      return;
    }
    settings = res.settings;
    renderSettings();
    lastKey = '';
    setStatus('');
    if (modelReady()) onSelection(source.value);
  });
  $('assist-model-download').addEventListener('click', async () => {
    $('assist-model-progress').value = 0;
    const pending = api.assistDownloadModel();
    setTimeout(refreshSettings, 300);
    const res = await pending;
    await refreshSettings();
    if (res && res.error) {
      $('assist-model-status').textContent = res.error;
    } else if (modelReady()) {
      setStatus('');
      onSelection(source.value);
    }
  });
  $('assist-model-cancel').addEventListener('click', () => api.assistCancelDownload());
  $('assist-model-delete').addEventListener('click', async () => {
    await api.assistDeleteModel();
    await refreshSettings();
  });
  api.onAssistDownloadProgress(({ pct }) => {
    $('assist-model-progress').hidden = false;
    $('assist-model-progress').value = pct;
    $('assist-model-status').textContent = `Téléchargement en cours… ${pct} %`;
  });

  // ----- Boutons -----

  $('assist-toggle').addEventListener('mousedown', (e) => e.preventDefault());
  $('assist-toggle').addEventListener('click', () => toggle());
  $('assist-close').addEventListener('click', () => toggle(false));
  $('assist-retry').addEventListener('click', () => request(true));
  $('assist-style').addEventListener('change', () => { savePrefs(); request(false); });
  $('assist-intensity').addEventListener('change', () => { savePrefs(); request(false); });

  for (const b of panel.querySelectorAll('.assist-tabs [data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));

  window.FTAssistant = {
    toggle,
    showTab,
    isOpen: () => open,
    tab: () => tab
  };
})();
