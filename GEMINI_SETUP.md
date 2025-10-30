# Gemini API Setup Guide

## Your Extension Now Uses Google Gemini!

The ToS Simplifier extension has been updated to use Google's Gemini 1.5 Flash model instead of OpenAI.

## Get Your Gemini API Key

1. **Go to Google AI Studio**: https://aistudio.google.com/app/apikey
2. **Sign in** with your Google account
3. **Click "Create API Key"**
4. **Copy your API key** (starts with `AIza...`)

## Set Your API Key

### Method 1: Using Browser Console (Recommended)

1. **Load the extension**:
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top-right toggle)
   - Click "Load unpacked"
   - Select your `c:\extention_project` folder

2. **Open Service Worker console**:
   - Find "ToS Simplifier" in the extensions list
   - Click "Details"
   - Click "Service Worker" (opens console)

3. **Set your Gemini API key**:
```javascript
chrome.storage.local.set({ api_key: 'YOUR_GEMINI_API_KEY_HERE' }, () => console.log('✅ Gemini API key saved!'));
```

Replace `YOUR_GEMINI_API_KEY_HERE` with your actual key from Google AI Studio.

4. **Verify it worked**:
```javascript
chrome.storage.local.get(['api_key'], r => console.log('Key set:', r.api_key ? 'Yes ✅' : 'No ❌'));
```

### Method 2: Using setup.html

1. Load the extension first (Method 1, step 1)
2. Open `setup.html` in Chrome
3. Paste your Gemini API key (starts with `AIza...`)
4. Click "Save API Key"

## Test the Extension

1. Visit any website with a Terms of Service popup
2. Click the extension icon
3. Click "Simplify"
4. You should see a real Gemini-generated summary!

## Benefits of Gemini

- **Free tier available** (with usage limits)
- **Fast responses** with Gemini 1.5 Flash
- **Good at understanding legal text**
- **Integrated with Google's safety filters**

## API Key Security

⚠️ **Keep your API key private!**
- Don't share it publicly
- Don't commit it to version control
- If compromised, regenerate it at https://aistudio.google.com/app/apikey

The key is stored locally in Chrome Storage and only used for API calls to Google.

## Troubleshooting

If you get errors:
1. Check that your API key is correct
2. Verify you have API access enabled in Google AI Studio
3. Check the browser console for error messages
4. Make sure you're using the latest version of the extension

Your extension is now ready to use Google Gemini for AI-powered ToS summarization!
