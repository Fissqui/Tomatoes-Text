// Polices « cloud » de Microsoft Office (Aptos, etc.) : elles sont téléchargées par Office
// dans un dossier à part et ne sont pas visibles des autres logiciels. On les lit sur place,
// sans les copier, pour les proposer dans Tomatoes Text sur l'ordinateur qui les possède.
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

function cloudFontsDir() {
  const local = process.env.LOCALAPPDATA;
  return local ? path.join(local, 'Microsoft', 'FontCache', '4', 'CloudFonts') : null;
}

async function readAt(handle, offset, length) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buf, 0, length, offset);
  return buf.subarray(0, bytesRead);
}

// Lit dans le fichier de police son nom de famille, sa graisse et s'il est italique,
// en ne lisant que l'en-tête et les deux petites tables utiles.
async function describeFont(handle) {
  const head = await readAt(handle, 0, 12);
  if (head.length < 12) return null;
  const tag = head.readUInt32BE(0);
  if (tag !== 0x00010000 && tag !== 0x4f54544f /* OTTO */ && tag !== 0x74727565 /* true */) return null;
  const numTables = head.readUInt16BE(4);
  const dir = await readAt(handle, 12, numTables * 16);
  if (dir.length < numTables * 16) return null;
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = i * 16;
    tables[dir.toString('latin1', rec, rec + 4)] = { offset: dir.readUInt32BE(rec + 8), length: dir.readUInt32BE(rec + 12) };
  }
  if (!tables.name || tables.name.length > 1024 * 1024) return null;
  const name = await readAt(handle, tables.name.offset, tables.name.length);
  const count = name.readUInt16BE(2);
  const strings = name.readUInt16BE(4);
  const names = {};
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (rec + 12 > name.length) break;
    const platform = name.readUInt16BE(rec);
    const lang = name.readUInt16BE(rec + 4);
    const id = name.readUInt16BE(rec + 6);
    const len = name.readUInt16BE(rec + 8);
    const off = strings + name.readUInt16BE(rec + 10);
    if (platform !== 3 || (lang !== 0x409 && names[id])) continue;
    const raw = name.subarray(off, off + len);
    let text = '';
    for (let j = 0; j + 1 < raw.length; j += 2) text += String.fromCharCode(raw.readUInt16BE(j));
    names[id] = text;
  }
  const family = names[16] || names[1];
  if (!family) return null;
  let weight = 400;
  let italic = /italic|oblique/i.test(names[17] || names[2] || '');
  if (tables['OS/2'] && tables['OS/2'].length >= 64) {
    const os2 = await readAt(handle, tables['OS/2'].offset, 64);
    if (os2.length === 64) {
      weight = os2.readUInt16BE(4) || 400;
      italic = italic || (os2.readUInt16BE(62) & 1) === 1;
    }
  }
  return { family, weight, style: italic ? 'italic' : 'normal' };
}

let scanning = null; // promesse du catalogue : famille -> [{ file, weight, style }]

// Le dossier n'est parcouru qu'une fois ; les demandes faites pendant le parcours en attendent la fin.
function scan() {
  if (!scanning) scanning = readCatalog();
  return scanning;
}

async function readCatalog() {
  const catalog = new Map();
  const dir = cloudFontsDir();
  if (!dir) return catalog;
  let folders = [];
  try {
    folders = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return catalog;
  }
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    let files = [];
    try {
      files = await fs.readdir(path.join(dir, folder.name));
    } catch {
      continue;
    }
    for (const fileName of files) {
      const file = path.join(dir, folder.name, fileName);
      let handle;
      try {
        handle = await fs.open(file, 'r');
        const info = await describeFont(handle);
        if (!info) continue;
        if (!catalog.has(info.family)) catalog.set(info.family, []);
        catalog.get(info.family).push({ file, weight: info.weight, style: info.style });
      } catch {
        /* fichier illisible : ignoré */
      } finally {
        if (handle) await handle.close();
      }
    }
  }
  return catalog;
}

function registerOfficeFonts() {
  ipcMain.handle('fonts:officeList', async () => [...(await scan()).keys()].sort((a, b) => a.localeCompare(b, 'fr')));
  // Renvoie les fichiers d'une famille, pour que l'interface les charge (FontFace).
  ipcMain.handle('fonts:officeLoad', async (_e, family) => {
    const faces = (await scan()).get(family) || [];
    const out = [];
    for (const face of faces) {
      try {
        const data = await fs.readFile(face.file);
        out.push({ weight: face.weight, style: face.style, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
      } catch {
        /* ignoré */
      }
    }
    return out;
  });
}

module.exports = { registerOfficeFonts, describeFont };
