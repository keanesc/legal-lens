// Background Service Worker for ToS Simplifier Extension
// Uses Chrome's on-device Summarizer API (Gemini Nano) to summarize ToS text

// Track active tabs and their ToS detection status
const activeTabs = new Map();

/**
 * Listen for messages from popup and content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'DETECT_TOS':
      // Content script detected a ToS popup
      handleTosDetection(message, sender);
      sendResponse({ success: true });
      break;

    case 'SIMPLIFY_TOS':
      // User clicked Simplify button
      handleSimplifyRequest(message, sender, sendResponse);
      return true; // Required for async sendResponse
      break;

    case 'SAVE_TOS':
      // User clicked Save button
      handleSaveRequest(message, sender, sendResponse);
      return true;
      break;

    case 'COMPARE_TOS':
      // User clicked Compare button
      handleCompareRequest(message, sender, sendResponse);
      return true;
      break;

    case 'EXTRACT_TEXT':
      // Content script extracted ToS text
      handleTextExtraction(message, sender, sendResponse);
      return true;
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true; // Keep message channel open for async responses
});

/**
 * Handle ToS detection from content script
 */
function handleTosDetection(message, sender) {
  const tabId = sender.tab?.id;
  if (tabId) {
    activeTabs.set(tabId, {
      detected: true,
      detectedAt: Date.now(),
      url: sender.tab.url
    });
  }
}

/**
 * Handle simplify request from popup
 */
async function handleSimplifyRequest(message, sender, sendResponse) {
  try {
    const tabId = message.tabId || sender.tab?.id;
    
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID provided' });
      return;
    }

    // Request text extraction from content script
    chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_TOS_TEXT' }, async (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ 
          success: false, 
          error: 'Failed to communicate with content script: ' + chrome.runtime.lastError.message 
        });
        return;
      }

      if (!response || !response.text) {
        sendResponse({ success: false, error: 'No ToS text found on page' });
        return;
      }

      // Summarize locally using Summarizer API
      const { summary, status } = await summarizeLocally(response.text);
      
      // Store summary for later use
      const storedData = {
        url: response.url,
        originalText: response.text.substring(0, 500), // Store first 500 chars
        summary: summary,
        timestamp: Date.now()
      };

      await chrome.storage.local.set({
        [`tos_${tabId}`]: storedData
      });

      sendResponse({ 
        success: true,
        status,
        summary,
        storedData: storedData
      });
    });
  } catch (error) {
    console.error('Error simplifying ToS:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle save request from popup
 */
async function handleSaveRequest(message, sender, sendResponse) {
  try {
    const tabId = message.tabId || sender.tab?.id;
    
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID provided' });
      return;
    }

    // Get stored ToS data
    const result = await chrome.storage.local.get([`tos_${tabId}`]);
    const tosData = result[`tos_${tabId}`];

    if (!tosData) {
      sendResponse({ success: false, error: 'No ToS data found. Please simplify first.' });
      return;
    }

    // Save to saved list
    const savedList = await chrome.storage.local.get(['saved_tos_list']);
    const list = savedList.saved_tos_list || [];
    
    list.push({
      ...tosData,
      savedAt: Date.now()
    });

    await chrome.storage.local.set({ saved_tos_list: list });

    sendResponse({ success: true, message: 'ToS saved successfully' });
  } catch (error) {
    console.error('Error saving ToS:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle compare request from popup
 */
async function handleCompareRequest(message, sender, sendResponse) {
  try {
    const tabId = message.tabId || sender.tab?.id;
    
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID provided' });
      return;
    }

    // Get current ToS data
    const currentResult = await chrome.storage.local.get([`tos_${tabId}`]);
    const currentTos = currentResult[`tos_${tabId}`];

    if (!currentTos) {
      sendResponse({ success: false, error: 'No current ToS data found. Please simplify first.' });
      return;
    }

    // Get saved list
    const savedList = await chrome.storage.local.get(['saved_tos_list']);
    const list = savedList.saved_tos_list || [];

    if (list.length === 0) {
      sendResponse({ success: false, error: 'No saved ToS to compare with' });
      return;
    }

    // Return comparison data
    sendResponse({ 
      success: true, 
      current: currentTos,
      saved: list,
      comparison: `Found ${list.length} saved ToS document(s) for comparison`
    });
  } catch (error) {
    console.error('Error comparing ToS:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle text extraction from content script
 */
async function handleTextExtraction(message, sender, sendResponse) {
  try {
    if (!message.text || message.text.trim().length === 0) {
      sendResponse({ success: false, error: 'No text extracted' });
      return;
    }

    // Summarize the extracted text locally
    const { summary, status } = await summarizeLocally(message.text);

    // Store temporarily
    const tabId = sender.tab?.id;
    if (tabId) {
      const storedData = {
        url: message.url || sender.tab.url,
        originalText: message.text.substring(0, 500),
        summary: summary,
        timestamp: Date.now()
      };

      await chrome.storage.local.set({
        [`tos_${tabId}`]: storedData
      });
    }

    sendResponse({ 
      success: true,
      status,
      summary
    });
  } catch (error) {
    console.error('Error processing extracted text:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle tab updates to inject content script if needed
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Reset detection status for this tab
    activeTabs.delete(tabId);
  }
});

// Cleanup on extension startup
chrome.runtime.onStartup.addListener(() => {
  activeTabs.clear();
});

/**
 * Use Chrome's on-device Summarizer API with recursive chunking.
 * Returns: { summary: string, status: string }
 */
async function summarizeLocally(text) {
  try {
    if (!('Summarizer' in self)) {
      console.warn('Summarizer API not supported in this browser.');
      return { summary: 'Summarizer not available.', status: 'unavailable' };
    }

    const availability = await self.Summarizer.availability();
    console.log('[Summarizer] availability:', availability);
    if (availability !== 'available' && availability !== 'downloadable' && availability !== 'after-download') {
      console.warn('Summarizer model not ready.');
      return { summary: 'Summarizer model unavailable.', status: 'unavailable' };
    }

    // Monitor model download progress if applicable
    const monitor = (m) => {
      try {
        m.addEventListener('downloadprogress', (e) => {
          const loaded = e?.loaded || 0;
          const total = e?.total || 0;
          chrome.runtime.sendMessage({ type: 'MODEL_PROGRESS', loaded, total });
        });
      } catch (_) {}
    };

    const summarizer = await self.Summarizer.create({
      type: 'tldr',
      format: 'plain-text',
      length: 'long',
      sharedContext: 'Summarizing legal Terms of Service text for clarity.',
      monitor
    });

    // Determine safe maximum characters per chunk based on inputQuota (tokens)
    // Approximate: 1 token ~ 4 chars on average; use conservative 1 token ~ 3 chars
    const quotaTokens = Number(summarizer.inputQuota || 3000);
    const MAX_LENGTH = Math.max(1000, Math.floor(quotaTokens * 3));
    const OVERLAP = 200;

    const splitText = (fullText, maxLength = MAX_LENGTH, overlap = OVERLAP) => {
      const chunks = [];
      let start = 0;
      const textLen = fullText.length;
      while (start < textLen) {
        let end = start + maxLength;
        if (end < textLen) {
          const boundary = fullText.lastIndexOf('.', end);
          end = boundary > start ? boundary + 1 : end;
        } else {
          end = textLen;
        }
        const chunk = fullText.slice(start, end).trim();
        if (chunk) chunks.push(chunk);
        if (end >= textLen) break;
        start = Math.max(0, end - overlap);
      }
      return chunks;
    };

    const summarizeChunksRecursively = async (model, inputText, depth = 0) => {
      const MAX_DEPTH = 8; // safety cap to avoid infinite recursion
      if (depth > MAX_DEPTH) {
        console.warn('[Summarizer] Max recursion depth reached. Returning last level text.');
        return inputText.slice(0, MAX_LENGTH);
      }
      if (inputText.length <= MAX_LENGTH) {
        return await model.summarize(inputText, { context: 'Summarize for a general audience.' });
      }
      const chunks = splitText(inputText, MAX_LENGTH, OVERLAP);
      const partials = [];
      for (const chunk of chunks) {
        const partSummary = await model.summarize(chunk);
        partials.push(partSummary);
      }
      const combined = partials.join('\n');
      return await summarizeChunksRecursively(model, combined, depth + 1);
    };

    const summary = await summarizeChunksRecursively(summarizer, text);
    const status = availability === 'downloadable' || availability === 'after-download' ? 'downloaded' : 'available';
    return { summary, status };
  } catch (err) {
    console.error('[Summarizer] Error summarizing:', err);
    return { summary: 'Failed to summarize locally: ' + (err?.message || String(err)), status: 'error' };
  }
}

