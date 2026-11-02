import { z } from "zod";
import { IMAP_PRESET_KEYS, IMAP_PRESETS, type ImapPresetKey } from "./presets";

/** What the "add email account" form submits. */
export const imapAccountSchema = z.object({
  preset: z.enum(IMAP_PRESET_KEYS, { error: "Choose a mail provider" }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter a valid email address" })),
  // Not trimmed: spaces can be part of an app password.
  password: z.string().min(1, "Enter the app password").max(256, "That password is too long"),
  label: z.string().trim().max(60, "Keep the name under 60 characters").optional(),
});

export type ImapAccountInput = z.infer<typeof imapAccountSchema>;

/** What the vault stores (encrypted) and the connector uses. */
export type ImapCredentials = {
  preset: ImapPresetKey;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

export function buildImapCredentials(input: ImapAccountInput): ImapCredentials {
  const preset = IMAP_PRESETS[input.preset];
  return {
    preset: preset.key,
    host: preset.host,
    port: preset.port,
    secure: preset.secure,
    user: input.email,
    password: input.password,
  };
}

/** Stored credentials come back from the vault as untyped JSON, so check their shape. */
export const imapCredentialsSchema = z.object({
  preset: z.enum(IMAP_PRESET_KEYS),
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean(),
  user: z.string().min(1),
  password: z.string().min(1),
});
