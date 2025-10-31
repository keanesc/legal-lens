// Translation Helper Module
// Uses Chrome's built-in Translator API to translate ToS summaries

/**
 * Check if Translator API is supported
 */
function isTranslatorSupported() {
  return "Translator" in self;
}

/**
 * Get user's preferred language from browser
 */
function getUserLanguage() {
  // Get the browser UI language
  const uiLanguage = chrome.i18n.getUILanguage();

  // Extract just the language code (e.g., "en" from "en-US")
  const langCode = uiLanguage.split("-")[0].toLowerCase();

  console.log("[Translator] UI Language:", uiLanguage, "-> Code:", langCode);
  return langCode;
}

/**
 * Check if translation is available for a language pair
 * @param {string} sourceLanguage - Source language code (e.g., 'en')
 * @param {string} targetLanguage - Target language code (e.g., 'es')
 * @returns {Promise<string>} - Availability status
 */
async function checkTranslationAvailability(sourceLanguage, targetLanguage) {
  if (!isTranslatorSupported()) {
    return "unsupported";
  }

  try {
    const availability = await self.Translator.availability({
      sourceLanguage,
      targetLanguage,
    });
    console.log(
      `[Translator] Availability for ${sourceLanguage} -> ${targetLanguage}:`,
      availability
    );
    return availability;
  } catch (error) {
    console.error("[Translator] Error checking availability:", error);
    return "error";
  }
}

/**
 * Detect the language of text using Language Detector API
 * @param {string} text - Text to detect language from
 * @returns {Promise<string|null>} - Detected language code or null
 */
async function detectLanguage(text) {
  if (!("LanguageDetector" in self)) {
    console.warn("[Translator] LanguageDetector API not available");
    // Assume English as default
    return "en";
  }

  try {
    const detector = await self.LanguageDetector.create();
    const results = await detector.detect(text);

    if (results && results.length > 0) {
      const topResult = results[0];
      console.log(
        "[Translator] Detected language:",
        topResult.detectedLanguage,
        "confidence:",
        topResult.confidence
      );
      return topResult.detectedLanguage;
    }
  } catch (error) {
    console.error("[Translator] Error detecting language:", error);
  }

  // Default to English if detection fails
  return "en";
}

/**
 * Create a translator for a language pair
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @param {Function} onProgress - Optional callback for download progress (percent, status)
 * @returns {Promise<Object>} - Translator instance
 */
async function createTranslator(
  sourceLanguage,
  targetLanguage,
  onProgress = null
) {
  if (!isTranslatorSupported()) {
    throw new Error("Translator API not supported in this browser");
  }

  console.log(
    `[Translator] Creating translator: ${sourceLanguage} -> ${targetLanguage}`
  );

  const options = {
    sourceLanguage,
    targetLanguage,
  };

  // Add progress monitor if callback provided
  if (onProgress) {
    options.monitor = (m) => {
      m.addEventListener("downloadprogress", (e) => {
        const percent = Math.floor(e.loaded * 100);
        console.log(`[Translator] Download progress: ${percent}%`);
        onProgress(percent, `Downloading translation model: ${percent}%`);
      });
    };
  }

  try {
    const translator = await self.Translator.create(options);
    console.log("[Translator] Translator created successfully");
    return translator;
  } catch (error) {
    console.error("[Translator] Error creating translator:", error);
    throw error;
  }
}

/**
 * Translate text from source to target language
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code (or null to auto-detect)
 * @param {string} targetLanguage - Target language code
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} - { translatedText, sourceLanguage, targetLanguage, wasTranslated }
 */
async function translateText(
  text,
  sourceLanguage,
  targetLanguage,
  onProgress = null
) {
  try {
    // If no source language provided, detect it
    if (!sourceLanguage) {
      console.log("[Translator] Auto-detecting source language...");
      sourceLanguage = await detectLanguage(text);
      console.log("[Translator] Detected source language:", sourceLanguage);
    }

    // Normalize language codes
    sourceLanguage = sourceLanguage.toLowerCase().split("-")[0];
    targetLanguage = targetLanguage.toLowerCase().split("-")[0];

    // If source and target are the same, no translation needed
    if (sourceLanguage === targetLanguage) {
      console.log(
        "[Translator] Source and target languages are the same, skipping translation"
      );
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        wasTranslated: false,
      };
    }

    // Check if translation is available
    const availability = await checkTranslationAvailability(
      sourceLanguage,
      targetLanguage
    );

    if (availability === "unsupported") {
      console.warn(
        "[Translator] Translation not supported for this language pair"
      );
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        wasTranslated: false,
        error: "unsupported",
      };
    }

    if (availability === "no") {
      console.warn(
        "[Translator] Translation not available for this language pair"
      );
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        wasTranslated: false,
        error: "unavailable",
      };
    }

    // Create translator
    const translator = await createTranslator(
      sourceLanguage,
      targetLanguage,
      onProgress
    );

    // Translate the text
    console.log("[Translator] Translating text...");
    const translatedText = await translator.translate(text);
    console.log("[Translator] Translation complete");

    return {
      translatedText,
      sourceLanguage,
      targetLanguage,
      wasTranslated: true,
    };
  } catch (error) {
    console.error("[Translator] Translation error:", error);
    return {
      translatedText: text,
      sourceLanguage: sourceLanguage || "unknown",
      targetLanguage,
      wasTranslated: false,
      error: error.message,
    };
  }
}

/**
 * Translate text in chunks for longer content
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} - Translation result
 */
async function translateTextStreaming(
  text,
  sourceLanguage,
  targetLanguage,
  onProgress = null
) {
  try {
    if (!sourceLanguage) {
      sourceLanguage = await detectLanguage(text);
    }

    sourceLanguage = sourceLanguage.toLowerCase().split("-")[0];
    targetLanguage = targetLanguage.toLowerCase().split("-")[0];

    if (sourceLanguage === targetLanguage) {
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        wasTranslated: false,
      };
    }

    const translator = await createTranslator(
      sourceLanguage,
      targetLanguage,
      onProgress
    );

    console.log("[Translator] Starting streaming translation...");
    const stream = translator.translateStreaming(text);

    let translatedText = "";
    for await (const chunk of stream) {
      translatedText = chunk; // Each chunk is the complete translation so far
    }

    console.log("[Translator] Streaming translation complete");

    return {
      translatedText,
      sourceLanguage,
      targetLanguage,
      wasTranslated: true,
    };
  } catch (error) {
    console.error("[Translator] Streaming translation error:", error);
    return {
      translatedText: text,
      sourceLanguage: sourceLanguage || "unknown",
      targetLanguage,
      wasTranslated: false,
      error: error.message,
    };
  }
}

// Export functions for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isTranslatorSupported,
    getUserLanguage,
    checkTranslationAvailability,
    detectLanguage,
    createTranslator,
    translateText,
    translateTextStreaming,
  };
}
