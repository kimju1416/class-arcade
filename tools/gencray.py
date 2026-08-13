# -*- coding: utf-8 -*-
"""물풍선 대작전 그래픽 생성 (OpenAI Images API) — genchars.py와 같은 키 재사용.

생성물 (public/sprites/):
  crayballoon.png  물풍선 (투명, 셀 크기)
  craybox.png      부서지는 상자 타일 (투명)
  crayblock.png    안 부서지는 블록 타일 (투명)
  floor-cray.jpg   맵 전체 바닥 배경 (밝은 잔디 체크)
"""
import os, sys, json, time, base64, urllib.request, urllib.error, io
try:
    import truststore; truststore.inject_into_ssl()
except Exception:
    pass
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "sprites")

KEY = os.environ.get("OPENAI_API_KEY")
if not KEY:
    _cfg = json.load(open(os.path.expanduser("~/.claude.json"), encoding="utf-8"))
    for proj in _cfg.get("projects", {}).values():
        srv = proj.get("mcpServers", {}).get("imagegen", {})
        if srv.get("env", {}).get("OPENAI_API_KEY"):
            KEY = srv["env"]["OPENAI_API_KEY"]; break
if not KEY:
    sys.exit("OPENAI_API_KEY 없음")

STYLE = (" Cute 8-bit retro pixel-art game asset, bold clean outline, bright cheerful colors, "
         "flat shading, centered, fully transparent background, no text, no shadow on ground.")

JOBS = [
    ("crayballoon", "A single round blue water balloon bomb with a small knotted tip on top and a shiny highlight, like a water bubble bomb from a classic arcade bomberman game." + STYLE, "png", 256),
    ("craybox",     "A single square wooden crate block tile viewed from the front, light brown planks with cross pattern, fills the whole square frame edge to edge." + STYLE, "png", 256),
    ("crayblock",   "A single square indestructible stone-steel block tile viewed from the front, cool gray with rivets and beveled edges, fills the whole square frame edge to edge." + STYLE, "png", 256),
    ("floor-cray",  "Seamless top-down game map background of a bright light-green grass field with a subtle soft checkerboard pattern of two very close light green tones, no objects, no border, uniform tile pattern filling the entire image. Cute pixel-art style, soft colors.", "jpg", 1024),
]

def api(payload, timeout=300, tries=4):
    last = None
    for i in range(tries):
        req = urllib.request.Request(
            "https://api.openai.com/v1/images/generations",
            data=json.dumps(payload).encode(),
            headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            last = e
            print("  HTTP", e.code, e.read().decode("utf-8", "ignore")[:200], flush=True)
            if e.code < 500 and e.code != 429:
                raise
        except Exception as e:
            last = e
        if i < tries - 1:
            w = 5 * (2 ** i); print(f"  retry after {w}s", flush=True); time.sleep(w)
    raise last

for name, prompt, fmt, size in JOBS:
    out = os.path.join(OUT, name + ("." + ("jpg" if fmt == "jpg" else "png")))
    if os.path.exists(out):
        print("skip", name); continue
    r = api({"model": "gpt-image-1", "prompt": prompt, "size": "1024x1024",
             "quality": "medium", "background": "transparent" if fmt == "png" else "opaque", "n": 1})
    img = Image.open(io.BytesIO(base64.b64decode(r["data"][0]["b64_json"])))
    if fmt == "png":
        img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
        img.save(out)
    else:
        img = img.convert("RGB").resize((size, size), Image.LANCZOS)
        img.save(out, quality=82)
    print("saved", name, os.path.getsize(out))
print("done")
