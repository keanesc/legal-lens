// Popup script for ToS Simplifier Extension
// Handles user interactions and communicates with background script

let currentTabId = null;

/**
 * Initialize popup when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Get current active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    currentTabId = tabs[0].id;
    updateStatus('Ready', 'ready');
  }

  // Attach event listeners
  attachEventListeners();
  
  // Check for existing ToS data
  await checkExistingData();
});

/**
 * Attach event listeners to buttons
 */
function attachEventListeners() {
  const simplifyBtn = document.getElementById('simplifyBtn');
  const saveBtn = document.getElementById('saveBtn');
  const compareBtn = document.getElementById('compareBtn');

  simplifyBtn.addEventListener('click', handleSimplify);
  saveBtn.addEventListener('click', handleSave);
  compareBtn.addEventListener('click', handleCompare);
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
    updateStatus('Summary available', 'success');
  }
}

/**
 * Handle Simplify button click
 */
async function handleSimplify() {
  if (!currentTabId) {
    showError('No active tab found');
    return;
  }

  const simplifyBtn = document.getElementById('simplifyBtn');
  simplifyBtn.disabled = true;
  simplifyBtn.querySelector('.btn-text').textContent = 'Processing...';
  
  updateStatus('Extracting ToS text...', 'processing');

  try {
    // Send message to background script
    chrome.runtime.sendMessage({
      type: 'SIMPLIFY_TOS',
      tabId: currentTabId
    }, (response) => {
      simplifyBtn.disabled = false;
      simplifyBtn.querySelector('.btn-text').textContent = 'Simplify';
      
      if (chrome.runtime.lastError) {
        showError('Error: ' + chrome.runtime.lastError.message);
        updateStatus('Error occurred', 'error');
        return;
      }

      if (response && response.success) {
        showSummary(response.summary);
        updateStatus('Summary generated', 'success');
      } else {
        showError(response?.error || 'Failed to simplify ToS');
        updateStatus('Failed', 'error');
      }
    });
  } catch (error) {
    simplifyBtn.disabled = false;
    simplifyBtn.querySelector('.btn-text').textContent = 'Simplify';
    showError('Error: ' + error.message);
    updateStatus('Error occurred', 'error');
  }
}

/**
 * Handle Save button click
 */
async function handleSave() {
  if (!currentTabId) {
    showError('No active tab found');
    return;
  }

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.querySelector('.btn-text').textContent = 'Saving...';

  try {
    chrome.runtime.sendMessage({
      type: 'SAVE_TOS',
      tabId: currentTabId
    }, (response) => {
      saveBtn.disabled = false;
      saveBtn.querySelector('.btn-text').textContent = 'Save';

      if (chrome.runtime.lastError) {
        showError('Error: ' + chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success) {
        showMessage('ToS saved successfully!', 'success');
        updateStatus('Saved', 'success');
      } else {
        showError(response?.error || 'Failed to save ToS');
      }
    });
  } catch (error) {
    saveBtn.disabled = false;
    saveBtn.querySelector('.btn-text').textContent = 'Save';
    showError('Error: ' + error.message);
  }
}

/**
 * Handle Compare button click
 */
async function handleCompare() {
  if (!currentTabId) {
    showError('No active tab found');
    return;
  }

  const compareBtn = document.getElementById('compareBtn');
  compareBtn.disabled = true;
  compareBtn.querySelector('.btn-text').textContent = 'Comparing...';

  try {
    chrome.runtime.sendMessage({
      type: 'COMPARE_TOS',
      tabId: currentTabId
    }, (response) => {
      compareBtn.disabled = false;
      compareBtn.querySelector('.btn-text').textContent = 'Compare';

      if (chrome.runtime.lastError) {
        showError('Error: ' + chrome.runtime.lastError.message);
        return;
      }

      if (response && response.success) {
        showComparison(response.current, response.saved);
        updateStatus('Comparison ready', 'success');
      } else {
        showError(response?.error || 'Failed to compare ToS');
      }
    });
  } catch (error) {
    compareBtn.disabled = false;
    compareBtn.querySelector('.btn-text').textContent = 'Compare';
    showError('Error: ' + error.message);
  }
}

/**
 * Show summary in result section
 */
function showSummary(summary) {
  const resultSection = document.getElementById('resultSection');
  const summaryContent = document.getElementById('summaryContent');
  
  summaryContent.textContent = summary;
  resultSection.style.display = 'block';
  
  // Scroll to result
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Show comparison data
 */
function showComparison(current, saved) {
  const savedSection = document.getElementById('savedSection');
  const savedList = document.getElementById('savedList');
  
  if (!saved || saved.length === 0) {
    showError('No saved ToS documents to compare with');
    return;
  }

  savedList.innerHTML = '';
  
  // Show current summary
  const currentDiv = document.createElement('div');
  currentDiv.className = 'saved-item current';
  currentDiv.innerHTML = `
    <h4>Current Document</h4>
    <p class="url">${current.url || 'Current page'}</p>
    <p class="summary">${current.summary.substring(0, 200)}...</p>
  `;
  savedList.appendChild(currentDiv);
  
  // Show saved documents
  saved.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'saved-item';
    const date = new Date(item.savedAt || item.timestamp).toLocaleDateString();
    itemDiv.innerHTML = `
      <h4>Saved Document ${index + 1}</h4>
      <p class="url">${item.url || 'Unknown URL'}</p>
      <p class="date">Saved: ${date}</p>
      <p class="summary">${item.summary.substring(0, 200)}...</p>
    `;
    savedList.appendChild(itemDiv);
  });
  
  savedSection.style.display = 'block';
  savedSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Update status indicator
 */
function updateStatus(text, status = 'ready') {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const statusDot = statusIndicator.querySelector('.status-dot');
  
  statusText.textContent = text;
  
  // Update status dot color
  statusDot.className = 'status-dot';
  switch (status) {
    case 'ready':
      statusDot.classList.add('ready');
      break;
    case 'processing':
      statusDot.classList.add('processing');
      break;
    case 'success':
      statusDot.classList.add('success');
      break;
    case 'error':
      statusDot.classList.add('error');
      break;
  }
}

/**
 * Show error message
 */
function showError(message) {
  showMessage(message, 'error');
}

/**
 * Show success/info message
 */
function showMessage(message, type = 'success') {
  // Create temporary message element
  const messageEl = document.createElement('div');
  messageEl.className = `message message-${type}`;
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 5px;
    background: ${type === 'error' ? '#f44336' : '#4CAF50'};
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


