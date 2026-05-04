import { describe, expect, it } from "vitest";
import { encodeCursor, decodeCursor } from "../src/lib/cursor";

describe("cursor encode/decode", () => {
  it("round-trips a typical (rank, id) pair", () => {
    const c = { rank: -3.14159, id: 42 };
    const enc = encodeCursor(c);
    expect(enc).not.toContain("=");
    expect(enc).not.toContain("+");
    expect(enc).not.toContain("/");
    expect(decodeCursor(enc)).toEqual(c);
  });

  it("round-trips id=0 (legitimate first row)", () => {
    expect(decodeCursor(encodeCursor({ rank: 0, id: 0 }))).toEqual({
      rank: 0,
      id: 0,
    });
  });

  it("round-trips negative rank (bm25 returns negatives)", () => {
    const c = { rank: -123.456, id: 999_999 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("returns null for null/undefined/empty", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("returns null for tampered base64", () => {
    expect(decodeCursor("!!!not-base64!!!")).toBeNull();
  });

  it("returns null for valid base64 but invalid JSON", () => {
    expect(decodeCursor(btoa("not json"))).toBeNull();
  });

  it("returns null for valid JSON missing fields", () => {
    expect(decodeCursor(btoa(JSON.stringify({ r: 1 })))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ i: 1 })))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({})))).toBeNull();
  });

  it("returns null for non-numeric fields", () => {
    expect(decodeCursor(btoa(JSON.stringify({ r: "x", i: 1 })))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ r: 1, i: "x" })))).toBeNull();
  });

  it("returns null for negative id (cannot exist in PK)", () => {
    expect(decodeCursor(btoa(JSON.stringify({ r: 0, i: -1 })))).toBeNull();
  });

  it("returns null for non-finite numbers", () => {
    const enc = btoa(JSON.stringify({ r: 1, i: Infinity }));
    expect(decodeCursor(enc)).toBeNull();
  });
});
