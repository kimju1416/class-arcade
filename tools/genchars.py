# -*- coding: utf-8 -*-
"""교실 아케이드 캐릭터 30종 생성 (OpenAI Images API, 픽셀아트 아바타, 투명 배경).

사용:
  python genchars.py test          # 1종(야구선수)만 생성해 키·스타일 검증
  python genchars.py               # 30종 전체 생성 (이미 있으면 건너뜀)

결과: public/sprites/chars/<slug>.png  (512x512 투명)
키: 환경변수 OPENAI_API_KEY 우선, 없으면 ~/.claude.json imagegen MCP env 재사용 (genimg.py와 동일).
"""
import os, sys, json, time, base64, urllib.request, urllib.error
try:
    import truststore; truststore.inject_into_ssl()
except Exception:
    pass
from PIL import Image
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "sprites", "chars")
os.makedirs(OUT, exist_ok=True)

KEY = os.environ.get("OPENAI_API_KEY")
if not KEY:
    try:
        _cfg = json.load(open(os.path.expanduser("~/.claude.json"), encoding="utf-8"))
        for proj in _cfg.get("projects", {}).values():
            srv = proj.get("mcpServers", {}).get("imagegen", {})
            if srv.get("env", {}).get("OPENAI_API_KEY"):
                KEY = srv["env"]["OPENAI_API_KEY"]; break
    except Exception as e:
        print("claude.json read failed:", repr(e)[:120])
if not KEY:
    sys.exit("OPENAI_API_KEY를 찾을 수 없음 (환경변수 또는 ~/.claude.json imagegen)")

# (slug, 한글이름, 프롬프트 특징)
CHARS = [
    ("baseball",  "야구선수",   "a baseball player wearing a cap and jersey, holding a bat"),
    ("soccer",    "축구선수",   "a soccer player in a team uniform kicking a soccer ball"),
    ("basketball","농구선수",   "a basketball player in a jersey holding a basketball"),
    ("volleyball","배구선수",   "a volleyball player in sportswear about to spike a ball"),
    ("taekwondo", "태권도선수", "a taekwondo athlete in a white dobok with a black belt"),
    ("swimmer",   "수영선수",   "a swimmer wearing goggles and a swim cap"),
    ("runner",    "육상선수",   "a track and field sprinter in running gear"),
    ("gymnast",   "체조선수",   "a gymnast in a leotard doing a pose"),
    ("skier",     "스키선수",   "a skier in a winter suit with goggles and ski poles"),
    ("tennis",    "테니스선수", "a tennis player holding a racket"),
    ("boxer",     "복싱선수",   "a boxer wearing red boxing gloves"),
    ("cyclist",   "사이클선수", "a cyclist wearing a helmet and racing jersey"),
    ("doctor",    "의사",       "a friendly doctor in a white coat with a stethoscope"),
    ("nurse",     "간호사",     "a nurse in a uniform with a nurse cap"),
    ("chef",      "요리사",     "a chef wearing a white chef hat and apron"),
    ("firefighter","소방관",    "a firefighter in a red helmet and uniform"),
    ("police",    "경찰관",     "a police officer in a blue uniform and cap"),
    ("astronaut", "우주인",     "an astronaut in a white space suit and helmet"),
    ("scientist", "과학자",     "a scientist in a lab coat holding a flask"),
    ("painter",   "화가",       "an artist holding a palette and paintbrush wearing a beret"),
    ("singer",    "가수",       "a pop singer holding a microphone"),
    ("farmer",    "농부",       "a farmer wearing a straw hat and overalls"),
    ("pilot",     "파일럿",     "an airline pilot in a uniform with a captain hat"),
    ("soldier",   "군인",       "a soldier in a green military uniform and beret"),
    ("judge",     "판사",       "a judge in a black robe holding a gavel"),
    ("carpenter", "목수",       "a carpenter with a tool belt holding a hammer"),
    ("fisher",    "어부",       "a fisherman in a yellow raincoat holding a fish"),
    ("dancer",    "발레리나",   "a ballerina in a pink tutu"),
    ("magician",  "마술사",     "a magician in a top hat and cape"),
    ("teacher",   "선생님",     "a school teacher holding a book, friendly smile"),
]

STYLE = (" . Cute chibi pixel-art character, 8-bit retro video game sprite, "
         "single character centered, front-facing, full body, bold clean outline, "
         "bright cheerful colors, flat shading, fully transparent background, "
         "no text, no ground shadow, no border.")

def api(path, payload, timeout=300, tries=4):
    last = None
    for i in range(tries):
        req = urllib.request.Request(
            "https://api.openai.com/v1/" + path,
            data=json.dumps(payload).encode(),
            headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            last = e
            body = e.read().decode("utf-8", "ignore")[:300]
            print(f"  HTTP {e.code}: {body}", flush=True)
            if e.code < 500 and e.code != 429:
                raise
        except Exception as e:
            last = e
        if i < tries - 1:
            w = 5 * (2 ** i); print(f"  retry {i+1} after {w}s", flush=True); time.sleep(w)
    raise last

def gen(slug, kor, feat):
    out = os.path.join(OUT, slug + ".png")
    if os.path.exists(out):
        print("skip", slug); return
    prompt = "A " + feat + STYLE
    r = api("images/generations", {
        "model": "gpt-image-1", "prompt": prompt,
        "size": "1024x1024", "quality": "medium",
        "background": "transparent", "n": 1})
    b64 = r["data"][0]["b64_json"]
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    img = img.resize((512, 512), Image.LANCZOS)
    img.save(out)
    print("saved", slug, kor, os.path.getsize(out))

if __name__ == "__main__":
    targets = CHARS
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        targets = CHARS[:1]
    elif len(sys.argv) > 1:
        want = set(sys.argv[1:]); targets = [c for c in CHARS if c[0] in want]
    fails = []
    for slug, kor, feat in targets:
        try:
            gen(slug, kor, feat)
        except Exception as e:
            fails.append(slug); print("FAIL", slug, repr(e)[:200], flush=True)
    # 매니페스트(클라이언트가 읽을 캐릭터 목록) 갱신
    man = [{"slug": c[0], "name": c[1]} for c in CHARS if os.path.exists(os.path.join(OUT, c[0] + ".png"))]
    json.dump(man, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("manifest:", len(man), "chars")
    if fails:
        print("FAILED:", " ".join(fails)); sys.exit(1)
