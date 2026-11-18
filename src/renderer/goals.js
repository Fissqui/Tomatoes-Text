// Objectifs de mots et statistiques d'écriture.
// Objectif du document (et date limite facultative) : doc.settings.goal = { words, deadline }.
// Objectif du jour et historique : réglages, settings.goals = { daily, days: { 'AAAA-MM-JJ': { words, minutes } } }.
// Les mots écrits sont comptés en net (mots ajoutés moins mots retirés) dans le document ouvert.
(function () {
  const $ = (id) => document.getElementById(id);
  const dialog = $('goals-dialog');
  const statusGoal = $('status-goal');
  const KEEP_DAYS = 400;

  let data = { daily: 0, days: {} };
  let docGoal = { words: 0, deadline: '' };
  let onSave = () => {};
  let onDocChange = () => {};
  let last = null; // nombre de mots du document au dernier compte
  let session = 0;
  let saveTimer = null;
  let lastMinute = null;
  let docWords = 0;
  let celebrated = { doc: false, day: false };

  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  const plural = (n, word) => `${fmt(n)} ${word}${Math.abs(n) > 1 ? 's' : ''}`;

  function today() {
    const k = dayKey();
    if (!data.days[k]) data.days[k] = { words: 0, minutes: 0 };
    return data.days[k];
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 4000);
  }

  function flush() {
    clearTimeout(saveTimer);
    const keys = Object.keys(data.days).sort();
    while (keys.length > KEEP_DAYS) delete data.days[keys.shift()];
    onSave(JSON.parse(JSON.stringify(data)));
  }

  // ----- Suivi -----

  // Nouveau document ouvert (ou texte remplacé) : le compte repart de son nombre de mots.
  function load(goal, words) {
    docGoal = { words: Math.max(0, parseInt(goal && goal.words, 10) || 0), deadline: (goal && goal.deadline) || '' };
    last = words;
    docWords = words;
    celebrated.doc = docGoal.words > 0 && words >= docGoal.words;
    renderStatus();
  }

  function rebase(words) {
    last = words;
    docWords = words;
    renderStatus();
  }

  function track(words) {
    docWords = words;
    if (last === null) last = words;
    const delta = words - last;
    last = words;
    if (delta) {
      today().words += delta;
      session += delta;
      scheduleSave();
    }
    renderStatus();
    checkReached();
    if (dialog.open) renderDialog();
  }

  // Temps d'écriture : chaque minute où l'on a tapé compte une fois.
  function activity() {
    const minute = Math.floor(Date.now() / 60000);
    if (minute === lastMinute) return;
    lastMinute = minute;
    today().minutes += 1;
    scheduleSave();
  }

  function checkReached() {
    if (docGoal.words && docWords >= docGoal.words && !celebrated.doc) {
      celebrated.doc = true;
      toast(`Objectif du document atteint : ${plural(docGoal.words, 'mot')} !`);
    }
    if (docGoal.words && docWords < docGoal.words) celebrated.doc = false;
    const t = today().words;
    if (data.daily && t >= data.daily && !celebrated.day) {
      celebrated.day = true;
      toast(`Objectif du jour atteint : ${plural(data.daily, 'mot')} écrits aujourd'hui !`);
    }
  }

  function toast(text) {
    const el = $('goals-toast');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // ----- Barre d'état -----

  function renderStatus() {
    const goal = docGoal.words || data.daily;
    if (!goal) {
      statusGoal.hidden = true;
      return;
    }
    const value = docGoal.words ? docWords : Math.max(0, today().words);
    const ratio = Math.min(1, value / goal);
    statusGoal.hidden = false;
    statusGoal.querySelector('.bar i').style.width = (ratio * 100).toFixed(1) + '%';
    statusGoal.querySelector('.txt').textContent = docGoal.words
      ? `${fmt(docWords)} / ${fmt(docGoal.words)}`
      : `${fmt(value)} / ${fmt(data.daily)} aujourd'hui`;
    statusGoal.classList.toggle('done', ratio >= 1);
    statusGoal.title = docGoal.words ? 'Objectif du document' : 'Objectif du jour';
  }

  // ----- Fenêtre « Objectifs et statistiques » -----

  function setBar(el, value, goal) {
    const ratio = goal ? Math.min(1, Math.max(0, value) / goal) : 0;
    el.querySelector('i').style.width = (ratio * 100).toFixed(1) + '%';
    el.classList.toggle('done', goal > 0 && ratio >= 1);
    el.hidden = !goal;
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const end = new Date(y, m - 1, d);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((end - start) / 86400000) + 1; // aujourd'hui compris
  }

  function streak() {
    let n = 0;
    const d = new Date();
    if (!((data.days[dayKey(d)] || {}).words > 0)) d.setDate(d.getDate() - 1); // aujourd'hui pas encore commencé
    for (;;) {
      const day = data.days[dayKey(d)];
      if (!day || day.words <= 0) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function minutesText(m) {
    if (m < 60) return plural(m, 'minute');
    return `${Math.floor(m / 60)} h ${pad(m % 60)}`;
  }

  function renderDialog() {
    const stats = window.FTEditor.stats();
    $('gl-words').textContent = fmt(stats.words);
    $('gl-chars').textContent = fmt(stats.chars);
    $('gl-chars-ns').textContent = fmt(stats.charsNoSpaces);
    $('gl-paras').textContent = fmt(stats.paragraphs);
    $('gl-sentences').textContent = fmt(stats.sentences);
    const read = Math.max(1, Math.round(stats.words / 230));
    $('gl-read').textContent = stats.words ? (read < 60 ? plural(read, 'minute') : minutesText(read)) : '—';

    // Document
    if (document.activeElement !== $('gl-doc-goal')) $('gl-doc-goal').value = docGoal.words || '';
    if (document.activeElement !== $('gl-deadline')) $('gl-deadline').value = docGoal.deadline || '';
    setBar($('gl-doc-bar'), stats.words, docGoal.words);
    let docText = 'Pas d’objectif pour ce document.';
    if (docGoal.words) {
      const left = docGoal.words - stats.words;
      if (left <= 0) docText = `Objectif atteint (${Math.round((stats.words / docGoal.words) * 100)} %).`;
      else {
        docText = `${Math.round((stats.words / docGoal.words) * 100)} % : il reste ${plural(left, 'mot')}.`;
        const days = daysUntil(docGoal.deadline);
        if (days !== null && days > 0) docText += ` Soit environ ${plural(Math.ceil(left / days), 'mot')} par jour jusqu’au ${new Date(docGoal.deadline + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`;
        else if (days !== null) docText += ' La date limite est passée.';
      }
    }
    $('gl-doc-text').textContent = docText;

    // Aujourd'hui
    const t = today();
    if (document.activeElement !== $('gl-daily')) $('gl-daily').value = data.daily || '';
    $('gl-today').textContent = fmt(Math.max(0, t.words));
    $('gl-time').textContent = t.minutes ? minutesText(t.minutes) : '—';
    $('gl-session').textContent = fmt(Math.max(0, session));
    const s = streak();
    $('gl-streak').textContent = s ? plural(s, 'jour') : '—';
    setBar($('gl-day-bar'), t.words, data.daily);
    $('gl-day-text').textContent = data.daily
      ? (t.words >= data.daily ? 'Objectif du jour atteint.' : `Encore ${plural(data.daily - Math.max(0, t.words), 'mot')} pour l’objectif du jour.`)
      : 'Pas d’objectif quotidien.';

    renderChart();
  }

  // Les 14 derniers jours, en barres, avec la ligne de l'objectif du jour.
  function renderChart() {
    const box = $('gl-chart');
    box.textContent = '';
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ d, words: Math.max(0, (data.days[dayKey(d)] || {}).words || 0) });
    }
    const max = Math.max(data.daily || 0, ...days.map((x) => x.words), 1);
    const total = days.reduce((a, x) => a + x.words, 0);
    $('gl-total').textContent = `${plural(total, 'mot')} en 14 jours · ${plural(Math.round(total / 14), 'mot')} par jour en moyenne`;
    if (data.daily) {
      const layer = document.createElement('div');
      layer.className = 'gl-lines';
      const line = document.createElement('div');
      line.className = 'gl-goal-line';
      line.style.bottom = `${(data.daily / max) * 100}%`;
      line.title = `Objectif du jour : ${plural(data.daily, 'mot')}`;
      layer.appendChild(line);
      box.appendChild(layer);
    }
    days.forEach(({ d, words }, i) => {
      const col = document.createElement('div');
      col.className = 'gl-col' + (i === 13 ? ' today' : '') + (data.daily && words >= data.daily ? ' done' : '');
      col.title = `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${plural(words, 'mot')}`;
      const bar = document.createElement('div');
      bar.className = 'gl-bar';
      bar.style.height = `${(words / max) * 100}%`;
      const wrap = document.createElement('div');
      wrap.className = 'gl-barbox';
      wrap.appendChild(bar);
      const label = document.createElement('span');
      label.textContent = String(d.getDate());
      col.append(wrap, label);
      box.appendChild(col);
    });
  }

  function open() {
    if (!window.FTApp.currentId()) return;
    renderDialog();
    if (!dialog.open) dialog.showModal();
  }

  $('gl-doc-goal').addEventListener('input', () => {
    docGoal.words = Math.max(0, parseInt($('gl-doc-goal').value, 10) || 0);
    celebrated.doc = docGoal.words > 0 && docWords >= docGoal.words;
    onDocChange();
    renderStatus();
    renderDialog();
  });
  $('gl-deadline').addEventListener('change', () => {
    docGoal.deadline = $('gl-deadline').value || '';
    onDocChange();
    renderDialog();
  });
  $('gl-daily').addEventListener('input', () => {
    data.daily = Math.max(0, parseInt($('gl-daily').value, 10) || 0);
    celebrated.day = data.daily > 0 && today().words >= data.daily;
    scheduleSave();
    renderStatus();
    renderDialog();
  });
  $('gl-close').addEventListener('click', () => dialog.close());
  $('gl-readability').addEventListener('click', () => { dialog.close(); window.FTReadability.open(); });
  dialog.addEventListener('close', flush);
  statusGoal.addEventListener('click', open);
  // Moteur 2.0 : la frappe passe par le moteur, sans événement « input » sur la zone d'écriture.
  if (window.FTMoteur) window.FTMoteur.onUpdate((tr) => { if (tr.docChanged && !tr.getMeta('ftQuiet')) activity(); });
  else $('editor').addEventListener('input', activity);

  window.FTGoals = {
    init(saved, save) {
      if (saved && typeof saved === 'object') {
        data = { daily: Math.max(0, parseInt(saved.daily, 10) || 0), days: saved.days && typeof saved.days === 'object' ? saved.days : {} };
      }
      celebrated.day = data.daily > 0 && today().words >= data.daily;
      onSave = save;
    },
    onDocChange(fn) { onDocChange = fn; },
    load,
    rebase,
    track,
    flush,
    open,
    getDocGoal: () => (docGoal.words || docGoal.deadline ? { ...docGoal } : undefined),
    // Pour le mode concentration : le texte de progression à afficher.
    progress() {
      const goal = docGoal.words || data.daily;
      if (!goal) return null;
      const value = docGoal.words ? docWords : Math.max(0, today().words);
      return { value, goal, ratio: Math.min(1, value / goal), label: docGoal.words ? 'du document' : 'du jour' };
    }
  };
})();
