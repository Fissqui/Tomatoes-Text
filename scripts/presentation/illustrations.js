// Illustrations du projet de présentation (dessins SVG faits à la main, rangés dans les documents).
const leaf = (x, y, r, s = 1, c = '#3f8f3a') => `<path transform="translate(${x} ${y}) rotate(${r}) scale(${s})" d="M0 0c6-10 20-12 30-6-8 2-14 9-16 18-4-6-9-9-14-12z" fill="${c}"/>`;
const crown = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">${leaf(0, 0, -160, 1.1)}${leaf(0, 0, -20, 1.1)}${leaf(0, 0, -95, 0.9, '#4fa246')}${leaf(0, 0, 60, 0.8)}${leaf(0, 0, 130, 0.8, '#4fa246')}<path d="M0 0c1-8 3-14 8-20" stroke="#2f6e2b" stroke-width="3" fill="none" stroke-linecap="round"/></g>`;

function tomato({ w = 360, h = 280, bg, body, shine = '#ffffff', ribs = 0, stripes = null, shape = 'round', cx = 180, cy = 158, r = 92 }) {
  const ry = shape === 'coeur' ? r * 0.92 : r * 0.84;
  let path;
  if (shape === 'coeur') {
    // Côtes marquées, pointe en bas.
    path = `M${cx} ${cy - ry * 0.78}c${r * 0.5} ${-ry * 0.42} ${r * 1.12} ${-ry * 0.12} ${r * 1.02} ${ry * 0.42}c-${r * 0.06} ${ry * 0.5} -${r * 0.52} ${ry * 0.98} -${r * 1.02} ${ry * 1.2}c-${r * 0.5} -${ry * 0.22} -${r * 0.96} -${ry * 0.7} -${r * 1.02} -${ry * 1.2}c-${r * 0.1} -${ry * 0.54} ${r * 0.52} -${ry * 0.84} ${r * 1.02} -${ry * 0.42}z`;
  } else {
    path = `M${cx - r} ${cy}a${r} ${ry} 0 1 0 ${2 * r} 0a${r} ${ry} 0 1 0 -${2 * r} 0z`;
  }
  let extra = '';
  for (let i = 1; i <= ribs; i++) {
    const dx = (i - (ribs + 1) / 2) * (r * 0.42);
    extra += `<path d="M${cx + dx * 0.4} ${cy - ry * 0.72}C${cx + dx * 1.15} ${cy - ry * 0.2} ${cx + dx * 1.15} ${cy + ry * 0.4} ${cx + dx * 0.5} ${cy + ry * 0.92}" stroke="rgba(0,0,0,0.13)" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
  if (stripes) {
    for (let i = -3; i <= 3; i++) {
      const dx = i * r * 0.27;
      extra += `<path d="M${cx + dx * 0.5} ${cy - ry * 0.8}C${cx + dx * 1.2} ${cy - ry * 0.3} ${cx + dx * 1.2} ${cy + ry * 0.3} ${cx + dx * 0.6} ${cy + ry * 0.85}" stroke="${stripes}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.8"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" rx="18" fill="${bg}"/>
<ellipse cx="${cx}" cy="${cy + ry + 14}" rx="${r * 0.95}" ry="12" fill="rgba(0,0,0,0.12)"/>
<clipPath id="c"><path d="${path}"/></clipPath>
<path d="${path}" fill="${body}"/>
<g clip-path="url(#c)">${extra}<ellipse cx="${cx + r * 0.35}" cy="${cy + ry * 0.55}" rx="${r * 0.9}" ry="${ry * 0.7}" fill="rgba(0,0,0,0.12)"/></g>
<ellipse cx="${cx - r * 0.42}" cy="${cy - ry * 0.32}" rx="${r * 0.16}" ry="${ry * 0.3}" transform="rotate(28 ${cx - r * 0.42} ${cy - ry * 0.32})" fill="${shine}" opacity="0.45"/>
${crown(cx, cy - ry * 0.78, 1.15)}
</svg>`;
}

const coeur = tomato({ bg: '#fbe9e4', body: '#d23a2a', ribs: 5, shape: 'coeur', r: 96, cy: 150 });
const noire = tomato({ bg: '#efe6e2', body: '#6e2f2b', shine: '#f4d3c8', ribs: 3, r: 94 });
const zebra = tomato({ bg: '#eef5e3', body: '#9cc63f', stripes: '#e2e86a', shine: '#ffffff', r: 90 });

function cerise() {
  const fruits = [[120, 150, 34], [178, 128, 36], [236, 150, 34], [150, 205, 33], [212, 206, 34], [268, 208, 30]];
  let g = '<path d="M60 70C120 40 220 40 300 64" stroke="#3d7a35" stroke-width="7" fill="none" stroke-linecap="round"/>';
  for (const [x, y] of fruits) g += `<path d="M${x} ${y - 30}C${x} ${y - 52} ${x - 12} ${y - 70} ${(x + 180) / 2} 58" stroke="#3d7a35" stroke-width="3" fill="none"/>`;
  for (const [x, y, r] of fruits) {
    g += `<ellipse cx="${x + 6}" cy="${y + 8}" rx="${r}" ry="${r * 0.9}" fill="rgba(0,0,0,0.1)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#e2412f"/><circle cx="${x + r * 0.3}" cy="${y + r * 0.3}" r="${r * 0.75}" fill="rgba(0,0,0,0.1)"/><ellipse cx="${x - r * 0.38}" cy="${y - r * 0.38}" rx="${r * 0.18}" ry="${r * 0.3}" transform="rotate(30 ${x - r * 0.38} ${y - r * 0.38})" fill="#fff" opacity="0.5"/>${crown(x, y - r * 0.85, 0.55)}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="280" viewBox="0 0 360 280"><rect width="360" height="280" rx="18" fill="#fdeee6"/>${g}</svg>`;
}

// Le jardin de l'association : collines, soleil, carrés potagers, cabane.
function jardin() {
  let beds = '';
  const bed = (x, y, w, plants) => {
    let s = `<rect x="${x}" y="${y}" width="${w}" height="34" rx="4" fill="#8a5a36"/><rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="12" rx="3" fill="#5b3a22"/>`;
    for (let i = 0; i < plants; i++) {
      const px = x + 16 + i * ((w - 32) / Math.max(1, plants - 1));
      s += `<path d="M${px} ${y + 8}v-34" stroke="#3a7d34" stroke-width="3"/>${leaf(px, y - 6, -150, 0.7)}${leaf(px, y - 14, -30, 0.7)}${leaf(px, y - 24, -140, 0.6, '#4fa246')}<circle cx="${px - 7}" cy="${y - 4}" r="6" fill="#e0412f"/><circle cx="${px + 6}" cy="${y - 16}" r="5" fill="#e86a3a"/>`;
    }
    return s;
  };
  beds += bed(70, 268, 170, 5) + bed(300, 268, 170, 5) + bed(140, 318, 200, 6) + bed(380, 318, 150, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
<defs><linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe8f6"/><stop offset="1" stop-color="#fbf3df"/></linearGradient></defs>
<rect width="600" height="380" rx="20" fill="url(#ciel)"/>
<circle cx="480" cy="86" r="40" fill="#f6c445"/><circle cx="480" cy="86" r="58" fill="#f6c445" opacity="0.25"/>
<path d="M0 210C90 150 170 170 250 196S420 150 600 182V380H0z" fill="#b9d98a"/>
<path d="M0 240C120 200 230 226 330 236S500 214 600 226V380H0z" fill="#93c26a"/>
<rect x="0" y="252" width="600" height="128" fill="#a7cf78"/>
<g><rect x="470" y="190" width="80" height="62" fill="#c98b5a"/><path d="M462 194l48-34 48 34z" fill="#9e5b3a"/><rect x="500" y="216" width="22" height="36" fill="#6f3f26"/></g>
<g stroke="#e8d7b8" stroke-width="5">${Array.from({ length: 12 }, (_, i) => `<path d="M${18 + i * 34} 244v26"/>`).join('')}<path d="M10 252h400M10 264h400"/></g>
${beds}
</svg>`;
}

// Récoltes de l'année (histogramme).
function recoltes() {
  const data = [['Juin', 42], ['Juillet', 128], ['Août', 236], ['Septembre', 174], ['Octobre', 61]];
  const max = 250;
  const x0 = 70;
  const y0 = 300;
  const bw = 70;
  let g = '';
  for (let v = 0; v <= max; v += 50) {
    const y = y0 - (v / max) * 240;
    g += `<path d="M${x0} ${y}H610" stroke="#e3ddd2" stroke-width="1"/><text x="${x0 - 10}" y="${y + 5}" text-anchor="end" font-size="13" fill="#6b6259">${v}</text>`;
  }
  data.forEach(([m, v], i) => {
    const x = x0 + 25 + i * 105;
    const hh = (v / max) * 240;
    g += `<rect x="${x}" y="${y0 - hh}" width="${bw}" height="${hh}" rx="6" fill="${i === 2 ? '#c8402c' : '#e5836f'}"/><text x="${x + bw / 2}" y="${y0 - hh - 8}" text-anchor="middle" font-size="14" font-weight="700" fill="#3b332c">${v} kg</text><text x="${x + bw / 2}" y="${y0 + 22}" text-anchor="middle" font-size="14" fill="#3b332c">${m}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="340" viewBox="0 0 640 340" font-family="Segoe UI, Arial, sans-serif">
<rect width="640" height="340" rx="14" fill="#fffdf8"/>${g}<path d="M${x0} ${y0}H610" stroke="#8c8277" stroke-width="1.5"/>
</svg>`;
}

// Panier de tomates (recettes).
function panier() {
  let fruits = '';
  const list = [[150, 150, 40, '#d93a2b'], [215, 136, 44, '#e4502f'], [285, 150, 40, '#c7322a'], [185, 178, 38, '#ef6a3c'], [255, 180, 40, '#d93a2b'], [118, 186, 30, '#f0a33a'], [320, 188, 30, '#7fb23a']];
  for (const [x, y, r, c] of list) fruits += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><ellipse cx="${x - r * 0.4}" cy="${y - r * 0.4}" rx="${r * 0.16}" ry="${r * 0.28}" transform="rotate(30 ${x - r * 0.4} ${y - r * 0.4})" fill="#fff" opacity="0.45"/>${crown(x, y - r * 0.9, 0.6)}`;
  let weave = '';
  for (let i = 0; i < 9; i++) weave += `<path d="M${92 + i * 32} 206l${10 - i * 2.5} 92" stroke="#a8743f" stroke-width="5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="330" viewBox="0 0 440 330">
<rect width="440" height="330" rx="18" fill="#f6efe2"/>
<ellipse cx="220" cy="304" rx="160" ry="14" fill="rgba(0,0,0,0.12)"/>
<path d="M120 200C120 90 320 90 320 200" stroke="#9c6a37" stroke-width="12" fill="none"/>
${fruits}
<path d="M70 200h300l-30 100H100z" fill="#c98f52"/>${weave}
<path d="M66 196h308v18H66z" rx="6" fill="#b47c43"/>
</svg>`;
}

const toDataUrl = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg.replace(/\n/g, '')).toString('base64');

module.exports = {
  jardin: toDataUrl(jardin()),
  coeur: toDataUrl(coeur),
  noire: toDataUrl(noire),
  zebra: toDataUrl(zebra),
  cerise: toDataUrl(cerise()),
  recoltes: toDataUrl(recoltes()),
  panier: toDataUrl(panier())
};
