// Icône du logiciel : build/icon.svg → build/icon.ico (fichier .exe), src/assets/icon.ico (raccourcis)
// et src/assets/icon.png (fenêtre, 512 px).
// Lancer : node scripts/icone-logiciel.js (Playwright et Chromium nécessaires).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

// Image BMP 32 bits d'une entrée ICO (en-tête, pixels BGRA de bas en haut, masque vide).
function bmpEntry(raw, s) {
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(s, 4);
  head.writeInt32LE(s * 2, 8);
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(32, 14);
  head.writeUInt32LE(s * s * 4, 20);
  const px = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const o = ((s - 1 - y) * s + x) * 4;
      px[o] = raw[i + 2];
      px[o + 1] = raw[i + 1];
      px[o + 2] = raw[i];
      px[o + 3] = raw[i + 3];
    }
  }
  const mask = Buffer.alloc(Math.ceil(s / 32) * 4 * s);
  return Buffer.concat([head, px, mask]);
}

(async () => {
  const root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (s) => {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img style="display:block" width="${s}" height="${s}" src="${src}"></body></html>`);
    await page.waitForTimeout(50);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
  };
  // Pixels bruts RGBA d'une image PNG, lus par le navigateur.
  const pixels = (png, s) => page.evaluate(async ({ b64, s }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(0, 0, s, s).data);
  }, { b64: png.toString('base64'), s });

  const images = [];
  for (const s of SIZES) {
    const png = await shot(s);
    images.push(s >= 256 ? png : bmpEntry(Buffer.from(await pixels(png, s)), s));
  }
  fs.writeFileSync(path.join(root, 'src', 'assets', 'icon.png'), await shot(512));
  await browser.close();

  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(SIZES.length, 4);
  const dir = Buffer.alloc(16 * SIZES.length);
  let offset = 6 + dir.length;
  SIZES.forEach((s, i) => {
    const e = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, e);
    dir.writeUInt8(s >= 256 ? 0 : s, e + 1);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(images[i].length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  const ico = Buffer.concat([head, dir, ...images]);
  for (const out of [path.join(root, 'build', 'icon.ico'), path.join(root, 'src', 'assets', 'icon.ico')]) {
    fs.writeFileSync(out, ico);
    console.log('Écrit :', out, ico.length, 'octets');
  }
})();
