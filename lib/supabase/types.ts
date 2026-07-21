/**
 * Types TypeScript générés depuis le schéma Supabase
 * Reflète exactement les tables créées par les scripts SQL d'audit
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ─── Enums ────────────────────────────────────────────────────────────────────

export type WalletRole = "user" | "admin";
export type OctoTransactionType = "referral" | "bet" | "task";
export type WalletStatus = "active" | "suspended";
export type BetToken = "usdc" | "clawdtrust";

export type PaymentFlow = "prediction" | "launch" | "listing" | "pool_prediction" | "pool_creation" | "pool_claim" | "updown_claim" | "withdrawal";
export type PaymentStatus = "pending" | "approved" | "rejected";
export type MarketType = "yes-no" | "threshold" | "three-way";
export type VisualType = "vs" | "simple";
export type AIListingPlanId = "free" | "starter" | "builder";
export type AIListingStatus = "pending" | "approved" | "rejected";
export type AIListingBadge = "none" | "blue" | "gold";
export type ToolReactionType = "heart" | "thumbs-up" | "flame";
export type PayoutStatus = "claimed" | "paid";
export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";
export type WithdrawalToken  = "usdc" | "clawdtrust";

export interface WithdrawalRow {
  id: string;
  wallet_address: string;
  token: WithdrawalToken;
  amount: number;
  status: WithdrawalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  paid_tx: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PredictionResultStatus =
  | "open"
  | "pending_review"
  | "approved_pending_result"
  | "win"
  | "lose"
  | "claimed"
  | "paid"
  | "rejected";
export type AdminAction =
  | "create_prediction"
  | "remove_prediction"
  | "resolve_prediction"
  | "remove_ai"
  | "approve_listing"
  | "reject_listing"
  | "suspend_user"
  | "reactivate_user"
  | "approve_payment"
  | "reject_payment"
  | "add_ai";

// ─── Row types (lecture depuis Supabase) ──────────────────────────────────────

export interface WalletRow {
  address: string;
  role: WalletRole;
  status: WalletStatus;
  username: string | null;
  display_name: string | null;
  twitter_handle: string | null;
  avatar_src: string | null;
  registered_at: string | null;
  first_connected_at: string;
  last_connected_at: string;
  connection_count: number;
  latest_activity_at: string;
  latest_activity_label: string;
  payment_count: number;
  approved_payment_count: number;
  pending_payment_count: number;
  rejected_payment_count: number;
  total_paid_usdc: number;
  total_won_usdc: number;
  total_lost_usdc: number;
  total_claimed_usdc: number;
  created_at: string;
  updated_at: string;
}

export interface PredictionMarketRow {
  id: string;
  slug: string | null;
  category_id: string;
  title: string;
  market_type: MarketType;
  resolution_label: string;
  resolution_criteria: string | null;
  visual_type: VisualType;
  single_name: string | null;
  single_image_src: string | null;
  left_competitor_name: string | null;
  left_competitor_image_src: string | null;
  right_competitor_name: string | null;
  right_competitor_image_src: string | null;
  options: Json;
  created_by_wallet: string | null;
  is_resolved: boolean;
  resolution_outcome_id: string | null;
  resolved_at: string | null;
  resolved_by_wallet: string | null;
  event_start_at: string | null;
  is_active: boolean;
  price_ticker: string | null;
  price_target: number | null;
  created_at: string;
  updated_at: string;
}

export interface MarketCommentRow {
  id: string;
  market_id: string;
  parent_id: string | null;
  wallet_address: string;
  username: string | null;
  avatar_src: string | null;
  content: string;
  created_at: string;
}

export interface MarketCommentLikeRow {
  id: string;
  comment_id: string;
  wallet_address: string;
  created_at: string;
}

/** MarketCommentRow enrichi avec les likes et les réponses */
export interface MarketCommentEnriched extends MarketCommentRow {
  like_count: number;
  liked_by_me: boolean;
  octo_balance: number;
  replies: MarketCommentEnriched[];
}

export interface PaymentRow {
  id: string;
  payment_request_id: string;
  payment_reference: string | null;
  flow: PaymentFlow;
  title: string;
  subtitle: string | null;
  category_label: string | null;
  market_id: string | null;
  selection_id: string | null;
  selection_label: string | null;
  username: string | null;
  user_wallet: string;
  recipient_wallet: string;
  amount_usdc: number;
  reserve_fee_usdc: number;
  total_paid_usdc: number;
  token: BetToken;
  status: PaymentStatus;
  reviewed_at: string | null;
  reviewed_by_wallet: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PredictionHistoryRow {
  id: string;
  market_id: string;
  market_title: string;
  category_label: string;
  selection_id: string;
  selection_label: string;
  amount: number;
  reserve_fee: number;
  total_charged: number;
  claim_fee_rate: number;
  payout_multiple: number;
  gross_reward: number;
  net_reward: number;
  wallet_address: string;
  payment_reference: string;
  payment_request_id: string;
  admin_decision_status: PaymentStatus | null;
  resolution_outcome_id: string | null;
  resolved_at: string | null;
  resolved_by_wallet: string | null;
  payout_recorded_at: string | null;
  claimed_at: string | null;
  claim_reference: string | null;
  payout_status: PayoutStatus | null;
  paid_at: string | null;
  paid_by_wallet: string | null;
  token: BetToken;
  reported_at: string;
  created_at: string;
  updated_at: string;
}

export interface AIListingRow {
  id: string;
  wallet_address: string;
  display_name: string;
  twitter_handle: string;
  icon_src: string;
  icon_name: string;
  website_url: string;
  description: string;
  social_url: string;
  guide_file_name: string;
  guide_file_url: string;
  plan_id: AIListingPlanId;
  billing_label: string;
  amount_usd: number;
  auto_renew_enabled: boolean;
  status: AIListingStatus;
  badge: AIListingBadge;
  admin_notes: string | null;
  payment_reference: string | null;
  payment_request_id: string | null;
  visible_in_explore: boolean;
  visitor_count: number;
  submitted_at: string;
  updated_at: string;
}

export interface AIToolSocialRow {
  id: string;
  tool_name: string;
  rating_average: number;
  rating_count: number;
  reports: number;
  created_at: string;
  updated_at: string;
}

export interface ToolRatingRow {
  id: string;
  tool_name: string;
  actor_key: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface ToolReactionRow {
  id: string;
  tool_name: string;
  actor_key: string;
  reaction_type: ToolReactionType;
  created_at: string;
  updated_at: string;
}

export interface ToolCommentRow {
  id: string;
  tool_name: string;
  author: string;
  content: string;
  created_at: string;
}

export interface AdminLogRow {
  id: string;
  admin_wallet: string;
  action: AdminAction;
  target_id: string;
  details: string;
  created_at: string;
}

export interface AIMemoryRow {
  wallet_address: string;
  user_name: string | null;
  user_age: string | null;
  user_location: string | null;
  user_profession: string | null;
  language_preference: "en" | "fr";
  response_style: string | null;
  tone_preference: string | null;
  humor_preference: string | null;
  projects_in_progress: string[];
  current_goals: string[];
  important_information: string[];
  updated_at: string;
}

export interface TokenBoardRow {
  id: string;
  name: string;
  ticker: string;
  logo_src: string | null;
  price: string | null;
  volume_24h: string | null;
  market_cap: string | null;
  holders: string | null;
  status: string;
  launched_by_wallet: string | null;
  launched_by_name: string | null;
  contract_address: string | null;
  pool_address: string | null;
  solscan_url: string | null;
  dex_screener_url: string | null;
  bird_eye_url: string | null;
  gecko_terminal_url: string | null;
  bags_fm_url: string | null;
  initial_buy_percent: number | null;
  chart_points: Json;
  last_updated_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRequestRow {
  id: string;
  kind: "listing" | "launch" | "prediction";
  wallet_address: string | null;
  recipient: string;
  amount: number;
  reference: string;
  currency: "SOL" | "USDC";
  token_mint: string | null;
  token_decimals: number | null;
  label: string | null;
  message: string | null;
  memo: string | null;
  encoded_url: string | null;
  qr_code_src: string | null;
  signature: string | null;
  status: "created" | "signed" | "validated";
  rpc_url: string | null;
  metadata: Json;
  validated_at: string | null;
  created_at: string;
}

// ─── Database type for createClient<Database> ─────────────────────────────────

export interface Database {
  public: {
    Tables: {
      wallets: {
        Row: WalletRow;
        Insert: Partial<WalletRow> & { address: string; first_connected_at: string; last_connected_at: string; latest_activity_at: string; latest_activity_label: string; };
        Update: Partial<WalletRow>;
        Relationships: [];
      };
      prediction_markets: {
        Row: PredictionMarketRow;
        Insert: Omit<PredictionMarketRow, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string; };
        Update: Partial<PredictionMarketRow>;
        Relationships: [];
      };
      payments: {
        Row: PaymentRow;
        Insert: Omit<PaymentRow, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string; };
        Update: Partial<PaymentRow>;
        Relationships: [];
      };
      prediction_history: {
        Row: PredictionHistoryRow;
        Insert: Omit<PredictionHistoryRow, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string; };
        Update: Partial<PredictionHistoryRow>;
        Relationships: [];
      };
      ai_listings: {
        Row: AIListingRow;
        Insert: Omit<AIListingRow, "submitted_at" | "updated_at"> & { submitted_at?: string; updated_at?: string; };
        Update: Partial<AIListingRow>;
        Relationships: [];
      };
      ai_tool_social: {
        Row: AIToolSocialRow;
        Insert: Omit<AIToolSocialRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string; };
        Update: Partial<AIToolSocialRow>;
        Relationships: [];
      };
      tool_ratings: {
        Row: ToolRatingRow;
        Insert: Omit<ToolRatingRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string; };
        Update: Partial<ToolRatingRow>;
        Relationships: [];
      };
      tool_reactions: {
        Row: ToolReactionRow;
        Insert: Omit<ToolReactionRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string; };
        Update: Partial<ToolReactionRow>;
        Relationships: [];
      };
      tool_comments: {
        Row: ToolCommentRow;
        Insert: Omit<ToolCommentRow, "created_at"> & { created_at?: string; };
        Update: Partial<ToolCommentRow>;
        Relationships: [];
      };
      admin_logs: {
        Row: AdminLogRow;
        Insert: Omit<AdminLogRow, "created_at"> & { created_at?: string; };
        Update: Partial<AdminLogRow>;
        Relationships: [];
      };
      ai_memory: {
        Row: AIMemoryRow;
        Insert: Partial<AIMemoryRow> & { wallet_address: string; };
        Update: Partial<AIMemoryRow>;
        Relationships: [];
      };
      token_board: {
        Row: TokenBoardRow;
        Insert: Omit<TokenBoardRow, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string; };
        Update: Partial<TokenBoardRow>;
        Relationships: [];
      };
      payment_requests: {
        Row: PaymentRequestRow;
        Insert: Omit<PaymentRequestRow, "created_at"> & { created_at?: string; };
        Update: Partial<PaymentRequestRow>;
        Relationships: [];
      };
      market_comments: {
        Row: MarketCommentRow;
        Insert: Omit<MarketCommentRow, "id" | "created_at"> & { id?: string; created_at?: string; };
        Update: Partial<MarketCommentRow>;
        Relationships: [];
      };
      market_comment_likes: {
        Row: MarketCommentLikeRow;
        Insert: Omit<MarketCommentLikeRow, "id" | "created_at"> & { id?: string; created_at?: string; };
        Update: Partial<MarketCommentLikeRow>;
        Relationships: [];
      };
      token_launches: {
        Row: TokenLaunchRow;
        Insert: Omit<TokenLaunchRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string; };
        Update: Partial<TokenLaunchRow>;
        Relationships: [];
      };
      mutuel_markets: {
        Row: MutuelMarketRow;
        Insert: Omit<MutuelMarketRow, "id" | "created_at" | "updated_at" | "total_pool_usdc" | "total_pool_clt" | "bet_count"> & { id?: string; created_at?: string; updated_at?: string; total_pool_usdc?: number; total_pool_clt?: number; bet_count?: number; };
        Update: Partial<MutuelMarketRow>;
        Relationships: [];
      };
      mutuel_bets: {
        Row: MutuelBetRow;
        Insert: Omit<MutuelBetRow, "id" | "created_at"> & { id?: string; created_at?: string; };
        Update: Partial<MutuelBetRow>;
        Relationships: [];
      };
    };
    Views: {
      prediction_history_with_status: {
        Row: PredictionHistoryRow & { result_status: PredictionResultStatus };
        Relationships: [];
      };
    };
    Functions: {
      get_wallet_address: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      refresh_wallet_payment_stats: { Args: { p_wallet: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ─── OCTO Referral System ─────────────────────────────────────────────────────

export interface ReferralCodeRow {
  wallet_address: string;
  code: string;
  created_at: string;
}

export interface ReferralRow {
  id: string;
  referrer_wallet: string;
  referred_wallet: string;
  created_at: string;
}

export interface OctoTransactionRow {
  id: string;
  wallet_address: string;
  type: OctoTransactionType;
  amount: number;
  ref_wallet: string | null;
  bet_amount_usd: number | null;
  created_at: string;
}

export interface ReferralCommissionRow {
  id: string;
  referrer_wallet: string;
  referred_wallet: string;
  type: "bet_fee" | "loss_commission";
  token: BetToken;
  amount_usdc: number | null;
  amount_clt: number | null;
  bet_reference: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  external_link: string | null;
  reward_octo: number;
  task_type: string;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserTaskCompletionRow {
  id: string;
  wallet_address: string;
  task_id: string;
  completed_at: string;
}

export interface TaskWithCompletion extends TaskRow {
  completed: boolean;
  completed_at: string | null;
}

export interface ReferralCommissionClaimRow {
  id: string;
  referrer_wallet: string;
  total_usdc: number;
  total_clt: number;
  status: "pending" | "paid";
  paid_at: string | null;
  paid_by_wallet: string | null;
  created_at: string;
}

// ─── Token Launches ───────────────────────────────────────────────────────────

export interface TokenLaunchRow {
  id: string;
  user_id: string;
  wallet_address: string;
  token_name: string;
  symbol: string;
  description: string | null;
  mint_address: string;
  logo_name: string | null;
  whitepaper_name: string | null;
  project_x_url: string | null;
  project_telegram_url: string | null;
  project_discord_url: string | null;
  developer_wallets: string[];
  launch_option: "free" | "standard";
  fee_amount_sol: number;
  initial_buy_enabled: boolean;
  initial_buy_percent: number;
  status: "pending" | "paid" | "submitted" | "rejected";
  bags_request_id: string | null;
  tx_signature: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Pari Mutuel System ───────────────────────────────────────────────────────

export type MutuelMarketStatus = 'pending' | 'active' | 'closed' | 'resolved' | 'rejected' | 'cancelled';

export interface MutuelOption {
  id: string;
  label: string;
}

export interface MutuelMarketRow {
  id: string;
  slug: string;
  creator_wallet: string;
  title: string;
  description: string | null;
  cover_image_src: string | null;
  options: MutuelOption[];
  category: string;
  creation_fee_token: 'usdc' | 'clawdtrust';
  creation_fee_amount: number;
  creation_tx: string | null;
  bet_token: 'usdc' | 'clawdtrust';
  betting_closes_at: string;
  status: MutuelMarketStatus;
  admin_notes: string | null;
  fee_refunded_at: string | null;
  fee_refund_tx: string | null;
  is_refund: boolean;
  resolved_by_wallet: string | null;
  winning_option_id: string | null;
  resolved_at: string | null;
  total_pool_usdc: number;
  total_pool_clt: number;
  bet_count: number;
  created_at: string;
  updated_at: string;
}

export interface MutuelBetRow {
  id: string;
  market_id: string;
  wallet_address: string;
  option_id: string;
  amount: number;
  token: 'usdc' | 'clawdtrust';
  tx_signature: string | null;
  payout_amount: number | null;
  payout_tx: string | null;
  claimed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

/** MutuelMarketRow enrichi avec les totaux par option (calculés client-side) */
export interface MutuelMarketEnriched extends MutuelMarketRow {
  /** Map option_id -> total misé sur cette option */
  option_totals: Record<string, number>;
  /** Map option_id -> pourcentage (0-100) */
  option_pcts: Record<string, number>;
}
