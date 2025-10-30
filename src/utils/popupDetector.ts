// Popup detector for Legal Lens
// Detects common ToS/Privacy Policy acceptance popups

export interface DetectedPopup {
  type: "tos" | "privacy" | "cookie" | "combined";
  element: HTMLElement;
  links: Array<{ url: string; text: string; type: string }>;
  buttonText: string;
}

export class PopupDetector {
  private static readonly POPUP_SELECTORS = [
    // Common cookie/consent banner selectors
    '[class*="cookie"]',
    '[class*="consent"]',
    '[class*="gdpr"]',
    '[id*="cookie"]',
    '[id*="consent"]',
    '[id*="gdpr"]',
    // Common modal/overlay patterns
    '[role="dialog"]',
    '[class*="modal"]',
    '[class*="overlay"]',
    '[class*="banner"]',
  ];

  private static readonly LEGAL_KEYWORDS = {
    tos: [
      "terms of service",
      "terms of use",
      "terms and conditions",
      "user agreement",
    ],
    privacy: ["privacy policy", "privacy notice", "data protection"],
    cookie: ["cookie policy", "cookie notice", "use of cookies"],
  };

  private static readonly ACCEPT_BUTTON_KEYWORDS = [
    "accept",
    "agree",
    "consent",
    "ok",
    "allow",
    "continue",
    "got it",
    "understood",
  ];

  static detectPopups(): DetectedPopup[] {
    const popups: DetectedPopup[] = [];

    // Check each potential popup element
    for (const selector of this.POPUP_SELECTORS) {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element) => {
        if (this.isLegalPopup(element as HTMLElement)) {
          const popup = this.analyzePopup(element as HTMLElement);
          if (popup) {
            popups.push(popup);
          }
        }
      });
    }

    return popups;
  }

  private static isLegalPopup(element: HTMLElement): boolean {
    const text = element.innerText.toLowerCase();
    const html = element.innerHTML.toLowerCase();

    // Check for legal keywords
    const hasLegalKeywords = Object.values(this.LEGAL_KEYWORDS)
      .flat()
      .some((keyword) => text.includes(keyword) || html.includes(keyword));

    // Check for accept button
    const hasAcceptButton = this.ACCEPT_BUTTON_KEYWORDS.some((keyword) =>
      text.includes(keyword)
    );

    // Must be visible
    const isVisible = element.offsetParent !== null;

    return hasLegalKeywords && hasAcceptButton && isVisible;
  }

  private static analyzePopup(element: HTMLElement): DetectedPopup | null {
    const links = this.extractLinks(element);
    if (links.length === 0) return null;

    const buttonText = this.findAcceptButtonText(element);
    const type = this.determinePopupType(links);

    return {
      type,
      element,
      links,
      buttonText,
    };
  }

  private static extractLinks(
    element: HTMLElement
  ): Array<{ url: string; text: string; type: string }> {
    const links: Array<{ url: string; text: string; type: string }> = [];
    const anchorElements = element.querySelectorAll("a[href]");

    anchorElements.forEach((anchor) => {
      const href = (anchor as HTMLAnchorElement).href;
      const text = anchor.textContent?.trim().toLowerCase() || "";

      let type = "other";
      if (this.LEGAL_KEYWORDS.tos.some((k) => text.includes(k))) {
        type = "tos";
      } else if (this.LEGAL_KEYWORDS.privacy.some((k) => text.includes(k))) {
        type = "privacy";
      } else if (this.LEGAL_KEYWORDS.cookie.some((k) => text.includes(k))) {
        type = "cookie";
      }

      if (type !== "other") {
        links.push({ url: href, text, type });
      }
    });

    return links;
  }

  private static findAcceptButtonText(element: HTMLElement): string {
    const buttons = element.querySelectorAll(
      'button, [role="button"], a[class*="button"]'
    );

    for (const button of Array.from(buttons)) {
      const text = button.textContent?.trim().toLowerCase() || "";
      if (
        this.ACCEPT_BUTTON_KEYWORDS.some((keyword) => text.includes(keyword))
      ) {
        return button.textContent?.trim() || "";
      }
    }

    return "";
  }

  private static determinePopupType(
    links: Array<{ url: string; text: string; type: string }>
  ): "tos" | "privacy" | "cookie" | "combined" {
    const types = new Set(links.map((link) => link.type));

    if (types.size > 1) return "combined";
    if (types.has("tos")) return "tos";
    if (types.has("privacy")) return "privacy";
    if (types.has("cookie")) return "cookie";

    return "combined";
  }
}
