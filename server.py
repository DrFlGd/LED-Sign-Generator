#!/usr/bin/env python3
"""Local-only, dependency-free web service around the OpenSCAD geometry core."""
import argparse
import functools
import io
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import threading
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DEFAULTS = dict(sign_text="GLOW", font_name="DejaVu Sans:style=Bold", height=80,
                spacing=1.05, style="letters", margin=6, depth=30, wall=1.6,
                back=1.6, face=1.2, clearance=0.2, ledge=1.2, recess=0, body_color="#294650", text_color="#ffe4a6", border_color="#294650")
LIMITS = dict(height=(20,300), spacing=(0.7,2), margin=(2,30), depth=(8,150),
              wall=(0.8,6), back=(0.8,6), face=(0.5,5), clearance=(0,1),
              ledge=(0.5,5), recess=(0,15))
OPENSCAD = os.environ.get("OPENSCAD", "openscad")
BUILD_LOCK = threading.Lock()
CACHE = tempfile.TemporaryDirectory(prefix="led-sign-")

@functools.lru_cache(maxsize=1)
def fonts():
    fallback = ["DejaVu Sans:style=Bold", "DejaVu Sans", "DejaVu Serif:style=Bold",
                "DejaVu Serif", "DejaVu Sans Mono:style=Bold", "Liberation Sans:style=Bold"]
    try:
        result = subprocess.run(["fc-list", "--format", "%{family[0]}:style=%{style[0]}\\n"],
                                capture_output=True, text=True, timeout=10, check=True)
        return sorted(set(fallback + [s for s in result.stdout.splitlines() if s]))
    except (OSError, subprocess.SubprocessError):
        return fallback

def validate(raw):
    if not isinstance(raw, dict):
        raise ValueError("Project must be a JSON object.")
    if "version" in raw:
        if raw["version"] != 1 or raw.get("format") != "led-sign-generator":
            raise ValueError("Unsupported project format or version.")
        raw = raw.get("settings")
        if not isinstance(raw, dict):
            raise ValueError("Project settings must be an object.")
    if set(raw) - set(DEFAULTS):
        raise ValueError("Project contains unrecognized settings.")
    p = {**DEFAULTS, **raw}
    if not isinstance(p["sign_text"], str) or not p["sign_text"].strip() or len(p["sign_text"]) > 24:
        raise ValueError("Enter 1–24 characters of text.")
    if any(ord(c) < 32 for c in p["sign_text"]):
        raise ValueError("Use a single line of text without control characters.")
    if not isinstance(p["font_name"], str) or p["font_name"] not in fonts():
        raise ValueError("Choose an installed font. Install custom fonts on your computer, then restart.")
    if p["style"] not in ("letters", "contour"):
        raise ValueError("Choose separate letters or convex contour.")
    for key in ("body_color", "text_color", "border_color"):
        if not isinstance(p[key], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", p[key]):
            raise ValueError("Colors must be six-digit hex values.")
    for key, (low, high) in LIMITS.items():
        value = p[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f"{key} must be between {low} and {high} mm (spacing is a multiplier).")
    if p["style"] == "contour" and p["margin"] <= p["wall"] + p["clearance"]:
        raise ValueError("Contour margin must exceed wall thickness plus clearance to preserve the lettering.")
    if p["ledge"] <= p["clearance"]:
        raise ValueError("Support ledge must be wider than face clearance.")
    if p["depth"] - p["recess"] - p["face"] <= p["back"] + 2:
        raise ValueError("Increase depth: the LED cavity needs more than 2 mm above the back.")
    return p

def project(p):
    return dict(format="led-sign-generator", version=1, settings=p)

def source(p):
    # Replace known assignments in the canonical core, retaining Customizer comments.
    code = (ROOT / "scad/lightbox.scad").read_text()
    for key, value in p.items():
        code = re.sub(rf"^{key} = .*?;", lambda m: f"{key} = {json.dumps(value, ensure_ascii=False)};", code, flags=re.M)
    return code

def render(scad, out, part):
    cmd = [OPENSCAD, "-o", str(out), "-D", f'part="{part}"']
    if out.suffix == ".stl":
        cmd += ["--export-format", "binstl"]
    result = subprocess.run(cmd + [str(scad)], capture_output=True, text=True, timeout=120)
    if result.returncode or "ERROR:" in result.stderr or not out.exists() or out.stat().st_size < 84:
        raise ValueError(f"OpenSCAD could not build {part}. Try larger, bolder text or thinner walls. " + result.stderr[-1500:])
    return result.stderr

def mesh_info(path):
    data = path.read_bytes()
    n = struct.unpack_from("<I", data, 80)[0]
    if not n or len(data) != 84 + 50*n:
        raise ValueError("OpenSCAD returned an empty or invalid mesh.")
    low, high = [math.inf]*3, [-math.inf]*3
    for i in range(n):
        coords = struct.unpack_from("<9f", data, 84 + 50*i + 12)
        for k, v in enumerate(coords):
            j = k % 3
            low[j], high[j] = min(low[j],v), max(high[j],v)
    return dict(triangles=n, minimum=low, maximum=high,
                size=[round(high[i]-low[i],3) for i in range(3)])

def build(p):
    token = uuid.uuid4().hex
    folder = Path(CACHE.name) / token
    folder.mkdir()
    try:
        scad = folder / "sign.scad"
        scad.write_text(source(p))
        info = {}
        for part in (("body", "diffuser", "fit_body", "fit_diffuser") + (("text_region", "border_region") if p["style"] == "contour" else ())):
            render(scad, folder/f"{part}.stl", part)
            info[part] = mesh_info(folder/f"{part}.stl")
        render(scad, folder/"diffuser.svg", "cutting")
        (folder/"project.json").write_text(json.dumps(project(p), indent=2))
        (folder/"ASSEMBLY.txt").write_text(assembly_notes(p, info))
        with zipfile.ZipFile(folder/"print-kit.zip", "w", zipfile.ZIP_DEFLATED) as z:
            for path in sorted(folder.iterdir()):
                if path.suffix != ".zip":
                    z.write(path, path.name)
        # Keep the last 12 completed builds; all cache is temporary and removed on exit.
        completed = sorted((d for d in Path(CACHE.name).iterdir() if (d/"print-kit.zip").exists()), key=lambda d:d.stat().st_mtime)
        for old in completed[:-12]:
            shutil.rmtree(old)
        return dict(id=token, parts=info, settings=p, seat=p["depth"]-p["recess"]-p["face"],
                    warnings=["Thin strokes, tiny islands and narrow LED cavities require inspection in your slicer.",
                              "Print the fit coupon first; the default clearance is a starting point.",
                              "Wire passages and mounting holes are not included in this version."])
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise

def assembly_notes(p, info):
    return f'''LED SIGN GENERATOR — PRINT & ASSEMBLY
Text: {p['sign_text']}
Font: {p['font_name']} (install the same font to regenerate sign.scad)
Body dimensions: {' × '.join(map(str,info['body']['size']))} mm
Depth: {p['depth']} mm; face: {p['face']} mm; recess: {p['recess']} mm
Wall: {p['wall']} mm; back: {p['back']} mm; per-side clearance: {p['clearance']} mm

For contour signs, text_region.stl and border_region.stl are complementary
full-thickness face regions, including enclosed letter counters. Import together
as parts of one object; do not arrange them separately. Print as one multi-material
face. diffuser.stl is the single-color combined fallback. Use the app's colored
3MF download to retain alignment and named color regions. Assign filaments in
your slicer as needed; 3MF colors are not printer-specific AMS assignments.

1. Print fit_body.stl and fit_diffuser.stl; test fit before the full sign.
2. Print body.stl back-down (Z=0). Separate letters are disconnected shells;
   use your slicer's split-to-objects command if you want to arrange them.
3. Print diffuser.stl flat (Z=0) in a light-transmitting material, or cut
   diffuser.svg from sheet of the configured face thickness. SVG units are mm;
   no kerf compensation is applied. Confirm scale in your cutting software.
4. Inspect thin strokes, counters and LED space. No automatic printability
   certification is performed. The ledge reduces the lower cavity width.
5. Plan wire exits and mounting before printing; these are not generated yet.
6. Install appropriate low-voltage LEDs, test illumination, then seat the face.
   The face rests on a ledge; this is a clearance fit, not a snap-lock. Secure
   with a suitable removable adhesive if needed. Fit and heat behavior depend
   on your printer, materials and LED choice.

sign.scad is self-contained and editable in OpenSCAD. Choose body or diffuser
in its Part control, render (F6), then export. Project JSON reopens in the app.
'''

class Handler(BaseHTTPRequestHandler):
    def send(self, data, status=200, mime="application/json"):
        if not isinstance(data, bytes):
            data = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def local_request(self):
        expected = f"{self.server.server_address[0]}:{self.server.server_address[1]}"
        permitted = {expected, f"localhost:{self.server.server_address[1]}"}
        if self.headers.get("Host") not in permitted:
            self.send({"error":"Local requests only."},403)
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in {"http://"+h for h in permitted}:
            self.send({"error":"Cross-origin requests are not allowed."},403)
            return False
        return True

    def do_GET(self):
        if not self.local_request(): return
        path = urlsplit(self.path).path
        if path == "/api/config":
            self.send(dict(defaults=DEFAULTS, fonts=fonts(), openscad=bool(shutil.which(OPENSCAD))))
        elif re.fullmatch(r"/build/[a-f0-9]{32}/(body.stl|diffuser.stl|text_region.stl|border_region.stl|fit_body.stl|fit_diffuser.stl|diffuser.svg|sign.scad|project.json|print-kit.zip)", path):
            file = Path(CACHE.name) / path.removeprefix("/build/")
            if file.is_file():
                self.send(file.read_bytes(), mime=mimetypes.guess_type(file.name)[0] or "application/octet-stream")
            else: self.send({"error":"Build expired. Generate again."},404)
        elif path in ("/", "/index.html", "/style.css", "/app.js", "/viewer.js", "/backend.js", "/model.js", "/three-mf.js"):
            file = ROOT / "web" / ("index.html" if path == "/" else path[1:])
            self.send(file.read_bytes(), mime=mimetypes.guess_type(file.name)[0] or "text/plain")
        else: self.send({"error":"Not found"},404)

    def do_POST(self):
        if not self.local_request(): return
        if self.path not in ("/api/build", "/api/validate", "/api/scad"):
            return self.send({"error":"Not found"},404)
        try:
            size = int(self.headers.get("Content-Length",0))
            if not 0 < size <= 16384: raise ValueError("Project is too large or empty.")
            p = validate(json.loads(self.rfile.read(size)))
            if self.path == "/api/validate": return self.send(p)
            if self.path == "/api/scad": return self.send(source(p).encode(), mime="text/plain")
            if not BUILD_LOCK.acquire(blocking=False):
                return self.send({"error":"Another model is rendering. Please try again shortly."},409)
            try: self.send(build(p))
            finally: BUILD_LOCK.release()
        except (ValueError, TypeError) as exc: self.send({"error":str(exc)},400)
        except FileNotFoundError: self.send({"error":"OpenSCAD is not installed or not on PATH. See README."},503)
        except subprocess.TimeoutExpired: self.send({"error":"Render exceeded 120 seconds. Shorten the text or simplify the font."},422)
        except OSError as exc: self.send({"error":f"File or renderer error: {exc}"},500)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port",type=int,default=8000)
    args = parser.parse_args()
    print(f"LED Sign Generator: http://127.0.0.1:{args.port}",flush=True)
    try: ThreadingHTTPServer(("127.0.0.1",args.port),Handler).serve_forever()
    except KeyboardInterrupt: pass
