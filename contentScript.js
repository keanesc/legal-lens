// Content Script for ToS Detection and Interaction
// Observes DOM changes to detect ToS popups and injects UI elements

/**
 * Configuration for ToS detection
 */
const DETECTION_CONFIG = {
  // Keywords to look for in ToS popups
  keywords: [
    'terms of service',
    'terms and conditions',
    'privacy policy',
    'cookie policy',
    'user agreement',
    'end user license agreement',
    'accept terms',
    'i agree',
    'agree and continue',
    'privacy notice',
    'terms of use'
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
    '[role="dialog"]'
  ],
  
  // Minimum text length to consider as ToS
  minTextLength: 50
};

// Track detected ToS elements
const detectedElements = new Set();
let observerActive = false;

/**
 * Initialize content script
 */
(function init() {
  console.log('ToS Simplifier content script loaded v1.1', new Date().toISOString());
  
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
      
      // Check attribute changes (e.g., style changes making popup visible)
      if (mutation.type === 'attributes') {
        checkForTosPopup(mutation.target);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'id']
  });
}

/**
 * Check for existing ToS popups on page load
 */
function detectExistingTosPopups() {
  // Check common selectors
  DETECTION_CONFIG.commonSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => checkForTosPopup(el));
    } catch (e) {
      // Invalid selector, skip
    }
  });
}

/**
 * Check if an element is a ToS popup
 */
function checkForTosPopup(element) {
  if (!element || typeof element.querySelector !== 'function') return;
  if (detectedElements.has(element)) return;
  
  // Check if element is visible
  if (!isElementVisible(element)) return;
  
  // Get text content
  const text = element.textContent || element.innerText || '';
  const lowerText = text.toLowerCase();
  
  // Check for keywords
  const hasKeyword = DETECTION_CONFIG.keywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
  
  // Check if it's a modal/popup structure
  const isModalStructure = isModalLike(element);
  
  // Check text length
  const hasEnoughText = text.trim().length >= DETECTION_CONFIG.minTextLength;
  
  if ((hasKeyword || isModalStructure) && hasEnoughText) {
    // Found a potential ToS popup
    handleTosDetection(element);
    detectedElements.add(element);
    
    // Notify background script
    chrome.runtime.sendMessage({
      type: 'DETECT_TOS',
      url: window.location.href,
      textPreview: text.substring(0, 200)
    });
  }
}

/**
 * Check if element is visible
 */
function isElementVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
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
  let className = '';
  if (typeof rawClassName === 'string') {
    className = rawClassName.toLowerCase();
  } else if (rawClassName && typeof rawClassName.baseVal === 'string') {
    className = rawClassName.baseVal.toLowerCase();
  }

  const rawId = element.id;
  let id = '';
  if (typeof rawId === 'string') {
    id = rawId.toLowerCase();
  } else if (rawId && typeof rawId.baseVal === 'string') {
    id = rawId.baseVal.toLowerCase();
  }
  
  const modalIndicators = ['modal', 'popup', 'overlay', 'dialog', 'drawer'];
  return modalIndicators.some(indicator => 
    className.includes(indicator) || id.includes(indicator)
  );
}

/**
 * Handle ToS detection - inject explain button
 */
function handleTosDetection(element) {
  console.log('ToS popup detected:', element);
  
  // Check if button already exists
  const existingButton = element.querySelector('.tos-simplifier-explain-btn');
  if (existingButton) return;
  
  // Find a good place to inject the button
  const buttonContainer = findButtonContainer(element);
  if (!buttonContainer) return;
  
  // Create and inject button
  const explainButton = createExplainButton();
  buttonContainer.appendChild(explainButton);
  
  // Add click handler
  explainButton.addEventListener('click', (e) => {
    e.stopPropagation();
    handleExplainClick(element);
  });
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
    'button',
    '.actions',
    '.footer'
  ];
  
  for (const selector of buttonSelectors) {
    const container = element.querySelector(selector);
    if (container) return container;
  }
  
  // If no button container found, create a wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'tos-simplifier-button-wrapper';
  wrapper.style.cssText = 'margin-top: 10px; text-align: center;';
  
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
 * Create the explain button element
 */
function createExplainButton() {
  const button = document.createElement('button');
  button.className = 'tos-simplifier-explain-btn';
  button.textContent = '🤖 Explain Terms';
  button.style.cssText = `
    background: #4CAF50;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    margin: 5px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: background 0.3s;
  `;
  
  button.addEventListener('mouseenter', () => {
    button.style.background = '#45a049';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.background = '#4CAF50';
  });
  
  return button;
}

/**
 * Handle explain button click
 */

/**
 * Handle explain button click
 */
async function handleExplainClick(element) {
  const button = element.querySelector('.tos-simplifier-explain-btn');
  if (button) {
    button.disabled = true;
    button.textContent = '⏳ Summarizing...';
  }
  
  try {
    // Extract text from the ToS element
    const text = extractTosText(element);
    
    if (!text || text.trim().length < DETECTION_CONFIG.minTextLength) {
      showResult('⚠️ Could not extract sufficient text from the Terms of Service.', 'error');
      resetExplainButton(button);
      return;
    }
    
    // Send to background script for summarization with retry logic
    const msg = {
      type: 'EXTRACT_TEXT',
      text: text,
      url: window.location.href
    };
    
    await sendMessageWithRetry(msg, button);
      
  } catch (error) {
    console.error('Error handling explain click:', error);
    showResult('Error: ' + error.message, 'error');
    resetExplainButton(button);
  }
}

/**
 * Send message with retry logic for service worker reloads
 */
async function sendMessageWithRetry(message, button, maxRetries = 3) {
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
      
      handleSummarizeResponse(response, button);
      return;
      
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isServiceWorkerError = error.message.includes('context invalidated') || 
                                   error.message.includes('Extension context') ||
                                   error.message.includes('message port');
      
      if (isServiceWorkerError && !isLastAttempt) {
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt)));
        continue;
      }
      
      // Last attempt or non-service-worker error
      showResult('Error communicating with extension: ' + error.message, 'error');
      resetExplainButton(button);
      return;
    }
  }
}
  // Clone element to avoid modifying original
  const clone = element.cloneNode(true);
  
  // Remove script and style elements
  const scripts = clone.querySelectorAll('script, style, noscript');
  scripts.forEach(el => el.remove());
  
  // Remove the explain button if present
  const buttons = clone.querySelectorAll('.tos-simplifier-explain-btn');
  buttons.forEach(el => el.remove());
  
  // Get text content
  let text = clone.textContent || clone.innerText || '';
  
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Show result to user
 */
function showResult(message, type = 'success') {
  // Remove existing result if any
  const existing = document.querySelector('.tos-simplifier-result');
  if (existing) existing.remove();
  
  // Create result overlay
  const overlay = document.createElement('div');
  overlay.className = 'tos-simplifier-result';
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    background: ${type === 'success' ? '#4CAF50' : '#f44336'};
    color: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    z-index: 999999;
    font-size: 14px;
    line-height: 1.5;
  `;
  
  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
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
  const content = document.createElement('div');
  content.style.cssText = 'white-space: pre-wrap; margin-bottom: 10px;';
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
function handleSummarizeResponse(response, button) {
  if (response && response.success) {
    showResult(response.summary, 'success');
  } else {
    showResult('Failed to summarize: ' + (response?.error || 'Unknown error'), 'error');
  }
  resetExplainButton(button);
}

function resetExplainButton(button) {
  if (button) {
    button.disabled = false;
    button.textContent = '🤖 Explain Terms';
  }
}

/**
 * Handle messages from background/popup
 */
function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case 'EXTRACT_TOS_TEXT':
      // Extract text from detected ToS popups
      const text = extractTosTextFromPage();
      sendResponse({
        success: true,
        text: text,
        url: window.location.href
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return true; // Keep channel open for async
}

/**
 * Extract ToS text from page
 */
function extractTosTextFromPage() {
  // Try to find detected elements first
  if (detectedElements.size > 0) {
    const firstElement = Array.from(detectedElements)[0];
    return extractTosText(firstElement);
  }
  
  // Fallback: search for ToS-related content
  for (const selector of DETECTION_CONFIG.commonSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (isElementVisible(el)) {
          const text = extractTosText(el);
          if (text.length >= DETECTION_CONFIG.minTextLength) {
            return text;
          }
        }
      }
    } catch (e) {
      // Skip invalid selector
    }
  }
  
  return '';
}

