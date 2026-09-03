# Link Saver

### How it looks now

<img width="440" alt="Link Saver current UI - categorized dark theme" src="Extension/Images/How%20it%20looks.png" />

### How it used to look

<img width="669" alt="Link Saver original UI - flat list" src="Extension/Images/How%20it%20used%20to%20look.png" />

## Overview

Link Saver is a Chrome extension for saving, auto-organizing, and exporting links from any page. It saves the current tab or a manually entered URL, automatically sorts each link into a category, and lets you browse, re-file, or bulk-delete links from a clean, dark-themed popup.

Categorization happens in two layers: a free, instant set of domain rules runs first, and if a link doesn't match any rule, it can optionally be sent to Google Gemini to pick (or invent) a category. Both are optional — the extension works fully offline with just the domain rules.

## Objectives

- Efficient link management inside a compact popup interface
- Automatic, low-effort organization instead of one long flat list
- Integration with Chrome Extension APIs (`storage`, `tabs`)
- Persistent local storage that survives browser restarts
- Optional external API integrations (TinyURL, Gemini) that are never required to use the extension

## Technologies Used

- **JavaScript (ES6)** — core logic, DOM rendering, event handling
- **HTML5 / CSS3** — popup structure and dark UI styling
- **Chrome Extension APIs (Manifest V3)**
  - `chrome.storage.local` — persistent storage for links, categories, and API keys
  - `chrome.tabs` — reading the active tab's URL for "Save current tab"
- **TinyURL API** — optional URL shortening for saved tabs
- **Google Gemini API** — optional AI-assisted categorization
- **Fetch API** — all HTTP requests to the above services

## Features

**Saving links**

- Save any URL by typing/pasting it into the input field
- Save the current tab in one click (shortened via TinyURL if a key is set)
- Duplicate links are skipped automatically

**Categories**

- Links are auto-sorted using domain rules (e.g. `github.com` → Development, `youtube.com` → Video) across built-in categories: Development, Gaming, Video, Social, Shopping, Docs & Tools, News & Reading, Other
- If nothing matches and a Gemini API key is set, the link is classified by AI, which can also invent new categories on the fly
- Categories are shown as a color-coded, count-badged list on the home screen; tapping one opens its links
- Custom categories can be created manually, and empty/unwanted categories can be deleted (their links move to "Other")
- Any individual link can be manually moved to a different category from a dropdown

**Managing saved links**

- Each link shows its favicon and title, and opens in a new tab on click
- Select one or more links via checkboxes and delete just those
- Delete all links within a category at once
- Toast notifications confirm actions instead of blocking alerts

**Data portability**

- Export all saved links as a JSON file
- Import a JSON file of links, with automatic deduplication (AI categorization is skipped during import to avoid API bursts — rule-based sorting still applies, and links can be re-filed manually afterward)

**Settings**

- Optional TinyURL API key, used only for "Save current tab"
- Optional Google Gemini API key, used only as a fallback categorizer when domain rules don't match
- Both keys are stored locally on-device only, never transmitted anywhere except their respective APIs

## How It Works

1. **Saving** — A URL is validated, optionally shortened (tab saves only), categorized (domain rules → Gemini fallback), and added to storage with a generated ID.
2. **Categorizing** — `matchDomainRule()` checks the URL's hostname against a table of known domains per category. If nothing matches and an AI key is present, `classifyWithAI()` asks Gemini to pick an existing category or propose a short new one.
3. **Rendering** — The popup has two views: a category list (home) and a category detail view showing that category's links. Both re-render from the in-memory state whenever it changes.
4. **Persisting** — Links and categories are written to `chrome.storage.local` after every change, so state survives popup close/reopen and browser restarts.
5. **Migrating old data** — On load, any previously saved links missing an `id` or `category` (from before these features existed) are backfilled automatically, with AI calls capped during this one-time pass.

## Project Structure

```
Extention/
├── index.html       # Popup markup
├── index.css         # Dark theme styling
├── index.js          # All extension logic
├── manifest.json      # MV3 manifest
└── icons/             # Extension icons
```

## Future Improvements

- Search/filter across all saved links
- Drag-and-drop reordering within a category
- Sync categorization rules across devices
- Replace `confirm()`/`prompt()` dialogs with in-popup modals
