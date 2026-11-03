import { describe, expect, it } from "vitest";
import { isValidOAuthState, newOAuthState } from "./oauth-state";

describe("OAuth state", () => {
  it("makes a different unguessable value every time", () => {
    const a = newOAuthState();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(newOAuthState()).not.toBe(a);
  });

  it("accepts only an exact match", () => {
    const state = newOAuthState();
    expect(isValidOAuthState(state, state)).toBe(true);
    expect(isValidOAuthState(state, `${state}x`)).toBe(false);
    expect(isValidOAuthState(state, newOAuthState())).toBe(false);
  });

  it("rejects a missing cookie or a missing query value", () => {
    const state = newOAuthState();
    expect(isValidOAuthState(undefined, state)).toBe(false);
    expect(isValidOAuthState(state, null)).toBe(false);
    expect(isValidOAuthState("", "")).toBe(false);
  });
});
