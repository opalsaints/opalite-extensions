#!/usr/bin/env bash
# Build script for Chrome Web Store publishing.
# Minifies opalite-*.js and popup.js files, copies everything else as-is.
#
# Usage: ./extensions/build.sh GrokExt-opalite
#        ./extensions/build.sh GeminiExt-opalite --publish
#
# Flags:
#   --publish      Build, zip, and publish to Chrome Web Store
#   --upload-only  Build, zip, and upload (don't publish — review in dashboard)
#
# Output: extensions/<ExtName>/dist/ and extensions/<ExtName>.zip

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_NAME="${1:?Usage: $0 <ExtensionName> (e.g., GrokExt-opalite)}"
PUBLISH_FLAG="${2:-}"

SRC_DIR="$SCRIPT_DIR/$EXT_NAME"

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: $SRC_DIR does not exist"
  exit 1
fi

DIST_DIR="$SRC_DIR/dist"

echo "Building $EXT_NAME..."

# ── Step 0: Build Opalite UI components (Vite) if ui/ workspace exists ──
UI_DIR="$SCRIPT_DIR/ui"
if [ -d "$UI_DIR" ] && [ -f "$UI_DIR/package.json" ]; then
  echo "Building Opalite UI components..."
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

  # Build the UI bundle — outputs to GeminiExt/scripts/opalite-ui.js
  (cd "$REPO_ROOT" && pnpm --filter @opalite/extension-ui build 2>&1) || {
    echo "Warning: Opalite UI build failed, continuing without it..."
  }

  # Copy opalite-ui.js to target extension if it's not GeminiExt (default output)
  if [ "$EXT_NAME" != "GeminiExt" ] && [ -f "$SCRIPT_DIR/GeminiExt/scripts/opalite-ui.js" ]; then
    cp "$SCRIPT_DIR/GeminiExt/scripts/opalite-ui.js" "$SRC_DIR/scripts/opalite-ui.js" 2>/dev/null || true
    echo "Copied opalite-ui.js to $EXT_NAME"
  fi
fi

# Clean previous build
rm -rf "$DIST_DIR"

# Use ditto (macOS) to copy the entire extension — handles file system quirks gracefully
ditto --norsrc "$SRC_DIR" "$DIST_DIR" 2>/dev/null || {
  echo "ditto failed, using manual copy..."
  mkdir -p "$DIST_DIR/scripts"
  # Copy top-level files
  for f in manifest.json rules.json popup.html popup.js background.js; do
    [ -f "$SRC_DIR/$f" ] && cp "$SRC_DIR/$f" "$DIST_DIR/$f" 2>/dev/null || true
  done
  # Copy directories
  for d in _locales _metadata images; do
    [ -d "$SRC_DIR/$d" ] && cp -R "$SRC_DIR/$d" "$DIST_DIR/$d" 2>/dev/null || true
  done
  # Copy scripts
  for f in "$SRC_DIR"/scripts/*; do
    [ -f "$f" ] && cp "$f" "$DIST_DIR/scripts/" 2>/dev/null || true
  done
}

# Remove nested dist/ if ditto copied it
rm -rf "$DIST_DIR/dist"

# Minify opalite-*.js files and popup.js (overwrite the copied versions)
FILES_TO_MINIFY=(
  "scripts/opalite-auth.js"
  "scripts/opalite-inject.js"
  "scripts/opalite-socket.js"
  "scripts/opalite-callback.js"
  "scripts/opalite-upsell.js"
  "popup.js"
)

MINIFIED=0
for file in "${FILES_TO_MINIFY[@]}"; do
  if [ -f "$SRC_DIR/$file" ]; then
    npx --yes terser "$SRC_DIR/$file" \
      --compress passes=2 \
      --mangle \
      --output "$DIST_DIR/$file" 2>/dev/null
    MINIFIED=$((MINIFIED + 1))
  fi
done

echo "Done! Minified $MINIFIED files."
echo "Output: $DIST_DIR"

# ── Step 3: Zip for Chrome Web Store ──
ZIP_PATH="$SCRIPT_DIR/${EXT_NAME}.zip"
rm -f "$ZIP_PATH"
(cd "$DIST_DIR" && zip -r "$ZIP_PATH" . -x "*.DS_Store" -x "__MACOSX/*") 2>/dev/null
echo "Zipped: $ZIP_PATH"

# ── Step 4: Publish (optional) ──
if [ "$PUBLISH_FLAG" = "--publish" ] || [ "$PUBLISH_FLAG" = "--upload-only" ]; then
  echo ""
  "$SCRIPT_DIR/publish.sh" "$EXT_NAME" "$PUBLISH_FLAG"
fi
