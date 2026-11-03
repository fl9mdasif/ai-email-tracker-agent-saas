import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMAP_PRESET_KEYS } from "../connectors/imap/presets";
import { BRAND_KEYS, PROVIDER_BRANDS, brandForPreset, isBrandKey } from "./brands";

describe("provider brands", () => {
  it("has an entry for every key, and the key matches", () => {
    expect(Object.keys(PROVIDER_BRANDS).sort()).toEqual([...BRAND_KEYS].sort());
    for (const key of BRAND_KEYS) expect(PROVIDER_BRANDS[key].key).toBe(key);
  });

  it("has a logo file on disk for every provider", () => {
    for (const brand of Object.values(PROVIDER_BRANDS)) {
      expect(existsSync(join(process.cwd(), "public", brand.logo)), `${brand.key} logo ${brand.logo}`).toBe(true);
    }
  });

  it("uses valid hex colours and unique names", () => {
    for (const brand of Object.values(PROVIDER_BRANDS)) expect(brand.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const names = Object.values(PROVIDER_BRANDS).map((brand) => brand.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks exactly the providers that can be connected today as available", () => {
    const now = Object.values(PROVIDER_BRANDS)
      .filter((brand) => brand.availability === "now")
      .map((brand) => brand.key)
      .sort();
    expect(now).toEqual(["gmail", "hostinger", "zoho"]);
  });

  it("maps every IMAP preset to an available brand", () => {
    for (const preset of IMAP_PRESET_KEYS) {
      const brand = brandForPreset(preset);
      expect(brand, preset).not.toBeNull();
      expect(PROVIDER_BRANDS[brand!].availability).toBe("now");
    }
    expect(brandForPreset("hostinger")).toBe("hostinger");
    expect(brandForPreset("zoho-eu")).toBe("zoho");
    expect(brandForPreset("something-else")).toBeNull();
  });

  it("recognises brand keys safely", () => {
    expect(isBrandKey("hostinger")).toBe(true);
    expect(isBrandKey("nope")).toBe(false);
    expect(isBrandKey(null)).toBe(false);
    expect(isBrandKey(undefined)).toBe(false);
  });
});
