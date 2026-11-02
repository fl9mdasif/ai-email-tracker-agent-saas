/**
 * IMAP servers the form offers. The server only ever connects to hosts listed here, never to
 * a host a user typed, which rules out using the app to probe other machines (SSRF).
 */
export const IMAP_PRESET_KEYS = ["hostinger", "zoho-com", "zoho-eu", "zoho-in", "zoho-com-au"] as const;

export type ImapPresetKey = (typeof IMAP_PRESET_KEYS)[number];

export type ImapPreset = {
  key: ImapPresetKey;
  label: string;
  host: string;
  port: number;
  secure: boolean;
};

export const IMAP_PRESETS: Record<ImapPresetKey, ImapPreset> = {
  hostinger: { key: "hostinger", label: "Hostinger", host: "imap.hostinger.com", port: 993, secure: true },
  "zoho-com": { key: "zoho-com", label: "Zoho Mail (zoho.com)", host: "imap.zoho.com", port: 993, secure: true },
  "zoho-eu": { key: "zoho-eu", label: "Zoho Mail (zoho.eu)", host: "imap.zoho.eu", port: 993, secure: true },
  "zoho-in": { key: "zoho-in", label: "Zoho Mail (zoho.in)", host: "imap.zoho.in", port: 993, secure: true },
  "zoho-com-au": {
    key: "zoho-com-au",
    label: "Zoho Mail (zoho.com.au)",
    host: "imap.zoho.com.au",
    port: 993,
    secure: true,
  },
};
