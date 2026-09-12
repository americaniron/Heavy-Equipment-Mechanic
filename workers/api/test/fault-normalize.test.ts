import { describe, expect, it } from "vitest";
import { likeSafe, normalizeFaultCode, parseSpnFmi } from "../src/lib/fault-normalize";

describe("normalizeFaultCode", () => {
  it("strips prefixes and whitespace", () => {
    expect(normalizeFaultCode("  dtc: P0420 ")).toBe("P0420");
    expect(normalizeFaultCode("code #110")).toBe("110");
  });
});

describe("parseSpnFmi", () => {
  it("parses SPN/FMI pairs", () => {
    expect(parseSpnFmi("SPN 3251 FMI 2")).toEqual({ spn: "3251", fmi: "2" });
    expect(parseSpnFmi("110/4")).toEqual({ spn: "110", fmi: "4" });
  });

  it("returns null when not present", () => {
    expect(parseSpnFmi("P0420")).toBeNull();
  });
});

describe("likeSafe", () => {
  it("strips LIKE metacharacters", () => {
    expect(likeSafe("100%_x")).toBe("100x");
  });
});
