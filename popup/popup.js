// Popup script for ToS Simplifier Extension
// Handles user interactions and communicates with background script

let currentTabId = null;

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
  // Get current active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    currentTabId = tabs[0].id;
    updateStatus("Ready", "ready");
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
        updateStatus(`Downloading on-device model... ${pct}%`, "processing");
      } else {
        updateStatus("Preparing on-device model...", "processing");
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
        updateStatus("Ready", "ready");
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

  simplifyBtn.addEventListener("click", handleSimplify);
  saveBtn.addEventListener("click", handleSave);
  compareBtn.addEventListener("click", handleCompare);
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
    progressStatus.textContent = "Extracting and loading model...";
    progressBar.classList.add("indeterminate");
  } else if (percent > 0) {
    progressStatus.textContent = `Downloading... (~${Math.round(
      (percent / 100) * 1.5
    )}GB of 1.5GB)`;
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
    updateStatus("Summary available", "success");
  }
}

/**
 * Handle Simplify button click
 */
async function handleSimplify() {
  if (!currentTabId) {
    showError("No active tab found");
    return;
  }

  const simplifyBtn = document.getElementById("simplifyBtn");
  simplifyBtn.disabled = true;
  simplifyBtn.classList.add("loading");
  const btnText = simplifyBtn.querySelector(".btn-text");
  const originalText = btnText.textContent;
  btnText.textContent = "Processing...";

  updateStatus("Extracting ToS text...", "processing");

  try {
    // Check if model needs download - show progress bar preemptively
    const apiStatus = await sendMessageWithRetry({ type: "CHECK_API_STATUS" });
    if (
      apiStatus &&
      (apiStatus.availability === "downloadable" ||
        apiStatus.availability === "after-download")
    ) {
      console.log("[Popup] Model needs download, showing progress bar");
      updateDownloadProgress(0, "Preparing to download AI model...");
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
        updateStatus(
          "Model downloading - try again in a few minutes",
          "processing"
        );
      } else if (response.status === "downloaded-and-ready") {
        // Model was just downloaded and is now ready
        showSummary(response.summary, response.source, response.tosUrl);
        updateStatus("Model downloaded! Summary generated", "success");
        showMessage(
          "✅ AI model downloaded successfully and is now ready for future use!",
          "success"
        );
      } else if (response.status === "download-error") {
        // Download error occurred
        showSummary(response.summary, "download-error", "");
        updateStatus("Model download error", "error");
      } else {
        // Normal summarization
        showSummary(response.summary, response.source, response.tosUrl);
        updateStatus("Summary generated", "success");
      }
    } else {
      showError(response?.error || "Failed to simplify ToS");
      updateStatus("Failed", "error");
    }
  } catch (error) {
    showError("Error: " + error.message);
    updateStatus("Error occurred", "error");
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
    showError("No active tab found");
    return;
  }

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;
  saveBtn.classList.add("loading");
  const btnText = saveBtn.querySelector(".btn-text");
  const originalText = btnText.textContent;
  btnText.textContent = "Saving...";

  try {
    const response = await sendMessageWithRetry({
      type: "SAVE_TOS",
      tabId: currentTabId,
    });

    if (response && response.success) {
      showMessage("✅ ToS saved successfully!", "success");
      updateStatus("Saved", "success");
    } else {
      showError(response?.error || "Failed to save ToS");
    }
  } catch (error) {
    showError("Error: " + error.message);
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
    showError("No active tab found");
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
      updateStatus("Comparison ready", "success");
    } else {
      showError(response?.error || "Failed to compare ToS");
    }
  } catch (error) {
    showError("Error: " + error.message);
  } finally {
    compareBtn.disabled = false;
    compareBtn.classList.remove("loading");
    btnText.textContent = originalText;
  }
}

/**
 * Show summary in result section
 */
function showSummary(summary, source, tosUrl) {
  const resultSection = document.getElementById("resultSection");
  const summaryContent = document.getElementById("summaryContent");
  const sourceInfo = document.getElementById("tosSourceInfo");

  // Safely set text content to prevent XSS
  summaryContent.textContent = summary;

  // Show source information if available
  if (source && sourceInfo) {
    let sourceMessage = "";
    let sourceClass = "";

    if (source === "downloading") {
      sourceMessage = `🔄 First-time setup: Downloading AI model`;
      sourceClass = "downloading";
    } else if (source === "download-error") {
      sourceMessage = `⚠️ Model download encountered an issue`;
      sourceClass = "downloading";
    } else if (source === "fetched-link") {
      sourceMessage = `✅ Successfully found and summarized ToS document from linked page`;
      sourceClass = "fetched-link";
    } else if (source === "current-page-popup") {
      sourceMessage = `ℹ️ Summarized ToS popup from current page`;
      sourceClass = "";
    } else if (source === "current-page-element") {
      sourceMessage = `⚠️ Summarized content from current page (no ToS link found)`;
      sourceClass = "";
    }

    if (sourceMessage) {
      sourceInfo.innerHTML = `<strong>${sourceMessage}</strong>`;
      if (tosUrl && tosUrl !== window.location.href) {
        const urlSpan = document.createElement("div");
        urlSpan.className = "source-url";
        urlSpan.textContent = `Source: ${tosUrl}`;
        sourceInfo.appendChild(urlSpan);
      }
      sourceInfo.className = `tos-source-info ${sourceClass}`;
      sourceInfo.style.display = "block";
    } else {
      sourceInfo.style.display = "none";
    }
  }

  resultSection.style.display = "block";

  // Scroll to result
  resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * Show comparison data
 */
function showComparison(current, saved) {
  const savedSection = document.getElementById("savedSection");
  const savedList = document.getElementById("savedList");

  if (!saved || saved.length === 0) {
    showError("No saved ToS documents to compare with");
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
  savedSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
