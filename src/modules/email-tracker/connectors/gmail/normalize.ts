import type { NormalizedEmail } from "../../types";
import { MAX_BODY_CHARS, MAX_SUBJECT_CHARS, makeSnippet } from "../imap/normalize";

type Header = { name?: string; value?: string };

/** The parts of a Gmail `messages.get?format=full` reply the normalizer reads. */
export type GmailPart = {
  mimeType?: string;
  headers?: Header[];
  body?: { data?: string };
  parts?: GmailPart[];
};

export type GmailMessageLike = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
};

const stripNul = (value: string) => value.replace(/\u0000/g, "");
const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

function header(part: GmailPart | undefined, name: string): string {
  const wanted = name.toLowerCase();
  return part?.headers?.find((entry) => entry.name?.toLowerCase() === wanted)?.value ?? "";
}

function decode(data: string | undefined): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/** Depth-first search for the first part with this MIME type that has a body. */
function findPart(part: GmailPart | undefined, mimeType: string): GmailPart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

/** Plain text from an HTML body when a message has no text part. Tags, scripts and styles are dropped. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

/** "Maria Gomez <maria@x.com>" or "maria@x.com" into a lower-case address and an optional name. */
export function parseAddress(raw: string): { address: string; name: string | null } {
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { address: match[2].trim().toLowerCase(), name: collapse(stripNul(match[1])) || null };
  return { address: raw.trim().toLowerCase(), name: null };
}

function parseRecipients(raw: string): string[] {
  const addresses = raw
    .split(",")
    .map((entry) => parseAddress(entry).address)
    .filter((address) => address.includes("@"));
  return [...new Set(addresses)];
}

function cleanId(value: string): string {
  return stripNul(value).trim().replace(/^<|>$/g, "").trim();
}

/** Converts a Gmail message into the shared email shape. Pure: same input, same output. */
export function normalizeGmailMessage(message: GmailMessageLike, meta: { accountAddress: string; now: Date }): NormalizedEmail {
  const root = message.payload;
  const messageId = cleanId(header(root, "message-id"));
  const providerMessageId = (messageId || `gmail:${message.id}`).slice(0, 500);

  const plain = decode(findPart(root, "text/plain")?.body?.data);
  const html = plain ? "" : decode(findPart(root, "text/html")?.body?.data);
  const text = stripNul(plain || htmlToText(html)).trim();

  const sender = parseAddress(header(root, "from"));
  const fromAddress = sender.address.includes("@") ? sender.address : "unknown@invalid";

  const internal = Number(message.internalDate);
  const receivedAt = Number.isFinite(internal) && internal > 0 ? new Date(internal) : meta.now;

  const labels = (message.labelIds ?? []).map((label) => label.toLowerCase());
  return {
    providerMessageId,
    threadId: (message.threadId ?? providerMessageId).slice(0, 500),
    from: { address: fromAddress, name: sender.name },
    to: parseRecipients(header(root, "to")),
    subject: collapse(stripNul(header(root, "subject"))).slice(0, MAX_SUBJECT_CHARS),
    snippet: makeSnippet(text),
    bodyText: text.slice(0, MAX_BODY_CHARS),
    receivedAt,
    direction: fromAddress === meta.accountAddress.trim().toLowerCase() ? "outbound" : "inbound",
    status: labels.includes("unread") ? "unread" : "read",
    labels: labels.filter((label) => label !== "unread" && label !== "inbox"),
  };
}
