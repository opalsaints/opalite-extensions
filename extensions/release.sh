#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# release.sh — Version bump + Build + Publish for Chrome Extensions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Usage:
#   ./extensions/release.sh                     # Release ALL extensions (patch bump)
#   ./extensions/release.sh GrokExt-opalite     # Release one extension (patch bump)
#   ./extensions/release.sh --minor             # Release ALL with minor bump
#   ./extensions/release.sh GrokExt-opalite --minor   # Release one with minor bump
#   ./extensions/release.sh --build-only        # Build only, no publish
#   ./extensions/release.sh --dry-run           # Show what would happen
#
# Bump types: --patch (default), --minor, --major
#
# Flow: Bump version in manifest.json → build.sh (minify + zip) → publish.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# All publishable extensions
ALL_EXTENSIONS=("GrokExt-opalite" "ChatGPTExt-opalite" "GeminiExt-opalite" "da-stash-helper")

# ── Parse arguments ─────────────────────────────────────────────
TARGET=""
BUMP_TYPE="patch"
BUILD_ONLY=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --patch)     BUMP_TYPE="patch" ;;
    --minor)     BUMP_TYPE="minor" ;;
    --major)     BUMP_TYPE="major" ;;
    --build-only) BUILD_ONLY=true ;;
    --dry-run)   DRY_RUN=true ;;
    -*)          echo "Unknown flag: $arg"; exit 1 ;;
    *)           TARGET="$arg" ;;
  esac
done

# Determine which extensions to release
if [ -n "$TARGET" ]; then
  EXTENSIONS=("$TARGET")
else
  EXTENSIONS=("${ALL_EXTENSIONS[@]}")
fi

# ── Resolve source directory ───────────────────────────────────
resolve_src_dir() {
  local name="$1"
  if [ -d "$SCRIPT_DIR/$name" ]; then
    echo "$SCRIPT_DIR/$name"
  else
    echo ""
  fi
}

# ── Version bump ───────────────────────────────────────────────
bump_version() {
  local manifest="$1"
  local bump="$2"

  # Read current version
  local current
  current=$(sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' "$manifest" | head -1)

  if [ -z "$current" ]; then
    echo "Error: Could not read version from $manifest"
    return 1
  fi

  # Split into parts
  IFS='.' read -r major minor patch <<< "$current"
  major=${major:-0}
  minor=${minor:-0}
  patch=${patch:-0}

  # Bump
  case "$bump" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
  esac

  local new_version="${major}.${minor}.${patch}"

  # Write back — use portable sed
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$current\"/\"version\": \"$new_version\"/" "$manifest"
  else
    sed -i "s/\"version\": \"$current\"/\"version\": \"$new_version\"/" "$manifest"
  fi

  echo "$current → $new_version"
}

# ── Main ───────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Opalite Extension Release"
echo "  Bump: $BUMP_TYPE | Build only: $BUILD_ONLY | Dry run: $DRY_RUN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILED=()
SUCCEEDED=()

for ext in "${EXTENSIONS[@]}"; do
  echo "┌─────────────────────────────────────────────────────"
  echo "│ $ext"
  echo "└─────────────────────────────────────────────────────"

  SRC_DIR=$(resolve_src_dir "$ext")
  if [ -z "$SRC_DIR" ]; then
    echo "  SKIP: Directory not found"
    FAILED+=("$ext (not found)")
    echo ""
    continue
  fi

  MANIFEST="$SRC_DIR/manifest.json"
  if [ ! -f "$MANIFEST" ]; then
    echo "  SKIP: No manifest.json"
    FAILED+=("$ext (no manifest)")
    echo ""
    continue
  fi

  # Step 1: Version bump
  echo -n "  Version bump ($BUMP_TYPE): "
  if [ "$DRY_RUN" = true ]; then
    current=$(sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)
    echo "$current → (dry run, not changed)"
  else
    bump_version "$MANIFEST" "$BUMP_TYPE"
  fi

  # Step 2: Build (minify + zip)
  echo "  Building..."
  if [ "$DRY_RUN" = true ]; then
    echo "    (dry run — skipped)"
  else
    if ! "$SCRIPT_DIR/build.sh" "$ext" 2>&1 | sed 's/^/    /'; then
      echo "  BUILD FAILED"
      FAILED+=("$ext (build failed)")
      echo ""
      continue
    fi
  fi

  # Step 3: Publish
  if [ "$BUILD_ONLY" = true ]; then
    echo "  Build complete (--build-only, skipping publish)"
  elif [ "$DRY_RUN" = true ]; then
    echo "  Publish: (dry run — skipped)"
  else
    echo "  Publishing to Chrome Web Store..."
    if ! "$SCRIPT_DIR/publish.sh" "$ext" "--publish" 2>&1 | sed 's/^/    /'; then
      echo "  PUBLISH FAILED (build succeeded — zip is ready for manual upload)"
      FAILED+=("$ext (publish failed)")
      echo ""
      continue
    fi
  fi

  SUCCEEDED+=("$ext")
  echo ""
done

# ── Summary ────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Release Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#SUCCEEDED[@]} -gt 0 ]; then
  echo "  Succeeded:"
  for ext in "${SUCCEEDED[@]}"; do
    new_ver=$(sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p' "$(resolve_src_dir "$ext")/manifest.json" | head -1)
    echo "    ✅ $ext → v$new_ver"
  done
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "  Failed:"
  for ext in "${FAILED[@]}"; do
    echo "    ❌ $ext"
  done
fi

echo ""

# Exit with error if any failed
[ ${#FAILED[@]} -eq 0 ]
