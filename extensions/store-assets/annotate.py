#!/usr/bin/env python3
"""
Production-quality annotated screenshots for Chrome Web Store listings.
Layout: Left feature panel (space photo backdrop) + Right screenshot + Bottom banner
Output: 1280x800 CWS-ready PNGs.
"""

from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter
import os

# Paths
SRC = "/Users/jonathancowley/Downloads/scfolder"
ASSETS = os.path.dirname(__file__)
OUT = os.path.join(ASSETS, "screenshots", "annotated")
SPACE_BG = os.path.join(ASSETS, "space_bg.jpg")
os.makedirs(OUT, exist_ok=True)

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
    """Heaviest available font for maximum impact titles."""
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

# ──────────────────────────────────────────────
# COLORS & LAYOUT
# ──────────────────────────────────────────────

WHITE = (255, 255, 255)
NEAR_WHITE = (235, 238, 248)
SOFT_WHITE = (180, 185, 210)
ACCENT_BLUE = (140, 155, 230)

CWS_SIZE = (1280, 800)
SIDEBAR_W = 400
BANNER_H = 90


# ──────────────────────────────────────────────
# SPACE BACKGROUND HELPERS
# ──────────────────────────────────────────────

def load_space_bg():
    """Load the space background image once."""
    return Image.open(SPACE_BG).convert("RGB")

def crop_and_darken(space_img, w, h, region="left", darkness=0.35):
    """
    Crop a region from the space background, resize to fit, and darken.
    region: 'left' crops from left side, 'bottom' crops from bottom, 'full' center-crops.
    darkness: 0.0 = black, 1.0 = original brightness.
    """
    src_w, src_h = space_img.size
    src_ratio = src_w / src_h
    target_ratio = w / h

    if region == "left":
        # Use the left portion of the image (where nebula colors are richest)
        if target_ratio < src_ratio:
            new_h = h
            new_w = int(new_h * src_ratio)
        else:
            new_w = w
            new_h = int(new_w / src_ratio)
        resized = space_img.resize((new_w, new_h), Image.LANCZOS)
        # Crop from left
        cropped = resized.crop((0, 0, w, h))
    elif region == "bottom":
        # Use bottom-center of image
        if src_ratio > target_ratio:
            new_h = h
            new_w = int(new_h * src_ratio)
        else:
            new_w = w
            new_h = int(new_w / src_ratio)
        resized = space_img.resize((new_w, new_h), Image.LANCZOS)
        cx = (new_w - w) // 2
        cropped = resized.crop((cx, new_h - h, cx + w, new_h))
    else:
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

    # Darken for text readability
    enhancer = ImageEnhance.Brightness(cropped)
    darkened = enhancer.enhance(darkness)

    return darkened


# ──────────────────────────────────────────────
# DRAWING FEATURES & BANNER
# ──────────────────────────────────────────────

def draw_feature_list(img, features, start_x, start_y, spacing):
    """Draw the feature list with bold, prominent typography on space backdrop."""
    draw = ImageDraw.Draw(img)
    feature_font = get_font_bold(28)

    for i, feat in enumerate(features):
        y = start_y + i * spacing

        # Glowing bullet dot
        dot_x = start_x + 6
        dot_y = y + 14
        # Outer glow
        draw.ellipse([dot_x - 5, dot_y - 5, dot_x + 5, dot_y + 5], fill=(50, 60, 130))
        # Mid ring
        draw.ellipse([dot_x - 3, dot_y - 3, dot_x + 3, dot_y + 3], fill=(80, 100, 180))
        # Inner bright core
        draw.ellipse([dot_x - 1, dot_y - 1, dot_x + 1, dot_y + 1], fill=ACCENT_BLUE)

        # Feature text with subtle shadow for readability
        draw.text((start_x + 26, y + 1), feat, fill=(0, 0, 0), font=feature_font)
        draw.text((start_x + 25, y), feat, fill=NEAR_WHITE, font=feature_font)


def draw_banner(img, title, subtitle, space_img):
    """Draw the bottom banner with space backdrop and heavy title."""
    w, h = img.size
    banner_top = h - BANNER_H

    # Space backdrop for banner (use a different region)
    banner_bg = crop_and_darken(space_img, w, BANNER_H, region="bottom", darkness=0.25)
    img.paste(banner_bg, (0, banner_top))

    # Subtle luminous top border
    draw = ImageDraw.Draw(img)
    for i in range(2):
        val = 70 - i * 25
        draw.line([(0, banner_top + i), (w, banner_top + i)],
                  fill=(val // 2, val // 2 + 8, val + 20), width=1)

    # Title — HEAVY weight, large, with text shadow
    title_font = get_font_heavy(36)
    bbox = title_font.getbbox(title)
    tw = bbox[2] - bbox[0]
    title_y = banner_top + 14

    # Shadow
    draw.text(((w - tw) // 2 + 1, title_y + 2), title, fill=(5, 5, 15), font=title_font)
    # Main title
    draw.text(((w - tw) // 2, title_y), title, fill=WHITE, font=title_font)

    # Subtitle
    if subtitle:
        sub_font = get_font(17)
        bbox2 = sub_font.getbbox(subtitle)
        sw = bbox2[2] - bbox2[0]
        draw.text(((w - sw) // 2, title_y + 44), subtitle, fill=SOFT_WHITE, font=sub_font)


# ──────────────────────────────────────────────
# COMPOSITION
# ──────────────────────────────────────────────

def compose_screenshot(src_img, features, title, subtitle, platform, space_img):
    """Create the full annotated screenshot with real space backdrop."""
    canvas = Image.new("RGB", CWS_SIZE, (5, 6, 14))

    # === SIDEBAR with space backdrop ===
    sidebar_h = CWS_SIZE[1] - BANNER_H
    sidebar_bg = crop_and_darken(space_img, SIDEBAR_W, sidebar_h, region="left", darkness=0.35)
    canvas.paste(sidebar_bg, (0, 0))

    # Feature list — centered vertically
    spacing = 56
    total_h = len(features) * spacing
    start_y = (sidebar_h - total_h) // 2
    start_x = 40

    draw_feature_list(canvas, features, start_x, start_y, spacing)

    # Soft edge separator between sidebar and screenshot
    draw = ImageDraw.Draw(canvas)
    for x_off in range(6):
        alpha_frac = 1.0 - (x_off / 6)
        val = int(40 * alpha_frac)
        draw.line([(SIDEBAR_W - 1 - x_off, 0), (SIDEBAR_W - 1 - x_off, sidebar_h)],
                  fill=(val // 3, val // 3 + 3, val + 5), width=1)

    # === SCREENSHOT ===
    screenshot_w = CWS_SIZE[0] - SIDEBAR_W
    screenshot_h = CWS_SIZE[1] - BANNER_H

    src_w, src_h = src_img.size
    src_ratio = src_w / src_h
    target_ratio = screenshot_w / screenshot_h

    if src_ratio > target_ratio:
        new_h = screenshot_h
        new_w = int(new_h * src_ratio)
    else:
        new_w = screenshot_w
        new_h = int(new_w / src_ratio)

    resized = src_img.resize((new_w, new_h), Image.LANCZOS)
    cx = (new_w - screenshot_w) // 2
    cy = (new_h - screenshot_h) // 2
    cropped = resized.crop((cx, cy, cx + screenshot_w, cy + screenshot_h))

    canvas.paste(cropped, (SIDEBAR_W, 0))

    # === BANNER ===
    draw_banner(canvas, title, subtitle, space_img)

    return canvas


# ──────────────────────────────────────────────
# FEATURE LISTS
# ──────────────────────────────────────────────

default_features = {
    "gemini": [
        "Auto-Save Images & Videos",
        "Batch Prompt Sending",
        "Video Generation Mode",
        "Prompt Templates",
        "Prompt Prefix / Suffix",
        "Cloud Library & Sharing",
        "AI Upscaling (4×)",
    ],
    "grok": [
        "Auto-Save Images & Videos",
        "Batch Prompt Sending",
        "Video & Create Mode",
        "Prompt Templates",
        "Prompt Prefix / Suffix",
        "Cloud Library & Sharing",
        "AI Upscaling (4×)",
    ],
    "chatgpt": [
        "Auto-Save Images & Videos",
        "Batch Prompt Sending",
        "DALL-E & Sora Support",
        "Prompt Templates",
        "Prompt Prefix / Suffix",
        "Cloud Library & Sharing",
        "AI Upscaling (4×)",
    ],
}

task_manager_features = [
    "Full Task Queue",
    "Status Tracking",
    "Bulk Actions",
    "Sort & Filter",
    "Export / Import Tasks",
    "Single & Grouped Tasks",
]

template_features = [
    "Reusable Templates",
    "[Variable] Replacement",
    "Live Prompt Preview",
    "Dropdown Options",
    "Random Combinations",
    "One-Click Send",
]

# ──────────────────────────────────────────────
# TITLES
# ──────────────────────────────────────────────

def get_titles(platform, view_type):
    names = {"gemini": "Gemini Suite", "grok": "Grok Suite", "chatgpt": "ChatGPT & Sora Suite"}
    name = names[platform]

    if view_type == "default":
        return (f"{name}  —  by Opalite", "Batch-create and auto-save every AI image and video")
    elif view_type == "task_manager":
        return (f"{name}  —  Task Manager", "Queue, track, and manage all your AI generations")
    elif view_type == "template_edit":
        return (f"{name}  —  Prompt Templates", "Build reusable prompts with variables and prefixes")
    elif view_type == "template_use":
        return (f"{name}  —  Prompt Templates", "Fill in the blanks, preview, and send in one click")
    return (name, "")


def get_features(platform, view_type):
    if view_type == "default":
        return default_features[platform]
    elif view_type == "task_manager":
        return task_manager_features
    elif view_type in ("template_edit", "template_use"):
        return template_features
    return []


# ──────────────────────────────────────────────
# PROCESS
# ──────────────────────────────────────────────

screenshots = [
    ("17.09.30", "gemini",  "default"),
    ("17.09.39", "gemini",  "task_manager"),
    ("17.09.50", "gemini",  "template_edit"),
    ("17.10.03", "grok",    "default"),
    ("17.10.16", "grok",    "template_use"),
    ("17.10.30", "grok",    "task_manager"),
    ("17.10.45", "chatgpt", "default"),
    ("17.10.49", "chatgpt", "template_use"),
    ("17.10.58", "chatgpt", "task_manager"),
]

# Load space background once
space_img = load_space_bg()

for time_suffix, platform, view_type in screenshots:
    filename = f"Screenshot 2026-03-03 at {time_suffix}.png"
    filepath = os.path.join(SRC, filename)

    if not os.path.exists(filepath):
        print(f"SKIP: {filename} not found")
        continue

    src_img = Image.open(filepath).convert("RGB")
    features = get_features(platform, view_type)
    title, subtitle = get_titles(platform, view_type)

    result = compose_screenshot(src_img, features, title, subtitle, platform, space_img)

    out_name = f"{platform}_{view_type}.png"
    out_path = os.path.join(OUT, out_name)
    result.save(out_path, "PNG", optimize=True)
    print(f"OK: {out_name} ({os.path.getsize(out_path) // 1024} KB)")

print(f"\nDone! {len(screenshots)} screenshots -> {OUT}")
