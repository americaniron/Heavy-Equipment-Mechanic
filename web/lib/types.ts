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

// ----- Troubleshooting wizard types ---------------------------------------

export type Confidence = "high" | "medium" | "low";

export interface WizardConclusion {
  summary: string;
  confidence: Confidence;
  next_steps: string[];
  safety_warnings: string[];
}

export type WizardTurn =
  | {
      question: string;
      reasoning: string;
      suggested_answers: string[];
      terminate: false;
    }
  | {
      question: string;
      reasoning: string;
      suggested_answers: string[];
      terminate: true;
      conclusion: WizardConclusion;
    };

export interface WizardStartInput {
  machine_make: string;
  machine_model: string;
  initial_complaint: string;
}

export interface WizardResponse {
  session_id: string;
  turn: WizardTurn;
  turn_number: number;
  max_turns: number;
  model_used: string;
  monthly_remaining?: number | null;
}

// ----- Recommended-parts types -------------------------------------------

export interface RecommendationCard {
  part_number: string;
  name: string;
  image_placeholder_url: string;
  why_you_need_it: string;
  price_usd: number | null;
  cta_label: string;
  stock_status?: string | null;
}

export interface BundleOffer {
  label: string;
  part_numbers: string[];
  bundle_savings_usd: number;
  rationale: string;
}

export interface RecommendationsResponse {
  hero_line: string;
  cards: RecommendationCard[];
  bundle_offer: BundleOffer | null;
  urgency_framing: string;
  model_used: string;
  prompt_version: string;
  candidates_considered: number;
  cards_returned: number;
}

// ----- Repair plan types -----

export interface RepairStep {
  step: string;
  time_min: number;
  prerequisites: string[];
}
export interface RepairPlanData {
  labor_hours_estimate: number;
  required_tools: string[];
  downtime_days_projection: number;
  suggested_sequence: RepairStep[];
  total_parts_cost_usd: number;
  total_labor_cost_usd_low: number;
  total_labor_cost_usd_high: number;
}
export interface RepairPlanResponse {
  session_id: string;
  plan: RepairPlanData;
  model_used: string;
  prompt_version: string;
}

// ----- Equipment + predictive types -----

export interface Equipment {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  serial: string | null;
  hours: number | null;
  created_at: number;
  updated_at: number;
}
export interface EquipmentListResponse {
  equipment: Equipment[];
}
export interface EquipmentResponse {
  equipment: Equipment;
}

export interface Prediction {
  equipment_id: string;
  risk_score: number;
  predicted_failure_window: string;
  recommended_action: string;
  confidence: number;
  based_on_diagnoses: number;
  equipment: Equipment;
}
export interface PredictiveResponse {
  predictions: Prediction[];
  empty_state: "no_equipment" | "no_diagnoses" | null;
  empty_message: string | null;
  fleet_size?: number;
  diagnoses_considered?: number;
  model_used: string | null;
  prompt_version: string;
}
