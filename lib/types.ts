export type EventStatus = "OPEN" | "CLOSED" | "FINISHED" | "CANCELLED";
export type PredictionStatus = "PENDING" | "VERIFIED" | "REJECTED" | "PAID" | "CANCELLED";
export type TeamSelection = "TEAM_A" | "TEAM_B";
export type RiskMode = "OPEN" | "WARN" | "HARD_LIMIT";
export type MatchResult = "TEAM_A" | "DRAW" | "TEAM_B" | null;

export interface EventRecord {
  id: string;
  title: string;
  team_a: string;
  team_b: string;
  team_a_logo: string | null;
  team_b_logo: string | null;
  match_date: string;
  match_time: string;
  betting_close_at: string;
  status: EventStatus;
  minimum_amount: number;
  multiplier: number;
  result: MatchResult;
  risk_mode: RiskMode;
  risk_limit_amount: number;
}

export interface PublicSettings {
  payment_qr_url: string | null;
  payment_receiver_name: string;
  rules_text: string;
  maintenance_mode: boolean;
  max_receipt_mb: number;
}

export interface PublicPrediction {
  masked_name: string;
  team_selected: TeamSelection;
  display_amount: number;
  status: "PENDING" | "VERIFIED";
  created_at: string;
  verified_at: string | null;
}

export interface PredictionRecord {
  id: string;
  code: string;
  event_id: string;
  name: string;
  phone: string;
  refund_phone: string;
  team_selected: TeamSelection;
  declared_amount: number;
  verified_amount: number | null;
  receipt_path: string | null;
  status: PredictionStatus;
  admin_note: string | null;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
}

export interface Exposure {
  teamA: number;
  teamB: number;
  pool: number;
  liabilityA: number;
  liabilityB: number;
  balanceA: number;
  balanceB: number;
}
