"""Vẽ icon app (quả bóng trắng trên nền xanh đội) — chạy: python scripts/gen-icons.py
Sinh ra trong public/: favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

GREEN = '#15803d'  # green-700 — màu chủ đạo của app
DARK = '#14532d'  # green-900 — mảng đen trên quả bóng
OUT = Path(__file__).resolve().parent.parent / 'public'


def pent(cx, cy, r, rot=-90):
    return [(cx + r * math.cos(math.radians(rot + 72 * i)), cy + r * math.sin(math.radians(rot + 72 * i))) for i in range(5)]


def ball_shapes(c, R):
    """Hình học quả bóng tâm c, bán kính R: ngũ giác giữa, 5 đường may, 5 mảng ở viền."""
    center = pent(c, c, R * 0.34)
    spokes = [(center[i], (c + R * math.cos(math.radians(-90 + 72 * i)), c + R * math.sin(math.radians(-90 + 72 * i)))) for i in range(5)]
    patches = [pent(c + R * 0.98 * math.cos(math.radians(-54 + 72 * i)), c + R * 0.98 * math.sin(math.radians(-54 + 72 * i)), R * 0.32, rot=-54 + 72 * i + 180) for i in range(5)]
    return center, spokes, patches


def draw_png(size, rounded, ball_ratio):
    S = size * 4  # vẽ to rồi thu nhỏ cho mịn cạnh
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=GREEN)
    else:
        d.rectangle([0, 0, S, S], fill=GREEN)
    c, R = S / 2, S * ball_ratio
    ball = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    b = ImageDraw.Draw(ball)
    b.ellipse([c - R, c - R, c + R, c + R], fill='white')
    center, spokes, patches = ball_shapes(c, R)
    for p in patches:
        b.polygon(p, fill=DARK)
    for p0, p1 in spokes:
        b.line([p0, p1], fill=DARK, width=max(2, int(R * 0.07)))
    b.polygon(center, fill=DARK)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse([c - R, c - R, c + R, c + R], fill=255)
    img.paste(ball, (0, 0), Image.composite(ball, Image.new('RGBA', (S, S)), mask).split()[3])
    return img.resize((size, size), Image.LANCZOS)


def svg():
    c, R = 32, 21
    center, spokes, patches = ball_shapes(c, R)
    f = lambda pts: ' '.join(f'{x:.2f},{y:.2f}' for x, y in pts)
    lines = ''.join(f'<line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{e[0]:.2f}" y2="{e[1]:.2f}"/>' for a, e in spokes)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="14" fill="{GREEN}"/>'
        f'<clipPath id="b"><circle cx="{c}" cy="{c}" r="{R}"/></clipPath>'
        f'<circle cx="{c}" cy="{c}" r="{R}" fill="#fff"/>'
        f'<g clip-path="url(#b)" fill="{DARK}">' + ''.join(f'<polygon points="{f(p)}"/>' for p in patches) + '</g>'
        f'<g stroke="{DARK}" stroke-width="1.5">{lines}</g>'
        f'<polygon points="{f(center)}" fill="{DARK}"/>'
        '</svg>\n'
    )


if __name__ == '__main__':
    (OUT / 'favicon.svg').write_text(svg(), encoding='utf-8')
    draw_png(192, True, 0.33).save(OUT / 'icon-192.png')
    draw_png(512, True, 0.33).save(OUT / 'icon-512.png')
    # maskable: Android tự cắt hình tròn/giọt nước → nền tràn viền, bóng nằm trong vùng an toàn 80%
    draw_png(512, False, 0.28).save(OUT / 'icon-maskable-512.png')
    # iOS tự bo góc → để nền vuông
    draw_png(180, False, 0.33).save(OUT / 'apple-touch-icon.png')
    print('Đã tạo icon trong', OUT)
