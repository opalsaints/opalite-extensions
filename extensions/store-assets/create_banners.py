#!/usr/bin/env python3
"""
Create promotional banner tiles for Chrome Web Store.
Sizes: 440x280 (small tile), 920x680 (large tile), 1400x560 (marquee)
Uses real space photography backdrop + platform-specific logos.
"""

from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import os

ASSETS = os.path.dirname(__file__)
OUT = os.path.join(ASSETS, "screenshots", "banners")
SPACE_BG = os.path.join(ASSETS, "space_bg.jpg")
os.makedirs(OUT, exist_ok=True)

# Platform-specific logos (original RGBA icons with transparency)
# store-assets is inside extensions/, so parent dir IS the extensions folder
EXT_DIR = os.path.dirname(ASSETS)
LOGO_PATHS = {
    "gemini":  os.path.join(EXT_DIR, "GeminiExt-opalite production 1.0", "images", "icon-128.png"),
    "grok":    os.path.join(EXT_DIR, "GrokExt-opalite production 1.0", "images", "icon-128.png"),
    "chatgpt": os.path.join(EXT_DIR, "ChatGPTExt-opalite production 1.0", "images", "icon-128.png"),
}


# ──────────────────────────────────────────────
# FONTS
# ──────────────────────────────────────────────

def get_font(size):
    for path in [
        "/System/Library/Fonts/SFNSText.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/Library/Fonts/SF-Pro-Text-Regular.otf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    return ImageFont.load_default()

def get_font_bold(size):
    for path in [
        "/Library/Fonts/SF-Pro-Display-Bold.otf",
        "/Library/Fonts/SF-Pro-Text-Bold.otf",
        "/System/Library/Fonts/SFNSTextBold.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Helvetica Neue.ttc", size, index=1)
    except:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)

def get_font_heavy(size):
    for path in [
        "/Library/Fonts/SF-Pro-Display-Heavy.otf",
        "/Library/Fonts/SF-Pro-Display-Black.otf",
        "/Library/Fonts/SF-Pro-Display-Bold.otf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    return get_font_bold(size)

def get_font_semibold(size):
    for path in [
        "/Library/Fonts/SF-Pro-Display-Semibold.otf",
        "/Library/Fonts/SF-Pro-Text-Semibold.otf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except:
            continue
    return get_font_bold(size)


# ──────────────────────────────────────────────
# SPACE BACKGROUND
# ──────────────────────────────────────────────

def load_space_bg():
    return Image.open(SPACE_BG).convert("RGB")

def make_space_backdrop(space_img, w, h, darkness=0.30):
    """Crop space image to size and darken for text readability."""
    src_w, src_h = space_img.size
    src_ratio = src_w / src_h
    target_ratio = w / h

    # Center crop
    if src_ratio > target_ratio:
        new_h = h
        new_w = int(new_h * src_ratio)
    else:
        new_w = w
        new_h = int(new_w / src_ratio)

    resized = space_img.resize((new_w, new_h), Image.LANCZOS)
    cx = (new_w - w) // 2
    cy = (new_h - h) // 2
    cropped = resized.crop((cx, cy, cx + w, cy + h))

    # Darken
    enhancer = ImageEnhance.Brightness(cropped)
    return enhancer.enhance(darkness)


# ──────────────────────────────────────────────
# TILE CREATION
# ──────────────────────────────────────────────

def create_tile(width, height, platform, tagline, suffix, space_img):
    """Create a promotional tile with space backdrop and platform logo."""

    # Space background
    img = make_space_backdrop(space_img, width, height, darkness=0.30)
    draw = ImageDraw.Draw(img)

    names = {"gemini": "Gemini Suite", "grok": "Grok Suite", "chatgpt": "ChatGPT & Sora Suite"}
    name = names[platform]

    # Scale based on tile width
    scale = width / 440

    # Font sizes
    title_size = max(14, int(36 * scale))
    by_size = max(10, int(14 * scale))
    tag_size = max(11, int(15 * scale))
    pill_text_size = max(9, int(11 * scale))

    title_font = get_font_heavy(title_size)
    by_font = get_font_semibold(by_size)
    tag_font = get_font(tag_size)
    pill_font = get_font_semibold(pill_text_size)

    # === LOGO ===
    logo_size_px = max(56, int(90 * scale))
    logo_path = LOGO_PATHS.get(platform)
    logo_loaded = False

    # Calculate layout heights
    logo_h = logo_size_px + int(20 * scale) if logo_path and os.path.exists(logo_path) else 0
    title_h = title_size + int(4 * scale)
    by_h = by_size + int(12 * scale)
    tag_h = tag_size + int(10 * scale)
    pill_h_total = max(20, int(26 * scale)) + int(8 * scale)

    total_content_h = logo_h + title_h + by_h + tag_h + pill_h_total
    start_y = (height - total_content_h) // 2

    # Draw logo with soft glow halo for visibility on dark backdrop
    if logo_path and os.path.exists(logo_path):
        try:
            logo = Image.open(logo_path).convert("RGBA")
            logo = logo.resize((logo_size_px, logo_size_px), Image.LANCZOS)

            if platform == "grok":
                # Grok already has its own dark rounded-rect background
                # Just paste it directly — no white circle needed
                logo_x = (width - logo_size_px) // 2
                logo_y = start_y

                # Subtle glow behind for depth
                glow_r = int(logo_size_px * 0.7)
                gcx = logo_x + logo_size_px // 2
                gcy = logo_y + logo_size_px // 2
                glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
                gdraw = ImageDraw.Draw(glow)
                for r in range(glow_r, 0, -2):
                    a = int(50 * (1 - (r / glow_r) ** 1.5))
                    a = max(0, min(255, a))
                    gdraw.ellipse([gcx - r, gcy - r, gcx + r, gcy + r],
                                  fill=(180, 195, 255, a))
                img_rgba = img.convert("RGBA")
                img_rgba = Image.alpha_composite(img_rgba, glow)
                img_rgba.paste(logo, (logo_x, logo_y), logo)
                img = img_rgba.convert("RGB")
                draw = ImageDraw.Draw(img)
            else:
                # Gemini & ChatGPT: white circle backing for visibility
                circle_size = logo_size_px + 8
                circle_img = Image.new("RGBA", (circle_size, circle_size), (0, 0, 0, 0))
                circle_draw = ImageDraw.Draw(circle_img)
                circle_draw.ellipse([0, 0, circle_size - 1, circle_size - 1],
                                    fill=(255, 255, 255, 255))
                offset = (circle_size - logo_size_px) // 2
                circle_img.paste(logo, (offset, offset), logo)

                logo_x = (width - circle_size) // 2
                logo_y = start_y

                # Outer glow
                glow_r = int(circle_size * 0.9)
                gcx = logo_x + circle_size // 2
                gcy = logo_y + circle_size // 2
                glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
                gdraw = ImageDraw.Draw(glow)
                for r in range(glow_r, 0, -2):
                    a = int(60 * (1 - (r / glow_r) ** 1.5))
                    a = max(0, min(255, a))
                    gdraw.ellipse([gcx - r, gcy - r, gcx + r, gcy + r],
                                  fill=(180, 195, 255, a))
                img_rgba = img.convert("RGBA")
                img_rgba = Image.alpha_composite(img_rgba, glow)
                img_rgba.paste(circle_img, (logo_x, logo_y), circle_img)
                img = img_rgba.convert("RGB")
                draw = ImageDraw.Draw(img)

            logo_loaded = True
            start_y += logo_h
        except:
            start_y += 0

    # === TITLE (heavy weight) ===
    bbox = title_font.getbbox(name)
    tw = bbox[2] - bbox[0]
    # Shadow
    draw.text(((width - tw) // 2 + 1, start_y + 1), name, fill=(5, 5, 15), font=title_font)
    draw.text(((width - tw) // 2, start_y), name, fill=(255, 255, 255), font=title_font)
    start_y += title_h

    # === "by Opalite" ===
    by_text = "by Opalite"
    bbox = by_font.getbbox(by_text)
    bw = bbox[2] - bbox[0]
    # Soft blue accent instead of orange
    draw.text(((width - bw) // 2, start_y), by_text, fill=(140, 155, 230), font=by_font)
    start_y += by_h

    # === TAGLINE ===
    bbox = tag_font.getbbox(tagline)
    sw = bbox[2] - bbox[0]
    draw.text(((width - sw) // 2, start_y), tagline, fill=(180, 185, 210), font=tag_font)
    start_y += tag_h

    # === FEATURE PILLS ===
    features = ["Auto Download", "Batch Prompts", "Templates"]
    pill_h = max(20, int(26 * scale))
    pill_pad = max(8, int(10 * scale))
    gap = max(5, int(8 * scale))

    pill_widths = []
    for feat in features:
        bbox = pill_font.getbbox(feat)
        pill_widths.append(bbox[2] - bbox[0] + pill_pad * 2)
    total_pills_w = sum(pill_widths) + gap * (len(features) - 1)

    px = (width - total_pills_w) // 2
    py = start_y
    radius = pill_h // 2

    for i, feat in enumerate(features):
        pw = pill_widths[i]
        # Semi-transparent pill with blue-ish border
        draw.rounded_rectangle(
            [px, py, px + pw, py + pill_h],
            radius=radius,
            fill=(30, 35, 70),
            outline=(100, 115, 190),
            width=1
        )
        bbox = pill_font.getbbox(feat)
        fth = bbox[3] - bbox[1]
        draw.text(
            (px + pill_pad, py + (pill_h - fth) // 2 - bbox[1]),
            feat, fill=(200, 210, 245), font=pill_font
        )
        px += pw + gap

    # Save
    out_name = f"{platform}_tile_{suffix}.png"
    out_path = os.path.join(OUT, out_name)
    img.save(out_path, "PNG", optimize=True)
    print(f"OK: {out_name} ({os.path.getsize(out_path) // 1024} KB)")


# ──────────────────────────────────────────────
# GENERATE ALL TILES
# ──────────────────────────────────────────────

taglines = {
    "gemini":  "AI Image Workflow, Supercharged",
    "grok":    "AI Image Workflow, Supercharged",
    "chatgpt": "AI Image Workflow, Supercharged",
}

space_img = load_space_bg()

for platform in ["gemini", "grok", "chatgpt"]:
    tag = taglines[platform]
    create_tile(440, 280, platform, tag, "small", space_img)
    create_tile(920, 680, platform, tag, "large", space_img)
    create_tile(1400, 560, platform, tag, "marquee", space_img)

print(f"\nDone! Banners saved to: {OUT}")
