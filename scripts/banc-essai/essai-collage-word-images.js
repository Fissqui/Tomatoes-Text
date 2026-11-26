// Images d'un texte copié dans Word (presse-papiers relevé sur Word 16, novembre 2026) : l'image du VML
// (<v:imagedata>, fichier d'origine en pleine taille) est préférée à la copie réduite de l'<img> de secours ;
// original illisible → copie de secours ; forme VML sans <img> de secours → image ajoutée quand même.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

// PNG d'une couleur unie, w × h.
function png(w, h, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msohtmlclip-'));
  fs.writeFileSync(path.join(dir, 'clip_image001.png'), png(1200, 720, [200, 40, 40])); // original
  fs.writeFileSync(path.join(dir, 'clip_image002.png'), png(120, 72, [200, 40, 40])); // vignette
  const url = (f) => pathToFileURL(path.join(dir, f)).href;
  const thumb = 'data:image/png;base64,' + png(150, 90, [40, 40, 200]).toString('base64');
  const vml = (id, src, style) => `<!--[if gte vml 1]><v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" filled="f" stroked="f"><v:stroke joinstyle="miter"/></v:shapetype><v:shape id="${id}" o:spid="_x0000_s1026" type="#_x0000_t75"\r\n style='${style}'>\r\n <v:imagedata src="${src}"\r\n  o:title=""/>\r\n</v:shape><![endif]-->`;
  const word = (frag) => `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns="http://www.w3.org/TR/REC-html40"><head><meta name=ProgId content=Word.Document></head><body lang=FR>\r\n<!--StartFragment-->${frag}<!--EndFragment-->\r\n</body></html>`;
  const paste = async (html, text) => {
    await page.evaluate(() => { const ed = document.getElementById('editor'); ed.innerHTML = '<p id="here">Début</p>'; ed.focus(); });
    await page.click('#editor p');
    await page.keyboard.press('End');
    await page.evaluate(([h, t]) => {
      const dt = new DataTransfer();
      dt.setData('text/html', h);
      dt.setData('text/plain', t);
      document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [html, text]);
    await page.waitForFunction(() => document.getElementById('paste-dialog').open || document.querySelector('#editor .ft-image img'), null, { timeout: 5000 }).catch(() => {});
    if (await page.evaluate(() => document.getElementById('paste-dialog').open)) await page.click('#ps-ok');
    await page.waitForTimeout(400);
    return page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('#editor .ft-image img')];
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
      return { imgs: imgs.map((i) => ({ w: i.naturalWidth, wrap: i.parentElement.dataset.wrap || '', align: i.parentElement.dataset.align || '', width: i.parentElement.style.width })), html: window.FTEditor.getHtml().replace(/base64,[^"]+/g, 'B64') };
    });
  };
  const TEXT = "Avant l'image.\r\n \r\nAprès l'image.\r\nTexte autour.\r\n";

  // 1. Image flottante (vignette en <img>, original en VML) et image dans le texte (copie réduite en data:).
  const floating = 'position:absolute;margin-left:-.35pt;margin-top:0;width:150pt;height:90pt;z-index:251659264;mso-wrap-style:square';
  const r1 = await paste(word(`<p class=MsoNormal>${vml('Image_x0020_2', url('clip_image001.png'), floating)}<![if !vml]><img width=200 height=120\r\nsrc="${url('clip_image002.png')}"\r\nalign=left hspace=12 v:shapes="Image_x0020_2"><![endif]>Avant l'image.<o:p></o:p></p>\r\n\r\n<p class=MsoNormal><span style='mso-no-proof:yes'>${vml('Image_x0020_1', url('clip_image001.png'), 'width:150pt;height:90pt;mso-wrap-style:square')}<![if !vml]><img width=200 height=120\r\nsrc="${thumb}"\r\nv:shapes="Image_x0020_1"><![endif]></span><o:p></o:p></p>\r\n\r\n<p class=MsoNormal>Après l'image.<o:p></o:p></p>\r\n\r\n<p class=MsoNormal>Texte autour.<o:p></o:p></p>`), TEXT);
  assert.strictEqual(r1.imgs.length, 2, 'deux images collées : ' + r1.html);
  assert.deepStrictEqual(r1.imgs.map((i) => i.w), [1200, 1200], 'originaux en pleine taille, pas les copies réduites');
  assert.strictEqual(r1.imgs[0].wrap, 'gauche', 'image flottante gardée à côté du texte');
  assert.strictEqual(r1.imgs[1].align, 'gauche', 'image du texte entre deux paragraphes');
  assert.strictEqual(r1.imgs[0].width, r1.imgs[1].width, 'taille affichée de Word gardée (200 px)');
  assert(/Après l'image\.<\/p><p>Texte autour/.test(r1.html), 'texte gardé');
  ok('Word : originaux en pleine taille, flottante et dans le texte, à la taille de Word');

  // 2. Original disparu (dossier temporaire de Word vidé) : copie de secours gardée.
  const r2 = await paste(word(`<p class=MsoNormal><span style='mso-no-proof:yes'>${vml('Image_x0020_1', url('absent.png'), 'width:150pt;height:90pt')}<![if !vml]><img width=200 height=120 src="${thumb}" v:shapes="Image_x0020_1"><![endif]></span></p>\r\n<p class=MsoNormal>Après l'image.</p>`), "\r\nAprès l'image.\r\n");
  assert.deepStrictEqual(r2.imgs.map((i) => i.w), [150], 'copie de secours : ' + r2.html);
  ok('Word : original illisible → copie de secours');

  // 3. Forme VML seule (sans <img> de secours) : image ajoutée, flottante.
  const r3 = await paste(word(`<p class=MsoNormal>${vml('Image_x0020_3', url('clip_image001.png'), floating)}Texte autour de l'image.</p>\r\n<p class=MsoNormal>Suite.</p>`), "Texte autour de l'image.\r\nSuite.\r\n");
  assert.strictEqual(r3.imgs.length, 1, 'image ajoutée : ' + r3.html);
  assert.strictEqual(r3.imgs[0].wrap, 'gauche', 'flottante');
  assert.strictEqual(r3.imgs[0].width, r1.imgs[0].width, 'taille du VML (150 pt = 200 px)');
  ok('Word : forme VML sans image de secours → image ajoutée');
  fs.rmSync(dir, { recursive: true, force: true });
};
