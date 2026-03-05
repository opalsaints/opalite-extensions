#!/usr/bin/env bash
# Publish a built extension to the Chrome Web Store.
#
# Usage:
#   ./extensions/publish.sh GrokExt-opalite              # upload + publish
#   ./extensions/publish.sh GrokExt-opalite --upload-only # upload only (review in dashboard)
#   ./extensions/publish.sh GrokExt-opalite --status      # check current status
#
# Prerequisites:
#   1. Run build.sh first to produce the .zip
#   2. Fill in .cws-credentials (copy from .cws-credentials.example)
#   3. Bump the version in manifest.json before uploading a new version

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_NAME="${1:?Usage: $0 <ExtensionName> [--upload-only|--status]}"
MODE="${2:-publish}"

# ── Load credentials ──────────────────────────────────────────
CREDS_FILE="$SCRIPT_DIR/.cws-credentials"
if [ ! -f "$CREDS_FILE" ]; then
  echo "Error: $CREDS_FILE not found."
  echo ""
  echo "To set up:"
  echo "  cp extensions/.cws-credentials.example extensions/.cws-credentials"
  echo "  # Then fill in your values (see comments in the file for instructions)"
  exit 1
fi

source "$CREDS_FILE"

# Validate required credentials
for var in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_PUBLISHER_ID; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var is not set in $CREDS_FILE"
    exit 1
  fi
done

# ── Resolve extension ID from credentials ─────────────────────
# Convert "GrokExt-opalite" → "CWS_ID_GrokExt_opalite"
VAR_NAME="CWS_ID_$(echo "$EXT_NAME" | tr '-' '_')"
EXTENSION_ID="${!VAR_NAME:-}"

if [ -z "$EXTENSION_ID" ]; then
  echo "Error: No extension ID found for '$EXT_NAME'"
  echo "Add $VAR_NAME=\"your-extension-id\" to $CREDS_FILE"
  exit 1
fi

# ── Refresh access token ──────────────────────────────────────
echo "Refreshing access token..."
TOKEN_RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=$CWS_CLIENT_ID" \
  -d "client_secret=$CWS_CLIENT_SECRET" \
  -d "refresh_token=$CWS_REFRESH_TOKEN" \
  -d "grant_type=refresh_token")

# Parse access token (portable — no jq dependency)
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | sed -n 's/.*"access_token" *: *"\([^"]*\)".*/\1/p' | head -1)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Error: Failed to get access token. Response:"
  echo "$TOKEN_RESPONSE"
  echo ""
  echo "Common fixes:"
  echo "  - Check that CWS_CLIENT_ID and CWS_CLIENT_SECRET are correct"
  echo "  - Regenerate your refresh token at https://developers.google.com/oauthplayground"
  exit 1
fi

echo "Access token acquired."

API_BASE="https://chromewebstore.googleapis.com"

# ── Status check ──────────────────────────────────────────────
if [ "$MODE" = "--status" ]; then
  echo "Fetching status for $EXT_NAME ($EXTENSION_ID)..."
  STATUS_RESPONSE=$(curl -s \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "x-goog-api-version: 2" \
    -X GET \
    "$API_BASE/v2/publishers/$CWS_PUBLISHER_ID/items/$EXTENSION_ID:fetchStatus")
  echo "$STATUS_RESPONSE"
  exit 0
fi

# ── Verify zip exists ─────────────────────────────────────────
ZIP_PATH="$SCRIPT_DIR/${EXT_NAME}.zip"
if [ ! -f "$ZIP_PATH" ]; then
  echo "Error: $ZIP_PATH not found."
  echo "Run build.sh first:  ./extensions/build.sh $EXT_NAME"
  exit 1
fi

ZIP_SIZE=$(wc -c < "$ZIP_PATH" | tr -d ' ')
echo "Zip: $ZIP_PATH ($ZIP_SIZE bytes)"

# ── Upload ────────────────────────────────────────────────────
echo ""
echo "Uploading $EXT_NAME to Chrome Web Store..."
UPLOAD_RESPONSE=$(curl -s \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-goog-api-version: 2" \
  -X POST \
  -T "$ZIP_PATH" \
  "$API_BASE/upload/v2/publishers/$CWS_PUBLISHER_ID/items/$EXTENSION_ID:upload")

echo "Upload response:"
echo "$UPLOAD_RESPONSE"

# Check for failure
if echo "$UPLOAD_RESPONSE" | grep -q '"FAILURE"'; then
  echo ""
  echo "Upload failed! Common causes:"
  echo "  - Version in manifest.json was not bumped"
  echo "  - The zip is malformed or too large"
  echo "  - A previous upload is still IN_PROGRESS (wait and retry)"
  exit 1
fi

if [ "$MODE" = "--upload-only" ]; then
  echo ""
  echo "Upload complete. Review and publish manually in the Developer Dashboard:"
  echo "  https://chrome.google.com/webstore/devconsole"
  exit 0
fi

# ── Publish ───────────────────────────────────────────────────
echo ""
echo "Publishing $EXT_NAME..."
PUBLISH_RESPONSE=$(curl -s \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  -X POST \
  "$API_BASE/v2/publishers/$CWS_PUBLISHER_ID/items/$EXTENSION_ID:publish")

echo "Publish response:"
echo "$PUBLISH_RESPONSE"

if echo "$PUBLISH_RESPONSE" | grep -q '"OK"'; then
  echo ""
  echo "Published! $EXT_NAME has been submitted for Chrome Web Store review."
  echo "It will go live once the review passes (usually within hours)."
elif echo "$PUBLISH_RESPONSE" | grep -q '"PUBLISHED_WITH_FRICTION_WARNING"'; then
  echo ""
  echo "Published with warnings. Check the Developer Dashboard for details."
else
  echo ""
  echo "Unexpected response. Check the Developer Dashboard:"
  echo "  https://chrome.google.com/webstore/devconsole"
fi
