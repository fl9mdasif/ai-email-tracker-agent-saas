import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { IMAP_PRESETS, SMTP_HOSTS } from "../connectors/imap/presets";
import type { ImapCredentials } from "../connectors/imap/schema";
import type { SendFailure, SendResult } from "./types";

const TIMEOUT_MS = 30_000;

/** The part of a nodemailer transport we use, so tests can pass a fake one. */
export type SmtpTransport = {
  sendMail: (mail: { envelope: { from: string; to: string[] }; raw: Buffer }) => Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;
  close?: () => void;
};

export type SmtpDeps = {
  createTransport?: (options: { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }) => SmtpTransport;
  /** Saves a copy in the mailbox's Sent folder. Best effort: a failure here never fails the send. */
  saveToSent?: (credentials: ImapCredentials, raw: Buffer) => Promise<void>;
};

/** Maps a nodemailer failure to a safe code. Server replies are never kept. */
export function classifySmtpError(error: unknown): SendFailure {
  const err = error as { code?: unknown; responseCode?: unknown } | null;
  const code = typeof err?.code === "string" ? err.code.toUpperCase() : "";
  const responseCode = typeof err?.responseCode === "number" ? err.responseCode : 0;
  if (code === "EAUTH" || responseCode === 535) return "reconnect";
  if (responseCode === 421 || responseCode === 450 || responseCode === 451 || responseCode === 452) return "rate_limited";
  if (code === "EENVELOPE" || (responseCode >= 500 && responseCode < 600)) return "rejected";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(code)) return "unreachable";
  return "unknown";
}

const defaultCreateTransport: NonNullable<SmtpDeps["createTransport"]> = (options) =>
  nodemailer.createTransport({
    ...options,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
    // Never fall back to an unencrypted connection.
    requireTLS: true,
    logger: false,
  });

/**
 * Puts a copy of the sent message in the Sent folder over IMAP, so it shows in webmail like any
 * mail the user sent. Uses the server's own "Sent" folder when it marks one.
 */
export async function saveToSentFolder(credentials: ImapCredentials, raw: Buffer): Promise<void> {
  const preset = IMAP_PRESETS[credentials.preset];
  const client = new ImapFlow({
    host: preset.host,
    port: preset.port,
    secure: preset.secure,
    auth: { user: credentials.user, pass: credentials.password },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    const folders = await client.list();
    const sent =
      folders.find((folder) => folder.specialUse === "\\Sent") ??
      folders.find((folder) => /^(inbox[./])?sent( items| messages)?$/i.test(folder.path));
    if (sent) await client.append(sent.path, raw, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Sends one prepared message through the provider's SMTP server, signed in as the mailbox
 * itself. The host comes from the account's preset, never from stored or typed text.
 */
export async function sendViaSmtp(
  credentials: ImapCredentials,
  message: { from: string; to: string; raw: Buffer; messageId: string },
  deps: SmtpDeps = {},
): Promise<SendResult> {
  const smtp = SMTP_HOSTS[credentials.preset];
  if (!smtp) return { ok: false, code: "unsupported" };
  const transport = (deps.createTransport ?? defaultCreateTransport)({ ...smtp, auth: { user: credentials.user, pass: credentials.password } });
  try {
    const info = await transport.sendMail({ envelope: { from: message.from, to: [message.to] }, raw: message.raw });
    if (Array.isArray(info.rejected) && info.rejected.length > 0) return { ok: false, code: "rejected" };
  } catch (error) {
    return { ok: false, code: classifySmtpError(error) };
  } finally {
    transport.close?.();
  }
  try {
    await (deps.saveToSent ?? saveToSentFolder)(credentials, message.raw);
  } catch {
    // The email went out; a missing copy in Sent is not worth failing the send over.
  }
  return { ok: true, messageId: message.messageId };
}
