# 슈퍼스타 카트 3D 캐릭터 — 코덱스 앞·뒤 그림 → 무료 Hunyuan3D-2mv(허깅페이스)로 모양 → 1만 2천 면으로 줄이기
# 색은 게임에서 원래 앞·뒤 그림을 앞뒤로 투영해 입힌다(kart.js). 결과:
#   public/kart/chars3d/cXX.glb, cXX-f.jpg, cXX-b.jpg  +  public/kart/char3d.js(있는 캐릭터와 그림 속 영역)
# 사용: python tools/kart-3d.py <원본 시트 폴더(img)> [c01 c02 ...]
#   무료 사용량(ZeroGPU)이 모자라면 exit 3 과 기다릴 시간을 출력한다. HF_TOKEN 환경변수가 있으면 더 많이 쓴다.
import sys, os, json, glob, shutil, re
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'kart', 'chars3d')
WORK = os.path.join(HERE, 'kart-3d-work')
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
SRC = sys.argv[1]
src = open(os.path.join(HERE, 'kart-assets.py'), encoding='utf-8').read()
ns = {'__file__': os.path.join(HERE, 'kart-assets.py')}
exec(src.split("def src(name):")[0].replace("SRC = sys.argv[1]", "SRC = ''"), ns)
cutout, bbox = ns['cutout'], ns['bbox']

def pad_colors(im):
    # 투명한 가장자리에 옆 색을 번지게 채운다(모서리에서 흰 테두리가 비치지 않게)
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    out = a[..., :3].copy(); filled = a[..., 3] > 200; k = np.ones((3, 3), np.float32)
    for _ in range(40):
        acc = cv2.filter2D(out * filled[..., None], -1, k); ww = cv2.filter2D(filled.astype(np.float32), -1, k)
        new = (~filled) & (ww > 0)
        out[new] = acc[new] / ww[new, None]; filled = filled | new
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))

def rect(im):
    b = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox(); W, H = im.size
    return [round(b[0] / W, 4), round(b[1] / H, 4), round(b[2] / W, 4), round(b[3] / H, 4)]

def prep(cid):
    f = glob.glob(os.path.join(SRC, cid + '-*.png'))
    if not f: raise SystemExit(f'{cid}: 원본 시트 없음')
    im = Image.open(f[0]); W, H = im.size; res = {}
    for nm, box in (('front', (0, 0, W // 2, H)), ('back', (W // 2, 0, W, H))):
        c = cutout(im.crop(box)); c = c.crop(bbox(c))
        s = max(c.size) + 80; can = Image.new('RGBA', (s, s), (255, 255, 255, 0)); can.paste(c, ((s - c.width) // 2, (s - c.height) // 2), c)
        can.save(os.path.join(WORK, f'{cid}-{nm}.png')); res[nm] = rect(can)
        pad_colors(can).resize((768, 768), Image.LANCZOS).save(os.path.join(OUT, f'{cid}-{nm[0]}.jpg'), quality=88)
    return res

def shape(cid):
    from gradio_client import Client, handle_file
    tok = os.environ.get('HF_TOKEN')
    if not tok:
        try:
            from huggingface_hub import get_token; tok = get_token()  # 형님이 hf auth login 해 둔 로그인
        except Exception: tok = None
    c = Client('tencent/Hunyuan3D-2mv', verbose=False, **({'token': tok} if tok else {}))
    try:
        r = c.predict(caption=None, image=None, mv_image_front=handle_file(os.path.join(WORK, f'{cid}-front.png')), mv_image_back=handle_file(os.path.join(WORK, f'{cid}-back.png')),
                      mv_image_left=None, mv_image_right=None, steps=20, guidance_scale=5.0, seed=1234, octree_resolution=256, check_box_rembg=True, num_chunks=8000, randomize_seed=False, api_name='/shape_generation')
    except Exception as e:
        m = re.search(r'Try again in ([0-9:]+)', str(e))
        if 'quota' in str(e).lower(): print('QUOTA', m.group(1) if m else '?'); sys.exit(3)
        raise
    p = r[0]['value'] if isinstance(r[0], dict) else r[0]
    dst = os.path.join(WORK, f'{cid}-shape.glb'); shutil.copy(p, dst); return dst

def decimate(cid, path):
    import pymeshlab, trimesh
    import tempfile
    tmp = tempfile.mkdtemp()  # pymeshlab은 한글 경로를 못 쓴다 → 영문 임시 폴더를 거친다
    tin = os.path.join(tmp, 'in.glb'); shutil.copy(path, tin)
    ms = pymeshlab.MeshSet(); ms.load_new_mesh(tin)
    ms.meshing_remove_duplicate_vertices(); ms.meshing_remove_unreferenced_vertices()
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=12000, preservenormal=True, preservetopology=False, qualitythr=0.4)
    obj = os.path.join(tmp, 'out.obj'); ms.save_current_mesh(obj)
    trimesh.load(obj, process=False).export(os.path.join(OUT, f'{cid}.glb'))

def same_char(a, b):
    # 두 그림이 같은 캐릭터인지: 투명 아닌 부분의 색 분포(HSV) 비교
    def h(im):
        x = np.asarray(im.convert('RGBA')); m = (x[..., 3] > 128).astype(np.uint8)
        hsv = cv2.cvtColor(np.ascontiguousarray(x[..., :3]), cv2.COLOR_RGB2HSV); hh = cv2.calcHist([hsv], [0, 1], m, [24, 16], [0, 180, 0, 256]); cv2.normalize(hh, hh); return hh
    return float(cv2.compareHist(h(a), h(b), cv2.HISTCMP_CORREL))

def extras(cid, xdir):
    # 옆모습(s)·어지러운 얼굴(h)·우승 얼굴(w): 코덱스가 앞모습을 참고해 그린 것. 다른 그림이 섞였으면 건너뛴다
    res = {}; front = Image.open(os.path.join(WORK, f'{cid}-front.png'))
    for key, nm in (('s', 'side'), ('h', 'hitf'), ('w', 'winf')):
        p = os.path.join(xdir, f'{cid}-{nm}.png')
        if not os.path.exists(p): continue
        c = cutout(Image.open(p)); c = c.crop(bbox(c))
        sim = same_char(front, c)
        if sim < 0.45: print(cid, nm, '다른 그림 같아서 건너뜀', round(sim, 2)); continue
        s = max(c.size) + 80; can = Image.new('RGBA', (s, s), (255, 255, 255, 0)); can.paste(c, ((s - c.width) // 2, (s - c.height) // 2), c)
        res[key] = rect(can); pad_colors(can).resize((768, 768), Image.LANCZOS).save(os.path.join(OUT, f'{cid}-{key}.jpg'), quality=88)
        print(cid, nm, 'OK', round(sim, 2))
    return res

man_p = os.path.join(OUT, 'rects.json')
man = json.load(open(man_p)) if os.path.exists(man_p) else {}
XDIR = os.environ.get('XDIR')  # 코덱스 추가 그림 폴더(있으면 옆모습·표정도)
ids = sys.argv[2:] or [f'c{i:02d}' for i in range(1, 11)]
for cid in ids:
    if os.path.exists(os.path.join(OUT, f'{cid}.glb')) and cid in man:
        if XDIR: man[cid].update(extras(cid, XDIR)); json.dump(man, open(man_p, 'w'), indent=0)
        print(cid, '이미 있음', sorted(man[cid].keys())); continue
    rc = prep(cid)
    sp = os.path.join(WORK, f'{cid}-shape.glb')
    if not os.path.exists(sp): sp = shape(cid)
    decimate(cid, sp); man[cid] = rc
    json.dump(man, open(man_p, 'w'), indent=0); print(cid, 'OK', rc)
with open(os.path.join(HERE, '..', 'public', 'kart', 'char3d.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/kart-3d.py가 만든 목록 — 손으로 고치지 말 것. f/b = 앞·뒤 그림 속 캐릭터 영역 [x0,y0,x1,y1]\n')
    f.write('export const CHAR3D = ' + json.dumps({k: {'f': v['front'], 'b': v['back'], **{x: v[x] for x in ('s', 'h', 'w') if x in v}} for k, v in man.items()}) + ';\n')
print('char3d', list(man.keys()))
