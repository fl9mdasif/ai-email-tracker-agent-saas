import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseKey } from "./crypto";

const key = randomBytes(32);
const aad = "tenant-1:imap:credentials";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips text, including unicode", () => {
    const secret = JSON.stringify({ user: "me@example.com", password: "pässwörd-বাংলা-✓" });
    expect(decryptSecret(encryptSecret(secret, key, aad), key, aad)).toBe(secret);
  });

  it("uses a fresh IV, so equal inputs give different ciphertexts", () => {
    expect(encryptSecret("same", key, aad)).not.toBe(encryptSecret("same", key, aad));
  });

  it("does not contain the plaintext", () => {
    expect(encryptSecret("super-secret-value", key, aad)).not.toContain("super-secret-value");
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, data] = encryptSecret("hello", key, aad).split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"), key, aad)).toThrow(
      "Could not decrypt secret",
    );
  });

  it("rejects a different key", () => {
    const payload = encryptSecret("hello", key, aad);
    expect(() => decryptSecret(payload, randomBytes(32), aad)).toThrow("Could not decrypt secret");
  });

  it("rejects a different aad (ciphertext moved to another tenant)", () => {
    const payload = encryptSecret("hello", key, aad);
    expect(() => decryptSecret(payload, key, "tenant-2:imap:credentials")).toThrow(
      "Could not decrypt secret",
    );
  });

  it("rejects malformed or unversioned payloads", () => {
    expect(() => decryptSecret("not-a-payload", key, aad)).toThrow("Unsupported encrypted payload");
    expect(() => decryptSecret("v9:a:b:c", key, aad)).toThrow("Unsupported encrypted payload");
  });

  it("does not leak the secret in error messages", () => {
    try {
      decryptSecret("v1:AAAA:BBBB:super-secret-value", key, aad);
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-value");
    }
  });

  it("rejects keys of the wrong length", () => {
    expect(() => encryptSecret("x", randomBytes(16), aad)).toThrow("32 bytes");
  });
});

describe("parseKey", () => {
  it("accepts 64 hex characters", () => {
    expect(parseKey("ab".repeat(32))).toHaveLength(32);
  });

  it("rejects bad input", () => {
    expect(() => parseKey("short")).toThrow();
    expect(() => parseKey("zz".repeat(32))).toThrow();
  });
});
