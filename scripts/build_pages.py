"""Build a self-contained GitHub Pages artifact from the shared app/core."""
import json
from pathlib import Path
import shutil
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
root=Path(__file__).resolve().parents[1]
out=root/'dist'
if out.exists(): shutil.rmtree(out)
shutil.copytree(root/'web',out)
(out/'vendor').mkdir()
(out/'fonts').mkdir()
shutil.copyfile(root/'node_modules/openscad-wasm/openscad.js',out/'vendor/openscad.js')
shutil.copyfile(root/'node_modules/fflate/esm/browser.js',out/'vendor/fflate.js')
shutil.copyfile(root/'scad/lightbox.scad',out/'lightbox.scad')
font_map={
 'DejaVu Sans:style=Bold':'DejaVuSans-Bold.ttf',
 'DejaVu Sans':'DejaVuSans.ttf',
 'DejaVu Serif:style=Bold':'DejaVuSerif-Bold.ttf',
 'DejaVu Serif':'DejaVuSerif.ttf',
 'DejaVu Sans Mono:style=Bold':'DejaVuSansMono-Bold.ttf',
 'DejaVu Sans Mono':'DejaVuSansMono.ttf',
}
for file in font_map.values():
 shutil.copyfile(Path('/usr/share/fonts/truetype/dejavu')/file,out/'fonts'/file)
shutil.copyfile('/usr/share/doc/fonts-dejavu-core/copyright',out/'fonts/LICENSE.txt')
(out/'config.json').write_text(json.dumps(dict(defaults=server.DEFAULTS,limits=server.LIMITS,fonts=list(font_map),fontFiles=font_map,openscad=True)))
html=(out/'index.html').read_text().replace('<head>','<head><meta name="renderer" content="wasm">')
html=html.replace('Fonts installed on the computer running OpenSCAD. Bold strokes work best.','Six included DejaVu fonts. Bold strokes work best.')
html=html.replace('Your model will be rendered by OpenSCAD. First builds can take a minute.','OpenSCAD runs privately in your browser. The first build downloads the engine and may take a minute.')
(out/'index.html').write_text(html)
(out/'.nojekyll').touch()
(out/'THIRD_PARTY.txt').write_text('OpenSCAD WebAssembly: openscad-wasm 0.0.4, GPL-2.0. Source: https://github.com/openscad/openscad-wasm\nDistribution: https://www.npmjs.com/package/openscad-wasm/v/0.0.4\nfflate 0.8.2: MIT. Source: https://github.com/101arrowz/fflate\nDejaVu fonts: see fonts/LICENSE.txt.\n')
shutil.copyfile('/usr/share/common-licenses/GPL-2',out/'vendor/OpenSCAD-COPYING.txt')
shutil.copyfile(root/'node_modules/fflate/LICENSE',out/'vendor/fflate-LICENSE.txt')
print('Built GitHub Pages site in dist/')
