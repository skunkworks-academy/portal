"""Pack sixteen generated six-pose strips into 96 playable cells. Requires Pillow; draws no artwork.

Run: python scripts/build-skunkie-atlas.py [source-directory]
Original sources default to assets/skunkie-motion-v2; new strips live in
assets/skunkie-motion-v3. Uses connected silhouettes instead
of guessed equal-width cuts, one scale per row, and a shared feet baseline.
"""
import hashlib
import io
import json
import statistics
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT/'assets/skunkie-motion-v2'
ROWS = ['idle', 'waiting', 'running', 'review', 'wave', 'listening', 'speaking', 'idle-alt']
ROWS += ['nod', 'acknowledge', 'wave-small', 'explain-left', 'breathe', 'consider', 'explain-both', 'reassure']
WIDTH, HEIGHT, COLS = 288, 384, 6
ATLAS_COLS, ATLAS_ROWS = 12, 8
FRAME_COUNT = len(ROWS)*COLS

def components(image):
    alpha = image.getchannel('A').tobytes()
    width, height = image.size
    seen = bytearray(len(alpha))
    found = []
    for start, value in enumerate(alpha):
        if value <= 16 or seen[start]:
            continue
        todo, pixels = [start], []
        seen[start] = 1
        while todo:
            index = todo.pop()
            pixels.append(index)
            x, y = index % width, index // width
            for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                other = ny*width+nx
                if 0 <= nx < width and 0 <= ny < height and not seen[other] and alpha[other] > 16:
                    seen[other] = 1
                    todo.append(other)
        if len(pixels) >= 1000:
            xs, ys = [p % width for p in pixels], [p // width for p in pixels]
            found.append((min(xs), min(ys), max(xs)+1, max(ys)+1, len(pixels)))
    assert len(found) == COLS, f'Expected six connected poses; found {len(found)}'
    return sorted(found)

atlas = Image.new('RGBA', (ATLAS_COLS*WIDTH, ATLAS_ROWS*HEIGHT))
frames = []
source_hashes = {}
for row, state in enumerate(ROWS):
    source_path = (SOURCE if row < 8 else ROOT/'assets/skunkie-motion-v3')/f'{state}.png'
    source_hashes[state] = hashlib.sha256(source_path.read_bytes()).hexdigest()
    source = Image.open(source_path).convert('RGBA')
    assert source.getchannel('A').getextrema() == (0, 255), f'{state}: real transparency required'
    boxes = components(source)
    # Same scale across a cycle preserves motion; body height is consistent
    # between cycles. No upscaling of the generated source pixels.
    scale = min(340/statistics.median(b[3]-b[1] for b in boxes),
                (HEIGHT-28)/max(b[3]-b[1] for b in boxes),
                (WIDTH-24)/max(b[2]-b[0] for b in boxes), 1)
    baseline = HEIGHT-18
    for col, (left, top, right, bottom, _) in enumerate(boxes):
        sprite = source.crop((left, top, right, bottom))
        # BICUBIC avoids the faint outer ringing introduced by LANCZOS.
        sprite = sprite.resize((round(sprite.width*scale), round(sprite.height*scale)), Image.Resampling.BICUBIC)
        cell = Image.new('RGBA', (WIDTH, HEIGHT))
        # The silhouette widens when a hand lifts. Anchor to the planted feet,
        # not the bounding box, so arm gestures cannot slide the whole body.
        alpha = sprite.getchannel('A')
        foot_x = [x for y in range(round(sprite.height*.9),sprite.height)
                  for x in range(sprite.width) if alpha.getpixel((x,y)) > 200]
        assert foot_x, f'{state}/{col}: missing feet registration'
        anchor = statistics.mean(foot_x)
        cell.alpha_composite(sprite, (round(WIDTH/2-anchor), baseline-sprite.height))
        # Zero RGB underneath transparency for deterministic lossless encoding.
        pixels = [(r,g,b,a) if a else (0,0,0,0) for r,g,b,a in cell.getdata()]
        cell.putdata(pixels)
        bounds = cell.getchannel('A').getbbox()
        assert bounds and bounds[0] >= 10 and bounds[1] >= 10 and bounds[2] <= WIDTH-10 and bounds[3] <= HEIGHT-10
        visible = sum(p[3] > 16 for p in pixels)
        opaque = sum(p[3] >= 250 for p in pixels)
        assert visible > 10000 and opaque/visible > .85, f'{state}/{col}: sparse or translucent body'
        index = row*COLS+col
        atlas.paste(cell, (index%ATLAS_COLS*WIDTH, index//ATLAS_COLS*HEIGHT))
        frames.append({'index':row*COLS+col, 'state':state, 'column':col, 'bounds':bounds,
                       'visiblePixels':visible, 'opaqueRatio':round(opaque/visible,4),
                       'sha256':hashlib.sha256(cell.tobytes()).hexdigest()})

assert len({f['sha256'] for f in frames}) == FRAME_COUNT, 'Duplicate artwork'
target = ROOT/'public/assets/skunkie/skunkie-motion-atlas-v3.webp'
encoded = io.BytesIO()
atlas.save(encoded, format='WEBP', lossless=True, method=6, exact=True)
temporary = target.with_suffix('.tmp')
temporary.write_bytes(encoded.getvalue())
temporary.replace(target)
# Validate exact encoded bytes, including every cell and the still fallback.
decoded = Image.open(target).convert('RGBA')
assert decoded.tobytes() == atlas.tobytes(), 'Lossless round-trip failed'
decoded.crop((0,0,WIDTH,HEIGHT)).save(ROOT/'public/assets/skunkie/skunkie-motion-still-v3.webp', lossless=True, method=6, exact=True)
report = {'ok':True, 'columns':ATLAS_COLS,'rows':ATLAS_ROWS,'cellWidth':WIDTH,'cellHeight':HEIGHT,
          'frameCount':FRAME_COUNT, 'previousPlayableFrameCount':48, 'additionalPlayableFrames':48,
          'blankFrames':0,'duplicateFrames':0,'clippedFrames':0,
          'sourceSha256':source_hashes,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
          'bytes':target.stat().st_size,'frames':frames}
(ROOT/'docs/skunkie-avatar-v3-validation.json').write_text(json.dumps(report,indent=2)+'\n')
qa = ROOT/'outputs/skunkie-avatar-v3'
qa.mkdir(parents=True,exist_ok=True)
sheet = Image.new('RGB',(6*144,len(ROWS)*212),'#f1f5f8')
draw = ImageDraw.Draw(sheet)
for row,state in enumerate(ROWS):
    draw.text((6,row*212+4),state,fill='#172333')
    for col in range(COLS):
        index = row*COLS+col
        x,y = index%ATLAS_COLS*WIDTH,index//ATLAS_COLS*HEIGHT
        cell = decoded.crop((x,y,x+WIDTH,y+HEIGHT)).resize((144,192),Image.Resampling.BICUBIC)
        sheet.paste(cell,(col*144,row*212+20),cell)
sheet.save(qa/'contact-sheet.png')
sheet.crop((0,8*212,6*144,len(ROWS)*212)).save(qa/'new-48-frames.png')
print(json.dumps({k:v for k,v in report.items() if k not in ('frames','sourceSha256')},indent=2))
