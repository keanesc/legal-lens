# ToS Simplifier Chrome Extension

A Chrome Extension that automatically detects and summarizes Terms of Service (ToS) popups on websites using Chrome's built-in AI (Gemini Nano).

## Features

- 🤖 **Automatic Detection**: Uses MutationObserver to detect ToS popups in real-time
- ✨ **On-Device AI Summarization**: Uses Chrome's built-in Gemini Nano to simplify complex legal language locally
- 🔒 **Privacy-Focused**: All summarization happens on your device - no data sent to external servers
- 💾 **Save & Compare**: Save ToS summaries and compare them across different websites
- 🎯 **Smart Injection**: Automatically injects "Explain" buttons next to detected ToS popups

## Requirements

- **Chrome 122 or later** (released February 2024)
- **Gemini Nano enabled** via Chrome flags
- **Sufficient disk space** for on-device AI model (~1.5GB)

## Project Structure

```text
tos-simplifier-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for background tasks
├── contentScript.js       # Content script for ToS detection
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── icons/                 # Extension icons (16x16, 48x48, 128x128)
└── README.md             # This file
```

## Setup Instructions

### 1. Enable Chrome's On-Device AI

Before installing the extension, you need to enable Chrome's built-in AI features:

1. **Update Chrome**: Make sure you're running Chrome 122 or later (check at `chrome://settings/help`)
2. **Enable the feature flag**:
   - Go to `chrome://flags/#optimization-guide-on-device-model`
   - Set it to **Enabled BypassPerfRequirement**
   - Restart Chrome
3. **Download the AI model**:
   - The Gemini Nano model will download automatically when first used
   - This requires ~1.5GB of disk space
   - You can check download status at `chrome://components/` (look for "Optimization Guide On Device Model")

### 2. Create Icons

You need to create three icon files in the `icons/` directory:

- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can use any icon design tool or online icon generator. The icons should represent the extension's purpose (e.g., a document with a checkmark or a simplified text icon).

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the extension directory
5. The extension should now be installed!

## Usage

1. **Automatic Detection**: Visit any website with a ToS popup. The extension will automatically detect it.

2. **Simplify Terms**:
   - Click the extension icon in the toolbar
   - Click "Simplify" button
   - The extension will extract and summarize the ToS text using on-device AI

3. **Save**: Click "Save" to store the summary for later reference

4. **Compare**: Click "Compare" to see differences between current and saved ToS documents

5. **Explain Button**: When a ToS popup is detected, an "Explain Terms" button will appear. Click it to get an instant summary.

## How It Works

This extension uses **Chrome's built-in Summarizer API** (powered by Gemini Nano) to generate summaries entirely on your device. No data is sent to external servers, ensuring your privacy.

The Summarizer API:

- Runs completely offline after initial model download
- Uses ~1.5GB of disk space for the AI model
- Generates summaries in 1-3 seconds
- Respects Chrome's built-in safety filters

## Technical Details

### Manifest V3 Compliance

- Uses service worker instead of background page
- Proper permissions: `activeTab`, `scripting`, `storage`
- Host permissions: `<all_urls>` for content script injection

### ToS Detection Algorithm

- Uses MutationObserver to watch for DOM changes
- Searches for common keywords: "terms", "privacy", "cookie", etc.
- Checks for modal/popup structures (high z-index, overlay classes)
- Requires minimum text length (50 characters)

### Message Passing

- `popup.js` ↔ `background.js`: User actions
- `contentScript.js` ↔ `background.js`: ToS detection and text extraction
- Uses `chrome.runtime.sendMessage()` and `chrome.runtime.onMessage.addListener()`

### Storage

- Uses `chrome.storage.local` for:
  - Current tab ToS data: `tos_${tabId}`
  - Saved ToS list: `saved_tos_list`
- No API keys required (uses on-device AI)

## Browser Compatibility

- **Chrome 122+** (required for Summarizer API)
- **Chromium 122+** (if Gemini Nano support is enabled)
- Edge and other Chromium browsers may work if they support the Summarizer API

## Development

### Testing

1. Load extension in developer mode
2. Open browser console to see logs
3. Visit test sites with ToS popups
4. Check background script logs: `chrome://extensions/` → Details → Service Worker

### Debugging

- Content script logs: Open DevTools on the webpage
- Background script logs: Service Worker console
- Popup logs: Right-click popup → Inspect

## Troubleshooting

**"Summarizer API unavailable"**

- Make sure you're using Chrome 122 or later
- Enable the flag at `chrome://flags/#optimization-guide-on-device-model`
- Restart Chrome and wait for the model to download
- Check `chrome://components/` for "Optimization Guide On Device Model" status

**"No ToS text found on page"**

- The extension looks for common ToS patterns
- Some custom popups may not be detected automatically
- Try clicking the extension icon and manually clicking "Simplify"

**Extension not working after update**

- Reload the extension at `chrome://extensions/`
- Check the service worker console for errors
- Clear extension storage and try again

## License

MIT License - Feel free to use and modify as needed.

## Contributing

Contributions welcome! Areas for improvement:

- Better ToS detection algorithms
- UI/UX enhancements
- Options page for configuration
- Export/import saved summaries
- Diff view for ToS comparisons


