// Content Script for ToS Detection and Interaction
// Observes DOM changes to detect ToS popups and injects UI elements

/**
 * Configuration for ToS detection
 */
const DETECTION_CONFIG = {
  // Keywords to look for in ToS popups
  keywords: [
    "terms of service",
    "terms and conditions",
    "privacy policy",
    "cookie policy",
    "user agreement",
    "end user license agreement",
    "accept terms",
    "i agree",
    "agree and continue",
    "privacy notice",
    "terms of use",
  ],

  // Selectors that commonly contain ToS popups
  commonSelectors: [
    '[class*="modal"]',
    '[class*="popup"]',
    '[class*="overlay"]',
    '[id*="modal"]',
    '[id*="popup"]',
    '[id*="overlay"]',
    '[class*="tos"]',
    '[class*="privacy"]',
    '[class*="cookie"]',
    '[role="dialog"]',
  ],

  // Link keywords to find ToS pages
  linkKeywords: [
    "terms of service",
    "terms and conditions",
    "terms of use",
    "privacy policy",
    "privacy notice",
    "cookie policy",
    "legal",
    "user agreement",
    "eula",
    "tos",
    "terms",
    "privacy",
  ],

  // Minimum text length to consider as ToS
  minTextLength: 50,

  // Minimum text length for a fetched ToS document
  minTosDocumentLength: 500,

  // Exclude elements with these classes/IDs (common false positives)
  excludeSelectors: [
    '[class*="ad-"]',
    '[class*="advertisement"]',
    '[id*="ad-"]',
    '[id*="advertisement"]',
    '[class*="video-ad"]',
    '[class*="promo"]',
    '[class*="banner"]',
    ".ytp-ad-overlay-container", // YouTube ads
    ".video-ads", // Generic video ads
  ],
};

// Track detected ToS elements
const detectedElements = new Set();
// Track detected ToS links
const detectedTosLinks = new Map(); // Map of URL -> {url, text, confidence}
let observerActive = false;
let fabButton = null; // Track the floating action button
let currentTosElement = null; // Track the currently detected ToS element

/**
 * Initialize content script
 */
(function init() {
  console.log(
    "Legal Lens content script loaded v1.1",
    new Date().toISOString()
  );

  // Start observing DOM changes
  startObserver();

  // Also check existing content
  detectExistingTosPopups();

  // Listen for messages from background/popup
  chrome.runtime.onMessage.addListener(handleMessage);
})();

/**
 * Start MutationObserver to watch for DOM changes
 */
function startObserver() {
  if (observerActive) return;

  observerActive = true;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check added nodes
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          checkForTosPopup(node);
        }
      });

      // Check removed nodes - hide FAB if ToS element was removed
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (
            currentTosElement &&
            (node === currentTosElement || node.contains(currentTosElement))
          ) {
            hideFab();
          }
        }
      });

      // Check attribute changes (e.g., style changes making popup visible)
      if (mutation.type === "attributes") {
        checkForTosPopup(mutation.target);

        // Check if ToS element became hidden
        if (
          currentTosElement === mutation.target &&
          !isElementVisible(mutation.target)
        ) {
          hideFab();
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "id"],
  });
}

/**
 * Check for existing ToS popups on page load
 */
function detectExistingTosPopups() {
  // Check common selectors
  DETECTION_CONFIG.commonSelectors.forEach((selector) => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => checkForTosPopup(el));
    } catch (e) {
      // Invalid selector, skip
    }
  });
}

/**
 * Check if an element is a ToS popup
 */
function checkForTosPopup(element) {
  if (!element || typeof element.querySelector !== "function") return;
  if (detectedElements.has(element)) return;

  // Check if element should be excluded (ads, banners, etc.)
  if (shouldExcludeElement(element)) return;

  // Check if element is visible
  if (!isElementVisible(element)) return;

  // Get text content
  const text = element.textContent || element.innerText || "";
  const lowerText = text.toLowerCase();

  // Check for keywords
  const hasKeyword = DETECTION_CONFIG.keywords.some((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  );

  // Check if it's a modal/popup structure
  const isModalStructure = isModalLike(element);

  // Check text length
  const hasEnoughText = text.trim().length >= DETECTION_CONFIG.minTextLength;

  // MUST have ToS keywords AND (modal structure OR enough text)
  // This prevents false positives from random modals/overlays
  if (hasKeyword && (isModalStructure || hasEnoughText)) {
    // Found a potential ToS popup
    handleTosDetection(element);
    detectedElements.add(element);

    // Notify background script
    chrome.runtime.sendMessage({
      type: "DETECT_TOS",
      url: window.location.href,
      textPreview: text.substring(0, 200),
    });
  }
}

/**
 * Check if element should be excluded from detection
 */
function shouldExcludeElement(element) {
  // Check if element matches any exclude selectors
  for (const selector of DETECTION_CONFIG.excludeSelectors) {
    try {
      if (element.matches(selector)) {
        console.log("Excluded element (matches exclude selector):", selector);
        return true;
      }
      // Also check if element is inside an excluded container
      if (element.closest(selector)) {
        console.log("Excluded element (inside excluded container):", selector);
        return true;
      }
    } catch (e) {
      // Invalid selector, skip
      continue;
    }
  }
  return false;
}

/**
 * Check if element is visible
 */
function isElementVisible(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Check if element looks like a modal/popup
 */
function isModalLike(element) {
  const style = window.getComputedStyle(element);
  const zIndex = parseInt(style.zIndex) || 0;

  // High z-index often indicates modal
  if (zIndex > 1000) return true;

  // Check for overlay/background classes
  // element.className can be a string or an object (e.g., SVGAnimatedString). Normalize safely.
  const rawClassName = element.className;
  let className = "";
  if (typeof rawClassName === "string") {
    className = rawClassName.toLowerCase();
  } else if (rawClassName && typeof rawClassName.baseVal === "string") {
    className = rawClassName.baseVal.toLowerCase();
  }

  const rawId = element.id;
  let id = "";
  if (typeof rawId === "string") {
    id = rawId.toLowerCase();
  } else if (rawId && typeof rawId.baseVal === "string") {
    id = rawId.baseVal.toLowerCase();
  }

  const modalIndicators = ["modal", "popup", "overlay", "dialog", "drawer"];
  return modalIndicators.some(
    (indicator) => className.includes(indicator) || id.includes(indicator)
  );
}

/**
 * Handle ToS detection - show floating action button
 */
function handleTosDetection(element) {
  console.log(chrome.i18n.getMessage("tosDetected"), element);

  // Store the current ToS element
  currentTosElement = element;

  // Check if FAB already exists
  if (fabButton && document.body.contains(fabButton)) {
    // FAB already visible, just update the element reference
    return;
  }

  // Create and inject FAB
  fabButton = createExplainButton();
  document.body.appendChild(fabButton);

  // Add click handler
  fabButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentTosElement) {
      handleExplainClick(currentTosElement);
    }
  });
}

/**
 * Hide the floating action button
 */
function hideFab() {
  if (fabButton && document.body.contains(fabButton)) {
    fabButton.remove();
    fabButton = null;
  }
  currentTosElement = null;
}

/**
 * Find the best container to place the explain button
 */
function findButtonContainer(element) {
  // Look for common button containers
  const buttonSelectors = [
    '[class*="button"]',
    '[class*="action"]',
    '[class*="footer"]',
    '[class*="controls"]',
    "button",
    ".actions",
    ".footer",
  ];

  for (const selector of buttonSelectors) {
    const container = element.querySelector(selector);
    if (container) return container;
  }

  // If no button container found, create a wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "legal-lens-button-wrapper";
  wrapper.style.cssText = "margin-top: 10px; text-align: center;";

  // Try to append to the element itself
  if (element.appendChild) {
    try {
      element.appendChild(wrapper);
      return wrapper;
    } catch (e) {
      // Fallback
    }
  }

  return null;
}

/**
 * Create the explain button element as a Floating Action Button (FAB)
 */
function createExplainButton() {
  const button = document.createElement("button");
  button.className = "legal-lens-explain-btn";
  button.setAttribute("aria-label", chrome.i18n.getMessage("explainTermsAria"));
  button.setAttribute("role", "button");
  button.title = chrome.i18n.getMessage("explainTermsTitle");

  // Get the extension icon URL
  const iconUrl = chrome.runtime.getURL("icons/icon48.png");

  button.style.cssText = `
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    width: 56px;
    height: 56px;
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: all 0.3s ease;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    overflow: hidden;
  `;

  // Create image element for the icon
  const icon = document.createElement("img");
  icon.src = iconUrl;
  icon.style.cssText = `
    width: 32px;
    height: 32px;
    pointer-events: none;
  `;

  button.appendChild(icon);

  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-50%) scale(1.1)";
    button.style.boxShadow = "0 6px 16px rgba(0,0,0,0.4)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(-50%) scale(1)";
    button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  });

  return button;
}

/**
 * Handle explain button click
 */
async function handleExplainClick(element) {
  if (fabButton) {
    fabButton.disabled = true;
    fabButton.style.opacity = "0.6";
    fabButton.style.cursor = "not-allowed";

    // Show loading state - replace icon with spinner
    const icon = fabButton.querySelector("img");
    if (icon) {
      icon.style.display = "none";
    }

    // Add loading spinner
    const spinner = document.createElement("div");
    spinner.className = "tos-fab-spinner";
    spinner.style.cssText = `
      width: 24px;
      height: 24px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top: 3px solid white;
      border-radius: 50%;
      animation: tos-spin 1s linear infinite;
    `;
    fabButton.appendChild(spinner);

    // Add CSS animation for spinner
    if (!document.getElementById("tos-fab-spinner-style")) {
      const style = document.createElement("style");
      style.id = "tos-fab-spinner-style";
      style.textContent = `
        @keyframes tos-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  try {
    // Extract text from the ToS element
    const text = extractTosText(element);

    if (!text || text.trim().length < DETECTION_CONFIG.minTextLength) {
      showResult(
        "⚠️ Could not extract sufficient text from the Terms of Service.",
        "error"
      );
      resetExplainButton();
      return;
    }

    // Send to background script for summarization with retry logic
    const msg = {
      type: "EXTRACT_TEXT",
      text: text,
      url: window.location.href,
    };

    await sendMessageWithRetry(msg);
  } catch (error) {
    console.error("Error handling explain click:", error);
    showResult("Error: " + error.message, "error");
    resetExplainButton();
  }
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

      handleSummarizeResponse(response);
      return;
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

      // Last attempt or non-service-worker error
      showResult(
        "Error communicating with extension: " + error.message,
        "error"
      );
      resetExplainButton();
      return;
    }
  }
}

/**
 * Extract text from a ToS element
 */
function extractTosText(element) {
  // Clone element to avoid modifying original
  const clone = element.cloneNode(true);

  // Remove script and style elements
  const scripts = clone.querySelectorAll("script, style, noscript");
  scripts.forEach((el) => el.remove());

  // Remove the explain button if present
  const buttons = clone.querySelectorAll(".legal-lens-explain-btn");
  buttons.forEach((el) => el.remove());

  // Get text content
  let text = clone.textContent || clone.innerText || "";

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Show result to user
 */
function showResult(message, type = "success") {
  // Remove existing result if any
  const existing = document.querySelector(".legal-lens-result");
  if (existing) existing.remove();

  // Create result overlay
  const overlay = document.createElement("div");
  overlay.className = "legal-lens-result";
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    background: ${type === "success" ? "#4CAF50" : "#f44336"};
    color: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    z-index: 999999;
    font-size: 14px;
    line-height: 1.5;
  `;

  // Create close button
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    background: transparent;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 5px 10px;
  `;
  closeBtn.onclick = () => overlay.remove();

  // Create content
  const content = document.createElement("div");
  content.style.cssText = "white-space: pre-wrap; margin-bottom: 10px;";
  content.textContent = message;

  overlay.appendChild(closeBtn);
  overlay.appendChild(content);

  document.body.appendChild(overlay);

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 10000);
}

/**
 * Handle summarize response and reset button
 */
function handleSummarizeResponse(response) {
  if (response && response.success) {
    showResult(response.summary, "success");
  } else {
    showResult(
      "Failed to summarize: " + (response?.error || "Unknown error"),
      "error"
    );
  }
  resetExplainButton();
}

function resetExplainButton() {
  if (fabButton) {
    fabButton.disabled = false;
    fabButton.style.opacity = "1";
    fabButton.style.cursor = "pointer";

    // Remove spinner
    const spinner = fabButton.querySelector(".tos-fab-spinner");
    if (spinner) {
      spinner.remove();
    }

    // Show icon again
    const icon = fabButton.querySelector("img");
    if (icon) {
      icon.style.display = "block";
    }
  }
}

/**
 * Handle messages from background/popup
 */
function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case "PING":
      // Respond to ping to confirm content script is loaded
      sendResponse({ success: true, loaded: true });
      break;

    case "EXTRACT_TOS_TEXT":
      // Extract text from detected ToS popups or fetch from links
      extractTosTextFromPage()
        .then((result) => {
          sendResponse({
            success: true,
            text: result.text || "",
            url: result.url || window.location.href,
            source: result.source || "unknown",
            linkText: result.linkText || "",
          });
        })
        .catch((error) => {
          console.error("[Legal Lens] Error in EXTRACT_TOS_TEXT:", error);
          sendResponse({
            success: false,
            error: error.message,
            text: "",
            url: window.location.href,
          });
        });
      return true; // Keep channel open for async response

    case "DETECT_TOS_LINKS":
      // Scan for ToS links without fetching
      try {
        const links = detectTosLinks();
        sendResponse({
          success: true,
          links: links,
          count: links.length,
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message,
          links: [],
        });
      }
      break;

    default:
      sendResponse({ success: false, error: "Unknown message type" });
  }

  return true; // Keep channel open for async
}

/**
 * Extract ToS text from page
 * NEW: Prioritizes fetching ToS from links over current page content
 */
async function extractTosTextFromPage() {
  console.log("[Legal Lens] Extracting ToS text from page...");

  // STEP 1: Try to find and fetch ToS documents from links (NEW BEHAVIOR)
  try {
    const tosDocument = await findAndFetchTosDocument();

    if (tosDocument.success && tosDocument.text) {
      console.log(
        `[Legal Lens] Successfully fetched ToS from: ${tosDocument.url}`
      );
      return {
        text: tosDocument.text,
        url: tosDocument.url,
        source: "fetched-link",
        linkText: tosDocument.linkText,
      };
    } else {
      console.log(
        `[Legal Lens] No ToS found via links: ${tosDocument.message}`
      );
    }
  } catch (error) {
    console.error("[Legal Lens] Error fetching ToS from links:", error);
  }

  // STEP 2: Fallback to current page content (OLD BEHAVIOR)
  console.log("[Legal Lens] Falling back to current page content...");

  // Try to find detected elements first
  if (detectedElements.size > 0) {
    const firstElement = Array.from(detectedElements)[0];
    const text = extractTosText(firstElement);
    if (text.length >= DETECTION_CONFIG.minTextLength) {
      return {
        text: text,
        url: window.location.href,
        source: "current-page-popup",
      };
    }
  }

  // Last resort: search for ToS-related content on current page
  for (const selector of DETECTION_CONFIG.commonSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (isElementVisible(el)) {
          const text = extractTosText(el);
          if (text.length >= DETECTION_CONFIG.minTextLength) {
            return {
              text: text,
              url: window.location.href,
              source: "current-page-element",
            };
          }
        }
      }
    } catch (e) {
      // Skip invalid selector
    }
  }

  return {
    text: "",
    url: "",
    source: "none",
  };
}

/**
 * ========================================
 * ToS Link Detection and Fetching
 * ========================================
 */

/**
 * Scan the page for links that might lead to ToS pages
 * Returns array of potential ToS links with confidence scores
 */
function detectTosLinks() {
  const links = [];
  const allLinks = document.querySelectorAll("a[href]");

  allLinks.forEach((link) => {
    const href = link.getAttribute("href");
    const text = (link.textContent || "").trim().toLowerCase();
    const title = (link.getAttribute("title") || "").toLowerCase();
    const ariaLabel = (link.getAttribute("aria-label") || "").toLowerCase();

    // Skip empty or javascript links
    if (!href || href.startsWith("javascript:") || href === "#") {
      return;
    }

    // Combine all text sources
    const combinedText = `${text} ${title} ${ariaLabel}`;

    // Check if link text/attributes contain ToS keywords
    let confidence = 0;
    let matchedKeyword = "";

    for (const keyword of DETECTION_CONFIG.linkKeywords) {
      if (combinedText.includes(keyword)) {
        // Higher confidence for exact matches in link text
        if (text === keyword) {
          confidence = 100;
        } else if (text.includes(keyword)) {
          confidence = Math.max(confidence, 80);
        } else {
          confidence = Math.max(confidence, 60);
        }
        matchedKeyword = keyword;
        break;
      }
    }

    // Also check the URL path
    const urlLower = href.toLowerCase();
    for (const keyword of DETECTION_CONFIG.linkKeywords) {
      const keywordSlug = keyword.replace(/\s+/g, "-");
      if (
        urlLower.includes(keywordSlug) ||
        urlLower.includes(keyword.replace(/\s+/g, ""))
      ) {
        confidence = Math.max(confidence, 70);
        if (!matchedKeyword) matchedKeyword = keyword;
      }
    }

    if (confidence > 0) {
      // Convert relative URLs to absolute
      const absoluteUrl = new URL(href, window.location.href).href;

      links.push({
        url: absoluteUrl,
        text: text || href,
        confidence: confidence,
        keyword: matchedKeyword,
      });
    }
  });

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  // Store detected links
  detectedTosLinks.clear();
  links.forEach((link) => {
    detectedTosLinks.set(link.url, link);
  });

  console.log(`[Legal Lens] Found ${links.length} potential ToS links:`, links);

  return links;
}

/**
 * Fetch the content of a ToS page via background script
 * Returns the HTML content or null if fetch fails
 */
async function fetchTosPage(url) {
  try {
    console.log(`[Legal Lens] Requesting fetch for ToS page: ${url}`);

    // Send fetch request to background script (to avoid CORS issues)
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "FETCH_TOS_PAGE",
          url: url,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (response && response.success && response.html) {
      console.log(`[Legal Lens] Successfully fetched ${url}`);
      return response.html;
    } else {
      console.error(
        `[Legal Lens] Failed to fetch ${url}: ${
          response?.error || "Unknown error"
        }`
      );
      return null;
    }
  } catch (error) {
    console.error(`[Legal Lens] Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * Verify if the fetched content is actually a ToS document
 * Returns {isToS: boolean, confidence: number, text: string}
 */
function verifyTosDocument(html, url) {
  try {
    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Remove scripts, styles, and navigation elements
    const elementsToRemove = doc.querySelectorAll(
      "script, style, nav, header, footer, iframe, noscript"
    );
    elementsToRemove.forEach((el) => el.remove());

    // Get main content - try common content selectors
    const contentSelectors = [
      "main",
      "article",
      '[role="main"]',
      "#content",
      ".content",
      "#main",
      ".main",
      "body",
    ];

    let contentElement = null;
    for (const selector of contentSelectors) {
      contentElement = doc.querySelector(selector);
      if (contentElement) break;
    }

    if (!contentElement) {
      contentElement = doc.body;
    }

    // Extract text
    let text = contentElement ? contentElement.textContent || "" : "";
    text = text.replace(/\s+/g, " ").trim();

    // Check text length
    if (text.length < DETECTION_CONFIG.minTosDocumentLength) {
      return {
        isToS: false,
        confidence: 0,
        text: "",
        reason: "Document too short",
      };
    }

    // Count ToS-related keywords in the document
    const textLower = text.toLowerCase();
    let keywordMatches = 0;
    const legalTerms = [
      "terms of service",
      "terms and conditions",
      "privacy policy",
      "agreement",
      "liability",
      "warranty",
      "intellectual property",
      "user conduct",
      "termination",
      "governing law",
      "disclaimer",
      "copyright",
      "license",
      "prohibited",
      "consent",
    ];

    for (const term of legalTerms) {
      if (textLower.includes(term)) {
        keywordMatches++;
      }
    }

    // Calculate confidence based on keyword density
    const confidence = Math.min(
      100,
      (keywordMatches / legalTerms.length) * 100
    );

    // Consider it a ToS document if it has at least 3 legal terms
    const isToS = keywordMatches >= 3;

    console.log(
      `[Legal Lens] Verified ${url}: isToS=${isToS}, confidence=${confidence}%, keywords=${keywordMatches}`
    );

    return {
      isToS: isToS,
      confidence: confidence,
      text: text,
      keywordMatches: keywordMatches,
      reason: isToS ? "Valid ToS document" : "Insufficient legal terms",
    };
  } catch (error) {
    console.error(`[Legal Lens] Error verifying document:`, error);
    return {
      isToS: false,
      confidence: 0,
      text: "",
      reason: "Parse error",
    };
  }
}

/**
 * Find and fetch the best ToS document from the page
 * Returns {success: boolean, text: string, url: string, source: string}
 */
async function findAndFetchTosDocument() {
  console.log("[Legal Lens] Starting ToS document search...");

  // Step 1: Detect ToS links on the page
  const tosLinks = detectTosLinks();

  if (tosLinks.length === 0) {
    console.log("[Legal Lens] No ToS links found on page");
    return {
      success: false,
      text: "",
      url: "",
      source: "none",
      message: "No Terms of Service links found on this page",
    };
  }

  // Step 2: Try to fetch and verify each link (starting with highest confidence)
  for (const link of tosLinks) {
    console.log(
      `[Legal Lens] Trying link: ${link.url} (confidence: ${link.confidence}%)`
    );

    const html = await fetchTosPage(link.url);

    if (!html) {
      console.log(`[Legal Lens] Failed to fetch ${link.url}, trying next...`);
      continue;
    }

    // Step 3: Verify if it's actually a ToS document
    const verification = verifyTosDocument(html, link.url);

    if (verification.isToS) {
      console.log(`[Legal Lens] Found valid ToS document at ${link.url}`);
      return {
        success: true,
        text: verification.text,
        url: link.url,
        source: "fetched",
        linkText: link.text,
        confidence: verification.confidence,
      };
    }
  }

  // No valid ToS document found
  console.log(
    "[Legal Lens] No valid ToS documents found after checking all links"
  );
  return {
    success: false,
    text: "",
    url: "",
    source: "none",
    message: `Found ${tosLinks.length} potential link(s) but none contained valid ToS documents`,
  };
}
