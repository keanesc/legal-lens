// Content script for Legal Lens Chrome Extension
// This script runs on all web pages to detect and collect legal document popups

console.log("Legal Lens content script loaded");

// Import popup detector functionality
const POPUP_SELECTORS = [
  '[class*="cookie"]',
  '[class*="consent"]',
  '[class*="gdpr"]',
  '[id*="cookie"]',
  '[id*="consent"]',
  '[id*="gdpr"]',
  '[role="dialog"]',
  '[class*="modal"]',
  '[class*="overlay"]',
  '[class*="banner"]',
];

const LEGAL_KEYWORDS = {
  tos: [
    "terms of service",
    "terms of use",
    "terms and conditions",
    "user agreement",
  ],
  privacy: ["privacy policy", "privacy notice", "data protection"],
  cookie: ["cookie policy", "cookie notice", "use of cookies"],
};

const ACCEPT_BUTTON_KEYWORDS = [
  "accept",
  "agree",
  "consent",
  "ok",
  "allow",
  "continue",
  "got it",
  "understood",
];

// Function to detect legal document popups
function detectLegalPopups() {
  const popups = [];

  for (const selector of POPUP_SELECTORS) {
    const elements = document.querySelectorAll(selector);

    elements.forEach((element) => {
      if (isLegalPopup(element)) {
        const popup = analyzePopup(element);
        if (popup) {
          popups.push(popup);
        }
      }
    });
  }

  return popups;
}

function isLegalPopup(element) {
  const text = element.innerText?.toLowerCase() || "";
  const html = element.innerHTML?.toLowerCase() || "";

  const hasLegalKeywords = Object.values(LEGAL_KEYWORDS)
    .flat()
    .some((keyword) => text.includes(keyword) || html.includes(keyword));

  const hasAcceptButton = ACCEPT_BUTTON_KEYWORDS.some((keyword) =>
    text.includes(keyword)
  );
  const isVisible = element.offsetParent !== null;

  return hasLegalKeywords && hasAcceptButton && isVisible;
}

function analyzePopup(element) {
  const links = extractLinks(element);
  if (links.length === 0) return null;

  const buttonText = findAcceptButtonText(element);
  const type = determinePopupType(links);

  return {
    type,
    element,
    links,
    buttonText,
    popupText: element.innerText?.substring(0, 500) || "",
  };
}

function extractLinks(element) {
  const links = [];
  const anchorElements = element.querySelectorAll("a[href]");

  anchorElements.forEach((anchor) => {
    const href = anchor.href;
    const text = anchor.textContent?.trim().toLowerCase() || "";

    let type = "other";
    if (LEGAL_KEYWORDS.tos.some((k) => text.includes(k))) {
      type = "tos";
    } else if (LEGAL_KEYWORDS.privacy.some((k) => text.includes(k))) {
      type = "privacy";
    } else if (LEGAL_KEYWORDS.cookie.some((k) => text.includes(k))) {
      type = "cookie";
    }

    if (type !== "other") {
      links.push({ url: href, text, type });
    }
  });

  return links;
}

function findAcceptButtonText(element) {
  const buttons = element.querySelectorAll(
    'button, [role="button"], a[class*="button"]'
  );

  for (const button of Array.from(buttons)) {
    const text = button.textContent?.trim().toLowerCase() || "";
    if (ACCEPT_BUTTON_KEYWORDS.some((keyword) => text.includes(keyword))) {
      return button.textContent?.trim() || "";
    }
  }

  return "";
}

function determinePopupType(links) {
  const types = new Set(links.map((link) => link.type));

  if (types.size > 1) return "combined";
  if (types.has("tos")) return "tos";
  if (types.has("privacy")) return "privacy";
  if (types.has("cookie")) return "cookie";

  return "combined";
}

// Function to detect legal documents on the page (legacy)
function detectLegalDocuments() {
  const legalKeywords = [
    "contract",
    "agreement",
    "terms of service",
    "privacy policy",
    "license",
    "legal notice",
    "disclaimer",
    "terms and conditions",
    "copyright",
    "trademark",
    "patent",
    "litigation",
    "settlement",
  ];

  const pageText = document.body.innerText.toLowerCase();
  const foundKeywords = legalKeywords.filter((keyword) =>
    pageText.includes(keyword)
  );

  return foundKeywords.length > 2;
}

// Function to extract text content for analysis
function extractDocumentText() {
  const clonedDoc = document.cloneNode(true);
  const scripts = clonedDoc.querySelectorAll("script, style");
  scripts.forEach((el) => el.remove());

  return clonedDoc.body ? clonedDoc.body.innerText : "";
}

// Check for legal popups on page load
setTimeout(() => {
  const popups = detectLegalPopups();

  if (popups.length > 0) {
    console.log(`Detected ${popups.length} legal popup(s)`);

    // Send detected popups to background script for storage
    chrome.runtime.sendMessage({
      action: "popupsDetected",
      data: {
        url: window.location.href,
        domain: window.location.hostname,
        timestamp: Date.now(),
        popups: popups.map((p) => ({
          type: p.type,
          links: p.links,
          buttonText: p.buttonText,
          popupText: p.popupText,
        })),
      },
    });

    // Add visual indicator
    const indicator = document.createElement("div");
    indicator.id = "legal-lens-indicator";
    indicator.innerHTML = `⚖️ Legal Lens: ${popups.length} document(s) detected`;
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #3b82f6;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 10000;
      font-family: system-ui, sans-serif;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    `;
    document.body.appendChild(indicator);

    setTimeout(() => {
      if (indicator) {
        indicator.style.opacity = "0";
        indicator.style.transition = "opacity 0.3s";
        setTimeout(() => indicator.remove(), 300);
      }
    }, 3000);
  }
}, 1000); // Wait 1 second for page to load

// Also check if current page IS a legal document
if (detectLegalDocuments()) {
  console.log("Legal document detected on this page");

  chrome.runtime.sendMessage({
    action: "documentDetected",
    url: window.location.href,
    title: document.title,
  });
}

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "analyzeCurrentPage":
      const text = extractDocumentText();
      sendResponse({
        success: true,
        data: {
          text: text,
          url: window.location.href,
          title: document.title,
          isLegalDocument: detectLegalDocuments(),
        },
      });
      break;

    case "detectPopups":
      const popups = detectLegalPopups();
      sendResponse({
        success: true,
        popups: popups.map((p) => ({
          type: p.type,
          links: p.links,
          buttonText: p.buttonText,
          popupText: p.popupText,
        })),
      });
      break;

    case "scrapeDocument":
      // Scrape the current page as a legal document
      fetch(window.location.href)
        .then((response) => response.text())
        .then((html) => {
          sendResponse({
            success: true,
            data: {
              url: window.location.href,
              title: document.title,
              html: html,
              text: extractDocumentText(),
            },
          });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response

    default:
      sendResponse({ error: "Unknown action" });
  }

  return true; // Keep message channel open
});
