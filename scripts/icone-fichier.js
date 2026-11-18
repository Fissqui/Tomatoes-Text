// Icône des documents .tmtx : build/tmtx.svg → src/assets/tmtx.ico (16 à 256 px, images PNG).
// Lancer : node scripts/icone-fichier.js (Playwright et Chromium nécessaires).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

(async () => {
  const root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'build', 'tmtx.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pngs = [];
  for (const s of SIZES) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img style="display:block" width="${s}" height="${s}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
    await page.waitForTimeout(50);
    pngs.push(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } }));
  }
  await browser.close();
  // En-tête ICO, puis une entrée de 16 octets par taille, puis les images.
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
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
    dir.writeUInt32LE(pngs[i].length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  const out = path.join(root, 'src', 'assets', 'tmtx.ico');
  fs.writeFileSync(out, Buffer.concat([head, dir, ...pngs]));
  console.log('Écrit :', out, offset, 'octets');
})();
