"""Renders the Campuslit mark to brand/logo.svg and the extension icons.

A navy tile, a white "C" ring and a gold spark in its opening ("lit").
Run:  python scripts/make-logo.py        (needs Pillow; output is committed, so this is only for changing the mark)
"""
import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NAVY, WHITE, GOLD = (11, 29, 64, 255), (255, 255, 255, 255), (242, 184, 75, 255)

# geometry on a 128 grid
TILE_R = 30
CX, CY, R, STROKE = 56, 64, 30, 13
GAP = 35                      # half-opening of the C, in degrees
SPARK_X, SPARK_R = 98, 8.5


def svg():
    sx, sy = CX + R * math.cos(math.radians(GAP)), CY + R * math.sin(math.radians(GAP))
    ex, ey = sx, CY - R * math.sin(math.radians(GAP))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Campuslit">
  <rect width="128" height="128" rx="{TILE_R}" fill="#0b1d40"/>
  <path d="M{sx:.2f} {sy:.2f}A{R} {R} 0 1 1 {ex:.2f} {ey:.2f}" fill="none" stroke="#fff" stroke-width="{STROKE}" stroke-linecap="round"/>
  <circle cx="{SPARK_X}" cy="{CY}" r="{SPARK_R}" fill="#f2b84b"/>
</svg>
'''


def render(size, scale=8):
    big = size * scale
    k = big / 128
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, big - 1, big - 1], radius=TILE_R * k, fill=NAVY)
    ro = R + STROKE / 2          # PIL draws the stroke inward from the outer edge
    box = [(CX - ro) * k, (CY - ro) * k, (CX + ro) * k, (CY + ro) * k]
    d.arc(box, GAP, 360 - GAP, fill=WHITE, width=round(STROKE * k))
    for a in (GAP, -GAP):     # round caps
        x, y = CX + R * math.cos(math.radians(a)), CY + R * math.sin(math.radians(a))
        r = STROKE / 2 * k
        d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill=WHITE)
    r = SPARK_R * k
    d.ellipse([SPARK_X * k - r, CY * k - r, SPARK_X * k + r, CY * k + r], fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


os.makedirs(os.path.join(ROOT, 'brand'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'extension', 'icons'), exist_ok=True)
with open(os.path.join(ROOT, 'brand', 'logo.svg'), 'w', encoding='utf8') as f:
    f.write(svg())
render(512).save(os.path.join(ROOT, 'brand', 'logo-512.png'))
for size in (16, 32, 48, 128):
    render(size).save(os.path.join(ROOT, 'extension', 'icons', f'icon-{size}.png'))
print('wrote brand/logo.svg, brand/logo-512.png and extension/icons/icon-*.png')
