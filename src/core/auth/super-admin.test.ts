import { describe, expect, it } from "vitest";
import { isSuperAdminEmail } from "./super-admin-email";

describe("isSuperAdminEmail", () => {
  it("matches an email on the list, ignoring case and spaces", () => {
    expect(isSuperAdminEmail("Owner@Example.com", " owner@example.com , other@example.com ")).toBe(true);
    expect(isSuperAdminEmail("other@example.com", "owner@example.com,other@example.com")).toBe(true);
  });

  it("rejects anyone not on the list", () => {
    expect(isSuperAdminEmail("stranger@example.com", "owner@example.com")).toBe(false);
  });

  it("matches nobody when the list is empty or missing", () => {
    expect(isSuperAdminEmail("owner@example.com", "")).toBe(false);
    expect(isSuperAdminEmail("owner@example.com", " , ")).toBe(false);
    expect(isSuperAdminEmail("owner@example.com", undefined)).toBe(false);
  });

  it("matches nobody when the user has no email", () => {
    expect(isSuperAdminEmail(null, "owner@example.com")).toBe(false);
    expect(isSuperAdminEmail(undefined, "owner@example.com")).toBe(false);
  });

  it("does not match on a partial address", () => {
    expect(isSuperAdminEmail("owner@example.com", "myowner@example.com.au")).toBe(false);
  });
});
