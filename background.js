// Background Service Worker for Legal Lens Extension
// Uses Chrome's on-device Summarizer API (Gemini Nano) to summarize ToS text

// Track active tabs and their ToS detection status
const activeTabs = new Map();

// Track API availability status
let summarizerAvailability = null;

/**
 * Check Summarizer API availability on startup
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Legal Lens extension installed/updated");
  await checkSummarizerAvailability();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("Legal Lens extension started");
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

    if (
      availability === "after-download" ||
      availability === "downloadable" ||
      availability === "downloading"
    ) {
      console.log(
        `[Summarizer] Model ${availability}. The model will download when you click 'Simplify' (approximately 1.5GB).`
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

    case "FETCH_TOS_PAGE":
      // Content script requests to fetch a ToS page (to avoid CORS)
      handleFetchTosPage(message, sender, sendResponse);
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
 * Ensure content script is loaded in the tab
 * Injects it if not already present
 */
async function ensureContentScriptLoaded(tabId) {
  try {
    // Try to ping the content script
    const pingResult = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
        // If we get a response, script is loaded
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    if (pingResult) {
      console.log("[Background] Content script already loaded");
      return;
    }

    // Content script not loaded, inject it
    console.log("[Background] Injecting content script...");
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["contentScript.js"],
    });

    // Wait a bit for script to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("[Background] Content script injected successfully");
  } catch (error) {
    console.error("[Background] Error ensuring content script loaded:", error);
    // Continue anyway, the sendMessage will fail with a proper error
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

    // Try to inject content script if not already loaded
    await ensureContentScriptLoaded(tabId);

    // Request text extraction from content script
    chrome.tabs.sendMessage(
      tabId,
      { type: "EXTRACT_TOS_TEXT" },
      async (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error:
              "Failed to communicate with content script. Please refresh the page and try again. (" +
              chrome.runtime.lastError.message +
              ")",
          });
          return;
        }

        if (!response || !response.text) {
          const errorMsg =
            response?.source === "none"
              ? "No Terms of Service found on this page. The extension looks for ToS links or ToS content on the current page."
              : "No ToS text found on page";
          sendResponse({
            success: false,
            error: errorMsg,
            source: response?.source || "unknown",
          });
          return;
        }

        console.log(
          `[Background] Received ToS text from ${response.source}: ${response.text.length} chars from ${response.url}`
        );

        // Summarize locally using Summarizer API
        const { summary, status } = await summarizeLocally(response.text);

        // Store summary for later use
        const storedData = {
          url: response.url,
          originalText: response.text.substring(0, 500), // Store first 500 chars for display
          fullText: response.text, // Store full text for chatbot
          summary: summary,
          timestamp: Date.now(),
          source: response.source || "unknown",
          linkText: response.linkText || "",
        };

        await chrome.storage.local.set({
          [`tos_${tabId}`]: storedData,
        });

        sendResponse({
          success: true,
          status,
          summary,
          storedData: storedData,
          source: response.source,
          tosUrl: response.url,
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
 * Handle ToS page fetch request from content script
 * Fetches external URLs to avoid CORS issues in content scripts
 */
async function handleFetchTosPage(message, sender, sendResponse) {
  try {
    const url = message.url;

    if (!url) {
      sendResponse({ success: false, error: "No URL provided" });
      return;
    }

    console.log(`[Background] Fetching ToS page: ${url}`);

    // Use fetch API from background script (no CORS restrictions)
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; Legal-Lens-Extension)",
      },
      credentials: "omit", // Don't send cookies for privacy
    });

    if (!response.ok) {
      console.error(`[Background] Failed to fetch ${url}: ${response.status}`);
      sendResponse({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
      return;
    }

    const html = await response.text();
    console.log(
      `[Background] Successfully fetched ${url} (${html.length} bytes)`
    );

    sendResponse({
      success: true,
      html: html,
      url: url,
    });
  } catch (error) {
    console.error(`[Background] Error fetching ToS page:`, error);
    sendResponse({
      success: false,
      error: error.message,
    });
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
    case "downloadable":
      return "AI model needs to download (~1.5GB). Click Simplify to start download.";
    case "downloading":
      return "AI model is downloading in the background (~1.5GB). Click Simplify to use it (may take a few minutes).";
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
 * Use Chrome's on-device Summarizer API with recursive chunking.
 * Returns: { summary: string, status: string }
 */
async function summarizeLocally(text) {
  try {
    // Ensure availability cached
    if (!summarizerAvailability) {
      await checkSummarizerAvailability();
    }

    if (!("Summarizer" in self)) {
      console.warn("Summarizer API not supported in this browser.");
      return { summary: "Summarizer not available.", status: "unavailable" };
    }

    const availability = await self.Summarizer.availability();
    console.log("[Summarizer] Current availability:", availability);
    if (availability === "unavailable") {
      return {
        summary: "Summarizer model unavailable.",
        status: "unavailable",
      };
    }

    const needsDownload =
      availability === "after-download" ||
      availability === "downloadable" ||
      availability === "downloading";

    // Helper functions for chunk processing
    const quotaTokens = 3000; // Default quota
    const MAX_LENGTH = Math.max(1000, Math.floor(quotaTokens * 3));
    const OVERLAP = 200;

    const splitText = (fullText, maxLength = MAX_LENGTH, overlap = OVERLAP) => {
      const chunks = [];
      let start = 0;
      const textLen = fullText.length;
      while (start < textLen) {
        let end = start + maxLength;
        if (end < textLen) {
          const boundary = fullText.lastIndexOf(".", end);
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
      const MAX_DEPTH = 8;
      if (depth > MAX_DEPTH) {
        console.warn(
          "[Summarizer] Max recursion depth reached. Returning last level text."
        );
        return inputText.slice(0, MAX_LENGTH);
      }
      if (inputText.length <= MAX_LENGTH) {
        return await model.summarize(inputText, {
          context: "Summarize for a general audience.",
        });
      }
      const chunks = splitText(inputText, MAX_LENGTH, OVERLAP);
      const partials = [];
      for (const chunk of chunks) {
        const partSummary = await model.summarize(chunk);
        partials.push(partSummary);
      }
      const combined = partials.join("\n");
      return await summarizeChunksRecursively(model, combined, depth + 1);
    };

    if (needsDownload) {
      console.log(
        `[Summarizer] Model ${availability}. Will initiate download with progress monitoring (approximately 1.5GB).`
      );

      // IMPORTANT: If the model download doesn't start automatically,
      // users need to manually trigger it from chrome://components/
      console.log(
        "[Summarizer] NOTE: If download doesn't start, go to chrome://components/ and click 'Check for update' on 'Optimization Guide On Device Model'"
      );

      // Send initial progress update
      chrome.runtime
        .sendMessage({
          type: "DOWNLOAD_PROGRESS",
          percent: 0,
          status:
            "Starting download... If stuck, open chrome://components/ and click 'Check for update' on 'Optimization Guide On Device Model'",
        })
        .catch(() => {
          console.log(
            "[Summarizer] Could not send initial progress to popup (popup may be closed)"
          );
        });

      // Create summarizer with download progress monitoring
      try {
        let downloadProgress = 0;
        let modelExtractingOrLoading = false;
        let lastProgressUpdate = Date.now();
        let progressCheckInterval = null;

        const summarizer = await self.Summarizer.create({
          type: "tldr",
          format: "plain-text",
          length: "long",
          sharedContext: "Summarizing legal Terms of Service text for clarity.",
          monitor(m) {
            console.log("[Summarizer] Monitor callback registered");

            // Set up a fallback progress checker since downloadprogress events may not fire reliably
            progressCheckInterval = setInterval(() => {
              const timeSinceLastUpdate = Date.now() - lastProgressUpdate;
              if (timeSinceLastUpdate > 5000 && downloadProgress === 0) {
                console.log(
                  "[Summarizer] No progress updates received for 5+ seconds. Download may be happening in background."
                );
                chrome.runtime
                  .sendMessage({
                    type: "DOWNLOAD_PROGRESS",
                    percent: 0,
                    status:
                      "Downloading in background... This may take several minutes. Check chrome://components for 'Optimization Guide On Device Model' status.",
                  })
                  .catch(() => {});
              }
            }, 5000);

            m.addEventListener("downloadprogress", (e) => {
              lastProgressUpdate = Date.now();
              downloadProgress = e.loaded;
              const percent = Math.round(e.loaded * 100);
              console.log(
                `[Summarizer] Download progress event: loaded=${e.loaded}, percent=${percent}%`
              );

              // Send progress update to popup
              const message = {
                type: "DOWNLOAD_PROGRESS",
                percent: percent,
                status:
                  percent < 100
                    ? `Downloading AI model... (${percent}%)`
                    : "Download complete. Extracting and loading model...",
              };

              console.log("[Summarizer] Sending message to popup:", message);

              chrome.runtime
                .sendMessage(message)
                .then((response) => {
                  console.log(
                    "[Summarizer] Message sent successfully, response:",
                    response
                  );
                })
                .catch((error) => {
                  // Popup might not be open, ignore error
                  console.log(
                    "[Summarizer] Could not send progress to popup:",
                    error.message
                  );
                });

              // When download completes, model needs to be extracted and loaded
              if (e.loaded === 1 && !modelExtractingOrLoading) {
                modelExtractingOrLoading = true;
                console.log(
                  "[Summarizer] Download complete. Extracting and loading model into memory..."
                );

                // Send extraction status to popup
                chrome.runtime
                  .sendMessage({
                    type: "DOWNLOAD_PROGRESS",
                    percent: 100,
                    status: "Extracting and loading model into memory...",
                  })
                  .catch(() => {});
              }
            });
          },
        });

        // Clear the progress check interval
        if (progressCheckInterval) {
          clearInterval(progressCheckInterval);
        }

        console.log(
          "[Summarizer] Summarizer created successfully, beginning summarization..."
        );

        // Model is ready, perform recursive summarization
        const summary = await summarizeChunksRecursively(summarizer, text);

        // Clean up
        summarizer.destroy();

        // Update cached availability since model is now ready
        summarizerAvailability = "readily";

        // Send completion message to popup
        chrome.runtime
          .sendMessage({
            type: "DOWNLOAD_PROGRESS",
            percent: 100,
            status: "complete",
          })
          .catch(() => {});

        return {
          summary,
          status: "downloaded-and-ready",
        };
      } catch (error) {
        console.error(
          "[Summarizer] Error during model download/creation:",
          error
        );
        return {
          summary:
            "⚠️ Model download initiated but encountered an error.\n\n" +
            "The AI model download may be in progress in the background. " +
            "Please wait a few minutes and try again.\n\n" +
            "You can check download status at chrome://components/ " +
            "(look for 'Optimization Guide On Device Model').\n\n" +
            "Error: " +
            error.message,
          status: "download-error",
        };
      }
    }

    // Model is already available, create summarizer and perform summarization
    let summarizer;
    try {
      summarizer = await self.Summarizer.create({
        type: "tldr",
        format: "plain-text",
        length: "long",
        sharedContext: "Summarizing legal Terms of Service text for clarity.",
      });

      const summary = await summarizeChunksRecursively(summarizer, text);
      const status = "readily";
      return { summary, status };
    } finally {
      try {
        summarizer && summarizer.destroy && summarizer.destroy();
      } catch (_) {}
    }
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
