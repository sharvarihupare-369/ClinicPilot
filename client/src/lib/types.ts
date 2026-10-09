export interface Doctor {
  id: number;
  name: string;
  specialty: string;
  location: string;
  qualification?: string;
  experience_years?: number;
  consultation_fee?: number;
  bio?: string;
  profile_image?: string;
  is_verified?: boolean;
  avatar?: string;
  rating?: number;
  average_rating?: number;
  total_reviews?: number;
}

export interface Review {
  id: number;
  doctor_id: number;
  patient_id: string;
  appointment_id: number;
  rating: number;
  review_text?: string;
  created_at: string;
  patient_name: string;
}

export interface Slot {
  id: string | number;
  doctor_id: number;
  date: string;
  time: string;
  start_time?: string;
  end_time?: string;
  status: "AVAILABLE" | "BOOKED" | "HELD" | "PAST";
  held_until?: string | null;
}

export interface AuthProfile {
  id: number;
  name: string;
  specialty?: string;
  location?: string;
  qualification?: string;
  experience_years?: number;
  consultation_fee?: number;
  phone?: string;
  patient_code?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  email: string;
  role: "DOCTOR" | "PATIENT";
  profile?: AuthProfile;
}

export interface UserResponse {
  id: number;
  email: string;
  role: "DOCTOR" | "PATIENT";
  created_at: string;
  profile?: AuthProfile;
}

export interface DoctorMetrics {
  total_slots: number;
  available_slots: number;
  booked_appointments: number;
}

export interface DoctorMeResponse {
  profile: Doctor;
  metrics: DoctorMetrics;
}

export interface Appointment {
  id: number;
  patient_id: string;
  patient_name?: string;
  patient_phone?: string;
  doctor_id: number;
  doctor_name?: string;
  specialty?: string;
  location?: string;
  date: string;
  time: string;
  status: "CONFIRMED" | "CANCELLED" | "PENDING_PAYMENT" | "COMPLETED";
  consultation_fee?: number;
  created_at: string;
  has_reviewed_doctor?: boolean;
}

export interface ActivityStep {
  icon: string;
  label: string;
  done: boolean;
}

export interface ConfirmationCard {
  doctor: string;
  doctor_name?: string;
  doctor_id?: number;
  specialty: string;
  date: string;
  time: string;
  location: string;
  consultation_fee?: number;
}

export interface SessionStateSummary {
  session_id: string;
  patient_id: string;
  current_date?: string;
  intent?: string | null;
  specialty?: string | null;
  location?: string | null;
  doctor_id?: number | null;
  doctor_name?: string | null;
  date?: string | null;
  time?: string | null;
  target_appointment_id?: number | null;
  available_slots?: string[] | null;
  confirmation_requested?: boolean;
  patient_confirmed?: boolean;
}

export interface ChatResponse {
  patient_id: string;
  session_id: string;
  response: string;
  tool_calls: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
  }>;
  activity_steps?: ActivityStep[];
  confirmation_card?: ConfirmationCard | null;
  state?: SessionStateSummary;
}

export interface ScenarioScore {
  scenario_id: string;
  scenario_name: string;
  score: number;
  max_score: number;
  passed: boolean;
  deductions?: Array<{
    dimension: string;
    points_lost: number;
    reason: string;
    failure_type?: string;
  }>;
}

export interface EvaluationSummary {
  total_scenarios: number;
  passed: number;
  failed: number;
  average_score: number;
  pass_rate: number;
  scenarios: ScenarioScore[];
  run_timestamp?: string;
}

export interface LearnedRule {
  improvement_id: string;
  title: string;
  rule_text: string;
  target_failure_type: string;
  target_scenario: string;
  created_at: string;
}

export interface ComparisonEntry {
  scenario_id: string;
  scenario_name: string;
  before_score: number;
  after_score: number;
  delta: number;
  status: string;
}

export interface BeforeAfterResponse {
  timestamp: string;
  learned_rule?: LearnedRule | null;
  baseline_summary: {
    passed: number;
    total: number;
    average_score: number;
  };
  improved_summary: {
    passed: number;
    total: number;
    average_score: number;
  };
  comparisons: ComparisonEntry[];
  zero_regressions_verified: boolean;
}
