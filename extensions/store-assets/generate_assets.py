#!/usr/bin/env python3
"""Generate Chrome Web Store marketing assets for Opalite extensions."""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Brand colors ────────────────────────────────────────
BG       = (11, 12, 16)       # #0B0C10
BG_CARD  = (17, 24, 39)       # #111827
BORDER   = (31, 41, 55)       # #1f2937
WHITE    = (255, 255, 255)
GRAY     = (156, 163, 175)    # #9ca3af
DGRAY    = (107, 114, 128)    # #6b7280
DDGRAY   = (75, 85, 99)       # #4b5563
ROSE     = (244, 63, 94)      # #f43f5e
ORANGE   = (249, 115, 22)     # #f97316
YELLOW   = (234, 179, 8)      # #eab308
GREEN    = (34, 197, 94)      # #22c55e

def lerp_color(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))

def gradient_color(t):
    """3-stop gradient: rose → orange → yellow"""
    if t < 0.5:
        return lerp_color(ROSE, ORANGE, t * 2)
    return lerp_color(ORANGE, YELLOW, (t - 0.5) * 2)

def draw_gradient_rect(draw, box, direction='horizontal'):
    x0, y0, x1, y1 = box
    if direction == 'horizontal':
        for x in range(x0, x1):
            t = (x - x0) / max(1, x1 - x0 - 1)
            draw.line([(x, y0), (x, y1)], fill=gradient_color(t))
    else:
        for y in range(y0, y1):
            t = (y - y0) / max(1, y1 - y0 - 1)
            draw.line([(x0, y), (x1, y)], fill=gradient_color(t))

def draw_rounded_rect(draw, box, radius, fill=None, outline=None):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline)

def get_font(size, bold=False):
    """Get the best available font."""
    paths = [
        "/System/Library/Fonts/SFPro-Bold.otf" if bold else "/System/Library/Fonts/SFPro-Regular.otf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except:
                continue
    return ImageFont.load_default()

def draw_gradient_text(img, pos, text, font, width=None):
    """Draw text with gradient fill."""
    txt_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    txt_draw = ImageDraw.Draw(txt_layer)
    txt_draw.text(pos, text, font=font, fill=WHITE)

    bbox = txt_draw.textbbox(pos, text, font=font)
    tw = bbox[2] - bbox[0]

    grad_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    grad_draw = ImageDraw.Draw(grad_layer)
    for x in range(bbox[0], bbox[2]):
        t = (x - bbox[0]) / max(1, tw - 1)
        c = gradient_color(t)
        grad_draw.line([(x, bbox[1]), (x, bbox[3])], fill=(*c, 255))

    # Use txt_layer as mask for gradient
    result = Image.composite(grad_layer, Image.new('RGBA', img.size, (0,0,0,0)), txt_layer)
    img.paste(result, mask=result)

def add_glow(img, cx, cy, radius, color, intensity=0.15):
    """Add a soft radial glow."""
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for r in range(radius, 0, -2):
        alpha = int(255 * intensity * (r / radius))
        c = (*color, alpha)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=c)
    img.paste(Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB'), (0,0))

def draw_grid(draw, w, h, spacing=40, color=(255,255,255)):
    """Draw subtle grid pattern."""
    alpha = 5
    c = (*color, alpha) if len(color) == 3 else color
    grid_color = (color[0], color[1], color[2], 5) if len(color) == 3 else color
    # For RGB images, use very dark lines
    line_color = tuple(max(0, BG[i] + 3) for i in range(3))
    for x in range(0, w, spacing):
        draw.line([(x, 0), (x, h)], fill=line_color, width=1)
    for y in range(0, h, spacing):
        draw.line([(0, y), (w, y)], fill=line_color, width=1)

def draw_logo_mark(draw, cx, cy, size):
    """Draw the Opalite 'O' logo mark."""
    r = size // 2
    # Gradient fill approximation
    for dy in range(-r, r+1):
        for dx in range(-r, r+1):
            dist = math.sqrt(dx*dx + dy*dy)
            if dist <= r:
                corner_r = size // 5
                # Simple rounded rect check
                ax, ay = abs(dx), abs(dy)
                in_rect = True
                if ax > r - corner_r and ay > r - corner_r:
                    cdist = math.sqrt((ax - (r-corner_r))**2 + (ay - (r-corner_r))**2)
                    in_rect = cdist <= corner_r
                if in_rect:
                    t = (dx + r) / (2 * r)
                    c = gradient_color(t)
                    draw.point((cx + dx, cy + dy), fill=c)

# ═══════════════════════════════════════════════════════════
# PROMO TILES (440 × 280)
# ═══════════════════════════════════════════════════════════

def create_promo_tile(name, platform_text, filename):
    W, H = 440, 280
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Accent line at top
    draw_gradient_rect(draw, (0, 0, W, 3))

    # Subtle glows
    add_glow(img, W - 80, 80, 200, ROSE, 0.08)
    add_glow(img, 80, H - 60, 180, ORANGE, 0.06)

    # Logo mark
    logo_y = 95
    draw_rounded_rect(draw, (196, logo_y-24, 244, logo_y+24), 12, fill=None)
    # Draw gradient logo
    for y in range(logo_y-24, logo_y+24):
        for x in range(196, 244):
            t = (x - 196) / 48
            # Check rounded corners
            cx, cy = 220, logo_y
            ax, ay = abs(x - cx), abs(y - cy)
            if ax > 12 and ay > 12:
                cdist = math.sqrt((ax - 12)**2 + (ay - 12)**2)
                if cdist > 12:
                    continue
            draw.point((x, y), fill=gradient_color(t))

    # 'O' letter
    font_o = get_font(28, bold=True)
    bbox = draw.textbbox((0, 0), "O", font=font_o)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((220 - tw//2, logo_y - th//2 - 2), "O", font=font_o, fill=WHITE)

    # Extension name
    font_name = get_font(28, bold=True)
    # Draw name parts
    parts = name.split(' ', 1)
    highlight = parts[0]
    suffix = ' ' + parts[1] if len(parts) > 1 else ''

    full_text = name
    bbox = draw.textbbox((0, 0), full_text, font=font_name)
    tw = bbox[2] - bbox[0]
    x_start = (W - tw) // 2
    y_name = 140

    # Draw highlight part with gradient
    draw_gradient_text(img, (x_start, y_name), highlight, font_name)
    draw = ImageDraw.Draw(img)  # Refresh draw after paste

    # Draw suffix in white
    if suffix:
        h_bbox = draw.textbbox((0, 0), highlight, font=font_name)
        hw = h_bbox[2] - h_bbox[0]
        draw.text((x_start + hw, y_name), suffix, font=font_name, fill=WHITE)

    # Tagline
    font_tag = get_font(13)
    tag = "Save AI images. Organize. Upscale. Share."
    bbox = draw.textbbox((0, 0), tag, font=font_tag)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, 178), tag, font=font_tag, fill=GRAY)

    # Bottom left - by Opalite Studios
    font_sm = get_font(10)
    draw.text((16, H - 28), "by Opalite Studios", font=font_sm, fill=DDGRAY)

    # Bottom right - platform
    bbox = draw.textbbox((0, 0), platform_text, font=font_sm)
    tw = bbox[2] - bbox[0]
    draw.text((W - 16 - tw, H - 28), platform_text, font=font_sm, fill=DGRAY)

    path = os.path.join(OUT, filename)
    img.save(path, 'PNG')
    print(f"  Created: {path}")
    return img

# ═══════════════════════════════════════════════════════════
# SCREENSHOTS (1280 × 800)
# ═══════════════════════════════════════════════════════════

def draw_platform_label(draw, name, w):
    font_b = get_font(13, bold=True)
    font_r = get_font(13)
    # Logo square
    for y in range(20, 48):
        for x in range(24, 52):
            t = (x - 24) / 28
            ax, ay = abs(x - 38), abs(y - 34)
            if ax > 8 and ay > 8:
                if math.sqrt((ax-8)**2 + (ay-8)**2) > 6:
                    continue
            draw.point((x, y), fill=gradient_color(t))
    font_sm = get_font(12, bold=True)
    draw.text((38 - 4, 34 - 7), "O", font=font_sm, fill=WHITE)

    draw.text((60, 27), name, font=font_b, fill=(209, 213, 219))
    bbox = draw.textbbox((0, 0), name, font=font_b)
    nw = bbox[2] - bbox[0]
    draw.text((60 + nw + 8, 27), "|", font=font_r, fill=(55, 65, 81))
    draw.text((60 + nw + 20, 27), "by Opalite", font=font_r, fill=DGRAY)

def create_hero_screenshot(ext_name, platform_badge, filename):
    W, H = 1280, 800
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Grid and glows
    draw_grid(draw, W, H)
    add_glow(img, int(W*0.2), int(H*0.5), 300, ROSE, 0.06)
    add_glow(img, int(W*0.8), int(H*0.2), 250, ORANGE, 0.04)
    add_glow(img, int(W*0.6), int(H*0.8), 220, YELLOW, 0.03)
    draw = ImageDraw.Draw(img)

    # Platform label
    draw_platform_label(draw, ext_name, W)

    # Badge
    font_badge = get_font(12)
    badge_text = platform_badge
    bbox = draw.textbbox((0, 0), badge_text, font=font_badge)
    bw = bbox[2] - bbox[0]
    bx = (W - bw - 32) // 2
    by = 160
    draw_rounded_rect(draw, (bx, by, bx + bw + 32, by + 32), 16,
                       fill=(ROSE[0], ROSE[1], ROSE[2], 25), outline=(*ROSE,))
    # Manual semi-transparent fill
    for y in range(by+1, by+32):
        for x in range(bx+1, bx+bw+31):
            px = img.getpixel((x, y))
            blended = tuple(int(px[i] * 0.85 + ROSE[i] * 0.15) for i in range(3))
            draw.point((x, y), fill=blended)
    draw.text((bx + 16, by + 7), badge_text, font=font_badge, fill=ROSE)

    # Main heading
    font_h1 = get_font(52, bold=True)
    line1 = "Save AI Images"
    bbox1 = draw.textbbox((0, 0), line1, font=font_h1)
    tw1 = bbox1[2] - bbox1[0]
    draw.text(((W - tw1) // 2, 220), line1, font=font_h1, fill=WHITE)

    line2 = "In One Click"
    bbox2 = draw.textbbox((0, 0), line2, font=font_h1)
    tw2 = bbox2[2] - bbox2[0]
    draw_gradient_text(img, ((W - tw2) // 2, 280), line2, font_h1)
    draw = ImageDraw.Draw(img)

    # Subtitle
    font_sub = get_font(18)
    sub = f"Instantly save images to your Opalite cloud library."
    bbox = draw.textbbox((0, 0), sub, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, 350), sub, font=font_sub, fill=GRAY)

    sub2 = "Organize, upscale, and share — all from one dashboard."
    bbox = draw.textbbox((0, 0), sub2, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, 378), sub2, font=font_sub, fill=GRAY)

    # UI Card mockup
    card_x, card_y = 290, 430
    card_w, card_h = 700, 320
    draw_rounded_rect(draw, (card_x, card_y, card_x+card_w, card_y+card_h), 16,
                       fill=BG_CARD, outline=BORDER)

    # Card header dots
    draw.ellipse([card_x+24, card_y+24, card_x+34, card_y+34], fill=(239,68,68))
    draw.ellipse([card_x+42, card_y+24, card_x+52, card_y+34], fill=YELLOW)
    draw.ellipse([card_x+60, card_y+24, card_x+70, card_y+34], fill=GREEN)

    font_card = get_font(13)
    draw.text((card_x + 84, card_y + 24), "Opalite — Your AI Media Library", font=font_card, fill=DGRAY)

    # Image grid (4x2)
    thumb_size = 130
    thumb_gap = 12
    grid_x = card_x + 30
    grid_y = card_y + 60
    check_positions = [0, 2, 5, 7]  # Which thumbs have checkmarks

    for i in range(8):
        row, col = i // 4, i % 4
        tx = grid_x + col * (thumb_size + thumb_gap)
        ty = grid_y + row * (thumb_size + thumb_gap)

        # Gradient-tinted thumb
        for y in range(ty, ty + thumb_size):
            for x in range(tx, tx + thumb_size):
                t = ((x - tx) + (y - ty)) / (2 * thumb_size)
                base = lerp_color((31, 41, 55), (55, 65, 81), t)
                tint = gradient_color(t)
                blended = tuple(int(base[j] * 0.7 + tint[j] * 0.3) for j in range(3))
                draw.point((x, y), fill=blended)

        draw_rounded_rect(draw, (tx, ty, tx+thumb_size, ty+thumb_size), 8, outline=BORDER)

        # Checkmark on some
        if i in check_positions:
            cx, cy = tx + thumb_size - 14, ty + 14
            draw.ellipse([cx-9, cy-9, cx+9, cy+9], fill=ROSE)
            font_chk = get_font(10, bold=True)
            draw.text((cx-4, cy-6), "✓", font=font_chk, fill=WHITE)

    path = os.path.join(OUT, filename)
    img.save(path, 'PNG', quality=95)
    print(f"  Created: {path}")

def create_features_screenshot(ext_name, platform, filename):
    W, H = 1280, 800
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)

    draw_grid(draw, W, H)
    add_glow(img, 200, 400, 300, ROSE, 0.05)
    add_glow(img, 900, 300, 250, ORANGE, 0.04)
    draw = ImageDraw.Draw(img)

    draw_platform_label(draw, ext_name, W)

    # Left side: feature list
    font_h2 = get_font(38, bold=True)
    draw.text((80, 100), "Everything You Need", font=font_h2, fill=WHITE)
    line2 = "to Manage AI Art"
    draw_gradient_text(img, (80, 148), line2, font_h2)
    draw = ImageDraw.Draw(img)

    features = [
        ("📷", "One-Click Save", f"Automatically detect and save images from {platform}."),
        ("⚡", "AI Upscaling", "Enhance resolution up to 4x with built-in upscaler."),
        ("📁", "Cloud Organization", "Your entire AI image collection in one library."),
        ("🔗", "Easy Sharing", "Share directly from your dashboard."),
    ]

    font_feat_title = get_font(16, bold=True)
    font_feat_desc = get_font(13)

    for i, (icon, title, desc) in enumerate(features):
        fy = 230 + i * 110
        # Icon box
        draw_rounded_rect(draw, (80, fy, 120, fy+40), 10, outline=(*ROSE,))
        # Tint the box
        for y in range(fy+1, fy+40):
            for x in range(81, 120):
                px = img.getpixel((x, y))
                blended = tuple(int(px[j] * 0.9 + ROSE[j] * 0.1) for j in range(3))
                draw.point((x, y), fill=blended)

        font_icon = get_font(18)
        draw.text((90, fy + 8), icon, font=font_icon, fill=WHITE)
        draw.text((136, fy + 2), title, font=font_feat_title, fill=WHITE)
        draw.text((136, fy + 24), desc, font=font_feat_desc, fill=GRAY)

    # Right side: popup mockup
    px, py = 780, 120
    pw, ph = 380, 560
    draw_rounded_rect(draw, (px, py, px+pw, py+ph), 20, fill=BG_CARD, outline=BORDER)

    # Popup header
    # Logo
    for y in range(py+20, py+52):
        for x in range(px+20, px+52):
            t = (x - (px+20)) / 32
            draw.point((x, y), fill=gradient_color(t))
    font_sm_b = get_font(12, bold=True)
    draw.text((px+30, py+29), "O", font=font_sm_b, fill=WHITE)

    font_popup_title = get_font(16, bold=True)
    font_popup_sub = get_font(11)
    draw.text((px+62, py+22), ext_name, font=font_popup_title, fill=WHITE)
    draw.text((px+62, py+42), "by Opalite Studios", font=font_popup_sub, fill=DGRAY)

    # Status bar
    sy = py + 80
    draw_rounded_rect(draw, (px+20, sy, px+pw-20, sy+36), 10, outline=(GREEN[0], GREEN[1], GREEN[2]))
    for y in range(sy+1, sy+36):
        for x in range(px+21, px+pw-20):
            px2 = img.getpixel((x, y))
            blended = tuple(int(px2[j] * 0.92 + GREEN[j] * 0.08) for j in range(3))
            draw.point((x, y), fill=blended)
    draw.ellipse([px+32, sy+12, px+40, sy+20], fill=GREEN)
    font_status = get_font(11)
    draw.text((px+48, sy+10), f"Connected to {platform}", font=font_status, fill=GREEN)

    # Stats
    stat_y = sy + 56
    stat_w = (pw - 52) // 2
    for i, (num, label) in enumerate([("247", "Images Saved"), ("12", "Upscaled")]):
        sx = px + 20 + i * (stat_w + 12)
        draw_rounded_rect(draw, (sx, stat_y, sx+stat_w, stat_y+70), 8, fill=(31,41,55))
        font_num = get_font(24, bold=True)
        bbox = draw.textbbox((0,0), num, font=font_num)
        nw = bbox[2] - bbox[0]
        # Draw num with gradient
        draw_gradient_text(img, (sx + (stat_w-nw)//2, stat_y+12), num, font_num)
        draw = ImageDraw.Draw(img)
        font_label = get_font(10)
        bbox = draw.textbbox((0,0), label, font=font_label)
        lw = bbox[2] - bbox[0]
        draw.text((sx + (stat_w-lw)//2, stat_y+46), label, font=font_label, fill=DGRAY)

    # Usage section
    usage_y = stat_y + 90
    draw.text((px+20, usage_y), "Storage Used", font=get_font(12), fill=GRAY)
    # Progress bar bg
    bar_y = usage_y + 22
    draw_rounded_rect(draw, (px+20, bar_y, px+pw-20, bar_y+8), 4, fill=(31,41,55))
    # Progress bar fill (60%)
    fill_w = int((pw - 40) * 0.6)
    for x in range(px+20, px+20+fill_w):
        t = (x - (px+20)) / fill_w
        draw.point((x, bar_y+1), fill=gradient_color(t))
        draw.point((x, bar_y+2), fill=gradient_color(t))
        draw.point((x, bar_y+3), fill=gradient_color(t))
        draw.point((x, bar_y+4), fill=gradient_color(t))
        draw.point((x, bar_y+5), fill=gradient_color(t))
        draw.point((x, bar_y+6), fill=gradient_color(t))
    draw.text((px+20, bar_y+16), "1.2 GB / 2.0 GB", font=get_font(10), fill=DGRAY)

    # Action button
    btn_y = py + ph - 70
    for y in range(btn_y, btn_y+42):
        for x in range(px+20, px+pw-20):
            t = (x - (px+20)) / (pw - 40)
            draw.point((x, y), fill=gradient_color(t))
    draw_rounded_rect(draw, (px+20, btn_y, px+pw-20, btn_y+42), 10, outline=None)
    font_btn = get_font(14, bold=True)
    btn_text = "Open Dashboard"
    bbox = draw.textbbox((0,0), btn_text, font=font_btn)
    btw = bbox[2] - bbox[0]
    draw.text((px + (pw - btw)//2, btn_y + 12), btn_text, font=font_btn, fill=WHITE)

    path = os.path.join(OUT, filename)
    img.save(path, 'PNG', quality=95)
    print(f"  Created: {path}")

def create_howto_screenshot(ext_name, platform_desc, filename):
    W, H = 1280, 800
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)

    draw_grid(draw, W, H)
    add_glow(img, 640, 400, 350, ROSE, 0.04)
    add_glow(img, 400, 600, 250, ORANGE, 0.03)
    add_glow(img, 900, 300, 200, YELLOW, 0.03)
    draw = ImageDraw.Draw(img)

    draw_platform_label(draw, ext_name, W)

    # Title
    font_h2 = get_font(40, bold=True)
    title1 = "How "
    title_name = ext_name
    title_end = " Works"

    # Measure
    bbox1 = draw.textbbox((0,0), title1, font=font_h2)
    bbox2 = draw.textbbox((0,0), title_name, font=font_h2)
    bbox3 = draw.textbbox((0,0), title_end, font=font_h2)
    total_w = (bbox1[2]-bbox1[0]) + (bbox2[2]-bbox2[0]) + (bbox3[2]-bbox3[0])

    tx = (W - total_w) // 2
    ty = 120
    draw.text((tx, ty), title1, font=font_h2, fill=WHITE)
    nx = tx + (bbox1[2]-bbox1[0])
    draw_gradient_text(img, (nx, ty), title_name, font_h2)
    draw = ImageDraw.Draw(img)
    nx2 = nx + (bbox2[2]-bbox2[0])
    draw.text((nx2, ty), title_end, font=font_h2, fill=WHITE)

    # Steps
    steps = [
        ("1", "Generate Images", platform_desc),
        ("2", "Auto-Detect & Save", f"{ext_name} detects new images and saves them to your Opalite library."),
        ("3", "Manage & Share", "Organize, upscale, and share from one unified dashboard."),
    ]

    step_w = 300
    gap = 60
    total_steps_w = 3 * step_w + 2 * gap
    start_x = (W - total_steps_w) // 2
    step_y = 280

    font_num = get_font(28, bold=True)
    font_step_title = get_font(18, bold=True)
    font_step_desc = get_font(14)

    for i, (num, title, desc) in enumerate(steps):
        cx = start_x + i * (step_w + gap) + step_w // 2

        # Number circle
        ny = step_y + 28
        for y in range(ny-28, ny+28):
            for x in range(cx-28, cx+28):
                dist = math.sqrt((x-cx)**2 + (y-ny)**2)
                if dist <= 28:
                    t = (x - (cx-28)) / 56
                    base = BG
                    tint = gradient_color(t)
                    blended = tuple(int(base[j] * 0.8 + tint[j] * 0.2) for j in range(3))
                    draw.point((x, y), fill=blended)
        draw_rounded_rect(draw, (cx-28, ny-28, cx+28, ny+28), 14, outline=(*ROSE,))

        bbox = draw.textbbox((0,0), num, font=font_num)
        nw = bbox[2] - bbox[0]
        nh = bbox[3] - bbox[1]
        draw.text((cx - nw//2, ny - nh//2 - 2), num, font=font_num, fill=ROSE)

        # Title
        bbox = draw.textbbox((0,0), title, font=font_step_title)
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw//2, step_y + 76), title, font=font_step_title, fill=WHITE)

        # Description (word wrap)
        words = desc.split()
        lines = []
        current = ""
        for word in words:
            test = current + " " + word if current else word
            bbox = draw.textbbox((0,0), test, font=font_step_desc)
            if bbox[2] - bbox[0] > step_w - 20:
                if current:
                    lines.append(current)
                current = word
            else:
                current = test
        if current:
            lines.append(current)

        for j, line in enumerate(lines):
            bbox = draw.textbbox((0,0), line, font=font_step_desc)
            lw = bbox[2] - bbox[0]
            draw.text((cx - lw//2, step_y + 110 + j * 22), line, font=font_step_desc, fill=GRAY)

        # Arrow connector
        if i < 2:
            arrow_x = cx + step_w//2 + gap//2
            arrow_y = ny
            font_arrow = get_font(24)
            draw.text((arrow_x - 8, arrow_y - 12), "→", font=font_arrow, fill=(55,65,81))

    # Bottom feature badges
    badge_y = 560
    badges = ["One-Click Save", "AI Upscaling", "Cloud Library", "Easy Sharing", "Real-Time Sync"]
    font_bdg = get_font(12)

    total_badge_w = sum(draw.textbbox((0,0), b, font=font_bdg)[2] - draw.textbbox((0,0), b, font=font_bdg)[0] + 32 for b in badges) + (len(badges)-1)*12
    bx = (W - total_badge_w) // 2

    for badge_text in badges:
        bbox = draw.textbbox((0,0), badge_text, font=font_bdg)
        bw = bbox[2] - bbox[0]

        draw_rounded_rect(draw, (bx, badge_y, bx+bw+32, badge_y+32), 16, outline=BORDER)
        # Slight tint
        for y in range(badge_y+1, badge_y+32):
            for x in range(bx+1, bx+bw+31):
                px = img.getpixel((x, y))
                blended = tuple(int(px[j] * 0.95 + ROSE[j] * 0.05) for j in range(3))
                draw.point((x, y), fill=blended)

        draw.text((bx + 16, badge_y + 7), badge_text, font=font_bdg, fill=GRAY)
        bx += bw + 32 + 12

    path = os.path.join(OUT, filename)
    img.save(path, 'PNG', quality=95)
    print(f"  Created: {path}")

# ═══════════════════════════════════════════════════════════
# GENERATE ALL ASSETS
# ═══════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("Generating Opalite CWS marketing assets...\n")

    # Promo tiles
    print("Promo Tiles (440×280):")
    for folder, name, platform in [
        ("gemini", "Gemini Suite", "for Google Gemini"),
        ("grok", "Grok Suite", "for xAI Grok"),
        ("chatgpt", "ChatGPT Suite", "for ChatGPT & DALL·E"),
    ]:
        create_promo_tile(name, platform, f"{folder}/promo-tile-440x280.png")

    print("\nScreenshots — Hero (1280×800):")
    for folder, name, badge in [
        ("gemini", "Gemini Suite", "✨ Built for Google Gemini"),
        ("grok", "Grok Suite", "⚡ Built for xAI Grok"),
        ("chatgpt", "ChatGPT Suite", "🚀 Built for ChatGPT & DALL·E"),
    ]:
        create_hero_screenshot(name, badge, f"{folder}/screenshot-1-hero.png")

    print("\nScreenshots — Features (1280×800):")
    for folder, name, platform in [
        ("gemini", "Gemini Suite", "Gemini"),
        ("grok", "Grok Suite", "Grok"),
        ("chatgpt", "ChatGPT Suite", "ChatGPT"),
    ]:
        create_features_screenshot(name, platform, f"{folder}/screenshot-2-features.png")

    print("\nScreenshots — How It Works (1280×800):")
    for folder, name, desc in [
        ("gemini", "Gemini Suite", "Use Gemini, AI Studio, or Labs to create images as you normally would."),
        ("grok", "Grok Suite", "Use Grok to create AI images on grok.com as you normally would."),
        ("chatgpt", "ChatGPT Suite", "Use ChatGPT, DALL·E, or Sora to create images as you normally would."),
    ]:
        create_howto_screenshot(name, desc, f"{folder}/screenshot-3-howto.png")

    print("\n✅ All assets generated!")
    print(f"Output directory: {OUT}")
