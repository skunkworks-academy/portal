"""Measure bidirectional motion between existing illustrated poses.

No character artwork is generated or changed. The PNG contains displacement
vectors (data, not display art) used to move pixels between the original poses.
Requires Pillow, numpy and opencv-python-headless. See requirements-motion.txt.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
metadata = ROOT/'src/skunkie-motion.json'
config = json.loads(metadata.read_text())
flow_config = config['flow']
width, height = flow_config['width'], flow_config['height']
extent = flow_config['range']
atlas_config = config['atlas']
atlas_path = ROOT/'public'/atlas_config['source'].lstrip('/')
atlas = Image.open(atlas_path).convert('RGBA')
frames = []
landmarks = []
for index in range(atlas_config['frameCount']):
    x, y = index % atlas_config['columns'] * 288, index // atlas_config['columns'] * 384
    cell = atlas.crop((x,y,x+288,y+384)).resize((width,height), Image.Resampling.BICUBIC)
    rgba = np.asarray(cell, dtype=np.float32)/255
    hsv = cv2.cvtColor(np.uint8(rgba[:,:,:3]*255),cv2.COLOR_RGB2HSV)
    cyan = ((hsv[:,:,0]>80)&(hsv[:,:,0]<115)&(hsv[:,:,1]>130)&(hsv[:,:,2]>100)&(rgba[:,:,3]>.8)).astype(np.uint8)
    count,_,areas,centres = cv2.connectedComponentsWithStats(cyan)
    parts = [(centres[k],areas[k,4]) for k in range(1,count) if areas[k,4]>3]
    chest = max((p for p in parts if 40<p[0][0]<105 and 75<p[0][1]<125),key=lambda p:p[1])[0]
    hands = {}
    for side in (-1,1):
        candidates = [p for p in parts if 45<p[0][1]<chest[1]+40 and (p[0][0]-chest[0])*side>10]
        if candidates: hands[side]=max(candidates,key=lambda p:p[1])[0]
    landmarks.append(hands)
    rgb = rgba[:,:,:3]*rgba[:,:,3:] + .5*(1-rgba[:,:,3:])
    frames.append(cv2.cvtColor(np.uint8(np.clip(rgb*255,0,255)),cv2.COLOR_RGB2GRAY))
pairs = set()
for sequence in config['sequences'].values():
    indices = sequence['frames']
    pairs.update(tuple(sorted((a,b))) for a,b in zip(indices,indices[1:]+indices[:1]) if a != b)
# Every pose can settle to the neutral frame before entering another activity.
pairs.update((0,index) for index in range(1,atlas_config['frameCount']))
pairs = sorted(pairs)
cols = flow_config['columns']
rows = math.ceil(len(pairs)/cols)
encoded = np.full((rows*height,cols*width*2,3),128,dtype=np.uint8)
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
dis.setFinestScale(0)
dis.setGradientDescentIterations(40)
dis.setVariationalRefinementIterations(10)
stats = []
cv2.setNumThreads(2)
yy,xx = np.mgrid[0:height,0:width].astype(np.float32)
def anchor_hands(field,source,target):
    """Constrain large hand movements using the existing cyan palm rings.

    Plain intensity matching can confuse a dark hand with a stationary leg.
    These matched landmarks guide displacement; no pixels are repainted.
    """
    if not (24 <= source <= 29 and 24 <= target <= 29): return field
    result=field.copy()
    for side,point in landmarks[source].items():
        destination=landmarks[target].get(side)
        if destination is None: continue
        delta=destination-point
        if np.linalg.norm(delta)<8: continue
        distance=((xx-point[0])**2+(yy-point[1])**2)
        weight=np.exp(-(distance/(22**2))**2).astype(np.float32)
        result=result*(1-weight[:,:,None])+delta*weight[:,:,None]
    return result
for index,(a,b) in enumerate(pairs):
    forward = cv2.GaussianBlur(anchor_hands(dis.calc(frames[a],frames[b],None),a,b),(0,0),3)
    backward = cv2.GaussianBlur(anchor_hands(dis.calc(frames[b],frames[a],None),b,a),(0,0),3)
    data = np.concatenate((forward,backward),axis=2)
    assert np.isfinite(data).all()
    peak = float(np.max(np.abs(data)))
    assert peak < extent, f'{a}->{b}: flow exceeds encoded range: {peak}'
    # 128 encodes exact zero. Signed data is never premultiplied as image alpha.
    packed = np.uint8(np.clip(np.round(data/extent*127+128),1,255))
    x,y = index%cols*width*2,index//cols*height
    # RGB, always opaque: browser image decoding must never premultiply vector
    # components as alpha. Forward and backward fields occupy adjacent cells.
    encoded[y:y+height,x:x+width,:2] = packed[:,:,:2]
    encoded[y:y+height,x+width:x+width*2,:2] = packed[:,:,2:]
    stats.append({'from':a,'to':b,'peakDisplacementPixels':round(peak,2)})
buffer = io.BytesIO()
Image.fromarray(encoded).save(buffer,format='PNG',optimize=True)
digest = hashlib.sha256(buffer.getvalue()).hexdigest()
flow_config['source'] = f'/assets/skunkie/skunkie-flow-{digest[:12]}.png'
path = ROOT/'public'/flow_config['source'].lstrip('/')
path.write_bytes(buffer.getvalue())
assert np.array_equal(np.asarray(Image.open(path)),encoded)
flow_config.update(rows=rows,pairs=pairs)
metadata.write_text(json.dumps(config,indent=2)+'\n')
report = {'ok':True,'opencv':cv2.__version__,'pairs':len(pairs),'bytes':path.stat().st_size,
          'atlasSha256':hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
          'flowSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'edges':stats}
(ROOT/'docs/skunkie-motion-flow-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k != 'edges'},indent=2))
