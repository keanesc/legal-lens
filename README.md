# Legal Lens — Chrome Extension

**Legal Lens** is a Chrome Extension that automatically detects and summarizes website **Terms of Service (ToS)** pop-ups using **Chrome’s on-device Gemini Nano AI**.  
It helps users quickly understand complex legal language while keeping all processing fully local and private.

---

## Features

- **Automatic Detection**  
  Detects ToS and Privacy Policy pop-ups in real time using `MutationObserver`.

- **On-Device AI Summarization**  
  Simplifies ToS text locally using Chrome's **Gemini Nano Summarizer API** — no data ever leaves your device.

- **Multilingual Support**  
  Automatically translates summaries to your browser's language using Chrome's **Translator API** — both UI and content in your language!

- **Privacy by Design**  
  100% local processing for both summarization and translation, no external servers or API calls.

- **Save & Compare**  
  Save summaries and compare them across websites to identify changes.

- **Smart UI Injection**  
  Adds an "Explain Terms" button automatically near detected ToS content.

---

## Requirements

| Requirement         | Details                            |
|---------------------|------------------------------------|
| **Chrome Version**  | 138+ for translation, 122+ for summarization |
| **Gemini Nano**     | Must be enabled via Chrome flags   |
| **Translator API**  | Enabled by default in Chrome 138+  |
| **Disk Space**      | ~1.5 GB for summarization + 1-5MB per translation language |

---

## Project Structure

```
legal-lens-extension/
├── manifest.json # Manifest V3 configuration
├── background.js # Background service worker
├── contentScript.js # Detects and extracts ToS pop-ups
├── popup/
│ ├── popup.html # Popup UI
│ ├── popup.js # Popup logic
│ └── popup.css # Popup styles
├── icons/ # Extension icons (16x16, 48x48, 128x128)
└── README.md # Documentation
```

---

## Setup Guide

### 1. Enable On-Device AI in Chrome

1. **Update Chrome** to version 122 or later  
   → Go to `chrome://settings/help`
2. **Enable the Optimization Guide flag**  
   → chrome://flags/#optimization-guide-on-device-model

   Set to **Enabled BypassPerfRequirement**  
Restart Chrome afterward.
3. **Verify Model Download**  
Open `chrome://components/` → find **Optimization Guide On Device Model** → confirm status.

---

### 2. Prepare Icons

Create the following icons inside the `icons/` folder:

| File Name     | Size       |
|---------------|------------|
| `icon16.png`  | 16×16 px   |
| `icon48.png`  | 48×48 px   |
| `icon128.png` | 128×128 px |

Use an icon that represents document simplification (e.g., a document with a checkmark).

---

### 3. Load the Extension in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select your `legal-lens-extension/` directory

The extension will now appear in your Chrome toolbar.

---

## Usage

1. Visit any website showing a Terms of Service or Privacy Policy pop-up.  
2. The extension automatically detects ToS content and displays an **“Explain Terms”** button.  
3. Click the button or open the extension popup → click **Simplify**.  
4. Review the summary and optionally **Save** it for comparison with future ToS versions.

---

## Technical Overview

### On-Device Summarization

- Powered by **Gemini Nano (Chrome Summarizer API)**
- Works entirely offline after the model download
- Summaries generated in 1–3 seconds
- No external data transfer or API key needed

---

### ToS Detection Algorithm

- Observes DOM changes with `MutationObserver`
- Searches for keywords such as:
- *terms*, *privacy*, *cookies*, *agreement*, *policy*
- Detects pop-ups by analyzing modal and overlay structures (`z-index`, opacity, etc.)
- Requires a minimum text length (50+ characters) to trigger summarization

---

### Message Passing

| From               | To              | Purpose                                               |
|--------------------|-----------------|-------------------------------------------------------|
| `popup.js`         | `background.js` | Handles user interactions                             |
| `contentScript.js` | `background.js` | Sends extracted ToS text                              |
|                    |                 | Uses `chrome.runtime.sendMessage()` for communication |

---

### 💾 Storage Schema

| Key           | Description                                |
|---------------|--------------------------------------------|
| `tos_<tabId>` | Current tab’s ToS summary |
| `saved_tos_list` | List of stored summaries for comparison |

All data is stored locally using `chrome.storage.local`.

---

## 🧪 Development & Debugging

### Viewing Logs

| Location | How to Access |
|-----------|---------------|
| **Content Script** | DevTools → Console (on webpage) |
| **Background Service Worker** | `chrome://extensions/` → *Details* → *Inspect service worker* |
| **Popup** | Right-click the popup → *Inspect* |

### Recommended Workflow

1. Load the extension in **Developer mode**.  
2. Open DevTools on a site with a ToS popup.  
3. Check the console for detection and summarization logs.  

---

## 🩺 Troubleshooting

**Issue:** “Summarizer API unavailable”  
- Ensure Chrome 122+ is installed  
- Enable the Optimization Guide flag  
- Wait for model download (`chrome://components/`)  

**Issue:** “No ToS text found”  
- Some websites use custom frameworks.  
- Try clicking **Simplify** manually from the popup.

**Extension not responding after update**  
- Reload the extension via `chrome://extensions/`  
- Check background logs for errors  
- Clear local storage if needed

---

## ⚖️ License

Licensed under the **GNU General Public License v3.0 (GPL-3.0)**.  
You are free to use, modify, and distribute this extension under the terms of the GPL-3.0 license.

---

## 🤝 Contributing

Contributions are welcome!  
Areas for improvement include:

- Smarter ToS detection (NLP or ML-based)  
- Enhanced UI/UX for summaries  
- Options page for customization  
- Export/Import features for stored summaries  
- Rich diff visualization for ToS comparisons

---

**Author:** _Your Name_  
**Version:** 1.0.0  
**License:** GNU GPL v3.0  
**Repository:** [GitHub Link Here]

---