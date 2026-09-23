# 슈퍼스타 카트 배경 실사 에셋 가공 — 코덱스 결과를 코스 질감·잎 카드·원경으로
# 사용: python tools/kart-env.py <원본폴더>   (있는 파일만, 여러 번 돌려도 됨)
#  t-*  → tex/tex-*.webp 1024 (이음새 없애기 + 예전 질감과 평균 밝기 맞춤)
#  c-*  → tex/leaf-*.webp (마젠타 배경 → 투명, 예전 카드와 같은 크기)
#  bg-* → tex/bg-*.webp 2048x1152 (하늘=투명, 좌우 이어지게)
import sys, os, json, importlib.util
import numpy as np
from PIL import Image
SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, '..', 'public', 'kart', 'tex')
ORIG = os.path.join(HERE, 'kart-tex-orig')  # 처음 질감(밝기 기준) 보관
os.makedirs(ORIG, exist_ok=True)
# kart-assets.py는 실행 스크립트라 필요한 함수만 복사해 쓴다
src = open(os.path.join(HERE, 'kart-assets.py'), encoding='utf-8').read()
ns = {"__file__": os.path.join(HERE, "kart-assets.py")}
exec(src.split("def src(name):")[0].replace("SRC = sys.argv[1]", "SRC = ''"), ns)
cutout, bbox = ns['cutout'], ns['bbox']

def lum(a): return (a[..., :3].astype(np.float32) * [0.3, 0.59, 0.11]).sum(-1)
def seamless(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32); H, W = a.shape[:2]
    b = np.roll(np.roll(a, H // 2, 0), W // 2, 1)
    y, x = np.mgrid[0:H, 0:W]; w = np.maximum(np.abs(x / (W - 1) - 0.5), np.abs(y / (H - 1) - 0.5)) * 2
    w = np.clip((w - 0.55) / 0.4, 0, 1); w = w * w * (3 - 2 * w)
    return Image.fromarray((a * (1 - w[..., None]) + b * w[..., None]).clip(0, 255).astype(np.uint8))
def save(im, name, q=85):
    im.save(os.path.join(TEX, name + '.webp'), 'WEBP', quality=q, method=4); print('  ->', name)

def get(n):
    p = os.path.join(SRC, n + '.png')
    try: im = Image.open(p) if os.path.exists(p) else None; im and im.load(); return im
    except Exception: return None  # 아직 쓰는 중인 파일

for n in ('asphalt', 'asphalt-wet', 'sand', 'grass', 'dirt', 'rock', 'bark', 'blossom'):
    im = get('t-' + n)
    if not im: continue
    cur = os.path.join(TEX, f'tex-{n}.webp'); keep = os.path.join(ORIG, f'tex-{n}.webp')
    if os.path.exists(cur) and not os.path.exists(keep): Image.open(cur).save(keep)
    out = seamless(im).resize((1024, 1024), Image.LANCZOS)
    ref = keep if os.path.exists(keep) else (os.path.join(ORIG, 'tex-asphalt.webp') if n == 'asphalt-wet' else None)
    if ref and os.path.exists(ref):
        a = np.asarray(out).astype(np.float32); m0 = lum(np.asarray(Image.open(ref).convert('RGB'))).mean(); m1 = lum(a).mean()
        k = m0 / max(1, m1)
        if n == 'asphalt-wet': k *= 0.7
        # 밝기만 맞추고 대비는 사진 그대로(너무 튀면 0.6~1.6 안으로)
        out = Image.fromarray((a * min(1.6, max(0.6, k))).clip(0, 255).astype(np.uint8))
    save(out, f'tex-{n}')

CARD = {'palm': (1024, 340, 'mid'), 'cherry': (512, 512, 'mid'), 'grass': (1024, 400, 'bottom'), 'pine': None}
for n, sz in CARD.items():
    im = get('c-' + n)
    if not im: continue
    cur = os.path.join(TEX, f'leaf-{n}.webp'); keep = os.path.join(ORIG, f'leaf-{n}.webp')
    if os.path.exists(cur) and not os.path.exists(keep): Image.open(cur).save(keep)
    if sz is None: w0, h0 = Image.open(keep).size if os.path.exists(keep) else (512, 512); sz = (w0, h0, 'mid')
    W, H, al = sz
    c = cutout(im); c = c.crop(bbox(c))
    sc = min(W / c.width, H / c.height); c = c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.LANCZOS)
    can = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    can.paste(c, ((W - c.width) // 2, H - c.height if al == 'bottom' else (H - c.height) // 2), c)
    save(can, f'leaf-{n}', 90)

env = []
for n in ('beach', 'blossom', 'neon'):
    im = get('bg-' + n)
    if not im: continue
    c = cutout(im, inner=(n != 'neon')).resize((2048, 1152), Image.LANCZOS)  # 네온 간판 분홍은 지우지 않게
    a = np.asarray(c).astype(np.float32); B = 200; W = a.shape[1]
    t = np.linspace(0, 1, B)[None, :, None]
    head = a[:, W - B:] * (1 - t) + a[:, :B] * t  # 오른쪽 끝 → 왼쪽 처음으로 스르르
    a2 = np.concatenate([head, a[:, B:W - B]], 1)
    out = Image.fromarray(a2.clip(0, 255).astype(np.uint8), 'RGBA').resize((2048, 1152), Image.LANCZOS)
    save(out, f'bg-{n}', 86); env.append(f'bg-{n}')
# 이미 있는 원경도 목록에
for n in ('beach', 'blossom', 'neon'):
    if f'bg-{n}' not in env and os.path.exists(os.path.join(TEX, f'bg-{n}.webp')): env.append(f'bg-{n}')
with open(os.path.join(HERE, '..', 'public', 'kart', 'env.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/kart-env.py가 만든 목록 — 손으로 고치지 말 것\nexport const ENV_ART = ' + json.dumps(sorted(env)) + ';\n')
print('env', env)
