// Popup script for Legal Lens Extension
// Handles user interactions and communicates with background script

let currentTabId = null;

/**
 * Initialize i18n for all elements with data-i18n attribute
 */
function initializeI18n() {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.textContent = message;
    }
  });

  // Handle placeholder attributes
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    const message = chrome.i18n.getMessage(key);
    if (message) {
      element.placeholder = message;
    }
  });
}

/**
 * Get localized message with optional substitutions
 */
function i18n(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

/**
 * Get human-readable language name
 */
function getLanguageName(langCode) {
  const languageNames = {
    en: "English",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    it: "Italiano",
    pt: "Português",
    ja: "日本語",
    zh: "中文",
    ru: "Русский",
    ar: "العربية",
    hi: "हिन्दी",
    ko: "한국어",
    nl: "Nederlands",
    pl: "Polski",
    tr: "Türkçe",
    sv: "Svenska",
    da: "Dansk",
    no: "Norsk",
    fi: "Suomi",
  };
  return languageNames[langCode] || langCode.toUpperCase();
}

/**
 * Send message with retry logic for service worker reloads
 */
async function sendMessageWithRetry(message, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      return response;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isServiceWorkerError =
        error.message.includes("context invalidated") ||
        error.message.includes("Extension context") ||
        error.message.includes("message port");

      if (isServiceWorkerError && !isLastAttempt) {
        // Wait before retry with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 200 * Math.pow(2, attempt))
        );
        continue;
      }

      throw error;
    }
  }
}

/**
 * Initialize popup when DOM is loaded
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize i18n translations
  initializeI18n();

  // Get current active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    currentTabId = tabs[0].id;
    updateStatus(chrome.i18n.getMessage("statusReady"), "ready");
  }

  // Attach event listeners
  attachEventListeners();

  // Listen for download progress updates
  setupDownloadProgressListener();

  // Check API availability
  await checkApiAvailability();

  // Check for existing ToS data
  await checkExistingData();

  // Listen for model download progress
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "MODEL_PROGRESS") {
      const { loaded = 0, total = 0 } = message;
      if (total > 0) {
        const pct = Math.floor((loaded / total) * 100);
        updateStatus(
          i18n("downloadingModelProgress", pct.toString()),
          "processing"
        );
      } else {
        updateStatus(i18n("preparingModel"), "processing");
      }
    }
  });
});

/**
 * Check if Summarizer API is available
 */
async function checkApiAvailability() {
  try {
    const response = await sendMessageWithRetry({ type: "CHECK_API_STATUS" });

    if (response && response.availability) {
      if (
        response.availability === "unavailable" ||
        response.availability === "unsupported"
      ) {
        updateStatus(response.message, "error");
        showError(response.message);
      } else if (
        response.availability === "after-download" ||
        response.availability === "downloadable" ||
        response.availability === "downloading"
      ) {
        updateStatus(response.message, "processing");
      } else {
        updateStatus(i18n("statusReady"), "ready");
      }
    }
  } catch (error) {
    console.error("Error checking API availability:", error);
  }
}

/**
 * Attach event listeners to buttons
 */
function attachEventListeners() {
  const simplifyBtn = document.getElementById("simplifyBtn");
  const saveBtn = document.getElementById("saveBtn");
  const compareBtn = document.getElementById("compareBtn");
  const chatBtn = document.getElementById("chatBtn");

  simplifyBtn.addEventListener("click", handleSimplify);
  saveBtn.addEventListener("click", handleSave);
  compareBtn.addEventListener("click", handleCompare);
  chatBtn.addEventListener("click", handleChatToggle);

  // Chatbot event listeners
  const sendChatBtn = document.getElementById("sendChatBtn");
  const chatbotInput = document.getElementById("chatbotInput");
  const closeChatBtn = document.getElementById("closeChatBtn");

  sendChatBtn.addEventListener("click", handleSendMessage);
  chatbotInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
  closeChatBtn.addEventListener("click", handleChatToggle);
}

/**
 * Setup listener for download progress updates from background script
 */
function setupDownloadProgressListener() {
  console.log("[Popup] Setting up download progress listener");
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Popup] Received message:", message);
    if (message.type === "DOWNLOAD_PROGRESS") {
      console.log(
        `[Popup] Download progress: ${message.percent}%, status: ${message.status}`
      );
      updateDownloadProgress(message.percent, message.status);
      sendResponse({ received: true });
    }
    return true;
  });
}

/**
 * Update download progress UI
 */
function updateDownloadProgress(percent, status) {
  console.log(
    `[Popup] updateDownloadProgress called: ${percent}%, status: ${status}`
  );

  const progressSection = document.getElementById("progressSection");
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const progressStatus = document.getElementById("progressStatus");

  console.log("[Popup] Progress elements:", {
    progressSection: !!progressSection,
    progressBar: !!progressBar,
    progressPercent: !!progressPercent,
    progressStatus: !!progressStatus,
  });

  if (!progressSection || !progressBar || !progressPercent) {
    console.error("[Popup] Missing progress UI elements!");
    return;
  }

  // Show progress section
  progressSection.style.display = "block";
  console.log("[Popup] Progress section displayed");

  // Update percentage
  progressPercent.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;

  // Update status message
  if (status) {
    progressStatus.textContent = status;
  } else if (percent === 100) {
    progressStatus.textContent = i18n("extractingModel");
    progressBar.classList.add("indeterminate");
  } else if (percent > 0) {
    const size = Math.round((percent / 100) * 1.5);
    progressStatus.textContent = i18n("downloadingSize", size.toString());
  }

  // Hide progress bar after completion with delay
  if (percent === 100 && status === "complete") {
    setTimeout(() => {
      progressSection.style.display = "none";
      progressBar.classList.remove("indeterminate");
      progressBar.style.width = "0%";
    }, 3000);
  }
}

/**
 * Check for existing ToS data for current tab
 */
async function checkExistingData() {
  if (!currentTabId) return;

  const result = await chrome.storage.local.get([`tos_${currentTabId}`]);
  const tosData = result[`tos_${currentTabId}`];

  if (tosData && tosData.summary) {
    showSummary(tosData.summary, tosData.source, tosData.url);
    updateStatus(i18n("summaryAvailable"), "success");
  }
}

/**
 * Handle Simplify button click
 */
async function handleSimplify() {
  if (!currentTabId) {
    showError(i18n("noActiveTab"));
    return;
  }

  const simplifyBtn = document.getElementById("simplifyBtn");
  simplifyBtn.disabled = true;
  simplifyBtn.classList.add("loading");
  const btnText = simplifyBtn.querySelector(".btn-text");
  const originalText = btnText.textContent;
  btnText.textContent = i18n("statusProcessing");

  updateStatus(i18n("extractingTos"), "processing");

  try {
    // Check if model needs download - show progress bar preemptively
    const apiStatus = await sendMessageWithRetry({ type: "CHECK_API_STATUS" });
    if (
      apiStatus &&
      (apiStatus.availability === "downloadable" ||
        apiStatus.availability === "after-download")
    ) {
      console.log("[Popup] Model needs download, showing progress bar");
      updateDownloadProgress(0, i18n("preparingToDownload"));
    }

    // Send message with retry logic
    const response = await sendMessageWithRetry({
      type: "SIMPLIFY_TOS",
      tabId: currentTabId,
    });

    if (response && response.success) {
      // Check different status types
      if (response.status === "downloading") {
        // Old behavior for backward compatibility (shouldn't happen with new code)
        showSummary(response.summary, "downloading", "");
        updateStatus(i18n("modelDownloadTryAgain"), "processing");
      } else if (response.status === "downloaded-and-ready") {
        // Model was just downloaded and is now ready
        showSummary(response.summary, response.source, response.tosUrl);
        updateStatus(i18n("modelDownloaded"), "success");
        showMessage(i18n("modelDownloadedSuccess"), "success");
      } else if (response.status === "download-error") {
        // Download error occurred
        showSummary(response.summary, "download-error", "");
        updateStatus(i18n("modelDownloadError"), "error");
      } else {
        // Normal summarization
        showSummary(response.summary, response.source, response.tosUrl);
        updateStatus(i18n("summaryGenerated"), "success");
      }
    } else {
      showError(response?.error || i18n("failedToSimplify"));
      updateStatus(i18n("failed"), "error");
    }
  } catch (error) {
    showError(i18n("error") + " " + error.message);
    updateStatus(i18n("errorOccurred"), "error");
  } finally {
    simplifyBtn.disabled = false;
    simplifyBtn.classList.remove("loading");
    btnText.textContent = originalText;
  }
}

/**
 * Handle Save button click
 */
async function handleSave() {
  if (!currentTabId) {
    showError(i18n("noActiveTab"));
    return;
  }

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;
  saveBtn.classList.add("loading");
  const btnText = saveBtn.querySelector(".btn-text");
  const originalText = btnText.textContent;
  btnText.textContent = i18n("btnSaving");

  try {
    const response = await sendMessageWithRetry({
      type: "SAVE_TOS",
      tabId: currentTabId,
    });

    if (response && response.success) {
      showMessage("✅ " + i18n("savedSuccessfully") + "!", "success");
      updateStatus(i18n("savedSuccessfully"), "success");
    } else {
      showError(response?.error || i18n("failedToSave"));
    }
  } catch (error) {
    showError(i18n("error") + " " + error.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.classList.remove("loading");
    btnText.textContent = originalText;
  }
}

/**
 * Handle Compare button click
 */
async function handleCompare() {
  if (!currentTabId) {
    showError(i18n("noActiveTab"));
    return;
  }

  const compareBtn = document.getElementById("compareBtn");
  compareBtn.disabled = true;
  compareBtn.classList.add("loading");
  const btnText = compareBtn.querySelector(".btn-text");
  const originalText = btnText.textContent;
  btnText.textContent = "Comparing...";

  try {
    const response = await sendMessageWithRetry({
      type: "COMPARE_TOS",
      tabId: currentTabId,
    });

    if (response && response.success) {
      showComparison(response.current, response.saved);
      updateStatus(i18n("comparisonReady"), "success");
    } else {
      showError(response?.error || i18n("failedToCompare"));
    }
  } catch (error) {
    showError(i18n("error") + " " + error.message);
  } finally {
    compareBtn.disabled = false;
    compareBtn.classList.remove("loading");
    btnText.textContent = originalText;
  }
}

/**
 * Show summary in result section with automatic translation
 */
async function showSummary(summary, source, tosUrl) {
  const resultSection = document.getElementById("resultSection");
  const summaryContent = document.getElementById("summaryContent");
  const sourceInfo = document.getElementById("tosSourceInfo");

  // Get user's language
  const userLanguage = getUserLanguage();

  // Try to translate the summary if not in user's language
  let displayText = summary;
  let translationInfo = "";

  // Only attempt translation if Translator API is supported and user language is not English
  if (isTranslatorSupported() && userLanguage !== "en") {
    try {
      updateStatus(i18n("translating"), "processing");

      // Translate with progress callback
      const translationResult = await translateText(
        summary,
        null, // Auto-detect source language
        userLanguage,
        (percent, status) => {
          console.log(`[Popup] Translation progress: ${percent}% - ${status}`);
          if (percent > 0) {
            updateStatus(
              i18n("downloadingTranslationModel") + ` ${percent}%`,
              "processing"
            );
          }
        }
      );

      if (translationResult.wasTranslated) {
        displayText = translationResult.translatedText;
        const languageName = getLanguageName(userLanguage);
        translationInfo = `<div class="translation-info">✓ ${i18n(
          "translated",
          languageName
        )}</div>`;
        updateStatus(i18n("summaryGenerated"), "success");
      } else if (translationResult.error) {
        console.warn(
          "[Popup] Translation not available:",
          translationResult.error
        );
        translationInfo = `<div class="translation-info">ℹ️ ${i18n(
          "translationFailed"
        )}</div>`;
      }
    } catch (error) {
      console.error("[Popup] Translation error:", error);
      // Fall back to original summary
      translationInfo = `<div class="translation-info">ℹ️ ${i18n(
        "translationFailed"
      )}</div>`;
    }
  }

  // Safely set text content to prevent XSS
  summaryContent.textContent = displayText;

  // Show source information if available
  if (source && sourceInfo) {
    let sourceMessage = "";
    let sourceClass = "";

    if (source === "downloading") {
      sourceMessage = i18n("sourceDownloading");
      sourceClass = "downloading";
    } else if (source === "download-error") {
      sourceMessage = i18n("sourceDownloadError");
      sourceClass = "downloading";
    } else if (source === "fetched-link") {
      sourceMessage = i18n("sourceFetchedLink");
      sourceClass = "fetched-link";
    } else if (source === "current-page-popup") {
      sourceMessage = i18n("sourceCurrentPagePopup");
      sourceClass = "";
    } else if (source === "current-page-element") {
      sourceMessage = i18n("sourceCurrentPageElement");
      sourceClass = "";
    }

    if (sourceMessage) {
      let sourceHtml = `<strong>${sourceMessage}</strong>`;
      if (translationInfo) {
        sourceHtml += translationInfo;
      }
      sourceInfo.innerHTML = sourceHtml;
      if (tosUrl && tosUrl !== window.location.href) {
        const urlSpan = document.createElement("div");
        urlSpan.className = "source-url";
        urlSpan.textContent = `${i18n("sourceLabel")} ${tosUrl}`;
        sourceInfo.appendChild(urlSpan);
      }
      sourceInfo.className = `tos-source-info ${sourceClass}`;
      sourceInfo.style.display = "block";
    } else {
      if (translationInfo) {
        sourceInfo.innerHTML = translationInfo;
        sourceInfo.style.display = "block";
      } else {
        sourceInfo.style.display = "none";
      }
    }
  }

  resultSection.style.display = "block";

  // Show scroll area and scroll to top
  const scrollArea = document.querySelector(".content-scroll-area");
  if (scrollArea) {
    scrollArea.classList.add("has-content");
    scrollArea.scrollTop = 0;
  }
}

/**
 * Show comparison data
 */
function showComparison(current, saved) {
  const savedSection = document.getElementById("savedSection");
  const savedList = document.getElementById("savedList");

  if (!saved || saved.length === 0) {
    showError(i18n("noSavedToCompare"));
    return;
  }

  // Clear existing content safely
  savedList.textContent = "";

  // Show current summary - create elements safely
  const currentDiv = document.createElement("div");
  currentDiv.className = "saved-item current";

  const currentTitle = document.createElement("h4");
  currentTitle.textContent = "Current Document";

  const currentUrl = document.createElement("p");
  currentUrl.className = "url";
  currentUrl.textContent = current.url || "Current page";

  const currentSummary = document.createElement("p");
  currentSummary.className = "summary";
  currentSummary.textContent = current.summary.substring(0, 200) + "...";

  currentDiv.appendChild(currentTitle);
  currentDiv.appendChild(currentUrl);
  currentDiv.appendChild(currentSummary);
  savedList.appendChild(currentDiv);

  // Show saved documents - create elements safely
  saved.forEach((item, index) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "saved-item";

    const title = document.createElement("h4");
    title.textContent = `Saved Document ${index + 1}`;

    const url = document.createElement("p");
    url.className = "url";
    url.textContent = item.url || "Unknown URL";

    const date = document.createElement("p");
    date.className = "date";
    const dateStr = new Date(
      item.savedAt || item.timestamp
    ).toLocaleDateString();
    date.textContent = `Saved: ${dateStr}`;

    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = item.summary.substring(0, 200) + "...";

    itemDiv.appendChild(title);
    itemDiv.appendChild(url);
    itemDiv.appendChild(date);
    itemDiv.appendChild(summary);
    savedList.appendChild(itemDiv);
  });

  savedSection.style.display = "block";

  // Show scroll area and scroll to top
  const scrollArea = document.querySelector(".content-scroll-area");
  if (scrollArea) {
    scrollArea.classList.add("has-content");
    scrollArea.scrollTop = 0;
  }
}

/**
 * Update status indicator
 */
function updateStatus(text, status = "ready") {
  const statusIndicator = document.getElementById("statusIndicator");
  const statusText = document.getElementById("statusText");
  const statusDot = statusIndicator.querySelector(".status-dot");

  statusText.textContent = text;

  // Update status dot color
  statusDot.className = "status-dot";
  switch (status) {
    case "ready":
      statusDot.classList.add("ready");
      break;
    case "processing":
      statusDot.classList.add("processing");
      break;
    case "success":
      statusDot.classList.add("success");
      break;
    case "error":
      statusDot.classList.add("error");
      break;
  }
}

/**
 * Show error message
 */
function showError(message) {
  showMessage(message, "error");
}

/**
 * Show success/info message
 */
function showMessage(message, type = "success") {
  // Create temporary message element
  const messageEl = document.createElement("div");
  messageEl.className = `message message-${type}`;
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    background: ${type === "error" ? "#f44336" : "#4CAF50"};
    color: white;
    font-size: 13px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideDown 0.3s ease-out;
  `;

  // Add animation styles
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(messageEl);

  setTimeout(() => {
    messageEl.style.animation = "slideDown 0.3s ease-out reverse";
    setTimeout(() => {
      messageEl.remove();
      style.remove();
    }, 300);
  }, 2700);
}

// ============================================
// Chatbot Functionality using Prompt API
// ============================================

let chatSession = null;
let documentContext = "";

/**
 * Toggle chatbot section visibility
 */
function handleChatToggle() {
  const chatbotSection = document.getElementById("chatbotSection");
  const savedSection = document.getElementById("savedSection");
  const chatBtn = document.getElementById("chatBtn");

  if (chatbotSection.style.display === "none") {
    // Show chatbot
    chatbotSection.style.display = "flex";
    savedSection.style.display = "none";
    chatBtn.classList.add("active");

    // Initialize chatbot if needed
    if (!chatSession) {
      initializeChatbot();
    }

    // Focus input
    document.getElementById("chatbotInput").focus();
  } else {
    // Hide chatbot
    chatbotSection.style.display = "none";
    chatBtn.classList.remove("active");
  }
}

/**
 * Initialize chatbot with Prompt API
 */
async function initializeChatbot() {
  try {
    // Get document context from current ToS
    const result = await chrome.storage.local.get([`tos_${currentTabId}`]);
    const tosData = result[`tos_${currentTabId}`];

    if (tosData && tosData.tosText) {
      documentContext = tosData.tosText;
    } else {
      // No document loaded, show message
      addChatMessage(
        "assistant",
        "Please simplify a document first so I can answer questions about it.",
        true
      );
      return;
    }

    // Check if Prompt API is available (it's a global API, not window.ai)
    if (!self.LanguageModel) {
      addChatMessage(
        "assistant",
        "Sorry, the AI Prompt API is not available in your browser. Please make sure you're using Chrome 128+ with AI features enabled at chrome://flags/#optimization-guide-on-device-model",
        true
      );
      return;
    }

    // Check availability
    const availability = await self.LanguageModel.availability();

    if (availability === "no" || availability === "unavailable") {
      addChatMessage(
        "assistant",
        "AI features are not available. Please enable chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano",
        true
      );
      return;
    }

    if (availability === "after-download" || availability === "downloadable") {
      addChatMessage(
        "assistant",
        "The AI model needs to be downloaded first. This will happen automatically when you use it.",
        false
      );
    }

    // Create session with document context as initial prompt
    const systemPrompt = `You are a helpful assistant that answers questions about legal documents, specifically Terms of Service agreements. The user has provided a document for analysis. Answer questions about this document accurately and concisely. If the answer is not in the document, say so.`;

    chatSession = await self.LanguageModel.create({
      initialPrompts: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the document to analyze:\n\n${documentContext.substring(
            0,
            3000
          )}`,
        },
        {
          role: "assistant",
          content:
            "I have read and understood the document. I am ready to answer your questions about it.",
        },
      ],
    });

    console.log("[Chatbot] Session initialized successfully");
  } catch (error) {
    console.error("[Chatbot] Error initializing:", error);
    addChatMessage(
      "assistant",
      `There was an error initializing the chatbot: ${error.message}. Please try again.`,
      true
    );
  }
}

/**
 * Handle sending a message
 */
async function handleSendMessage() {
  const input = document.getElementById("chatbotInput");
  const message = input.value.trim();

  if (!message) return;

  // Add user message to chat
  addChatMessage("user", message);
  input.value = "";

  // Disable input while processing
  const sendBtn = document.getElementById("sendChatBtn");
  sendBtn.disabled = true;
  input.disabled = true;

  // Show thinking indicator
  const thinkingId = addThinkingIndicator();

  try {
    // Initialize session if not already done
    if (!chatSession) {
      await initializeChatbot();
    }

    if (!chatSession) {
      removeThinkingIndicator(thinkingId);
      addChatMessage(
        "assistant",
        "Please simplify a document first so I can answer questions about it."
      );
      return;
    }

    // Get response from Prompt API
    const response = await chatSession.prompt(message);

    // Remove thinking indicator
    removeThinkingIndicator(thinkingId);

    // Add assistant response
    addChatMessage("assistant", response);
  } catch (error) {
    console.error("[Chatbot] Error getting response:", error);
    removeThinkingIndicator(thinkingId);
    addChatMessage(
      "assistant",
      "I'm sorry, I encountered an error. Please try asking your question again.",
      true
    );
  } finally {
    // Re-enable input
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

/**
 * Add a message to the chat
 */
function addChatMessage(role, content, isError = false) {
  const messagesContainer = document.getElementById("chatbotMessages");
  const messageDiv = document.createElement("div");
  messageDiv.className = `chatbot-message ${role}${isError ? " error" : ""}`;

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "message-bubble";
  bubbleDiv.textContent = content;

  messageDiv.appendChild(bubbleDiv);
  messagesContainer.appendChild(messageDiv);

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Add thinking indicator
 */
function addThinkingIndicator() {
  const messagesContainer = document.getElementById("chatbotMessages");
  const thinkingDiv = document.createElement("div");
  const thinkingId = `thinking-${Date.now()}`;
  thinkingDiv.id = thinkingId;
  thinkingDiv.className = "chatbot-message assistant thinking";

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "message-bubble";

  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typing-indicator";
  typingIndicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;

  bubbleDiv.appendChild(typingIndicator);
  thinkingDiv.appendChild(bubbleDiv);
  messagesContainer.appendChild(thinkingDiv);

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return thinkingId;
}

/**
 * Remove thinking indicator
 */
function removeThinkingIndicator(thinkingId) {
  const thinkingDiv = document.getElementById(thinkingId);
  if (thinkingDiv) {
    thinkingDiv.remove();
  }
}
