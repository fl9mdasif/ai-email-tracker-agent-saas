import { beforeEach, describe, expect, it, vi } from "vitest";
import { GMAIL_MESSAGES, GmailError, mapGmailError } from "./errors";
import { type FetchGmailEmails, fetchGmailEmails } from "./fetch-messages";
import { type GmailMessageLike, htmlToText, normalizeGmailMessage, parseAddress } from "./normalize";
import { GMAIL_FIRST_SYNC_LIMIT, GMAIL_MAX_PER_RUN, nextGmailCursor, pickIdsToRead, planGmailList, readGmailCursor } from "./plan-fetch";
import { exchangeCode, getAccessToken } from "./tokens";

const b64 = (text: string) => Buffer.from(text, "utf-8").toString("base64url");
const now = new Date("2026-11-03T10:00:00Z");
const meta = { accountAddress: "owner@gmail.com", now };

function message(overrides: Partial<GmailMessageLike> = {}): GmailMessageLike {
  return {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX", "UNREAD"],
    internalDate: String(Date.parse("2026-11-03T08:30:00Z")),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Maria Gomez <Maria@Client.com>" },
        { name: "To", value: "owner@gmail.com, Other <other@x.com>" },
        { name: "Subject", value: "  Pricing   for 20 seats? " },
        { name: "Message-ID", value: "<abc123@mail.client.com>" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64("Hi, can you send the price list?") } },
        { mimeType: "text/html", body: { data: b64("<p>Hi, can you send the <b>price list</b>?</p>") } },
      ],
    },
    ...overrides,
  };
}

describe("normalizeGmailMessage", () => {
  it("maps a Gmail message into the shared email shape", () => {
    expect(normalizeGmailMessage(message(), meta)).toEqual({
      providerMessageId: "abc123@mail.client.com",
      threadId: "t1",
      from: { address: "maria@client.com", name: "Maria Gomez" },
      to: ["owner@gmail.com", "other@x.com"],
      subject: "Pricing for 20 seats?",
      snippet: "Hi, can you send the price list?",
      bodyText: "Hi, can you send the price list?",
      receivedAt: new Date("2026-11-03T08:30:00Z"),
      direction: "inbound",
      status: "unread",
      labels: [],
    });
  });

  it("uses the HTML part, as plain text, when there is no text part", () => {
    const html = message({
      payload: {
        mimeType: "text/html",
        headers: [{ name: "From", value: "a@b.com" }],
        body: { data: b64("<style>x{}</style><p>Hello&nbsp;there</p><script>bad()</script>") },
      },
    });
    expect(normalizeGmailMessage(html, meta).bodyText).toBe("Hello there");
  });

  it("falls back to the Gmail id and treats mail from the account itself as outbound and read", () => {
    const own = message({
      labelIds: ["SENT"],
      payload: { mimeType: "text/plain", headers: [{ name: "From", value: "owner@gmail.com" }], body: { data: b64("hi") } },
    });
    const result = normalizeGmailMessage(own, meta);
    expect(result.providerMessageId).toBe("gmail:m1");
    expect(result.direction).toBe("outbound");
    expect(result.status).toBe("read");
  });

  it("copes with a message that has no headers or body", () => {
    const result = normalizeGmailMessage({ id: "x", internalDate: "not-a-number" }, meta);
    expect(result).toMatchObject({ from: { address: "unknown@invalid" }, bodyText: "", receivedAt: now });
  });

  it("parses addresses with and without a name", () => {
    expect(parseAddress('"Doe, Jane" <JANE@x.com>')).toEqual({ address: "jane@x.com", name: "Doe, Jane" });
    expect(parseAddress("plain@x.com")).toEqual({ address: "plain@x.com", name: null });
    expect(htmlToText("a<br>b")).toBe("a\nb");
  });
});

describe("Gmail fetch planning", () => {
  it("reads the newest few on the first sync and everything after the cursor later", () => {
    expect(planGmailList(null)).toEqual({ query: null, newestOnly: true });
    expect(planGmailList({ lastInternalDateMs: 1_762_000_123_456 })).toEqual({ query: "after:1762000123", newestOnly: false });
  });

  it("keeps the newest on the first sync, but the oldest first afterwards so nothing is skipped", () => {
    const ids = Array.from({ length: 300 }, (_, i) => i); // 0 is newest
    expect(pickIdsToRead(ids, true)).toHaveLength(GMAIL_FIRST_SYNC_LIMIT);
    expect(pickIdsToRead(ids, true)[0]).toBe(0);
    const later = pickIdsToRead(ids, false);
    expect(later).toHaveLength(GMAIL_MAX_PER_RUN);
    expect(later[0]).toBe(299); // oldest first
  });

  it("never moves the cursor backwards, and ignores a broken saved value", () => {
    expect(nextGmailCursor({ lastInternalDateMs: 500 }, [100, 200])).toEqual({ lastInternalDateMs: 500 });
    expect(nextGmailCursor(null, [100, 700, 300])).toEqual({ lastInternalDateMs: 700 });
    expect(readGmailCursor({ lastInternalDateMs: 42 })).toEqual({ lastInternalDateMs: 42 });
    expect(readGmailCursor({ lastInternalDateMs: "x" })).toBeNull();
    expect(readGmailCursor(null)).toBeNull();
  });
});

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("tokens", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  });

  it("trades a refresh token for an access token", async () => {
    const fetchFn = vi.fn(async () => reply(200, { access_token: "at" }));
    expect(await getAccessToken("rt", fetchFn as unknown as typeof fetch)).toBe("at");
  });

  it("says to reconnect when Google reports the grant is gone or expired", async () => {
    const fetchFn = vi.fn(async () => reply(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }));
    await expect(getAccessToken("rt", fetchFn as unknown as typeof fetch)).rejects.toMatchObject({ kind: "reconnect" });
  });

  it("maps rate limits and network failures to safe errors", async () => {
    await expect(getAccessToken("rt", (async () => reply(429, {})) as unknown as typeof fetch)).rejects.toMatchObject({ kind: "quota" });
    await expect(
      getAccessToken("rt", (async () => {
        throw new Error("boom with secret");
      }) as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "unreachable" });
  });

  it("needs both tokens from the code exchange", async () => {
    const good = vi.fn(async () => reply(200, { access_token: "at", refresh_token: "rt" }));
    expect(await exchangeCode("code", good as unknown as typeof fetch)).toEqual({ accessToken: "at", refreshToken: "rt" });
    const noRefresh = vi.fn(async () => reply(200, { access_token: "at" }));
    await expect(exchangeCode("code", noRefresh as unknown as typeof fetch)).rejects.toBeInstanceOf(GmailError);
  });

  it("never puts Google's own error text into a message", () => {
    const text = mapGmailError(new GmailError("reconnect"));
    expect(text).toBe(GMAIL_MESSAGES.reconnect);
    expect(mapGmailError(new Error("secret token abc"))).toBe(GMAIL_MESSAGES.unknown);
  });
});

describe("fetchGmailEmails", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  });

  const run: (fetchFn: typeof fetch, cursor?: { lastInternalDateMs: number } | null) => ReturnType<FetchGmailEmails> = (fetchFn, cursor = null) =>
    fetchGmailEmails({ refreshToken: "rt" }, cursor, "owner@gmail.com", fetchFn);

  it("lists the INBOX read-only, reads each message and moves the cursor forward", async () => {
    const urls: string[] = [];
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("oauth2.googleapis.com")) return reply(200, { access_token: "at" });
      if (url.includes("/messages?")) return reply(200, { messages: [{ id: "m1" }] });
      return reply(200, message());
    });
    const result = await run(fetchFn as unknown as typeof fetch);

    expect(result.emails).toHaveLength(1);
    expect(result.fetched).toBe(1);
    expect(result.cursor).toEqual({ lastInternalDateMs: Date.parse("2026-11-03T08:30:00Z") });
    expect(urls.find((url) => url.includes("/messages?"))).toContain("labelIds=INBOX");
    // Read-only: only GET requests, no modify, delete or send endpoint is ever called.
    expect(urls.some((url) => /modify|trash|delete|send/.test(url))).toBe(false);
  });

  it("skips one unreadable message but keeps the others", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com")) return reply(200, { access_token: "at" });
      if (url.includes("/messages?")) return reply(200, { messages: [{ id: "bad" }, { id: "m1" }] });
      return url.includes("/messages/bad") ? reply(500, {}) : reply(200, message());
    });
    const result = await run(fetchFn as unknown as typeof fetch);
    expect(result.emails).toHaveLength(1);
    expect(result.fetched).toBe(2);
  });

  it("tells a switched-off Gmail API apart from missing permission", async () => {
    const forbidden = (reason: string) =>
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes("oauth2.googleapis.com")
          ? reply(200, { access_token: "at" })
          : reply(403, { error: { errors: [{ reason }] } }),
      ) as unknown as typeof fetch;
    await expect(run(forbidden("accessNotConfigured"))).rejects.toMatchObject({ kind: "apiDisabled" });
    await expect(run(forbidden("insufficientPermissions"))).rejects.toMatchObject({ kind: "scope" });
    await expect(run(forbidden("somethingElse"))).rejects.toMatchObject({ kind: "reconnect" });
  });

  it("stops with a reconnect message when Google rejects the access", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com")) return reply(200, { access_token: "at" });
      return reply(401, {});
    });
    await expect(run(fetchFn as unknown as typeof fetch)).rejects.toMatchObject({ kind: "reconnect" });
  });
});
