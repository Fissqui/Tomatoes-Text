"""Polices fixes (non variables) pour l'export PDF et l'export Word.

Les polices intégrées (src/renderer/fonts) sont des polices variables, coupées en deux fichiers
(latin, latin-ext). Chromium les met dans un PDF en « Type 3 » (dessins sans hinting, rendu flou
dans plusieurs lecteurs, texte mal copié) et Word ne sait pas les joindre à un .docx.
Ce script en tire, pour chaque famille, une police fixe par graisse et par style, latin et
latin-ext réunis, au format WOFF2 sans transformation des tables (décompressable par Node seul).

Sortie : src/renderer/fonts/statiques/*.woff2, statiques/polices.json et fonts/fonts-impression.css.
Usage : python3 scripts/polices-statiques.py   (fonttools et brotli nécessaires)
"""
import json
import os
import re
import tempfile

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData
from fontTools.varLib import instancer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'renderer', 'fonts')
OUT = os.path.join(ROOT, 'statiques')
WEIGHTS = [400, 500, 600, 700, 800]


def families():
    """Familles de fonts.css : nom → { style → { 'files': {sous-ensemble: fichier}, 'range': (min, max) } }."""
    css = open(os.path.join(ROOT, 'fonts.css'), encoding='utf-8').read()
    out = {}
    for block in re.findall(r'@font-face\s*{([^}]*)}', css):
        name = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        style = re.search(r'font-style:\s*(\w+)', block).group(1)
        w = [int(x) for x in re.search(r'font-weight:\s*([\d ]+);', block).group(1).split()]
        src = re.search(r'url\(\./([^)]+)\)', block).group(1)
        sub = 'ext' if '-latin-ext-' in src else 'latin'
        entry = out.setdefault(name, {}).setdefault(style, {})
        key = (w[0], w[-1])
        entry.setdefault(key, {})[sub] = src
    return out


def save(font, path):
    font.flavor = 'woff2'
    font.flavorData = WOFF2FlavorData(transformedTables=())
    font.save(path)


def build(parts, weight, variable, path, name, italic):
    tmp = []
    for src in parts:
        f = TTFont(os.path.join(ROOT, src))
        if variable:
            f = instancer.instantiateVariableFont(f, {'wght': weight}, updateFontNames=False)
        f.flavor = None
        fd, p = tempfile.mkstemp(suffix='.ttf')
        os.close(fd)
        f.save(p)
        tmp.append(p)
    merged = Merger().merge(tmp) if len(tmp) > 1 else TTFont(tmp[0])
    for p in tmp:
        os.remove(p)
    rename(merged, name, weight, italic)
    save(merged, path)


NAMES = {500: 'Medium', 600: 'SemiBold', 800: 'ExtraBold'}


def rename(font, name, weight, italic):
    """Noms internes d'une graisse fixe : « Inter » Bold Italic pour 400 / 700 (familles de Word),
    « Inter SemiBold » Regular / Italic pour les autres ; bits gras et italique cohérents."""
    bold = weight == 700
    family = name if weight in (400, 700) else f'{name} {NAMES.get(weight, weight)}'
    sub = ('Bold ' if bold else '') + ('Italic' if italic else '')
    sub = sub.strip() or 'Regular'
    ps = re.sub(r'[^A-Za-z0-9]', '', family) + '-' + sub.replace(' ', '')
    table = font['name']
    for rec in list(table.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            table.removeNames(nameID=rec.nameID)
    for nid, val in ((1, family), (2, sub), (3, ps), (4, f'{family} {sub}'.replace(' Regular', '')), (6, ps)):
        table.setName(val, nid, 3, 1, 0x409)
        table.setName(val, nid, 1, 0, 0)
    os2 = font['OS/2']
    os2.fsType = 0  # (polices SIL OFL : intégration libre)
    os2.usWeightClass = weight
    sel = os2.fsSelection & ~(1 | 32 | 64)
    os2.fsSelection = sel | (1 if italic else 0) | (32 if bold else 0) | (64 if not italic and not bold else 0)
    font['head'].macStyle = (1 if bold else 0) | (2 if italic else 0)


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    css = ['/* Polices fixes pour l\'impression PDF (scripts/polices-statiques.py) : une graisse par fichier. */']
    for name, styles in sorted(families().items()):
        slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        info = manifest.setdefault(name, {'slug': slug, 'styles': {}})
        for style, ranges in styles.items():
            done = []
            for (lo, hi), subs in sorted(ranges.items()):
                parts = [subs[k] for k in ('latin', 'ext') if k in subs]
                variable = lo != hi
                weights = [w for w in WEIGHTS if lo <= w <= hi] if variable else [lo]
                for w in weights:
                    file = f'{slug}-{w}-{style}.woff2'
                    build(parts, w, variable, os.path.join(OUT, file), name, style == 'italic')
                    done.append(w)
                    css.append("@font-face { font-family: '%s'; font-style: %s; font-weight: %d; src: url(./statiques/%s) format('woff2'); }" % (name, style, w, file))
            info['styles'][style] = sorted(done)
    with open(os.path.join(OUT, 'polices.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, 'fonts-impression.css'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(css) + '\n')


if __name__ == '__main__':
    main()
