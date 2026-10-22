import { describe, expect, it } from "vitest";
import { isNewSince } from "@/lib/boards";

const since = "2026-10-22T12:00:00Z";

describe("isNewSince", () => {
  it("marks things added after you last looked", () => {
    expect(isNewSince({ added_at: "2026-10-22T12:00:01Z" }, since)).toBe(true);
  });
  it("doesn't mark what was already there", () => {
    expect(isNewSince({ added_at: "2026-10-22T11:59:59Z" }, since)).toBe(false);
    expect(isNewSince({ added_at: since }, since)).toBe(false);
  });
  it("never marks your own", () => {
    expect(
      isNewSince({ added_at: "2026-10-23T00:00:00Z", mine: true }, since),
    ).toBe(false);
  });
  it("stays quiet when a time is missing", () => {
    expect(isNewSince({ added_at: null }, since)).toBe(false);
    expect(isNewSince({ added_at: "2026-10-23T00:00:00Z" }, undefined)).toBe(
      false,
    );
  });
});
