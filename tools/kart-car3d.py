# 슈퍼스타 카트 3D 차 — 코덱스가 그린 차 4방향(옆·앞·뒤·위) → 무료 Hunyuan3D-2mv로 모양 → 1만 6천 면
# 색은 게임에서 네 방향 그림을 비춰 입힌다(car3dview.js). 흰 차체는 캐릭터 색으로 물들인다.
# 결과: public/kart/cars3d/<차>.glb, <차>-s/f/b/t.jpg + public/kart/car3d.js
# 사용: python tools/kart-car3d.py <코덱스 차 그림 폴더> [kart f1 gt buggy classic]
import sys, os, json, shutil, re, tempfile
import numpy as np
from PIL import Image, ImageOps
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'kart', 'cars3d')
WORK = os.path.join(HERE, 'kart-3d-work')
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
SRC = sys.argv[1]
src = open(os.path.join(HERE, 'kart-assets.py'), encoding='utf-8').read()
ns = {'__file__': os.path.join(HERE, 'kart-assets.py')}
exec(src.split("def src(name):")[0].replace("SRC = sys.argv[1]", "SRC = ''"), ns)
cutout, bbox = ns['cutout'], ns['bbox']

def pad_colors(im):
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    out = a[..., :3].copy(); filled = a[..., 3] > 200; k = np.ones((3, 3), np.float32)
    for _ in range(40):
        acc = cv2.filter2D(out * filled[..., None], -1, k); ww = cv2.filter2D(filled.astype(np.float32), -1, k)
        new = (~filled) & (ww > 0); out[new] = acc[new] / ww[new, None]; filled = filled | new
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))

def rect(im):
    b = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox(); W, H = im.size
    return [round(b[0] / W, 4), round(b[1] / H, 4), round(b[2] / W, 4), round(b[3] / H, 4)]

def prep(car):
    res = {}
    for v in ('side', 'front', 'back', 'top'):
        c = cutout(Image.open(os.path.join(SRC, f'{car}-{v}.png'))); c = c.crop(bbox(c))
        s = max(c.size) + 80; can = Image.new('RGBA', (s, s), (255, 255, 255, 0)); can.paste(c, ((s - c.width) // 2, (s - c.height) // 2), c)
        can.save(os.path.join(WORK, f'car-{car}-{v}.png')); res[v[0]] = rect(can)
        pad_colors(can).resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, f'{car}-{v[0]}.jpg'), quality=88)
    # 오른쪽 옆모습 = 왼쪽 옆모습 좌우 반전(차는 좌우 대칭)
    ImageOps.mirror(Image.open(os.path.join(WORK, f'car-{car}-side.png'))).save(os.path.join(WORK, f'car-{car}-right.png'))
    return res

def shape(car):
    from gradio_client import Client, handle_file
    tok = os.environ.get('HF_TOKEN')
    if not tok:
        try:
            from huggingface_hub import get_token; tok = get_token()  # 형님이 hf auth login 해 둔 로그인
        except Exception: tok = None
    c = Client('tencent/Hunyuan3D-2mv', verbose=False, **({'token': tok} if tok else {}))
    w = lambda v: handle_file(os.path.join(WORK, f'car-{car}-{v}.png'))
    try:
        # 코덱스 옆모습(앞이 화면 왼쪽)은 차의 왼쪽 옆면(+x 쪽에서 본 모습) → left, 반전본 → right
        r = c.predict(caption=None, image=None, mv_image_front=w('front'), mv_image_back=w('back'), mv_image_left=w('side'), mv_image_right=w('right'),
                      steps=20, guidance_scale=5.0, seed=1234, octree_resolution=256, check_box_rembg=True, num_chunks=8000, randomize_seed=False, api_name='/shape_generation')
    except Exception as e:
        m = re.search(r'Try again in ([0-9:]+)', str(e))
        if 'quota' in str(e).lower(): print('QUOTA', m.group(1) if m else '?'); sys.exit(3)
        raise
    p = r[0]['value'] if isinstance(r[0], dict) else r[0]
    dst = os.path.join(WORK, f'car-{car}-shape.glb'); shutil.copy(p, dst); return dst

def decimate(car, path):
    import pymeshlab, trimesh
    tmp = tempfile.mkdtemp(); tin = os.path.join(tmp, 'in.glb'); shutil.copy(path, tin)
    ms = pymeshlab.MeshSet(); ms.load_new_mesh(tin)
    ms.meshing_remove_duplicate_vertices(); ms.meshing_remove_unreferenced_vertices()
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=16000, preservenormal=True, preservetopology=False, qualitythr=0.4)
    obj = os.path.join(tmp, 'out.obj'); ms.save_current_mesh(obj)
    trimesh.load(obj, process=False).export(os.path.join(OUT, f'{car}.glb'))

man_p = os.path.join(OUT, 'rects.json')
man = json.load(open(man_p)) if os.path.exists(man_p) else {}
for car in (sys.argv[2:] or ['kart', 'f1', 'gt', 'buggy', 'classic']):
    if os.path.exists(os.path.join(OUT, f'{car}.glb')) and car in man: print(car, '이미 있음'); continue
    rc = prep(car)
    sp = os.path.join(WORK, f'car-{car}-shape.glb')
    if not os.path.exists(sp): sp = shape(car)
    decimate(car, sp); man[car] = rc
    json.dump(man, open(man_p, 'w'), indent=0); print(car, 'OK', rc)
with open(os.path.join(HERE, '..', 'public', 'kart', 'car3d.js'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('// tools/kart-car3d.py가 만든 목록 — 손으로 고치지 말 것. s/f/b/t = 옆·앞·뒤·위 그림 속 차 영역 [x0,y0,x1,y1]\n')
    f.write('export const CAR3D = ' + json.dumps(man) + ';\n')
print('car3d', list(man.keys()))
