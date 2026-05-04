/** Shared API types — keep in sync with workers/api/src/routes/parts.ts. */

export interface Part {
  id: number;
  part_number: string;
  description: string;
  category: string | null;
  make: string;
  price_usd: number | null;
  stock_status: string | null;
  source_file: string;
}

export interface PartsSearchResponse {
  results: Part[];
  next_cursor: string | null;
  /**
   * Total number of matches for the *first* page only (cursor === null).
   * 0 when paginating; clients should not display a "of Y" count after
   * the first page (we don't recompute on every page for cost reasons).
   */
  total_estimate: number;
}

export interface PartsFacetsResponse {
  makes: string[];
  categories: string[];
}

export interface ApiError {
  error: { code: string; message: string; hint?: string };
}

// ----- Diagnosis types (mirrors workers/api/src/lib/diagnosis-schema.ts) -----

export type Likelihood = "high" | "medium" | "low";

export interface PossibleCause {
  cause: string;
  likelihood: Likelihood;
  reasoning: string;
}
export interface DiagnosticTest {
  test: string;
  tools: string[];
  expected_reading_pass: string;
  expected_reading_fail: string;
}
export interface PartLikelyNeeded {
  part_number: string;
  description: string;
  why: string;
}
export interface ScenarioPlaybook {
  possible_causes: PossibleCause[];
  tests_in_order: DiagnosticTest[];
  expected_readings: Record<string, string>;
  parts_likely_needed: PartLikelyNeeded[];
  safety_warnings: string[];
}
export interface ScenarioInputPayload {
  machine_make: string;
  machine_model: string;
  year: number | null;
  hours: number | null;
  symptoms: string;
  fault_codes: string[];
  recent_service: string[];
  operator_notes: string;
}
export interface ScenarioResponse {
  session_id: string;
  playbook: ScenarioPlaybook;
  model_used: string;
  prompt_version: string;
  monthly_remaining: number | null;
}
export interface ChatResponse {
  session_id: string;
  reply: string;
  model_used: string;
  monthly_remaining: number | null;
}
