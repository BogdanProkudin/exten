# Deployment Guide

## Convex Backend

### Initial Setup

1. Create a Convex account at [convex.dev](https://www.convex.dev)
2. Run `npx convex dev` to create and link a project
3. Set environment variables in the Convex dashboard:
   - `OPENAI_API_KEY` — Your OpenAI API key (required for AI features)

### Deploy Backend

```bash
npx convex deploy
```

This pushes your schema and functions to production.

## Chrome Web Store Submission

### Build

```bash
pnpm build
pnpm zip
```

The ZIP file will be in `.output/`.

### CWS Developer Dashboard

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay one-time $5 registration fee (if first time)
3. Click "New Item" and upload the ZIP from `.output/`
4. Fill in listing details:
   - **Category:** Education
   - **Language:** English
   - **Screenshots:** At least 1 screenshot (1280x800 or 640x400)
   - **Privacy policy:** Include the privacy policy from `public/privacy.html`
5. Submit for review (typically 1-3 business days)

### Required Fields

- Description (already in manifest)
- At least 1 screenshot
- Privacy policy URL
- Single purpose description

### Permissions Justification

When submitting, CWS may ask you to justify permissions:

| Permission | Justification |
|-----------|--------------|
| `storage` | Save user preferences and word cache locally |
| `alarms` | Schedule periodic review reminders |
| `activeTab` | Read selected text for translation on the current tab |
| `contextMenus` | Add "Translate with Vocabify" right-click menu |
| `scripting` | Inject content script for word selection UI |
| `idle` | Pause review toasts when user is idle |

### Host Permissions

| Host | Justification |
|------|--------------|
| `api.mymemory.translated.net` | Free translation API (primary) |
| `libretranslate.com` | Translation fallback |
| `translate.googleapis.com` | Translation fallback |
| `api.datamuse.com` | Word enrichment (synonyms, related words) |
| `api.dictionaryapi.dev` | Word definitions and phonetics |
| `www.youtube.com` | YouTube caption enhancement |

## CI/CD

GitHub Actions runs on every push to `main` and on PRs:
- Type checking
- Tests
- Production build
- ZIP packaging

### Required GitHub Secrets

- `VITE_CONVEX_URL` — Your production Convex deployment URL

## Version Bumping

Follow semver. Update version in `package.json`:

```bash
# WXT reads version from package.json for the manifest
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0
```
