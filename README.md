# Opalite Extensions

Chrome extensions for the Opalite AI image suite.

## Extensions

| Extension | Platform | Version | CWS Status |
|---|---|---|---|
| **GrokExt-opalite** | [grok.com](https://grok.com) | 1.2.0 | Published |
| **ChatGPTExt-opalite** | [chatgpt.com](https://chatgpt.com) | 1.2.0 | Pending review |
| **GeminiExt-opalite** | [gemini.google.com](https://gemini.google.com) | 1.2.0 | Rejected (resubmit) |
| **da-stash-helper** | [deviantart.com](https://deviantart.com) | 2.0.0 | Not yet published |
| **InstagramExt** | [instagram.com](https://instagram.com) | 1.0.0 | Not yet published |

## Project Structure

```
extensions/
  GrokExt-opalite/       # Grok AI image tools
  ChatGPTExt-opalite/    # ChatGPT/Sora image tools
  GeminiExt-opalite/     # Gemini image tools
  da-stash-helper/       # DeviantArt Stash automation (TypeScript/Vite)
  InstagramExt/          # Instagram tools
  shared/                # Shared scripts (opalite-auth, opalite-upsell)
  ui/                    # Shared React UI components (Vite)
  store-assets/          # CWS listing screenshots & marketing
  build.sh               # Minify + zip one extension
  publish.sh             # Upload + publish to Chrome Web Store
  release.sh             # Version bump + build + publish (all-in-one)
```

## Publishing

### From Terminal (recommended)

```bash
# Release all extensions (patch version bump)
./extensions/release.sh

# Release one extension
./extensions/release.sh GrokExt-opalite

# Minor or major bump
./extensions/release.sh --minor
./extensions/release.sh --major

# Build only (no publish) — inspect the zip
./extensions/release.sh --build-only

# Dry run — see what would happen
./extensions/release.sh --dry-run
```

The release script handles everything automatically:
1. Bumps version in `manifest.json`
2. Minifies JS with Terser (opalite-auth, opalite-inject, opalite-socket, opalite-callback, opalite-upsell, popup)
3. Zips the extension (excludes `.DS_Store`, `__MACOSX`)
4. Uploads to Chrome Web Store via API
5. Publishes (submits for CWS review)

### From GitHub Actions

Go to **Actions** tab > **Publish Chrome Extensions** > **Run workflow**

Options:
- Which extensions (all, or pick one)
- Version bump type (patch/minor/major)
- Publish or build-only

Also triggers on push tags matching `ext-v*`.

### Manual Steps (build only)

```bash
# Build + zip one extension
./extensions/build.sh GrokExt-opalite

# Upload + publish separately
./extensions/publish.sh GrokExt-opalite --publish

# Upload only (review in CWS dashboard)
./extensions/publish.sh GrokExt-opalite --upload-only

# Check CWS status
./extensions/publish.sh GrokExt-opalite --status
```

## Setup

### Local Development

1. Clone this repo
2. Load an extension in Chrome: `chrome://extensions` > Developer mode > Load unpacked > select extension directory
3. Navigate to the target platform (grok.com, chatgpt.com, etc.)

### CWS Credentials (for publishing)

Copy the example and fill in your values:

```bash
cp extensions/.cws-credentials.example extensions/.cws-credentials
```

See the comments in `.cws-credentials.example` for the full setup guide.

For GitHub Actions, add the same values as repository secrets:
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`
- `CWS_PUBLISHER_ID`
- `CWS_ID_GROKEXT`
- `CWS_ID_GEMINIEXT`
- `CWS_ID_CHATGPTEXT`
- `CWS_ID_DA_STASH_HELPER`

## Related

- **Server**: [`opalsaints/opalite`](https://github.com/opalsaints/opalite) — Opalite SaaS (Next.js + Socket.io), deploys to Railway
