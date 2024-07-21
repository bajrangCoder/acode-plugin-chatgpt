export class APIKeyManager {
  constructor(secret) {
    this.secret = secret; // Secret passphrase for encryption/decryption
  }

  // Utility to encode a string as an ArrayBuffer
  _encode(text) {
    const encoder = new TextEncoder();
    return encoder.encode(text);
  }

  // Utility to decode an ArrayBuffer to a string
  _decode(buffer) {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }

  // Utility to import a key for AES-GCM
  async _importKey(secret) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      this._encode(secret),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: this._encode("salt"),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    return key;
  }

  // Encrypt a value using AES-GCM
  async _encrypt(value) {
    const key = await this._importKey(this.secret);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      this._encode(value)
    );
    return { iv, encrypted };
  }

  // Decrypt a value using AES-GCM
  async _decrypt(encrypted, iv) {
    const key = await this._importKey(this.secret);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encrypted
    );
    return this._decode(decrypted);
  }

  // Save API key
  async saveAPIKey(provider, apiKey) {
    const { iv, encrypted } = await this._encrypt(apiKey);
    const storageValue = {
      iv: Array.from(iv),
      encrypted: Array.from(new Uint8Array(encrypted))
    };
    localStorage.setItem(provider, JSON.stringify(storageValue));
  }

  // Retrieve API key
  async getAPIKey(provider) {
    const storageValue = localStorage.getItem(provider);
    if (!storageValue) {
      return null;
    }
    const { iv, encrypted } = JSON.parse(storageValue);
    const decryptedKey = await this._decrypt(
      new Uint8Array(encrypted),
      new Uint8Array(iv)
    );
    return decryptedKey;
  }

  // Delete API key
  deleteAPIKey(provider) {
    localStorage.removeItem(provider);
  }

  // Check if an API key exists
  apiKeyExists(provider) {
    return localStorage.getItem(provider) !== null;
  }
}