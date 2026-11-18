// Export livre (PDF prêt pour l'imprimeur) et export EPUB (liseuses).
// Livre : la page préparée par la fenêtre (renderer/livre.js) est ouverte dans une fenêtre cachée ;
// les paragraphes y sont composés (renderer/composition.js), puis Chromium la met en pages au format du
// livre (marges miroir, folios, titres courants : règles @page de la page). Une première impression
// donne la page de chaque chapitre et de chaque cible (renderer/livre-page.js, pdf-livre.js) : pages
// blanches pour ouvrir les chapitres à droite, numéros du sommaire, des renvois et de l'index. Les pages
// d'ouverture sont réimprimées sans titre courant, puis les pages sont imposées si besoin (livret à plier,
// traits de coupe).
// EPUB : les fichiers sont préparés par la fenêtre (renderer/epub.js) ; ici, l'archive.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { destPages, assemble, impose, pageCount } = require('./pdf-livre');

const inch = (mm) => mm / 25.4;

async function makeBook(job, step = () => {}) {
  const tmp = path.join(app.getPath('temp'), `tomatoes-livre-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, job.html, 'utf8');
  const win = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const js = (code) => win.webContents.executeJavaScript(code);
  try {
    await win.loadFile(tmp);
    await js('document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => null)))).then(() => true)');
    step('Composition des paragraphes…');
    const stats = job.compose ? await js(`window.FTComposition ? window.FTComposition.run(${JSON.stringify(job.compose)}) : null`) : null;
    const options = {
      pageSize: { width: inch(job.page.width), height: inch(job.page.height) },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true
    };
    // Notes de bas de page au pied de leur page (notes-pied.js) : avant les repères des numéros de page.
    const notes = () => (job.notes ? js(`window.FTNotesPied ? window.FTNotesPied.run(${JSON.stringify(job.notes)}) : null`) : null);
    await notes();
    const prep = await js(`window.FTLivrePage.prepare(${JSON.stringify(job.layout || {})})`);
    let info = { openings: [] };
    if (prep && prep.anchors) {
      step('Mise en pages…');
      const first = await win.webContents.printToPDF(options);
      info = await js(`window.FTLivrePage.finish(${JSON.stringify(destPages(first))})`);
      // (Pages blanches posées avant des chapitres : les pages sont refaites.)
      if (info.blanks) await notes();
    }
    step('Impression…');
    let pdf = await win.webContents.printToPDF(options);
    // Pages d'ouverture des chapitres : sans titre courant.
    if (job.layout && job.layout.heads && info.openings.length) {
      await js('window.FTLivrePage.heads(false)');
      const alt = await win.webContents.printToPDF({ ...options, pageRanges: info.openings.join(',') });
      const at = new Map(info.openings.map((n, k) => [n - 1, k]));
      pdf = assemble([pdf, alt], (i) => (at.has(i) ? [1, at.get(i)] : null));
    }
    const pages = pageCount(pdf);
    if (job.output === 'livret' || job.output === 'coupe') pdf = impose(pdf, job.output);
    return { pdf, pages, stats, openings: info.openings };
  } finally {
    win.destroy();
    fs.unlink(tmp).catch(() => {});
  }
}

// ----- Archive ZIP (EPUB) -----

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files : [{ name, data: Buffer, store }] ; « mimetype » d'abord et sans compression (règle de l'EPUB).
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = f.data;
    const body = f.store ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // noms en UTF-8
    head.writeUInt16LE(f.store ? 0 : 8, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(f.store ? 0 : 8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

// files venus de la fenêtre : { name, text } ou { name, base64 }.
function epub(files) {
  const list = [{ name: 'mimetype', data: Buffer.from('application/epub+zip', 'ascii'), store: true }];
  for (const f of files) {
    if (!f || typeof f.name !== 'string' || f.name === 'mimetype' || /(^|\/)\.\.(\/|$)|^\//.test(f.name)) continue;
    list.push({ name: f.name, data: f.base64 !== undefined ? Buffer.from(f.base64, 'base64') : Buffer.from(String(f.text || ''), 'utf8') });
  }
  return zip(list);
}

function registerLivre({ getWindow, safeFileName }) {
  ipcMain.handle('doc:exportBook', async (e, title, job) => {
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Exporter en livre',
      defaultPath: path.join(app.getPath('documents'), `${safeFileName(title)}${job.output === 'livret' ? ' (livret)' : ''}.pdf`),
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return null;
    const res = await makeBook(job, (text) => e.sender.send('livre:etape', text));
    await fs.writeFile(filePath, res.pdf);
    return { filePath, pages: res.pages };
  });
  ipcMain.handle('doc:exportEpub', async (_e, title, files) => {
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Exporter en EPUB',
      defaultPath: path.join(app.getPath('documents'), `${safeFileName(title)}.epub`),
      filters: [{ name: 'Livre numérique EPUB', extensions: ['epub'] }]
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, epub(files));
    return filePath;
  });
}

module.exports = { registerLivre, makeBook, epub, zip };
