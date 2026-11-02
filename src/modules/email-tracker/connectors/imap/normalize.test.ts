import { describe, expect, it } from "vitest";
import {
  type ImapMessageMeta,
  MAX_BODY_CHARS,
  MAX_SUBJECT_CHARS,
  SNIPPET_CHARS,
  makeSnippet,
  normalizeImapMessage,
} from "./normalize";

const now = new Date("2026-11-02T10:00:00Z");
const meta = (overrides: Partial<ImapMessageMeta> = {}): ImapMessageMeta => ({
  uidValidity: "1700",
  uid: 42,
  internalDate: new Date("2026-11-01T08:30:00Z"),
  flags: new Set<string>(),
  accountAddress: "owner@example.com",
  now,
  ...overrides,
});

const base = {
  messageId: "<abc123@mail.example.com>",
  from: { value: [{ address: "Maria@Client.COM", name: "  Maria   Gomez " }] },
  to: { value: [{ address: "Owner@example.com" }, { address: "owner@example.com" }] },
  subject: "  Pricing   for\n20 seats? ",
  text: "Hi,\n\nCan you send the price?\n\n> quoted older text\nThanks",
  date: new Date("2026-11-01T08:29:00Z"),
};

describe("normalizeImapMessage", () => {
  it("maps a normal inbound message to the shared shape", () => {
    const email = normalizeImapMessage(base, meta());
    expect(email).toMatchObject({
      providerMessageId: "abc123@mail.example.com",
      threadId: "abc123@mail.example.com",
      from: { address: "maria@client.com", name: "Maria Gomez" },
      to: ["owner@example.com"],
      subject: "Pricing for 20 seats?",
      direction: "inbound",
      status: "unread",
      labels: [],
    });
    expect(email.receivedAt).toEqual(new Date("2026-11-01T08:30:00Z"));
  });

  it("uses the first reference as the thread root, then In-Reply-To, then the message itself", () => {
    expect(
      normalizeImapMessage({ ...base, references: ["<root@x>", "<mid@x>"], inReplyTo: "<mid@x>" }, meta()).threadId,
    ).toBe("root@x");
    expect(normalizeImapMessage({ ...base, references: "<root@x> <mid@x>" }, meta()).threadId).toBe("root@x");
    expect(normalizeImapMessage({ ...base, inReplyTo: "<mid@x>" }, meta()).threadId).toBe("mid@x");
    expect(normalizeImapMessage(base, meta()).threadId).toBe("abc123@mail.example.com");
  });

  it("falls back to a UID-based id when there is no Message-ID", () => {
    const email = normalizeImapMessage({ ...base, messageId: undefined }, meta());
    expect(email.providerMessageId).toBe("uid:1700:42");
    expect(email.threadId).toBe("uid:1700:42");
  });

  it("marks mail sent from the account itself as outbound", () => {
    const email = normalizeImapMessage(
      { ...base, from: { value: [{ address: "OWNER@example.com" }] } },
      meta(),
    );
    expect(email.direction).toBe("outbound");
  });

  it("reads the Seen flag into status and keeps the other flags as labels", () => {
    const email = normalizeImapMessage(base, meta({ flags: new Set(["\\Seen", "\\Flagged", "$Work"]) }));
    expect(email.status).toBe("read");
    expect(email.labels).toEqual(["flagged", "$work"]);
  });

  it("prefers the server date over the Date header, then falls back to the header, then to now", () => {
    expect(normalizeImapMessage(base, meta()).receivedAt).toEqual(new Date("2026-11-01T08:30:00Z"));
    expect(normalizeImapMessage(base, meta({ internalDate: undefined })).receivedAt).toEqual(base.date);
    expect(normalizeImapMessage({ ...base, date: undefined }, meta({ internalDate: undefined })).receivedAt).toEqual(now);
  });

  it("copes with a message that has almost nothing in it", () => {
    const email = normalizeImapMessage({}, meta());
    expect(email).toMatchObject({
      from: { address: "unknown@invalid", name: null },
      to: [],
      subject: "",
      snippet: "",
      bodyText: "",
    });
  });

  it("removes NUL characters, which Postgres cannot store", () => {
    const email = normalizeImapMessage(
      { ...base, subject: "Hi\u0000 there", text: "body\u0000text", from: { value: [{ address: "a@b.com", name: "A\u0000B" }] } },
      meta(),
    );
    expect(JSON.stringify(email)).not.toContain("\\u0000");
  });

  it("caps long subjects and bodies", () => {
    const email = normalizeImapMessage(
      { ...base, subject: "s".repeat(MAX_SUBJECT_CHARS + 50), text: "b".repeat(MAX_BODY_CHARS + 500) },
      meta(),
    );
    expect(email.subject).toHaveLength(MAX_SUBJECT_CHARS);
    expect(email.bodyText).toHaveLength(MAX_BODY_CHARS);
  });

  it("is deterministic", () => {
    expect(normalizeImapMessage(base, meta())).toEqual(normalizeImapMessage(base, meta()));
  });
});

describe("makeSnippet", () => {
  it("drops quoted lines, collapses whitespace and caps the length", () => {
    expect(makeSnippet("Hello\n\n> old reply\n   world")).toBe("Hello world");
    expect(makeSnippet("x".repeat(500))).toHaveLength(SNIPPET_CHARS);
  });
});
