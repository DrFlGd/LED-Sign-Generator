# LED Sign Generator

A web workshop for printable LED lightboxes, with **OpenSCAD as the geometry authority**. Type a short sign, tune its dimensions and fit, inspect the actual rendered STL meshes, then download a fabrication kit.

This is the first working milestone in the selected order: text/fonts → sign styles → dimensions → diffuser → walls/fit → exports → assembly preview → saved projects. It is an original implementation of that workflow, not a copy of the reference site's code or assets.

## Hosted on GitHub Pages

The hosted edition runs OpenSCAD WebAssembly in a background browser worker. No Python or OpenSCAD installation is required. Six DejaVu fonts are included; source, STL, SVG, fit coupons and project downloads are generated locally in your browser. The first build downloads the engine.

Pushes to `main` run `.github/workflows/pages.yml`, test the WebAssembly renderer, and deploy `dist/` using GitHub Actions. In repository Settings → Pages, the source should be **GitHub Actions**.

To reproduce the Pages build on Linux: install Node 22+, Python 3.10+ and `fonts-dejavu-core`, then run `npm ci`, `npm run build`, and `npm run test:wasm`. The build copies pinned dependencies and fonts into the site; runtime rendering does not rely on an external CDN.

Browser and desktop OpenSCAD versions may produce slightly different text dimensions. Each preview and its print kit use the same rendered geometry; use the measured dimensions shown after rendering.

## Run locally with desktop OpenSCAD

Install **Python 3.10+** and **OpenSCAD 2021.01+** from [openscad.org](https://openscad.org/downloads.html). No pip, npm, or CDN dependencies are needed. The browser needs WebGL for the preview; exports work without it.

```sh
git clone https://github.com/DrFlGd/LED-Sign-Generator.git
cd LED-Sign-Generator
python server.py
```

Open **http://127.0.0.1:8000**. On systems where Python is called `python3`, use that command instead. This optional local mode uses the desktop OpenSCAD executable behind the browser. The hosted Pages edition uses WebAssembly instead.

OpenSCAD must be on PATH, or set `OPENSCAD` to its executable:

```sh
# macOS example
OPENSCAD=/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD python3 server.py
```

```powershell
# Windows PowerShell example (adjust installation path if necessary)
$env:OPENSCAD = 'C:\Program Files\OpenSCAD\openscad.com'
python server.py
```

On Debian/Ubuntu, the system packages are `openscad` and `fonts-dejavu-core`. Fontconfig's `fc-list` provides the installed font picker when available. Otherwise the app offers common DejaVu/Liberation names; install those fonts and check OpenSCAD's font list to prevent substitution. Custom fonts are supported by **installing them on the host**, then restarting the app; browser font upload is not implemented yet. Fonts are not bundled or embedded in exports, so install the same font when regenerating on another computer.

## First build

1. Start with `GLOW`, a bold font and 80 mm artwork height.
2. Select **separate letters**, or **convex contour enclosure** for one convex outer outline around the word. The latter is not a tight concave contour and does not expose text-shaped windows: it creates a convex face with separate text and background color regions.
3. Set total depth, wall/back thickness, diffuser thickness, clearance, ledge and recess.
4. Click **Generate lightbox**. The app renders with OpenSCAD; no approximate browser geometry is substituted. Rotate with drag or arrow keys, zoom with scroll or +/−, choose front/rear, hide parts, or explode the assembly.
5. Download the print kit. Print the fit coupon first, then inspect the full meshes in your slicer.
6. Save a project JSON to resume later. The last successful build's settings also restore from local browser storage. After changing or opening a project, generate again; downloads are disabled until the new geometry is built.

## Included exports

| File | Purpose |
| --- | --- |
| `body.stl` | Shell, solid back and inset support ledge; back on Z=0 |
| `diffuser.stl` | Separate face, flat on Z=0 |
| `diffuser.svg` | Face cutting outline in mm; no kerf compensation |
| `fit_body.stl`, `fit_diffuser.stl` | 30 mm square fit coupon with the selected tolerances |
| `sign.scad` | Standalone, editable source with the selected parameters |
| `project.json` | Versioned app settings |
| `ASSEMBLY.txt` | Dimensions, printing and assembly notes |

Separate letters and disconnected glyph islands are separate shells inside one STL. Split to objects in your slicer to arrange them. Export size is measured from the rendered mesh. Visible glyph height is normalized with OpenSCAD `resize`; it is not font point size. Contour margins add to height, with small tessellation differences.

## Geometry and assembly

`scad/lightbox.scad` is the single source of truth. The server only substitutes its parameter assignments and invokes OpenSCAD. It can also be used independently in OpenSCAD's Customizer:

```sh
openscad -o body.stl -D 'part="body"' scad/lightbox.scad
openscad -o face.stl -D 'part="diffuser"' scad/lightbox.scad
```

The lower cavity is inset by `wall + ledge`; the upper face seat is inset by `wall`. The diffuser is inset by `wall + clearance`. Its assembled bottom is `depth - recess - face`. Clearance is **per side**, so a 0.20 mm setting produces 0.40 mm total clearance across a straight span. The face rests on a ledge; there are no snap tabs or retaining clips. Thin letters can lose diffuser regions or have unusably narrow cavities. A successful render is not printability certification. Review counters, islands and available LED space before manufacturing.

The default 0.20 mm clearance is a starting point, not a calibrated fit guarantee. Use the coupon and adjust for your printer/material. Choose suitable low-voltage LEDs and account for their heat and required cavity size. Wiring, mounting and retention are manual in this milestone.

## Scope and next milestones

Implemented: installed font selection, separate letters, convex/close/rectangular enclosures, rear wire holes and horizontal passages, exact rendered dimensions, inset printed/cut diffuser, wall/back/ledge/clearance/recess controls, fit coupons, STL/SVG/SCAD kit, mesh-based 3D/front/rear/exploded preview, part visibility, preview colors, project save/open and last-build restore.

Next: font upload/portable font outlines, joined letters and shared backings, automatic wire routing and passage diagnostics, mounting features, more assembly styles, 3MF/plate arrangement, artwork import and canvas editing. No Bambu printer-project export, browser undo history, LED simulation, automatic narrow-stroke diagnostics, or print-volume splitting is claimed in this version.

## Development and verification

```sh
python -m unittest discover -s tests -v
```

Geometry tests invoke real OpenSCAD to check closed edges, positive volume, counters/islands, visible dimensions, diffuser print orientation and the analytic volume of the stepped fit coupon. API tests cover validation, source escaping and project round trips. CI installs OpenSCAD and DejaVu fonts on Ubuntu and runs the suite.

The server uses Python's standard library, binds only to loopback, checks Host/Origin, limits request size and rendering concurrency, passes arguments without a shell, and times out each render after 120 seconds. It is **not a public hosting service**. Recent builds live in temporary storage (up to 12) and disappear when the server exits; save your kit/project downloads. Host/Origin checks intentionally prevent remote proxy access.

Initial validation: 9 automated checks passed with OpenSCAD 2021.01. JavaScript syntax checks passed. A live visual browser check could not be completed in the implementation environment because browser access timed out; perform a browser smoke test locally before relying on the interface.

## Multicolor contour faces and 3MF

Contour faces now contain separate **Text** and **Border / background** regions, including letter counters. They are complementary full-thickness solids with no overlapping volume or clearance gap: print them together as one multicolor face. Choose a translucent material for the text and opaque material for the border to make the lettering light up. This is not a loose press-fit lettering kit.

The Body, Text / diffuser and Border color controls affect both the preview and the **Download colored 3MF** button. Colors are preserved in saved projects; old projects receive default colors. The 3MF contains named parts and base-material color metadata, with the face regions grouped and aligned on Z=0. The body is a separate object beside the face. Arrange those two objects for your printer; keep the face's text and border together.

This is standard 3MF, not a Bambu Studio printer project. Slicers may ask you to assign each named part to an actual filament/AMS slot. Color metadata does not select printer-specific filaments. The ZIP also includes aligned `text_region.stl` and `border_region.stl`; import both as parts of the same object. `diffuser.stl` and `diffuser.svg` remain the full single-color face/cutting outline. A contour margin must exceed wall thickness plus face clearance to avoid clipping the lettering.


### More enclosures and wiring

Styles now include separate letters, convex contour, **close contour**, and **rectangular lightbox**. Close contour offsets the artwork and smooths small gaps; disconnected letters may remain separate if the enclosure margin is too small. Increase margin or reduce spacing to join them. Rectangular bounds follow the actual glyph extents. All enclosure styles retain complementary text and border faces in the colored 3MF.

Wiring is optional and disabled in existing projects by default. A rear hole cuts through the back at a specified X/Y coordinate. The horizontal cable passage is a round bore above the back, through each wall along its Y coordinate, including both exterior sides. It does not create a physical conduit across gaps between separate letters. Diameter is shared by the rear hole and passage. Validation keeps the passage below the face ledge.

Coordinates use the OpenSCAD artwork origin (X right, Y up from the front), not a bounding-box corner. Hide the face and inspect the rear before printing: a rear hole outside the shape or inside a counter can miss the cavity. Wiring controls do not auto-route, check LED collisions, or certify cable clearance. Mounting is not yet included.
