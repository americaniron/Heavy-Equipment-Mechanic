import { describe, expect, it } from "vitest";
import {
  buildFtsQuery,
  parseSearchQuery,
} from "../src/lib/parts-search";
import { decodeCursor, encodeCursor } from "../src/lib/cursor";

describe("buildFtsQuery", () => {
  it("returns null for empty / whitespace-only / single-char input", () => {
    expect(buildFtsQuery("")).toBeNull();
    expect(buildFtsQuery("   ")).toBeNull();
    expect(buildFtsQuery("a")).toBeNull();
    expect(buildFtsQuery("a b")).toBeNull();
  });

  it("wraps each kept token in double quotes", () => {
    expect(buildFtsQuery("hydraulic")).toBe('"hydraulic"');
    expect(buildFtsQuery("hydraulic pump")).toBe('"hydraulic" "pump"');
  });

  it("lowercases and strips embedded double quotes (FTS5 syntax escape)", () => {
    expect(buildFtsQuery('hy"draulic PU"MP')).toBe('"hydraulic" "pump"');
  });

  it("drops short tokens but keeps the rest", () => {
    expect(buildFtsQuery("a hydraulic b pump")).toBe('"hydraulic" "pump"');
  });

  it("does not let FTS5 operators through as syntax", () => {
    // The `*` and `:` would be FTS5 operators; we let them ride inside the
    // quoted phrase, where FTS5 treats them as literals. The risk is the
    // double-quote, which we already strip.
    const out = buildFtsQuery('cat:pump *');
    // 'cat:pump' is one token, '*' fails the >=2 char filter.
    expect(out).toBe('"cat:pump"');
  });
});

describe("parseSearchQuery", () => {
  function sp(query: string): URLSearchParams {
    return new URL(`https://x/?${query}`).searchParams;
  }

  it("rejects missing q", () => {
    const r = parseSearchQuery(sp(""), decodeCursor);
    expect(r.ok).toBe(false);
  });

  it("rejects q shorter than 2 chars", () => {
    const r = parseSearchQuery(sp("q=a"), decodeCursor);
    expect(r.ok).toBe(false);
  });

  it("trims q before length check", () => {
    const r = parseSearchQuery(sp("q=%20%20"), decodeCursor);
    expect(r.ok).toBe(false);
  });

  it("accepts a 2-char q", () => {
    const r = parseSearchQuery(sp("q=oh"), decodeCursor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.q).toBe("oh");
  });

  it("defaults limit to 50", () => {
    const r = parseSearchQuery(sp("q=pump"), decodeCursor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.limit).toBe(50);
  });

  it("clamps limit to MAX_LIMIT (100)", () => {
    const r = parseSearchQuery(sp("q=pump&limit=999"), decodeCursor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.limit).toBe(100);
  });

  it("rejects non-numeric limit", () => {
    const r = parseSearchQuery(sp("q=pump&limit=abc"), decodeCursor);
    expect(r.ok).toBe(false);
  });

  it("rejects zero / negative limit", () => {
    expect(parseSearchQuery(sp("q=pump&limit=0"), decodeCursor).ok).toBe(false);
    expect(parseSearchQuery(sp("q=pump&limit=-5"), decodeCursor).ok).toBe(
      false,
    );
  });

  it("passes through make/category filters", () => {
    const r = parseSearchQuery(
      sp("q=pump&make=CAT&category=COMPONENTS"),
      decodeCursor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.make).toBe("CAT");
      expect(r.category).toBe("COMPONENTS");
    }
  });

  it("decodes a valid cursor", () => {
    const enc = encodeCursor({ rank: -2.5, id: 100 });
    const r = parseSearchQuery(sp(`q=pump&cursor=${enc}`), decodeCursor);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cursor).toEqual({ r: -2.5, i: 100 });
  });

  it("treats a malformed cursor as no cursor (forgiving)", () => {
    const r = parseSearchQuery(
      sp("q=pump&cursor=not-base64!!!"),
      decodeCursor,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cursor).toBeNull();
  });
});
