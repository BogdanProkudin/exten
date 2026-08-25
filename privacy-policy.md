# Privacy Policy for Vocabify

**Last updated:** August 24, 2026

## What Vocabify Does

Vocabify is a Chrome extension that helps you learn vocabulary by translating
words and sentences you select while browsing, and scheduling spaced-repetition
reviews.

## Data We Collect

- **Saved vocabulary**: Words, phrases and sentences you explicitly choose to
  save, with their translations, example sentences and review progress.
- **Learning statistics**: Review scores, streaks and study session data used to
  produce your learning insights.
- **Device identifier**: A randomly generated ID that associates your data with
  your device. It is not linked to your identity and requires no account.

## How Data Is Stored

- Saved vocabulary and learning statistics are stored on your device and synced
  to our backend (Convex) so spaced repetition and insights work.
- Translations are cached on your device (IndexedDB) for up to 30 days to avoid
  repeat lookups. The cache is capped and pruned automatically.
- Your OpenAI API key, if you provide one, is stored **only on your device**
  (`chrome.storage.local`). It is never sent to our backend and never leaves
  your browser except in requests to OpenAI.
- No account or login is required.

## What Is Sent To Third Parties

Vocabify contacts external services only when you actively use a feature. What
is sent depends on the feature.

### Translating a word or sentence

When you select text and the translation popup opens, we send:

- the word or sentence you selected;
- **the sentence surrounding it on the page**, so the translation matches the
  intended meaning (for example, "bank" by a river versus a bank that lends
  money);
- **the page title and the site's domain name** (for example `example.com`), as
  additional context for the same purpose.

Where that goes depends on your settings:

| Service | When it is used | What it receives |
|---|---|---|
| OpenAI (`api.openai.com`) | When you have entered your own OpenAI API key and Smart Translation is on | Selected text, surrounding sentence, page title, domain |
| Google Translate (`translate.googleapis.com`) | Fallback when no key is set, or when OpenAI fails | Selected text only |
| MyMemory (`api.mymemory.translated.net`) | Fallback | Selected text only |
| LibreTranslate (`libretranslate.com`) | Fallback | Selected text only |

Requests to OpenAI are billed to **your** OpenAI account and are governed by
OpenAI's own privacy policy: https://openai.com/policies/privacy-policy

### Word details

| Service | What it receives |
|---|---|
| Datamuse (`api.datamuse.com`) | The single word, to return synonyms and antonyms |
| Free Dictionary API (`api.dictionaryapi.dev`) | The single word, to return definitions and pronunciation |

### Explain and Simplify (Reading Assistant)

These optional features send text to OpenAI through our backend, using **our**
API key rather than yours:

- **Explain a word**: the word and the sentence it appeared in.
- **Simplify this page**: up to 12,000 characters of the visible text of the
  page you are reading.

Use them only on pages whose content you are comfortable sending to OpenAI.

### Pronunciation (text-to-speech)

The word or sentence being pronounced is sent to whichever voice engine you have
selected: Google Translate TTS (`translate.googleapis.com`), OpenAI
(`api.openai.com`, using your own key), or your browser's built-in voices, which
send nothing over the network.

### YouTube

On YouTube, the extension reads subtitle text already present on the page so it
can highlight words you are learning. Nothing is sent anywhere for this.

## Data We Do NOT Collect

- No personally identifiable information (name, email, address)
- No browsing history, and no page content beyond what is described above
- No health, financial or location data
- No authentication credentials or passwords
- We do not read pages you have added to the excluded-sites list, and the
  extension never acts on text typed into inputs, password fields or editors

## Data Sharing

We do not sell your data or share it for advertising. Text is sent to the
services listed above solely to return a translation, definition or audio clip,
and only when you trigger that feature.

## Data Deletion

- Removing the extension deletes all data stored on your device, including your
  API key and the translation cache.
- Data synced to our backend is keyed to your device identifier and is **not**
  removed automatically when you uninstall. To have it deleted, email the
  address below with your device identifier, which is shown in
  Settings.

## Changes to This Policy

Updates will appear here with a new date.

## Contact

Questions about this policy: prokudinbogdan@gmail.com
