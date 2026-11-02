/** Every mail or outreach provider Loopify shows branding for. */
export const BRAND_KEYS = [
  "gmail",
  "outlook",
  "zoho",
  "hostinger",
  "instantly",
  "apollo",
  "brevo",
] as const;

export type BrandKey = (typeof BRAND_KEYS)[number];

export type ProviderBrand = {
  key: BrandKey;
  name: string;
  /** The brand's own accent colour, used for tints, borders and fallbacks. */
  color: string;
  /** Logo file under /public. */
  logo: string;
  /** "now" can be connected today; "soon" arrives with the milestone named in `availableWith`. */
  availability: "now" | "soon";
  availableWith: string;
};

export const PROVIDER_BRANDS: Record<BrandKey, ProviderBrand> = {
  gmail: { key: "gmail", name: "Gmail", color: "#EA4335", logo: "/providers/gmail.svg", availability: "soon", availableWith: "Milestone 7" },
  outlook: { key: "outlook", name: "Outlook", color: "#0078D4", logo: "/providers/outlook.svg", availability: "soon", availableWith: "Milestone 7" },
  zoho: { key: "zoho", name: "Zoho Mail", color: "#E42527", logo: "/providers/zoho.svg", availability: "now", availableWith: "Milestone 2" },
  hostinger: { key: "hostinger", name: "Hostinger", color: "#673DE6", logo: "/providers/hostinger.svg", availability: "now", availableWith: "Milestone 2" },
  instantly: { key: "instantly", name: "Instantly", color: "#0078FF", logo: "/providers/instantly.png", availability: "soon", availableWith: "Milestone 9" },
  apollo: { key: "apollo", name: "Apollo", color: "#EBF212", logo: "/providers/apollo.png", availability: "soon", availableWith: "Milestone 9" },
  brevo: { key: "brevo", name: "Brevo", color: "#0B996E", logo: "/providers/brevo.svg", availability: "soon", availableWith: "Milestone 11" },
};

export function isBrandKey(value: string | null | undefined): value is BrandKey {
  return typeof value === "string" && (BRAND_KEYS as readonly string[]).includes(value);
}

/** Which brand an IMAP preset belongs to (all Zoho regions are Zoho Mail). */
export function brandForPreset(preset: string): BrandKey | null {
  if (preset === "hostinger") return "hostinger";
  if (preset.startsWith("zoho-")) return "zoho";
  return null;
}
