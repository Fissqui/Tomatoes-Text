// Historique des versions : la liste des copies d'un document (faites toutes les 10 minutes pendant
// l'écriture, ou à la main), leur aperçu, les différences avec le texte actuel, et la restauration.
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const dialog = $('versions-dialog');
  const list = $('vs-list');
  const preview = $('vs-preview');
  const diffBox = $('vs-diff');

  let docId = null;
  let versions = [];
  let selected = null; // { entry, doc }
  let currentDoc = null;
  let readToken = 0;

  const KIND = { auto: 'automatique', manuel: 'enregistrée à la main', restauration: 'avant une restauration' };
  const time = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const words = (n) => `${n.toLocaleString('fr-FR')} mot${n > 1 ? 's' : ''}`;

  function dayLabel(iso) {
    const d = new Date(iso);
    const today = new Date();
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(today) - start(d)) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Hier';
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  function longDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + time(iso);
  }

  // ----- Liste -----

  function renderList() {
    list.textContent = '';
    if (!versions.length) {
      const p = document.createElement('div');
      p.className = 'vs-empty';
      p.textContent = "Pas encore de version gardée pour ce document. Pendant l'écriture, une copie est faite toutes les 10 minutes ; « Créer une version maintenant… » en fait une tout de suite.";
      list.appendChild(p);
      return;
    }
    let day = null;
    versions.forEach((v, i) => {
      const label = dayLabel(v.saved);
      if (label !== day) {
        day = label;
        const h = document.createElement('div');
        h.className = 'vs-day';
        h.textContent = label;
        list.appendChild(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vs-item' + (selected && selected.entry.file === v.file ? ' on' : '');
      const older = versions[i + 1];
      const delta = older ? v.words - older.words : 0;
      b.innerHTML = '<span class="vs-line"><b></b><span class="vs-kind"></span><span class="vs-words"></span></span>';
      b.querySelector('b').textContent = time(v.saved);
      const kind = b.querySelector('.vs-kind');
      kind.textContent = KIND[v.kind] || KIND.auto;
      kind.classList.toggle('manuel', v.kind === 'manuel');
      const w = b.querySelector('.vs-words');
      w.textContent = words(v.words);
      if (delta) {
        const s = document.createElement('span');
        s.className = delta > 0 ? 'plus' : 'minus';
        s.textContent = ` (${delta > 0 ? '+' : '−'}${Math.abs(delta)})`;
        w.appendChild(s);
      }
      if (v.label || v.title !== currentDoc.title) {
        const l = document.createElement('span');
        l.className = 'vs-label';
        l.textContent = v.label ? '« ' + v.label + ' »' : 'Titre : ' + v.title;
        b.appendChild(l);
      }
      b.addEventListener('click', () => select(v));
      list.appendChild(b);
    });
  }

  async function select(entry) {
    const token = ++readToken;
    let doc;
    try {
      doc = await api.readVersion(docId, entry.file);
    } catch (err) {
      preview.textContent = err.message;
      return;
    }
    if (token !== readToken) return;
    selected = { entry, doc };
    renderList();
    renderPreview();
    updateButtons();
  }

  function updateButtons() {
    ['vs-delete', 'vs-copy', 'vs-restore'].forEach((id) => { $(id).disabled = !selected; });
  }

  // ----- Aperçu -----

  function renderPreview() {
    preview.textContent = '';
    $('vs-legend').hidden = !diffBox.checked || !selected;
    if (!selected) {
      $('vs-info').textContent = '';
      return;
    }
    const { entry, doc } = selected;
    $('vs-info').textContent = `Version du ${longDate(entry.saved)} · ${words(entry.words)}`;
    if (diffBox.checked) {
      renderDiff(doc, currentDoc);
    } else {
      const title = document.createElement('div');
      title.className = 'vs-title';
      title.textContent = doc.title;
      const body = document.createElement('div');
      body.innerHTML = String(doc.content.html || '');
      body.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
      body.querySelectorAll('script, style, iframe, object, embed').forEach((e) => e.remove());
      preview.append(title, body);
    }
    preview.scrollTop = 0;
  }

  // Les paragraphes (titres, éléments de liste, cases de tableau…) d'un texte, sous forme de texte simple.
  const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, .ft-caption';
  function blocksOf(html) {
    const root = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html').body.firstChild;
    root.querySelectorAll('.ft-pg-gap, .ft-toc, .ft-lof, .ft-index, script, style').forEach((e) => e.remove());
    const out = [];
    root.querySelectorAll(BLOCKS).forEach((el) => {
      if (el.querySelector(BLOCKS)) return;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text) out.push({ tag: el.tagName.toLowerCase(), text });
    });
    return out;
  }

  // Plus longue suite commune de deux listes (comparées par `same`) : les paires d'indices gardés.
  function lcs(a, b, same, limit) {
    let start = 0;
    while (start < a.length && start < b.length && same(a[start], b[start])) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && same(a[endA - 1], b[endB - 1])) { endA--; endB--; }
    const pairs = [];
    for (let i = 0; i < start; i++) pairs.push([i, i]);
    const n = endA - start;
    const m = endB - start;
    if (n && m && n * m <= limit) {
      const w = m + 1;
      const t = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          t[i * w + j] = same(a[start + i], b[start + j]) ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (same(a[start + i], b[start + j])) { pairs.push([start + i, start + j]); i++; j++; }
        else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
        else j++;
      }
    }
    for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k]);
    return pairs;
  }

  // Ce qui a changé entre deux suites (anciennes → nouvelles) : [{ type: 'same'|'del'|'ins', a?, b? }].
  function diff(a, b, same, limit) {
    const out = [];
    let i = 0;
    let j = 0;
    for (const [pi, pj] of [...lcs(a, b, same, limit), [a.length, b.length]]) {
      while (i < pi) out.push({ type: 'del', a: a[i++] });
      while (j < pj) out.push({ type: 'ins', b: b[j++] });
      if (pi < a.length) out.push({ type: 'same', a: a[i++], b: b[j++] });
    }
    return out;
  }

  const wordSet = (text) => new Set(text.toLowerCase().split(/\s+/));
  function similar(x, y) {
    const a = wordSet(x);
    const b = wordSet(y);
    let common = 0;
    a.forEach((w) => { if (b.has(w)) common++; });
    return common / Math.max(a.size, b.size) >= 0.3;
  }

  function line(tag, cls) {
    const el = document.createElement(/^h[1-6]$/.test(tag) ? tag : 'p');
    if (cls) el.className = cls;
    return el;
  }

  function wrap(tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
  }

  // Un paragraphe modifié : les mots retirés et ajoutés à leur place.
  function changedLine(oldBlock, newBlock) {
    const el = line(newBlock.tag);
    const tokens = (s) => s.match(/\s+|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}]/gu) || [];
    for (const part of diff(tokens(oldBlock.text), tokens(newBlock.text), (x, y) => x === y, 4e6)) {
      if (part.type === 'same') el.appendChild(document.createTextNode(part.a));
      else if (part.type === 'del') el.appendChild(wrap('del', part.a));
      else el.appendChild(wrap('ins', part.b));
    }
    return el;
  }

  function renderDiff(oldDoc, newDoc) {
    const parts = diff(blocksOf(oldDoc.content.html), blocksOf(newDoc.content.html), (x, y) => x.text === y.text, 9e6);
    if (oldDoc.title !== newDoc.title) {
      const t = document.createElement('div');
      t.className = 'vs-title';
      t.append(wrap('del', oldDoc.title), ' ', wrap('ins', newDoc.title));
      preview.appendChild(t);
    }
    if (!parts.some((p) => p.type !== 'same')) {
      preview.appendChild(wrap('p', 'Le texte de cette version est le même que le texte actuel.')).className = 'vs-skip';
      return;
    }
    // Les paragraphes retirés et ajoutés au même endroit sont comparés mot à mot quand ils se ressemblent.
    const rows = [];
    for (let k = 0; k < parts.length;) {
      if (parts[k].type === 'same') { rows.push(parts[k++]); continue; }
      const dels = [];
      const inss = [];
      while (k < parts.length && parts[k].type !== 'same') (parts[k].type === 'del' ? dels : inss).push(parts[k++]);
      const n = Math.max(dels.length, inss.length);
      for (let i = 0; i < n; i++) {
        const d = dels[i];
        const s = inss[i];
        if (d && s && similar(d.a.text, s.b.text)) rows.push({ type: 'change', a: d.a, b: s.b });
        else {
          if (d) rows.push(d);
          if (s) rows.push(s);
        }
      }
    }
    // Les longues suites de paragraphes identiques sont résumées (un paragraphe gardé de chaque côté).
    const near = rows.map((r, i) => r.type !== 'same' || (rows[i - 1] && rows[i - 1].type !== 'same') || (rows[i + 1] && rows[i + 1].type !== 'same'));
    let skipped = 0;
    const flush = () => {
      if (!skipped) return;
      preview.appendChild(wrap('p', `… ${skipped} paragraphe${skipped > 1 ? 's' : ''} sans changement …`)).className = 'vs-skip';
      skipped = 0;
    };
    rows.forEach((r, i) => {
      if (!near[i]) { skipped++; return; }
      flush();
      if (r.type === 'same') {
        const el = line(r.b.tag, 'vs-same');
        el.textContent = r.b.text;
        preview.appendChild(el);
      } else if (r.type === 'change') {
        preview.appendChild(changedLine(r.a, r.b));
      } else {
        const block = r.type === 'del' ? r.a : r.b;
        const el = line(block.tag);
        el.appendChild(wrap(r.type, block.text));
        preview.appendChild(el);
      }
    });
    flush();
  }

  // ----- Ouverture et actions -----

  async function load(keep) {
    versions = await api.listVersions(docId);
    const again = keep && versions.find((v) => v.file === keep);
    selected = null;
    if (again || versions[0]) await select(again || versions[0]);
    else { renderList(); renderPreview(); updateButtons(); }
  }

  async function open() {
    if (!window.FTApp.currentId()) return;
    currentDoc = await window.FTApp.versionDoc();
    if (!currentDoc) return;
    docId = currentDoc.id;
    $('vs-doc').textContent = currentDoc.title;
    selected = null;
    list.textContent = '';
    preview.textContent = '';
    updateButtons();
    if (!dialog.open) dialog.showModal();
    await load();
  }

  async function snapshot() {
    const label = await window.FTApp.ask('Nom de cette version (facultatif) :', '', { okLabel: 'Créer la version' });
    if (label === null) return;
    currentDoc = await window.FTApp.versionDoc();
    const entry = await api.saveVersion(currentDoc, 'manuel', label);
    await load(entry.file);
  }

  async function restore() {
    if (!selected) return;
    const ok = await window.FTApp.ask(`Remettre le document comme il était le ${longDate(selected.entry.saved)} ? Le texte actuel est d'abord gardé dans l'historique.`, '', { okLabel: 'Restaurer', input: false });
    if (!ok) return;
    await window.FTApp.restoreVersion(selected.doc);
    dialog.close();
  }

  async function copy() {
    if (!selected) return;
    const d = new Date(selected.entry.saved);
    const suffix = ` (version du ${d.toLocaleDateString('fr-FR')} ${time(selected.entry.saved).replace(':', 'h')})`;
    dialog.close();
    await window.FTApp.copyVersion(selected.doc, suffix);
  }

  async function remove() {
    if (!selected) return;
    const ok = await window.FTApp.ask(`Supprimer définitivement la version du ${longDate(selected.entry.saved)} ?`, '', { okLabel: 'Supprimer', input: false });
    if (!ok) return;
    await api.deleteVersion(docId, selected.entry.file);
    await load();
  }

  $('vs-snap').addEventListener('click', snapshot);
  $('vs-restore').addEventListener('click', restore);
  $('vs-copy').addEventListener('click', copy);
  $('vs-delete').addEventListener('click', remove);
  $('vs-close').addEventListener('click', () => dialog.close());
  diffBox.addEventListener('change', renderPreview);

  window.FTVersions = { open };
})();
