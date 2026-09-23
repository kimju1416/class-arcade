# 슈퍼스타 카트 2차 에셋 가공 — 코덱스 결과(마젠타 배경 또는 투명 배경)를 잘라 webp로.
# 사용: python tools/kart-assets.py <원본폴더>   (있는 파일만 처리, 여러 번 돌려도 됨)
#  p01~p10 → chars/cXX-portrait.webp (600x800, 허리 아래 잘림)
#  s01~s10 → chars/cXX-side / -q3f / -q3b .webp (480x640, 왼쪽을 보는 옆·대각 앞·대각 뒤)
#  e01~e10 → chars/cXX-hit / -win .webp (480x640)
#  i-*     → items/<이름>.webp (256)
#  sky-kpop → tex/sky-kpop.webp, logo → logo.webp
import sys, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'kart')
for d in ('chars', 'items', 'tex'): os.makedirs(os.path.join(OUT, d), exist_ok=True)

def cutout(im, inner=True):
    """투명 배경이면 그대로, 마젠타 배경이면 가장자리에서 이어진 마젠타만 지운다."""
    if im.mode == 'RGBA' and np.asarray(im)[..., 3].min() < 10:
        return im
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = np.minimum(r, b) - g
    cand = ((key > 70) & (r > 120) & (b > 120)).astype(np.uint8) * 255
    m = Image.fromarray(cand, 'L').copy()
    W, H = m.size
    for x, y in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (0, H // 2), (W - 1, H // 2), (W // 3, 0), (2 * W // 3, 0)]:
        if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    # 팔·머리카락 사이에 갇힌 마젠타(가장자리와 안 이어짐)도 배경: 아주 진한 순수 마젠타만
    bg = (np.asarray(m) == 128) | (((key > 150) & (np.abs(r - b) < 50)) if inner else False)
    near = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    alpha = np.where(bg, 0.0, 1.0)
    fr = near & ~bg
    alpha = np.where(fr, np.minimum(alpha, np.clip((190 - key) / 130.0, 0, 1)), alpha)
    # 머리카락 끝처럼 반투명하게 마젠타가 비친 곳: 어디든 마젠타 색조면 투명하게·색 빼기
    mag = ((key > 45) & (np.abs(r - b) < 70) & ~bg) if inner else np.zeros_like(bg)
    alpha = np.where(mag, np.minimum(alpha, np.clip(1 - (key - 45) / 110.0, 0, 1)), alpha)
    spill = np.clip(np.minimum(r, b) - g, 0, None) * (fr | mag | (key > 40) & near)
    out = np.dstack([np.clip(r - spill * 0.75, 0, 255), g, np.clip(b - spill * 0.75, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

def bbox(im): return im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
def fit(c, W, H, pad=8):
    sc = min((W - pad) / c.width, (H - pad) / c.height)
    c = c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.LANCZOS)
    can = Image.new('RGBA', (W, H), (0, 0, 0, 0)); can.paste(c, ((W - c.width) // 2, H - c.height), c); return can
def save(im, rel, q=86): im.save(os.path.join(OUT, rel), 'WEBP', quality=q, method=4); print('  ->', rel)
def main_blob(im):
    # 옆 칸에서 넘어온 팔 조각 같은 작은 덩어리는 지우고 가장 큰 덩어리(+큰 것)만 남긴다
    import cv2
    a = np.asarray(im).copy(); n, lab, st, _ = cv2.connectedComponentsWithStats((a[..., 3] > 30).astype(np.uint8), connectivity=8)
    if n <= 2: return im
    sz = st[1:, cv2.CC_STAT_AREA]; keep = [i + 1 for i, v in enumerate(sz) if v >= sz.max() * 0.08]
    a[..., 3] = np.where(np.isin(lab, keep), a[..., 3], 0); return Image.fromarray(a, 'RGBA')
def parts(im, n):
    # 칸 경계는 1/n 자리 근처에서 그림이 가장 적은 세로줄
    W = im.width; col = (np.asarray(im)[..., 3] > 30).sum(0); cuts = [0]
    for i in range(1, n):
        c = i * W // n; w = W // (n * 6); cuts.append(c - w + int(np.argmin(col[c - w:c + w])))
    cuts.append(W)
    hs = [main_blob(im.crop((cuts[i], 0, cuts[i + 1], im.height))) for i in range(n)]
    bbs = [bbox(h) for h in hs]; bbs = [b for b in bbs if b]
    x0 = min(b[0] for b in bbs); y0 = min(b[1] for b in bbs); x1 = max(b[2] for b in bbs); y1 = max(b[3] for b in bbs)
    return [h.crop((x0, y0, x1, y1)) for h in hs]

def src(name):
    p = os.path.join(SRC, name + '.png')
    try: im = Image.open(p) if os.path.exists(p) else None; im and im.load(); return im
    except Exception: return None  # 아직 쓰는 중인 파일

for i in range(1, 11):
    cid = 'c%02d' % i
    im = src('p%02d' % i)
    if im: c = cutout(im); save(fit(c.crop(bbox(c)), 600, 800), f'chars/{cid}-portrait.webp')
    im = src('s%02d' % i)
    if im:
        for v, part in zip(('side', 'q3f', 'q3b'), parts(cutout(im), 3)): save(fit(part, 480, 640), f'chars/{cid}-{v}.webp')
    im = src('e%02d' % i)
    if im:
        for v, part in zip(('hit', 'win'), parts(cutout(im), 2)): save(fit(part, 480, 640), f'chars/{cid}-{v}.webp')
for n in ('boost', 'ball', 'hball', 'banana', 'star', 'mic', 'soccer'):
    im = src('i-' + n)
    if im: c = cutout(im); b = bbox(c); c = c.crop(b); s = max(c.width, c.height); can = Image.new('RGBA', (s, s)); can.paste(c, ((s - c.width) // 2, (s - c.height) // 2), c); save(can.resize((256, 256), Image.LANCZOS), f'items/{n}.webp', 90)
im = src('sky-kpop')
if im: save(im.convert('RGB').resize((1536, 864), Image.LANCZOS), 'tex/sky-kpop.webp', 82)
im = src('logo')
if im: c = cutout(im); save(fit(c.crop(bbox(c)), 1024, 640, 0), 'logo.webp', 90)

# 있는 추가 그림 목록 → kart.js가 없는 파일을 요청하지 않게
import json
ex = {}
for i in range(1, 11):
    cid = 'c%02d' % i
    ex[cid] = [v for v in ('side', 'q3f', 'q3b', 'hit', 'win') if os.path.exists(os.path.join(OUT, 'chars', f'{cid}-{v}.webp'))]
items = [n for n in ('boost', 'ball', 'hball', 'banana', 'star', 'mic', 'soccer') if os.path.exists(os.path.join(OUT, 'items', n + '.webp'))]
with open(os.path.join(OUT, 'extra.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/kart-assets.py가 만든 목록 — 손으로 고치지 말 것\n')
    f.write('export const CHAR_EXTRA = ' + json.dumps(ex) + ';\n')
    f.write('export const ITEM_ART = ' + json.dumps(items) + ';\n')
print('extra.js', sum(len(v) for v in ex.values()), 'items', len(items))
