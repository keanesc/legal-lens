// Document scraper and analyzer for Legal Lens
// Scrapes legal documents and extracts key information

export interface ScrapedDocument {
  url: string;
  title: string;
  fullText: string;
  keySections: {
    summary: string;
    importantClauses: string[];
    dataCollection: string[];
    userRights: string[];
  };
  hash: string;
}

export class DocumentScraper {
  private static readonly IMPORTANT_KEYWORDS = [
    "liability",
    "indemnify",
    "warranty",
    "termination",
    "breach",
    "dispute",
    "arbitration",
    "governing law",
    "modification",
    "amendment",
  ];

  private static readonly DATA_COLLECTION_KEYWORDS = [
    "collect",
    "gather",
    "obtain",
    "personal information",
    "data",
    "cookies",
    "tracking",
    "analytics",
    "third party",
    "share",
    "sell",
    "transfer",
    "process",
  ];

  private static readonly USER_RIGHTS_KEYWORDS = [
    "right to",
    "you may",
    "you can",
    "opt-out",
    "opt out",
    "delete",
    "access",
    "correct",
    "withdraw",
    "object",
    "portability",
    "rectification",
  ];

  static async scrapeDocument(url: string): Promise<ScrapedDocument> {
    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Remove scripts, styles, and other non-content elements
      doc
        .querySelectorAll("script, style, nav, header, footer, aside")
        .forEach((el) => el.remove());

      const fullText = doc.body.textContent || "";
      const title = doc.title || "Untitled Document";

      const keySections = this.extractKeySections(fullText);
      const hash = await this.generateHash(fullText);

      return {
        url,
        title,
        fullText,
        keySections,
        hash,
      };
    } catch (error) {
      console.error("Failed to scrape document:", error);
      throw new Error(`Failed to scrape document from ${url}`);
    }
  }

  private static extractKeySections(
    text: string
  ): ScrapedDocument["keySections"] {
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 50);

    return {
      summary: this.generateSummary(paragraphs),
      importantClauses: this.extractClauses(
        paragraphs,
        this.IMPORTANT_KEYWORDS
      ),
      dataCollection: this.extractClauses(
        paragraphs,
        this.DATA_COLLECTION_KEYWORDS
      ),
      userRights: this.extractClauses(paragraphs, this.USER_RIGHTS_KEYWORDS),
    };
  }

  private static generateSummary(paragraphs: string[]): string {
    // Take first substantial paragraph as summary (simple approach)
    const firstParagraph = paragraphs.find(
      (p) => p.length > 100 && p.length < 500
    );
    return firstParagraph?.substring(0, 300) + "..." || "No summary available";
  }

  private static extractClauses(
    paragraphs: string[],
    keywords: string[]
  ): string[] {
    const clauses: string[] = [];

    for (const paragraph of paragraphs) {
      const lowerParagraph = paragraph.toLowerCase();

      // Check if paragraph contains any of the keywords
      if (
        keywords.some((keyword) =>
          lowerParagraph.includes(keyword.toLowerCase())
        )
      ) {
        // Truncate long paragraphs
        const clause =
          paragraph.length > 300
            ? paragraph.substring(0, 300) + "..."
            : paragraph;
        clauses.push(clause.trim());

        // Limit to 5 clauses per category
        if (clauses.length >= 5) break;
      }
    }

    return clauses;
  }

  private static async generateHash(text: string): Promise<string> {
    // Simple hash generation using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  static async scrapeMultipleDocuments(
    links: Array<{ url: string; type: string }>
  ): Promise<Map<string, ScrapedDocument>> {
    const results = new Map<string, ScrapedDocument>();

    for (const link of links) {
      try {
        const doc = await this.scrapeDocument(link.url);
        results.set(link.type, doc);
      } catch (error) {
        console.error(`Failed to scrape ${link.type} from ${link.url}:`, error);
      }
    }

    return results;
  }
}
