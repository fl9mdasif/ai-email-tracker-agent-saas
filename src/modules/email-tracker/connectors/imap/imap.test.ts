import { describe, expect, it } from "vitest";
import { getConnector, listConnectors } from "@/core/connectors/registry";
import { registerEmailTrackerConnectors } from "../index";
import { IMAP_MESSAGES, mapImapError } from "./errors";
import { IMAP_PRESET_KEYS, IMAP_PRESETS } from "./presets";
import { buildImapCredentials, imapAccountSchema, imapCredentialsSchema } from "./schema";
import { testImapConnection } from "./test-connection";

describe("imapAccountSchema", () => {
  const valid = { preset: "hostinger", email: "  Owner@Example.COM ", password: "app pass word" };

  it("accepts a valid account and normalizes the email", () => {
    const parsed = imapAccountSchema.parse(valid);
    expect(parsed.email).toBe("owner@example.com");
    expect(parsed.password).toBe("app pass word"); // spaces are kept
  });

  it("rejects an unknown provider, so no free-text host can get in", () => {
    expect(imapAccountSchema.safeParse({ ...valid, preset: "evil.example.com" }).success).toBe(false);
    expect(imapAccountSchema.safeParse({ ...valid, host: "10.0.0.1" }).success).toBe(true); // extra keys are ignored...
    expect(Object.keys(imapAccountSchema.parse({ ...valid, host: "10.0.0.1" }))).not.toContain("host"); // ...and dropped
  });

  it("rejects bad emails and empty or oversized passwords", () => {
    expect(imapAccountSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(imapAccountSchema.safeParse({ ...valid, password: "" }).success).toBe(false);
    expect(imapAccountSchema.safeParse({ ...valid, password: "x".repeat(257) }).success).toBe(false);
  });

  it("limits the label length", () => {
    expect(imapAccountSchema.safeParse({ ...valid, label: "x".repeat(61) }).success).toBe(false);
    expect(imapAccountSchema.safeParse({ ...valid, label: "Work" }).success).toBe(true);
  });
});

describe("presets and credentials", () => {
  it("has a secure port-993 entry for every key", () => {
    for (const key of IMAP_PRESET_KEYS) {
      expect(IMAP_PRESETS[key]).toMatchObject({ key, port: 993, secure: true });
      expect(IMAP_PRESETS[key].host).toMatch(/^imap\.[a-z.]+$/);
    }
  });

  it("builds credentials from the preset, never from user input", () => {
    const credentials = buildImapCredentials({
      preset: "zoho-eu",
      email: "a@b.com",
      password: "secret",
    });
    expect(credentials).toEqual({
      preset: "zoho-eu",
      host: "imap.zoho.eu",
      port: 993,
      secure: true,
      user: "a@b.com",
      password: "secret",
    });
    expect(imapCredentialsSchema.safeParse(credentials).success).toBe(true);
  });

  it("rejects malformed stored credentials", () => {
    expect(imapCredentialsSchema.safeParse({ host: "x" }).success).toBe(false);
  });
});

describe("mapImapError", () => {
  it("maps known failures to safe categories", () => {
    expect(mapImapError({ authenticationFailed: true })).toBe(IMAP_MESSAGES.auth);
    expect(mapImapError({ code: "ENOTFOUND" })).toBe(IMAP_MESSAGES.notFound);
    expect(mapImapError({ code: "ECONNREFUSED" })).toBe(IMAP_MESSAGES.unreachable);
    expect(mapImapError({ code: "ETIMEDOUT" })).toBe(IMAP_MESSAGES.timeout);
    expect(mapImapError({ code: "ERR_TLS_CERT_ALTNAME_INVALID" })).toBe(IMAP_MESSAGES.tls);
    expect(mapImapError(new Error("IMAP access is disabled for this account"))).toBe(
      IMAP_MESSAGES.imapDisabled,
    );
  });

  it("falls back to a generic message for anything else", () => {
    expect(mapImapError(new Error("something odd"))).toBe(IMAP_MESSAGES.unknown);
    expect(mapImapError(undefined)).toBe(IMAP_MESSAGES.unknown);
    expect(mapImapError("a string")).toBe(IMAP_MESSAGES.unknown);
  });

  it("never copies secrets or addresses from the error into the message", () => {
    const message = mapImapError(
      new Error("LOGIN failed for owner@example.com with password hunter2 on imap.hostinger.com"),
    );
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("owner@example.com");
    expect(message).not.toContain("hostinger");
  });
});

describe("testImapConnection", () => {
  it("reports an unreachable server for a closed port, without leaking the password", async () => {
    const result = await testImapConnection(
      {
        preset: "hostinger",
        host: "127.0.0.1",
        port: 1,
        secure: true,
        user: "owner@example.com",
        password: "hunter2",
      },
      3000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(IMAP_MESSAGES.unreachable);
      expect(result.message).not.toContain("hunter2");
    }
  }, 15_000);
});

describe("connector registry", () => {
  it("registers the IMAP connector once, even if called twice", () => {
    registerEmailTrackerConnectors();
    registerEmailTrackerConnectors();
    expect(listConnectors().filter((name) => name === "imap")).toHaveLength(1);
    expect(getConnector("imap")).toMatchObject({ provider: "imap", authType: "app_password" });
    expect(getConnector("unknown")).toBeUndefined();
  });
});
