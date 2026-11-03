import { describe, expect, it, vi } from "vitest";
import { GMAIL_SCOPE, GMAIL_SEND_SCOPE, canSend, parseScopes } from "../connectors/gmail/schema";
import { buildConsentUrl } from "../connectors/gmail/tokens";
import type { ImapCredentials } from "../connectors/imap/schema";
import { sendViaGmail } from "./gmail-send";
import { buildRawMessage, isRfcMessageId, newMessageId, threadingHeaders } from "./mime";
import { type SmtpTransport, classifySmtpError, sendViaSmtp } from "./smtp";

vi.mock("@/core/config", () => ({
  requireConfig: (key: string) => `test-${key}`,
  getAppUrl: () => "http://localhost:3000",
}));

const imap: ImapCredentials = { preset: "hostinger", host: "imap.hostinger.com", port: 993, secure: true, user: "me@shop.com", password: "app-pass" };

describe("threading headers", () => {
  it("recognises real Message-IDs and never our own fallbacks", () => {
    expect(isRfcMessageId("abc.123@mail.client.com")).toBe(true);
    expect(isRfcMessageId("uid:12:34")).toBe(false);
    expect(isRfcMessageId("gmail:18c2f")).toBe(false);
    expect(isRfcMessageId("no-at-sign")).toBe(false);
    expect(isRfcMessageId(null)).toBe(false);
  });

  it("replies under the original: In-Reply-To the email, References the root then the email", () => {
    expect(threadingHeaders({ replyToMessageId: "last@client.com", threadRootId: "first@client.com" })).toEqual({
      inReplyTo: "<last@client.com>",
      references: ["<first@client.com>", "<last@client.com>"],
    });
    // The first email of a thread is its own root: listed once.
    expect(threadingHeaders({ replyToMessageId: "only@client.com", threadRootId: "only@client.com" })).toEqual({
      inReplyTo: "<only@client.com>",
      references: ["<only@client.com>"],
    });
    // A Gmail thread id is not a Message-ID and is left out.
    expect(threadingHeaders({ replyToMessageId: "last@client.com", threadRootId: "18c2f0a9" }).references).toEqual(["<last@client.com>"]);
    expect(threadingHeaders({ replyToMessageId: "uid:1:2", threadRootId: null })).toEqual({});
  });

  it("builds a complete message with the threading headers and our own Message-ID", async () => {
    const id = newMessageId("me@shop.com");
    expect(id).toMatch(/^<[0-9a-f-]{36}@shop\.com>$/);
    const raw = (
      await buildRawMessage(
        { from: { address: "me@shop.com" }, to: "maria@client.com", subject: "Re: Pricing", text: "Hi Maria, the price is 100.", replyToMessageId: "last@client.com", threadRootId: "first@client.com" },
        id,
      )
    ).toString("utf8");
    expect(raw).toMatch(/^From: me@shop\.com$/m);
    expect(raw).toMatch(/^To: maria@client\.com$/m);
    expect(raw).toMatch(/^Subject: Re: Pricing$/m);
    expect(raw).toContain(`Message-ID: ${id}`);
    expect(raw).toMatch(/^In-Reply-To: <last@client\.com>$/m);
    expect(raw).toMatch(/^References: <first@client\.com> <last@client\.com>$/m);
    expect(raw).toContain("Hi Maria, the price is 100.");
  });

  it("keeps Bangla text intact", async () => {
    const raw = await buildRawMessage({ from: { address: "me@shop.com" }, to: "a@b.com", subject: "Re: দাম", text: "ধন্যবাদ, দাম ১০০ টাকা।" }, "<x@shop.com>");
    const text = raw.toString("utf8");
    expect(text).toMatch(/charset=utf-8/i);
    expect(text).not.toContain("ধন্যবাদ"); // encoded on the wire, not raw bytes in a 7-bit header
  });
});

describe("SMTP", () => {
  const message = { from: "me@shop.com", to: "maria@client.com", raw: Buffer.from("raw message"), messageId: "<m@shop.com>" };

  function fakeTransport(result: () => Promise<{ accepted?: unknown[]; rejected?: unknown[] }>) {
    const sent: Parameters<SmtpTransport["sendMail"]>[0][] = [];
    const options: unknown[] = [];
    const createTransport = (opts: unknown) => {
      options.push(opts);
      return { sendMail: async (mail: Parameters<SmtpTransport["sendMail"]>[0]) => (sent.push(mail), result()), close: () => {} };
    };
    return { createTransport, sent, options };
  }

  it("sends one message through the preset's own SMTP host and saves a copy in Sent", async () => {
    const transport = fakeTransport(async () => ({ accepted: ["maria@client.com"], rejected: [] }));
    const saveToSent = vi.fn(async () => {});
    const result = await sendViaSmtp(imap, message, { createTransport: transport.createTransport, saveToSent });

    expect(result).toEqual({ ok: true, messageId: "<m@shop.com>" });
    expect(transport.options).toEqual([{ host: "smtp.hostinger.com", port: 465, secure: true, auth: { user: "me@shop.com", pass: "app-pass" } }]);
    expect(transport.sent).toEqual([{ envelope: { from: "me@shop.com", to: ["maria@client.com"] }, raw: message.raw }]);
    expect(saveToSent).toHaveBeenCalledTimes(1);
  });

  it("never connects to a host from the stored credentials", async () => {
    const transport = fakeTransport(async () => ({ accepted: ["x"] }));
    await sendViaSmtp({ ...imap, host: "evil.internal" }, message, { createTransport: transport.createTransport, saveToSent: async () => {} });
    expect(transport.options[0]).toMatchObject({ host: "smtp.hostinger.com" });
  });

  it("still reports success when only the copy in Sent fails", async () => {
    const transport = fakeTransport(async () => ({ accepted: ["x"] }));
    const result = await sendViaSmtp(imap, message, { createTransport: transport.createTransport, saveToSent: async () => Promise.reject(new Error("imap down")) });
    expect(result.ok).toBe(true);
  });

  it("turns failures into safe codes and saves nothing to Sent", async () => {
    const saveToSent = vi.fn(async () => {});
    const failing = fakeTransport(async () => Promise.reject(Object.assign(new Error("535 5.7.8 auth failed for me@shop.com"), { code: "EAUTH", responseCode: 535 })));
    expect(await sendViaSmtp(imap, message, { createTransport: failing.createTransport, saveToSent })).toEqual({ ok: false, code: "reconnect" });
    const rejected = fakeTransport(async () => ({ accepted: [], rejected: ["maria@client.com"] }));
    expect(await sendViaSmtp(imap, message, { createTransport: rejected.createTransport, saveToSent })).toEqual({ ok: false, code: "rejected" });
    expect(saveToSent).not.toHaveBeenCalled();
  });

  it("classifies SMTP errors", () => {
    expect(classifySmtpError({ code: "EAUTH" })).toBe("reconnect");
    expect(classifySmtpError({ code: "ETIMEDOUT" })).toBe("unreachable");
    expect(classifySmtpError({ code: "EENVELOPE" })).toBe("rejected");
    expect(classifySmtpError({ responseCode: 550 })).toBe("rejected");
    expect(classifySmtpError({ responseCode: 421 })).toBe("rate_limited");
    expect(classifySmtpError(new Error("?"))).toBe("unknown");
  });
});

describe("Gmail send", () => {
  const withSend = { refreshToken: "rt", scopes: [GMAIL_SCOPE, GMAIL_SEND_SCOPE] };
  const message = { raw: Buffer.from("raw message"), messageId: "<m@gmail.com>", threadId: "18c2f0a9" };

  function fakeFetch(sendStatus: number, tokenStatus = 200) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify(tokenStatus === 200 ? { access_token: "at" } : { error: "invalid_grant" }), { status: tokenStatus });
      }
      return new Response("{}", { status: sendStatus });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  }

  it("asks for permission first, without calling Google, when the send scope is missing", async () => {
    const google = fakeFetch(200);
    expect(await sendViaGmail({ refreshToken: "rt" }, message, google.fetchFn)).toEqual({ ok: false, code: "needs_permission" });
    expect(await sendViaGmail({ refreshToken: "rt", scopes: [GMAIL_SCOPE] }, message, google.fetchFn)).toEqual({ ok: false, code: "needs_permission" });
    expect(google.calls).toHaveLength(0);
  });

  it("sends the raw message once, in the thread", async () => {
    const google = fakeFetch(200);
    expect(await sendViaGmail(withSend, message, google.fetchFn)).toEqual({ ok: true, messageId: "<m@gmail.com>" });
    const sends = google.calls.filter((call) => call.url.includes("/messages/send"));
    expect(sends).toHaveLength(1);
    expect(JSON.parse(String(sends[0].init?.body))).toEqual({ raw: Buffer.from("raw message").toString("base64url"), threadId: "18c2f0a9" });
    expect(new Headers(sends[0].init?.headers).get("authorization")).toBe("Bearer at");
  });

  it("maps Google's answers to safe codes", async () => {
    expect(await sendViaGmail(withSend, message, fakeFetch(403).fetchFn)).toEqual({ ok: false, code: "needs_permission" });
    expect(await sendViaGmail(withSend, message, fakeFetch(401).fetchFn)).toEqual({ ok: false, code: "reconnect" });
    expect(await sendViaGmail(withSend, message, fakeFetch(429).fetchFn)).toEqual({ ok: false, code: "rate_limited" });
    expect(await sendViaGmail(withSend, message, fakeFetch(200, 400).fetchFn)).toEqual({ ok: false, code: "reconnect" });
  });

  it("Connect asks only to read; Allow sending adds the send permission to what was granted", () => {
    const connect = new URL(buildConsentUrl("state-1", "me@gmail.com"));
    expect(connect.searchParams.get("scope")).toBe(GMAIL_SCOPE);
    expect(connect.searchParams.get("include_granted_scopes")).toBe("false");

    const allow = new URL(buildConsentUrl("state-2", "me@gmail.com", { allowSending: true }));
    expect(allow.searchParams.get("scope")?.split(" ")).toEqual([GMAIL_SCOPE, GMAIL_SEND_SCOPE]);
    expect(allow.searchParams.get("include_granted_scopes")).toBe("true");
    expect(allow.searchParams.get("login_hint")).toBe("me@gmail.com");
    expect(allow.searchParams.get("state")).toBe("state-2");
  });

  it("reads the granted scopes", () => {
    expect(parseScopes(`${GMAIL_SCOPE} ${GMAIL_SEND_SCOPE} openid`)).toEqual([GMAIL_SCOPE, GMAIL_SEND_SCOPE]);
    expect(parseScopes(undefined)).toEqual([]);
    expect(canSend({ refreshToken: "x", scopes: parseScopes(GMAIL_SCOPE) })).toBe(false);
  });
});
