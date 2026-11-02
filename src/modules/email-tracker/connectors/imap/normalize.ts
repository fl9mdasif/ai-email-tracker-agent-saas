import type { NormalizedEmail } from "../../types";

export const MAX_SUBJECT_CHARS = 500;
export const MAX_BODY_CHARS = 20_000;
export const SNIPPET_CHARS = 200;

type AddressLike = { address?: string; name?: string };
type AddressObjectLike = { value: AddressLike[] };

/** The parts of mailparser's result the normalizer reads (kept structural so it is easy to test). */
export type ParsedMailLike = {
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  from?: AddressObjectLike;
  to?: AddressObjectLike | AddressObjectLike[];
  subject?: string;
  text?: string;
  date?: Date;
};

export type ImapMessageMeta = {
  uidValidity: string;
  uid: number;
  /** When the server received the message; more trustworthy than the Date header. */
  internalDate?: Date;
  flags: ReadonlySet<string> | readonly string[];
  /** The mailbox owner's address, used to tell inbound from outbound. */
  accountAddress: string;
  /** Used only when the message carries no usable date. Injected to keep this function pure. */
  now: Date;
};

// Postgres text columns reject NUL characters, and mail can contain them.
const stripNul = (value: string) => value.replace(/\u0000/g, "");

function cleanId(value: string | undefined): string {
  return stripNul(value ?? "")
    .trim()
    .replace(/^<|>$/g, "")
    .trim();
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toList(value: ParsedMailLike["to"]): AddressLike[] {
  if (!value) return [];
  const objects = Array.isArray(value) ? value : [value];
  return objects.flatMap((object) => object.value ?? []);
}

function firstReference(references: ParsedMailLike["references"]): string {
  const list = Array.isArray(references) ? references : references ? references.split(/\s+/) : [];
  return cleanId(list.find((item) => cleanId(item) !== ""));
}

/** Plain-text preview: no quoted reply lines, whitespace collapsed, capped. */
export function makeSnippet(text: string): string {
  const unquoted = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join(" ");
  return collapse(stripNul(unquoted)).slice(0, SNIPPET_CHARS);
}

function labelsFrom(flags: ImapMessageMeta["flags"]): string[] {
  const names = [...flags].map((flag) => flag.replace(/^\\/, "").toLowerCase());
  return names.filter((name) => name !== "seen" && name !== "recent");
}

/** Converts a parsed IMAP message into the shared email shape. Pure: same input, same output. */
export function normalizeImapMessage(parsed: ParsedMailLike, meta: ImapMessageMeta): NormalizedEmail {
  const messageId = cleanId(parsed.messageId);
  // Without a Message-ID, fall back to the UID, which is only unique within one UIDVALIDITY.
  const providerMessageId = (messageId || `uid:${meta.uidValidity}:${meta.uid}`).slice(0, 500);

  const threadRoot = firstReference(parsed.references) || cleanId(parsed.inReplyTo) || providerMessageId;

  const sender = parsed.from?.value?.[0];
  const fromAddress = (sender?.address ?? "").trim().toLowerCase() || "unknown@invalid";
  const fromName = collapse(stripNul(sender?.name ?? "")) || null;

  const recipients = [
    ...new Set(
      toList(parsed.to)
        .map((entry) => (entry.address ?? "").trim().toLowerCase())
        .filter((address) => address !== ""),
    ),
  ];

  const text = stripNul(parsed.text ?? "").trim();
  const flagNames = new Set([...meta.flags]);

  return {
    providerMessageId,
    threadId: threadRoot.slice(0, 500),
    from: { address: fromAddress, name: fromName },
    to: recipients,
    subject: collapse(stripNul(parsed.subject ?? "")).slice(0, MAX_SUBJECT_CHARS),
    snippet: makeSnippet(text),
    bodyText: text.slice(0, MAX_BODY_CHARS),
    receivedAt: meta.internalDate ?? parsed.date ?? meta.now,
    direction: fromAddress === meta.accountAddress.trim().toLowerCase() ? "outbound" : "inbound",
    status: flagNames.has("\\Seen") ? "read" : "unread",
    labels: labelsFrom(meta.flags),
  };
}
