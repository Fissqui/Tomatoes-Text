// Mise à jour en un clic (Aide > « Rechercher une mise à jour… », voir src/updater.js).
// Au démarrage, une recherche discrète affiche « Mise à jour disponible » dans la barre d'état.
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const dialog = $('update-dialog');
  const status = $('up-status');
  const errorBox = $('up-error');
  const applyBtn = $('up-apply');
  const checkBtn = $('up-check');
  const notice = $('status-update');

  let busy = false;

  function setError(text) {
    errorBox.hidden = !text;
    errorBox.textContent = text || '';
  }

  function showChanges(list) {
    $('up-changes').hidden = !list.length;
    $('up-list').replaceChildren(...list.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  }

  async function fillSettings() {
    const s = await api.updateSettings();
    // Réglages des sources : version de développement seulement (la version publiée suit GitHub Releases).
    $('up-settings').hidden = !!(s.disabled || s.public);
    if (s.disabled || s.public) return s;
    $('up-folder').textContent = s.folder;
    $('up-folder-state').textContent = s.folderFound ? 'trouvé' : 'introuvable';
    $('up-folder-state').classList.toggle('bad', !s.folderFound);
    $('up-token-state').textContent = s.hasToken ? 'Clé enregistrée.' : 'Aucune clé enregistrée.';
    $('up-token-remove').hidden = !s.hasToken;
    return s;
  }

  function showNotice(res) {
    notice.hidden = !(res && res.ok && res.available);
    if (!notice.hidden) notice.textContent = `Mise à jour ${res.latest} disponible`;
  }

  async function check(interactive = true) {
    if (busy) return;
    busy = true;
    checkBtn.disabled = true;
    applyBtn.hidden = true;
    setError('');
    showChanges([]);
    status.textContent = 'Recherche en cours…';
    let res;
    try {
      res = await api.updateCheck({ interactive });
    } catch (err) {
      res = { ok: false, notes: [err.message] };
    }
    busy = false;
    checkBtn.disabled = false;
    showNotice(res);
    if (!res.ok) {
      status.textContent = 'Recherche impossible.';
      setError((res.notes || []).join('\n'));
      if (res.needsToken && !res.disabled) $('up-settings').open = true;
      return;
    }
    if (res.available) {
      status.textContent = `Version ${res.latest} disponible (version installée : ${res.installed}).`;
      showChanges(res.changes || []);
      applyBtn.hidden = false;
    } else {
      status.textContent = `Tomatoes Text est à jour (version ${res.installed}).`;
    }
  }

  async function apply() {
    if (busy) return;
    busy = true;
    applyBtn.disabled = true;
    checkBtn.disabled = true;
    setError('');
    const res = await api.updateApply();
    if (!res.ok) {
      busy = false;
      applyBtn.disabled = false;
      checkBtn.disabled = false;
      status.textContent = 'La mise à jour a échoué.';
      setError('Cause : ' + res.error);
      return;
    }
    status.textContent = res.setup
      ? `Le programme d'installation de la version ${res.version} va s'ouvrir. Tomatoes Text se ferme…`
      : `Version ${res.version} installée. Redémarrage…`;
    setTimeout(() => api.updateRestart(), 900);
  }

  api.onUpdateProgress((step) => { if (busy) status.textContent = step; });

  async function open() {
    if (!dialog.open) dialog.showModal();
    await fillSettings();
    check(true);
  }

  checkBtn.addEventListener('click', () => check(true));
  applyBtn.addEventListener('click', apply);
  $('up-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (e) => { if (busy && !applyBtn.hidden) e.preventDefault(); });
  notice.addEventListener('click', open);

  $('up-folder-change').addEventListener('click', async () => {
    const res = await api.updateChooseFolder();
    if (res) await fillSettings();
  });
  async function saveToken(value) {
    const res = await api.updateSetToken(value);
    if (!res.ok) { setError(res.error); return; }
    setError('');
    $('up-token').value = '';
    await fillSettings();
  }
  $('up-token-save').addEventListener('click', () => {
    const v = $('up-token').value.trim();
    if (v) saveToken(v);
  });
  $('up-token').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('up-token-save').click(); }
  });
  $('up-token-remove').addEventListener('click', () => saveToken(''));

  // Recherche discrète, une fois, peu après le démarrage (sans fenêtre de connexion).
  setTimeout(() => {
    api.updateCheck({ interactive: false }).then(showNotice, () => {});
  }, 20000);

  window.FTUpdate = { open };
})();
