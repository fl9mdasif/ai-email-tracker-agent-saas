import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const VERSION = "v1";

/** Parses a 64-character hex string into a 32-byte AES key. */
export function parseKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Encryption key must be 32 bytes as 64 hex characters");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts text with AES-256-GCM. The result is `v1:iv:tag:ciphertext` (base64 parts).
 * `aad` is authenticated but not stored: pass the same value to decrypt. Binding it to
 * the tenant and provider stops a ciphertext from being moved to another row.
 */
export function encryptSecret(plaintext: string, key: Buffer, aad: string): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Decrypts a value from `encryptSecret`. Throws if the data, key or `aad` is wrong. */
export function decryptSecret(payload: string, key: Buffer, aad: string): string {
  assertKey(key);
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unsupported encrypted payload");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // Never echo the payload or the underlying reason; it could leak details.
    throw new Error("Could not decrypt secret");
  }
}

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) throw new Error("Encryption key must be 32 bytes");
}
