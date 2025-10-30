// IndexedDB wrapper for Legal Lens
// Stores legal documents with metadata, links, and optional full content

const DB_NAME = "LegalLensDB";
const DB_VERSION = 1;
const STORE_NAME = "documents";

export interface LegalDocument {
  id: string; // unique identifier (hash of url + timestamp)
  url: string;
  domain: string;
  title: string;
  documentType: "tos" | "privacy" | "cookie" | "other";
  timestamp: number;
  hash: string; // content hash for change detection
  keySections: {
    summary: string;
    importantClauses: string[];
    dataCollection: string[];
    userRights: string[];
  };
  metadata: {
    detectedAt: string; // page where popup was detected
    popupText?: string; // text from the popup itself
    lastChecked: number;
    changeDetected: boolean;
  };
  fullDocument?: string; // optional: store full text if user wants
  storagePreference: "link-only" | "key-sections" | "full";
}

class LegalLensDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
          });

          // Create indexes for efficient querying
          objectStore.createIndex("url", "url", { unique: false });
          objectStore.createIndex("domain", "domain", { unique: false });
          objectStore.createIndex("timestamp", "timestamp", { unique: false });
          objectStore.createIndex("documentType", "documentType", {
            unique: false,
          });
          objectStore.createIndex("hash", "hash", { unique: false });
        }
      };
    });
  }

  async saveDocument(doc: LegalDocument): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(doc);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getDocument(id: string): Promise<LegalDocument | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getDocumentsByDomain(domain: string): Promise<LegalDocument[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("domain");
      const request = index.getAll(domain);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllDocuments(): Promise<LegalDocument[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async checkForChanges(url: string, currentHash: string): Promise<boolean> {
    if (!this.db) await this.init();

    const transaction = this.db!.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("url");

    return new Promise((resolve, reject) => {
      const request = index.getAll(url);

      request.onsuccess = () => {
        const docs = request.result;
        if (docs.length === 0) {
          resolve(false); // No previous version
        } else {
          // Check if hash is different from most recent version
          const mostRecent = docs.sort((a, b) => b.timestamp - a.timestamp)[0];
          resolve(mostRecent.hash !== currentHash);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
export const db = new LegalLensDB();
