// API Connector for ToS Summarization
// Handles communication with summarization API with retry logic and exponential backoff

/**
 * Configuration for the summarization API
 * Using Google Gemini Nano API
 */
const API_CONFIG = {
  // Google Gemini API endpoint
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent',
  apiKey: '', // Set via storage or options page
  
  // Rate limiting
  maxRetries: 3,
  baseDelay: 1000, // 1 second base delay
  maxDelay: 10000, // 10 seconds max delay
};

/**
 * SummarizationAPI class handles API communication
 */
class SummarizationAPI {
  constructor() {
    this.rateLimitQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Get API key from storage or use default
   */
  async getApiKey() {
    const result = await chrome.storage.local.get(['api_key']);
    return result.api_key || API_CONFIG.apiKey;
  }

  /**
   * Summarize text using the configured API
   * @param {string} text - The text to summarize
   * @returns {Promise<string>} - The summarized text
   */
  async summarize(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('Empty text provided for summarization');
    }

    const apiKey = await this.getApiKey();
    
    if (!apiKey && API_CONFIG.endpoint.includes('generativelanguage.googleapis.com')) {
      // Fallback to a mock summary if no API key is configured
      console.warn('No API key configured, using mock summary');
      return this.mockSummarize(text);
    }

    return this.callAPIWithRetry(text, apiKey);
  }

  /**
   * Call API with retry logic and exponential backoff
   */
  async callAPIWithRetry(text, apiKey, retryCount = 0) {
    try {
      const summary = await this.callSummarizationAPI(text, apiKey);
      return summary;
    } catch (error) {
      if (retryCount >= API_CONFIG.maxRetries) {
        console.error('Max retries reached, using fallback:', error);
        return this.mockSummarize(text);
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        API_CONFIG.baseDelay * Math.pow(2, retryCount),
        API_CONFIG.maxDelay
      );

      console.log(`Retry attempt ${retryCount + 1} after ${delay}ms`);
      
      await this.sleep(delay);
      return this.callAPIWithRetry(text, apiKey, retryCount + 1);
    }
  }

  /**
   * Make actual API call to summarization endpoint
   */
  async callSummarizationAPI(text, apiKey) {
    // Truncate text if too long (keep it reasonable for API)
    const maxLength = 5000;
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '...' 
      : text;

    // Prepare request based on API type
    if (API_CONFIG.endpoint.includes('generativelanguage.googleapis.com')) {
      return this.callGemini(truncatedText, apiKey);
    } else {
      // Generic API call
      return this.callGenericAPI(truncatedText, apiKey);
    }
  }

  /**
   * Call Google Gemini API
   */
  async callGemini(text, apiKey) {
    const prompt = `Please summarize the following Terms of Service or Privacy Policy text in simple, easy-to-understand language. Focus on key points, user rights, and important obligations. Make it concise and clear. Keep it under 500 words:\n\n${text}`;

    const response = await fetch(`${API_CONFIG.endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          topP: 0.8,
          topK: 10
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text || 'Unable to generate summary';
    } else {
      throw new Error('Invalid response format from Gemini API');
    }
  }

  /**
   * Call generic API endpoint
   */
  async callGenericAPI(text, apiKey) {
    const response = await fetch(API_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey ? `Bearer ${apiKey}` : undefined
      },
      body: JSON.stringify({
        text: text,
        type: 'terms_of_service'
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.summary || data.text || 'Unable to generate summary';
  }

  /**
   * Mock summarization for testing/fallback
   */
  mockSummarize(text) {
    // Simple mock that extracts key phrases
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keySentences = sentences.slice(0, 5);
    
    return `📋 Simplified Summary (Mock):\n\n` +
           `This Terms of Service document contains information about:\n` +
           keySentences.map((s, i) => `${i + 1}. ${s.trim().substring(0, 100)}...`).join('\n') +
           `\n\n⚠️ Note: This is a mock summary. Configure your Gemini API key for real AI-powered summaries.`;
  }

  /**
   * Sleep utility for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

