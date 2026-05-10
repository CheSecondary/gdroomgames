export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export interface Card {
  suit: Suit;
  rank: string;
  deck_id: number;
  hidden?: boolean;
}

export interface PlayerState {
  seat: number;
  username: string;
  bid: number;           // -1 = not yet bid
  tricks_won: number;
  total_score: number;
  hand_count: number;
  hand: Card[];
  is_connected: boolean;
  team_index: number;    // -1 = no teams
  is_captain: boolean;   // true = this player places team bid
}

export interface TrickCard {
  suit: Suit;
  rank: string;
  deck_id: number;
  player_seat: number;
  player_name: string;
  play_order: number;
}

export type GameStatus = "waiting" | "bidding" | "playing" | "finished";

export interface GameState {
  type: "state";
  game_code: string;
  host_username: string;
  status: GameStatus;
  current_round: number;
  max_rounds: number;
  trump_suit: Suit | "";
  current_player_index: number;
  lead_player_index: number;
  num_decks: number;
  expected_players: number;
  teams_enabled: boolean;
  teams: number[][];        // [[captain_seat, teammate_seat], ...]
  players: PlayerState[];
  current_trick: TrickCard[];
}

export interface RoundScore {
  username: string;
  bid: number;
  tricks_won: number;
  delta: number;
  team_index: number;
}

// Team color palette (up to 4 teams)
export const TEAM_COLORS = [
  { bg: "bg-blue-500/20",  border: "border-blue-400/60",  text: "text-blue-300",  badge: "bg-blue-500" },
  { bg: "bg-rose-500/20",  border: "border-rose-400/60",  text: "text-rose-300",  badge: "bg-rose-500" },
  { bg: "bg-amber-500/20", border: "border-amber-400/60", text: "text-amber-300", badge: "bg-amber-500" },
  { bg: "bg-violet-500/20",border: "border-violet-400/60",text: "text-violet-300",badge: "bg-violet-500" },
];
