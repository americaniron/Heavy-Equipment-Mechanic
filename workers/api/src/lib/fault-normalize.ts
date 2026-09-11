/**
 * Normalize manufacturer fault codes for lookup.
 * Accepts J1939 SPN/FMI, CAT, Cummins, and generic DTC strings.
 */
export function normalizeFaultCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^DTC\s*[:#-]?\s*/, "")
    .replace(/^CODE\s*[:#-]?\s*/, "")
    .replace(/[^A-Z0-9./-]+/g, "");
}

export function parseSpnFmi(input: string): { spn: string; fmi: string } | null {
  const compact = input.toUpperCase().replace(/\s+/g, " ").trim();
  const match =
    compact.match(/\bSPN\s*[:#-]?\s*(\d+)\s*(?:\/|,|\s)?\s*FMI\s*[:#-]?\s*(\d+)\b/) ||
    compact.match(/\b(\d{3,6})\s*[\/-]\s*(\d{1,2})\b/);
  if (!match) return null;
  return { spn: match[1]!, fmi: match[2]! };
}

export function likeSafe(input: string): string {
  return input.replace(/[%_]/g, "");
}
