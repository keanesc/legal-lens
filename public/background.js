// Background script for Legal Lens Chrome Extension
// This service worker handles extension lifecycle events and document storage

chrome.runtime.onInstalled.addListener((details) => {
  console.log("Legal Lens extension installed:", details.reason);

  if (details.reason === "install") {
    // Extension was installed for the first time
    chrome.storage.local.set({
      notifications: true,
      updateFrequency: "daily",
      languageLevel: "standard",
      storagePreference: "key-sections", // link-only, key-sections, or full
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  console.log("Extension icon clicked on tab:", tab.id);
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background:", request);

  switch (request.action) {
    case "popupsDetected":
      // Handle detected legal popups
      handlePopupsDetected(request.data, sender.tab, sendResponse);
      return true;

    case "analyzeDocument":
      handleDocumentAnalysis(request.data, sendResponse);
      return true;

    case "getSettings":
      chrome.storage.local.get(
        [
          "notifications",
          "updateFrequency",
          "languageLevel",
          "storagePreference",
        ],
        (result) => {
          sendResponse(result);
        }
      );
      return true;

    case "saveSettings":
      chrome.storage.local.set(request.settings, () => {
        sendResponse({ success: true });
      });
      return true;

    case "getAllDocuments":
      // Retrieve all stored documents from IndexedDB
      getAllStoredDocuments(sendResponse);
      return true;

    case "getDocumentsByDomain":
      getDocumentsByDomain(request.domain, sendResponse);
      return true;

    default:
      sendResponse({ error: "Unknown action" });
  }
});

async function handlePopupsDetected(data, tab, sendResponse) {
  try {
    console.log("Processing detected popups:", data);

    const { url, domain, timestamp, popups } = data;

    // Get storage preference
    const settings = await chrome.storage.local.get(["storagePreference"]);
    const storagePreference = settings.storagePreference || "key-sections";

    // Process each detected popup
    for (const popup of popups) {
      for (const link of popup.links) {
        // Scrape the document from the link
        const documentData = await scrapeDocument(link.url, storagePreference);

        // Create document record
        const docRecord = {
          id: await generateDocId(link.url, timestamp),
          url: link.url,
          domain: domain,
          title: documentData.title || link.text,
          documentType: link.type,
          timestamp: timestamp,
          hash: documentData.hash,
          keySections: documentData.keySections,
          metadata: {
            detectedAt: url,
            popupText: popup.popupText,
            lastChecked: timestamp,
            changeDetected: false,
          },
          fullDocument:
            storagePreference === "full" ? documentData.fullText : undefined,
          storagePreference: storagePreference,
        };

        // Store in IndexedDB via content script (since background can't access IndexedDB directly)
        chrome.tabs.sendMessage(tab.id, {
          action: "storeDocument",
          document: docRecord,
        });

        // Also store basic info in chrome.storage for quick access
        const storageKey = `doc_${docRecord.id}`;
        await chrome.storage.local.set({
          [storageKey]: {
            url: link.url,
            domain: domain,
            type: link.type,
            timestamp: timestamp,
          },
        });
      }
    }

    sendResponse({ success: true, message: "Popups processed and stored" });
  } catch (error) {
    console.error("Error handling popups:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function scrapeDocument(url, storagePreference) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Clean document
    doc
      .querySelectorAll("script, style, nav, header, footer, aside")
      .forEach((el) => el.remove());

    const fullText = doc.body.textContent || "";
    const title = doc.title || "Untitled Document";

    // Extract key sections (simplified version)
    const keySections = extractKeySections(fullText);
    const hash = await generateHash(fullText);

    return {
      title,
      fullText: storagePreference === "full" ? fullText : undefined,
      keySections,
      hash,
    };
  } catch (error) {
    console.error("Failed to scrape document:", error);
    return {
      title: "Error loading document",
      fullText: "",
      keySections: {
        summary: "",
        importantClauses: [],
        dataCollection: [],
        userRights: [],
      },
      hash: "",
    };
  }
}

function extractKeySections(text) {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 50);

  return {
    summary: paragraphs[0]?.substring(0, 300) + "..." || "No summary available",
    importantClauses: extractClauses(paragraphs, [
      "liability",
      "indemnify",
      "warranty",
    ]),
    dataCollection: extractClauses(paragraphs, [
      "collect",
      "personal information",
      "cookies",
    ]),
    userRights: extractClauses(paragraphs, [
      "right to",
      "opt-out",
      "delete",
      "access",
    ]),
  };
}

function extractClauses(paragraphs, keywords) {
  const clauses = [];

  for (const paragraph of paragraphs) {
    const lowerParagraph = paragraph.toLowerCase();

    if (
      keywords.some((keyword) => lowerParagraph.includes(keyword.toLowerCase()))
    ) {
      const clause =
        paragraph.length > 300
          ? paragraph.substring(0, 300) + "..."
          : paragraph;
      clauses.push(clause.trim());

      if (clauses.length >= 5) break;
    }
  }

  return clauses;
}

async function generateHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateDocId(url, timestamp) {
  const combined = url + timestamp.toString();
  return await generateHash(combined);
}

async function handleDocumentAnalysis(data, sendResponse) {
  try {
    console.log("Analyzing document:", data);

    // Placeholder for Chrome built-in AI integration
    const analysis = {
      summary: "Document analysis placeholder",
      keyPoints: ["Point 1", "Point 2", "Point 3"],
      complexity: "medium",
    };

    sendResponse({ success: true, analysis });
  } catch (error) {
    console.error("Document analysis failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function getAllStoredDocuments(sendResponse) {
  try {
    // Get all document keys from chrome.storage
    const allData = await chrome.storage.local.get(null);
    const documents = Object.entries(allData)
      .filter(([key]) => key.startsWith("doc_"))
      .map(([, value]) => value);

    sendResponse({ success: true, documents });
  } catch (error) {
    console.error("Failed to get documents:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function getDocumentsByDomain(domain, sendResponse) {
  try {
    const allData = await chrome.storage.local.get(null);
    const documents = Object.entries(allData)
      .filter(
        ([key, value]) => key.startsWith("doc_") && value.domain === domain
      )
      .map(([, value]) => value);

    sendResponse({ success: true, documents });
  } catch (error) {
    console.error("Failed to get documents by domain:", error);
    sendResponse({ success: false, error: error.message });
  }
}
