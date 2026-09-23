# 슈퍼스타 카트 그림 가공: 코덱스가 뽑은 마젠타 배경 캐릭터 시트(좌=앞, 우=뒤)를
# 투명 배경 480x640 두 장으로 자르고, 하늘·바닥·키아트는 webp로 줄인다.
# 사용: python tools/kart-sprites.py <원본폴더>
import sys, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'kart')
os.makedirs(os.path.join(OUT, 'chars'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
MAP = {'c01-baseball': 'c01', 'c02-basketball': 'c02', 'c03-soccer': 'c03', 'c04-idol-singer': 'c04', 'c05-idol-dancer': 'c05',
       'c06-taekwondo': 'c06', 'c07-figure-skater': 'c07', 'c08-pro-gamer': 'c08', 'c09-skateboarder': 'c09', 'c10-archer': 'c10'}

def key_out(im):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = np.minimum(r, b) - g                      # 마젠타일수록 큼
    cand = ((key > 70) & (r > 120) & (b > 120)).astype(np.uint8) * 255
    m = Image.fromarray(cand, 'L').copy()  # fromarray는 읽기 전용이라 floodfill이 조용히 무시된다
    W, H = m.size
    # 가장자리에서 이어진 마젠타만 배경 (옷의 분홍은 살린다)
    for x, y in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (0, H // 2), (W - 1, H // 2)]:
        if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    bg = np.asarray(m) == 128
    near = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    alpha = np.where(bg, 0.0, 1.0)
    fr = near & ~bg
    soft = np.clip((190 - key) / 130.0, 0, 1)
    alpha = np.where(fr, np.minimum(alpha, soft), alpha)
    # 번짐 제거: 테두리의 분홍기를 초록 쪽으로 눌러 준다
    spill = np.clip(np.minimum(r, b) - g, 0, None) * (fr | (key > 40) & near)
    rr = np.clip(r - spill * 0.75, 0, 255); bb = np.clip(b - spill * 0.75, 0, 255)
    out = np.dstack([rr, g, bb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

for name, cid in MAP.items():
    p = os.path.join(SRC, name + '.png')
    im = key_out(Image.open(p))
    W, H = im.size
    halves = [im.crop((0, 0, W // 2, H)), im.crop((W // 2, 0, W, H))]
    boxes = [h.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox() for h in halves]
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    for h, v in zip(halves, ['front', 'back']):
        c = h.crop((x0, y0, x1, y1))
        sc = min(470 / c.width, 632 / c.height)
        c = c.resize((max(1, round(c.width * sc)), max(1, round(c.height * sc))), Image.LANCZOS)
        can = Image.new('RGBA', (480, 640), (0, 0, 0, 0))
        can.paste(c, ((480 - c.width) // 2, 640 - c.height), c)
        can.save(os.path.join(OUT, 'chars', f'{cid}-{v}.webp'), 'WEBP', quality=86, method=6)
    print(cid, 'ok', boxes)

for n, size, q in [('sky-beach', (2048, 1152), 82), ('sky-neon', (2048, 1152), 82), ('sky-blossom', (2048, 1152), 82), ('keyart', (1536, 1024), 84),
                   ('tex-asphalt', (512, 512), 80), ('tex-grass', (512, 512), 80), ('tex-sand', (512, 512), 80), ('tex-neon', (512, 512), 80)]:
    p = os.path.join(SRC, n + '.png')
    if not os.path.exists(p): print('없음', n); continue
    Image.open(p).convert('RGB').resize(size, Image.LANCZOS).save(os.path.join(OUT, 'tex', n + '.webp'), 'WEBP', quality=q, method=6)
    print(n, 'ok')
