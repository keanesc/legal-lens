# ToS Simplifier Chrome Extension

A Chrome Extension that automatically detects and summarizes Terms of Service (ToS) popups on websites using AI summarization.

## Features

- 🤖 **Automatic Detection**: Uses MutationObserver to detect ToS popups in real-time
- ✨ **AI Summarization**: Simplifies complex legal language into easy-to-understand summaries
- 💾 **Save & Compare**: Save ToS summaries and compare them across different websites
- 🎯 **Smart Injection**: Automatically injects "Explain" buttons next to detected ToS popups

## Project Structure

```
tos-simplifier-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Service worker for background tasks
├── contentScript.js       # Content script for ToS detection
├── apiConnector.js        # API communication handler
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── icons/                 # Extension icons (16x16, 48x48, 128x128)
└── README.md             # This file
```

## Setup Instructions

### 1. Create Icons

You need to create three icon files in the `icons/` directory:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

You can use any icon design tool or online icon generator. The icons should represent the extension's purpose (e.g., a document with a checkmark or a simplified text icon).

### 2. Configure API Key

1. Open `apiConnector.js`
2. Set your API key in one of these ways:
   - Option A: Set `API_CONFIG.apiKey` directly (not recommended for production)
   - Option B: Use Chrome Storage API to set 'api_key' (recommended)
   - Option C: Create an options page to let users configure their API key

Example for Option B (in browser console or via extension):
```javascript
chrome.storage.local.set({ api_key: 'your-api-key-here' });
```

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
   - The extension will extract and summarize the ToS text

3. **Save**: Click "Save" to store the summary for later reference

4. **Compare**: Click "Compare" to see differences between current and saved ToS documents

5. **Explain Button**: When a ToS popup is detected, an "Explain Terms" button will appear. Click it to get an instant summary.

## API Configuration

The extension supports OpenAI API by default, but can be configured for any API endpoint.

### OpenAI Setup
1. Get an API key from https://platform.openai.com/
2. Set it using Chrome Storage API or modify `apiConnector.js`

### Custom API
Modify `apiConnector.js`:
- Update `API_CONFIG.endpoint` with your API URL
- Modify `callGenericAPI()` method to match your API's request/response format

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

## Rate Limiting & Retry Logic

The API connector includes:
- Exponential backoff retry mechanism
- Configurable max retries (default: 3)
- Rate limit queue management
- Fallback to mock summary if API fails

## Browser Compatibility

- Chrome/Chromium (Manifest V3)
- Edge (Chromium-based)
- Other Chromium-based browsers

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

## License

MIT License - Feel free to use and modify as needed.

## Contributing

Contributions welcome! Areas for improvement:
- Better ToS detection algorithms
- Support for more API providers
- UI/UX enhancements
- Options page for configuration
- Export/import saved summaries


