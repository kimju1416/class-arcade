# 코덱스 한도로 못 뽑은 텍스처를 코드로 그린다: 바위·흙·나무껍질(이음매 없는 타일) + 풀·솔잎(투명 카드)
import os, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'kart', 'tex')
rng = np.random.default_rng(7); random.seed(7)

def tnoise(n, cells, seed):
    """이음매 없는 값 노이즈 (격자를 감아 돈다)"""
    r = np.random.default_rng(seed).random((cells, cells))
    y, x = np.mgrid[0:n, 0:n] / n * cells
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = x - x0; fy = y - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    x1 = (x0 + 1) % cells; y1 = (y0 + 1) % cells; x0 %= cells; y0 %= cells
    a = r[y0, x0]; b = r[y0, x1]; c = r[y1, x0]; d = r[y1, x1]
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy

def fbm(n, base, oct, seed, gain=0.5):
    s = np.zeros((n, n)); amp = 1; tot = 0
    for i in range(oct):
        s += tnoise(n, base * 2 ** i, seed + i) * amp; tot += amp; amp *= gain
    return s / tot

def ridge(n, base, oct, seed):
    return 1 - np.abs(fbm(n, base, oct, seed) * 2 - 1)

def lerp3(a, b, t): return a + (b - a) * t[..., None]
def save(arr, name): Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6)

N = 1024
# 바위: 층진 화강암 + 금 + 이끼
h = fbm(N, 4, 7, 1); cr = ridge(N, 6, 5, 11); lay = fbm(N, 3, 4, 21)
base = lerp3(np.array([96, 90, 84.]), np.array([176, 168, 156.]), h)
base = lerp3(base, np.array([130, 118, 100.]), np.clip(lay * 1.4 - 0.5, 0, 1) * 0.6)
crack = np.clip((cr - 0.94) * 14, 0, 1) * 0.7
base = lerp3(base, np.array([78, 72, 66.]), crack)
moss = np.clip((fbm(N, 5, 5, 31) - 0.58) * 5, 0, 1) * 0.7
base = lerp3(base, np.array([96, 118, 64.]), moss)
# 간단한 빛(노멀 느낌)
gy = np.roll(h, -2, 0) - np.roll(h, 2, 0); gx = np.roll(h, -2, 1) - np.roll(h, 2, 1)
base *= (1 + (gx + gy) * 3.5)[..., None]
save(base, 'tex-rock')

# 흙: 다져진 흙 + 자갈 + 마른 풀
h = fbm(N, 6, 6, 41)
base = lerp3(np.array([112, 82, 56.]), np.array([164, 128, 90.]), h)
im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
for _ in range(1400):
    x, y = random.randrange(N), random.randrange(N); r = random.uniform(2, 7); c = random.randint(120, 190)
    for ox in (0, -N, N):
        for oy in (0, -N, N):
            d.ellipse([x - r + ox, y - r * 0.8 + oy, x + r + ox, y + r * 0.8 + oy], fill=(c, c - 10, c - 22))
for _ in range(900):
    x, y = random.randrange(N), random.randrange(N); a = random.uniform(0, math.pi); l = random.uniform(6, 16)
    d.line([x, y, x + math.cos(a) * l, y + math.sin(a) * l], fill=(170, 150, 90), width=1)
im = im.filter(ImageFilter.GaussianBlur(0.6)); im.save(os.path.join(OUT, 'tex-dirt.webp'), 'WEBP', quality=86, method=6)

# 나무껍질: 세로 결 + 가로 마디
n2 = 512
y, x = np.mgrid[0:n2, 0:n2] / n2
fib = fbm(n2, 8, 5, 51); fib = np.abs(np.sin((x * 22 + fib * 3) * math.pi))
ring = np.clip(np.abs(np.sin((y * 7 + fbm(n2, 4, 3, 61) * 0.6) * math.pi)) ** 18, 0, 1)
base = lerp3(np.array([72, 54, 42.]), np.array([146, 118, 92.]), fib * 0.7 + fbm(n2, 6, 4, 71) * 0.3)
base = lerp3(base, np.array([52, 38, 30.]), ring * 0.8)
save(base, 'tex-bark')

def blade(d, x0, y0, h, lean, w, col):
    pts = []
    for i in range(9):
        t = i / 8
        pts.append((x0 + lean * t * t * h, y0 - t * h))
    for i in range(8):
        ww = w * (1 - i / 8)
        d.line([pts[i], pts[i + 1]], fill=col, width=max(1, int(ww)))

# 풀 카드 (가로로 긴 풀 줄 + 들꽃), 투명 배경
W_, H_ = 1024, 400
im = Image.new('RGBA', (W_, H_), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
for layer in range(3):
    for _ in range(520):
        x = random.uniform(20, W_ - 20); hgt = random.uniform(110, 330) * (0.75 + layer * 0.12)
        g = random.randint(95, 170) + layer * 18
        col = (int(g * 0.45), g, int(g * 0.28), 255)
        blade(d, x, H_ - 2, hgt, random.uniform(-0.35, 0.35), random.uniform(4, 9), col)
for _ in range(34):
    x = random.uniform(40, W_ - 40); y = H_ - random.uniform(120, 260)
    c = random.choice([(255, 226, 90), (255, 255, 250), (255, 150, 200), (190, 160, 255)])
    d.line([x, y, x + random.uniform(-6, 6), H_], fill=(70, 120, 50, 255), width=3)
    for k in range(5):
        a = k / 5 * math.pi * 2; d.ellipse([x + math.cos(a) * 7 - 6, y + math.sin(a) * 7 - 6, x + math.cos(a) * 7 + 6, y + math.sin(a) * 7 + 6], fill=c + (255,))
    d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 190, 40, 255))
im.save(os.path.join(OUT, 'leaf-grass.webp'), 'WEBP', quality=88, method=6)

# 솔잎 뭉치 카드
S = 512
im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
cx, cy = S / 2, S / 2
for _ in range(2600):
    a = random.uniform(0, math.pi * 2); r = abs(random.gauss(0, 0.33)) * S * 0.62
    if r > S * 0.46: continue
    x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.8
    ang = a + random.uniform(-0.6, 0.6); l = random.uniform(16, 34)
    t = 1 - r / (S * 0.46)
    g = int(70 + 70 * t + random.uniform(-15, 15))
    d.line([x, y, x + math.cos(ang) * l, y + math.sin(ang) * l], fill=(int(g * 0.32), g, int(g * 0.4), 255), width=3)
im.save(os.path.join(OUT, 'leaf-pine.webp'), 'WEBP', quality=88, method=6)
print('ok')

# 벚꽃 수관용 이음매 없는 꽃 무더기 텍스처(3D 구에 입힌다)
S = 1024
im = Image.new('RGB', (S, S), (214, 120, 150)); d = ImageDraw.Draw(im)
def flower(cx, cy, r, col, core):
    for k in range(5):
        a = k / 5 * math.pi * 2 + random.uniform(0, 1)
        px, py = cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55
        for ox in (0, -S, S):
            for oy in (0, -S, S):
                d.ellipse([px - r * 0.52 + ox, py - r * 0.52 + oy, px + r * 0.52 + ox, py + r * 0.52 + oy], fill=col)
    for ox in (0, -S, S):
        for oy in (0, -S, S):
            d.ellipse([cx - r * 0.18 + ox, cy - r * 0.18 + oy, cx + r * 0.18 + ox, cy + r * 0.18 + oy], fill=core)
for layer in range(4):
    for _ in range(520 if layer < 3 else 260):
        x, y = random.uniform(0, S), random.uniform(0, S)
        l = 0.72 + layer * 0.09 + random.uniform(-0.05, 0.05)
        base = (255, int(170 + 60 * l * random.uniform(0.85, 1)), int(200 + 40 * l))
        col = tuple(int(min(255, c * (0.78 + 0.22 * l))) for c in base)
        if random.random() < 0.08 and layer < 2: col = (120, 170, 90)  # 사이사이 연두 잎
        flower(x, y, random.uniform(13, 24), col, (255, 205, 120) if col[1] > 150 else col)
im = im.filter(ImageFilter.GaussianBlur(0.5))
im.save(os.path.join(OUT, 'tex-blossom.webp'), 'WEBP', quality=86, method=6)
print('blossom ok')
