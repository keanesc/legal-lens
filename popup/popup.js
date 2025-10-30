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

  // Check API availability
  await checkApiAvailability();

  // Check for existing ToS data
  await checkExistingData();
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
      } else if (response.availability === "after-download") {
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
 * Check for existing ToS data for current tab
 */
async function checkExistingData() {
  if (!currentTabId) return;

  const result = await chrome.storage.local.get([`tos_${currentTabId}`]);
  const tosData = result[`tos_${currentTabId}`];

  if (tosData && tosData.summary) {
    showSummary(tosData.summary);
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
  simplifyBtn.querySelector(".btn-text").textContent = "Processing...";

  updateStatus("Extracting ToS text...", "processing");

  try {
    // Send message with retry logic
    const response = await sendMessageWithRetry({
      type: "SIMPLIFY_TOS",
      tabId: currentTabId,
    });

    if (response && response.success) {
      showSummary(response.summary);
      updateStatus("Summary generated", "success");
    } else {
      showError(response?.error || "Failed to simplify ToS");
      updateStatus("Failed", "error");
    }
  } catch (error) {
    showError("Error: " + error.message);
    updateStatus("Error occurred", "error");
  } finally {
    simplifyBtn.disabled = false;
    simplifyBtn.querySelector(".btn-text").textContent = "Simplify";
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
  saveBtn.querySelector(".btn-text").textContent = "Saving...";

  try {
    const response = await sendMessageWithRetry({
      type: "SAVE_TOS",
      tabId: currentTabId,
    });

    if (response && response.success) {
      showMessage("ToS saved successfully!", "success");
      updateStatus("Saved", "success");
    } else {
      showError(response?.error || "Failed to save ToS");
    }
  } catch (error) {
    showError("Error: " + error.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.querySelector(".btn-text").textContent = "Save";
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
  compareBtn.querySelector(".btn-text").textContent = "Comparing...";

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
    compareBtn.querySelector(".btn-text").textContent = "Compare";
  }
}

/**
 * Show summary in result section
 */
function showSummary(summary) {
  const resultSection = document.getElementById("resultSection");
  const summaryContent = document.getElementById("summaryContent");

  // Safely set text content to prevent XSS
  summaryContent.textContent = summary;
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
    padding: 10px 20px;
    border-radius: 5px;
    background: ${type === "error" ? "#f44336" : "#4CAF50"};
    color: white;
    font-size: 12px;
    z-index: 1000;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;

  document.body.appendChild(messageEl);

  setTimeout(() => {
    messageEl.remove();
  }, 3000);
}
