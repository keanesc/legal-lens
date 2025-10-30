// Background Service Worker for ToS Simplifier Extension
// Uses Chrome's on-device Summarizer API (Gemini Nano) to summarize ToS text

// Track active tabs and their ToS detection status
const activeTabs = new Map();

// Track API availability status
let summarizerAvailability = null;

/**
 * Check Summarizer API availability on startup
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log("ToS Simplifier extension installed/updated");
  await checkSummarizerAvailability();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("ToS Simplifier extension started");
  activeTabs.clear();
  await checkSummarizerAvailability();
});

/**
 * Check if Summarizer API is available
 */
async function checkSummarizerAvailability() {
  try {
    if (!("ai" in self) && !("Summarizer" in self)) {
      summarizerAvailability = "unsupported";
      console.error(
        "[Summarizer] API not available in this browser. Requires Chrome 122+"
      );
      return;
    }

    const availability = await self.Summarizer.availability();
    summarizerAvailability = availability;
    console.log("[Summarizer] Availability status:", availability);

    if (availability === "after-download") {
      console.log(
        "[Summarizer] Model download required. The model will download automatically on first use."
      );
    } else if (availability === "unavailable") {
      console.error(
        "[Summarizer] API unavailable. Please enable chrome://flags/#optimization-guide-on-device-model"
      );
    }
  } catch (error) {
    summarizerAvailability = "error";
    console.error("[Summarizer] Error checking availability:", error);
  }
}

/**
 * Listen for messages from popup and content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.type);

  switch (message.type) {
    case "CHECK_API_STATUS":
      // Check API availability
      sendResponse({
        success: true,
        availability: summarizerAvailability,
        message: getAvailabilityMessage(summarizerAvailability),
      });
      break;

    case "DETECT_TOS":
      // Content script detected a ToS popup
      handleTosDetection(message, sender);
      sendResponse({ success: true });
      break;

    case "SIMPLIFY_TOS":
      // User clicked Simplify button
      handleSimplifyRequest(message, sender, sendResponse);
      return true; // Required for async sendResponse
      break;

    case "SAVE_TOS":
      // User clicked Save button
      handleSaveRequest(message, sender, sendResponse);
      return true;
      break;

    case "COMPARE_TOS":
      // User clicked Compare button
      handleCompareRequest(message, sender, sendResponse);
      return true;
      break;

    case "EXTRACT_TEXT":
      // Content script extracted ToS text
      handleTextExtraction(message, sender, sendResponse);
      return true;
      break;

    default:
      sendResponse({ success: false, error: "Unknown message type" });
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
      url: sender.tab.url,
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
      sendResponse({ success: false, error: "No tab ID provided" });
      return;
    }

    // Request text extraction from content script
    chrome.tabs.sendMessage(
      tabId,
      { type: "EXTRACT_TOS_TEXT" },
      async (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error:
              "Failed to communicate with content script: " +
              chrome.runtime.lastError.message,
          });
          return;
        }

        if (!response || !response.text) {
          sendResponse({ success: false, error: "No ToS text found on page" });
          return;
        }

        // Summarize locally using Summarizer API
        const { summary, status } = await summarizeLocally(response.text);

        // Store summary for later use
        const storedData = {
          url: response.url,
          originalText: response.text.substring(0, 500), // Store first 500 chars
          summary: summary,
          timestamp: Date.now(),
        };

        await chrome.storage.local.set({
          [`tos_${tabId}`]: storedData,
        });

        sendResponse({
          success: true,
          status,
          summary,
          storedData: storedData,
        });
      }
    );
  } catch (error) {
    console.error("Error simplifying ToS:", error);
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
      sendResponse({ success: false, error: "No tab ID provided" });
      return;
    }

    // Get stored ToS data
    const result = await chrome.storage.local.get([`tos_${tabId}`]);
    const tosData = result[`tos_${tabId}`];

    if (!tosData) {
      sendResponse({
        success: false,
        error: "No ToS data found. Please simplify first.",
      });
      return;
    }

    // Save to saved list
    const savedList = await chrome.storage.local.get(["saved_tos_list"]);
    const list = savedList.saved_tos_list || [];

    list.push({
      ...tosData,
      savedAt: Date.now(),
    });

    await chrome.storage.local.set({ saved_tos_list: list });

    sendResponse({ success: true, message: "ToS saved successfully" });
  } catch (error) {
    console.error("Error saving ToS:", error);
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
      sendResponse({ success: false, error: "No tab ID provided" });
      return;
    }

    // Get current ToS data
    const currentResult = await chrome.storage.local.get([`tos_${tabId}`]);
    const currentTos = currentResult[`tos_${tabId}`];

    if (!currentTos) {
      sendResponse({
        success: false,
        error: "No current ToS data found. Please simplify first.",
      });
      return;
    }

    // Get saved list
    const savedList = await chrome.storage.local.get(["saved_tos_list"]);
    const list = savedList.saved_tos_list || [];

    if (list.length === 0) {
      sendResponse({ success: false, error: "No saved ToS to compare with" });
      return;
    }

    // Return comparison data
    sendResponse({
      success: true,
      current: currentTos,
      saved: list,
      comparison: `Found ${list.length} saved ToS document(s) for comparison`,
    });
  } catch (error) {
    console.error("Error comparing ToS:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle text extraction from content script
 */
async function handleTextExtraction(message, sender, sendResponse) {
  try {
    if (!message.text || message.text.trim().length === 0) {
      sendResponse({ success: false, error: "No text extracted" });
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
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({
        [`tos_${tabId}`]: storedData,
      });
    }

    sendResponse({
      success: true,
      status,
      summary,
    });
  } catch (error) {
    console.error("Error processing extracted text:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle tab updates to inject content script if needed
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    // Reset detection status for this tab
    activeTabs.delete(tabId);
  }
});

/**
 * Get user-friendly message for availability status
 */
function getAvailabilityMessage(status) {
  switch (status) {
    case "readily":
      return "AI summarization is ready to use";
    case "after-download":
      return "AI model will download on first use (~1.5GB)";
    case "unavailable":
      return "AI summarization unavailable. Please enable chrome://flags/#optimization-guide-on-device-model and restart Chrome";
    case "unsupported":
      return "This browser does not support on-device AI. Please use Chrome 122 or later";
    case "error":
      return "Error checking AI availability. Please check browser console";
    default:
      return "Checking AI availability...";
  }
}

/**
 * Use Chrome's on-device Summarizer API
 * Returns: { summary: string, status: string }
 */
async function summarizeLocally(text) {
  try {
    // Re-check availability if not cached
    if (!summarizerAvailability) {
      await checkSummarizerAvailability();
    }

    // Provide helpful error messages based on availability
    if (summarizerAvailability === "unsupported") {
      return {
        summary:
          "On-device AI is not supported in this browser. Please use Chrome 122 or later.",
        status: "unsupported",
      };
    }

    if (summarizerAvailability === "unavailable") {
      return {
        summary:
          "On-device AI is not available. Please enable it at chrome://flags/#optimization-guide-on-device-model and restart Chrome.",
        status: "unavailable",
      };
    }

    if (!("Summarizer" in self)) {
      return {
        summary:
          "Summarizer API not available in this browser. Please use Chrome 122 or later.",
        status: "unavailable",
      };
    }

    // Check availability; may be 'readily', 'unavailable', or 'after-download'
    const availability = await self.Summarizer.availability();
    console.log("[Summarizer] Current availability:", availability);

    if (availability === "unavailable") {
      return {
        summary:
          "Summarizer API unavailable. Please enable chrome://flags/#optimization-guide-on-device-model",
        status: "unavailable",
      };
    }

    // If model needs download, inform the user
    const needsDownload = availability === "after-download";
    if (needsDownload) {
      console.log(
        "[Summarizer] Downloading AI model... This may take a few minutes."
      );
    }

    const summarizer = await self.Summarizer.create({
      type: "key-points",
      format: "markdown",
      length: "medium",
      sharedContext: "Summarizing Terms of Service for user clarity",
    });

    const summary = await summarizer.summarize(text, {
      context: "Simplify the legal content for a general audience.",
    });

    // Clean up
    summarizer.destroy();

    const status = needsDownload ? "downloaded" : "readily";

    // Update cached availability
    if (needsDownload) {
      summarizerAvailability = "readily";
    }

    return { summary, status };
  } catch (err) {
    console.error("[Summarizer] Error summarizing:", err);

    // Provide helpful error messages
    let errorMessage = "Failed to summarize: ";
    if (err.message && err.message.includes("user activation")) {
      errorMessage +=
        "Please click the extension icon in the toolbar and try again.";
    } else {
      errorMessage += err?.message || String(err);
    }

    return {
      summary: errorMessage,
      status: "error",
    };
  }
}
