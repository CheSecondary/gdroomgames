"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "./Card";
import Scoreboard from "./Scoreboard";
import TrumpIndicator from "./TrumpIndicator";
import BidPanel from "./BidPanel";
import RoundSummary from "./RoundSummary";
import VoiceChat from "./VoiceChat";
import type { GameState, Card as CardType, RoundScore } from "@/lib/types";
import { TEAM_COLORS } from "@/lib/types";

interface Props {
  state: GameState;
  username: string;
  gameCode: string;
  gameError: string | null;
  roundSummary: { round: number; scores: RoundScore[] } | null;
  onClearSummary: () => void;
  onStartGame: () => void;
  onBid: (bid: number) => void;
  onPlayCard: (card: CardType) => void;
  onEndGame: () => void;
}

const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
const RANK_VAL:  Record<string, number>  = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

export default function GameBoard({
  state,
  username,
  gameCode,
  gameError,
  roundSummary,
  onClearSummary,
  onStartGame,
  onBid,
  onPlayCard,
  onEndGame,
}: Props) {
  const [selectedCard,  setSelectedCard]  = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const me       = state.players.find((p) => p.username === username);
  const myTurn   = !!me && state.players[state.current_player_index]?.username === username;
  const isHost   = state.host_username === username;

  const cardKey = (c: CardType) => `${c.suit}-${c.rank}-${c.deck_id}`;

  const handleCardClick = (card: CardType) => {
    if (!myTurn || state.status !== "playing") return;
    const key = cardKey(card);
    if (selectedCard === key) {
      onPlayCard(card);
      setSelectedCard(null);
    } else {
      setSelectedCard(key);
    }
  };

  const myHand    = (me?.hand ?? []).filter((c) => !c.hidden);
  const sortedHand = [...myHand].sort(
    (a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_VAL[a.rank] - RANK_VAL[b.rank]
  );

  // Teams: find my captain
  const myTeam    = state.teams_enabled && me ? state.teams[me.team_index] : null;
  const captainSeat = myTeam?.[0] ?? -1;
  const captain   = state.teams_enabled ? state.players.find((p) => p.seat === captainSeat) : null;
  const iAmCapitain = !state.teams_enabled || (me?.is_captain ?? true);

  // Bidding state
  const activeBidder = state.status === "bidding"
    ? state.players[state.current_player_index]
    : null;

  return (
    <div
      className="landscape-required min-h-screen flex flex-col select-none"
      style={{ background: "linear-gradient(160deg, #0a1f2e 0%, #0d2b1e 50%, #091209 100%)" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-3 py-2 bg-black/50 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 font-extrabold text-sm tracking-wide">♠</span>
          <span className="bg-black/50 text-gray-400 text-xs px-2 py-0.5 rounded font-mono border border-white/10">
            {gameCode}
          </span>
          {state.status !== "finished" && (
            <span className="text-gray-500 text-xs hidden sm:inline">
              R<span className="text-yellow-400 font-bold ml-0.5">{state.current_round}</span>
              <span className="text-gray-700">/{state.max_rounds}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {state.trump_suit && (
            <div className="shrink-0">
              <TrumpIndicator suit={state.trump_suit} />
            </div>
          )}
          <VoiceChat gameCode={gameCode} username={username} />
          <span className="text-gray-600 text-xs hidden sm:inline">👤 {username}</span>
          {isHost && state.status !== "finished" && (
            <button
              onClick={() => setShowEndConfirm(true)}
              className="text-[11px] text-red-400/70 hover:text-red-400 border border-red-400/20 hover:border-red-400/50 px-2 py-0.5 rounded transition-all"
            >
              End
            </button>
          )}
        </div>
      </header>

      {/* ── Error toast ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {gameError && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className="bg-red-900/80 border-b border-red-500/30 text-red-300 text-xs text-center py-1.5 px-4 shrink-0"
          >
            {gameError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Body: sidebar + table ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar — desktop only */}
        <aside className="hidden lg:flex flex-col gap-2 w-52 p-3 bg-black/25 border-r border-white/5 shrink-0 overflow-y-auto">
          <Scoreboard
            players={state.players}
            currentPlayerIndex={state.current_player_index}
            myUsername={username}
            teamsEnabled={state.teams_enabled}
            teams={state.teams}
          />
        </aside>

        {/* ── Main playing area ─────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Opponents row */}
          <div className="shrink-0 px-2 pt-2 pb-1">
            <OtherPlayers
              players={state.players}
              myUsername={username}
              currentPlayerIndex={state.current_player_index}
              teamsEnabled={state.teams_enabled}
            />
          </div>

          {/* Table center — trick + status */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-2 min-h-0">

            <TrickArea cards={state.current_trick} trumpSuit={state.trump_suit} />

            {/* Status layer */}
            <div className="flex flex-col items-center gap-2">

              {state.status === "bidding" && (
                <>
                  {myTurn ? (
                    <BidPanel
                      maxBid={state.current_round}
                      onBid={onBid}
                      isCapitain={iAmCapitain}
                      captainUsername={captain?.username}
                    />
                  ) : !iAmCapitain && state.teams_enabled ? (
                    <BidPanel
                      maxBid={state.current_round}
                      onBid={onBid}
                      isCapitain={false}
                      captainUsername={captain?.username}
                    />
                  ) : (
                    <motion.p
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                      className="text-gray-400 text-sm"
                    >
                      {activeBidder?.username} is bidding…
                    </motion.p>
                  )}
                </>
              )}

              {state.status === "playing" && myTurn && (
                <motion.p
                  key={selectedCard ? "sel" : "pick"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-yellow-300 text-sm font-semibold text-center"
                >
                  {selectedCard ? "Tap again to play ↓" : "Your turn — tap a card"}
                </motion.p>
              )}
              {state.status === "playing" && !myTurn && (
                <p className="text-gray-600 text-xs">
                  Waiting for {state.players[state.current_player_index]?.username}…
                </p>
              )}

              {state.status === "finished" && (
                <GameOverBanner
                  players={state.players}
                  teamsEnabled={state.teams_enabled}
                  teams={state.teams}
                  onNewGame={() => { window.location.href = "/lobby"; }}
                />
              )}
            </div>
          </div>

          {/* Mobile: score strip */}
          <div className="lg:hidden shrink-0 border-t border-white/5 bg-black/40 overflow-x-auto px-3 py-1.5">
            <MobileScoreStrip
              players={state.players}
              currentPlayerIndex={state.current_player_index}
              myUsername={username}
              teamsEnabled={state.teams_enabled}
              teams={state.teams}
            />
          </div>

          {/* My hand */}
          {me && state.status !== "finished" && (
            <div className="shrink-0 bg-black/30 border-t border-white/5 pt-2 pb-1">
              {/* Hand label */}
              <div className="flex items-center justify-between px-4 mb-1.5">
                <span className="text-gray-500 text-[11px]">
                  Your hand
                  <span className="text-gray-600 ml-1">({myHand.length})</span>
                </span>
                {me.bid >= 0 && (
                  <span className="text-xs text-gray-400">
                    Bid <span className="text-yellow-400 font-bold">{me.bid}</span>
                    {" "}· Won <span className="text-emerald-400 font-bold">{me.tricks_won}</span>
                  </span>
                )}
              </div>

              {/* Scrollable fan hand */}
              <div className="card-hand-scroll">
                <div className="card-hand-inner">
                  {sortedHand.map((card) => (
                    <Card
                      key={cardKey(card)}
                      card={card}
                      selected={selectedCard === cardKey(card)}
                      onClick={
                        state.status === "playing" && myTurn
                          ? () => handleCardClick(card)
                          : undefined
                      }
                    />
                  ))}
                  {myHand.length === 0 && state.status === "playing" && (
                    <p className="text-gray-600 text-sm py-4 px-4">No cards left</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Round Summary overlay ─────────────────────────────────────────────── */}
      {roundSummary && (
        <RoundSummary
          round={roundSummary.round}
          scores={roundSummary.scores}
          onClose={onClearSummary}
        />
      )}

      {/* ── End-game confirm ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center"
            >
              <p className="text-white font-bold text-lg mb-2">End Game?</p>
              <p className="text-gray-400 text-sm mb-6">This ends the game for everyone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onEndGame(); setShowEndConfirm(false); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-all"
                >
                  End Game
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function OtherPlayers({
  players,
  myUsername,
  currentPlayerIndex,
  teamsEnabled,
}: {
  players: GameState["players"];
  myUsername: string;
  currentPlayerIndex: number;
  teamsEnabled: boolean;
}) {
  const others = players.filter((p) => p.username !== myUsername);
  if (!others.length) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {others.map((p) => {
        const isActive  = players[currentPlayerIndex]?.username === p.username;
        const teamColor = teamsEnabled && p.team_index >= 0 ? TEAM_COLORS[p.team_index % TEAM_COLORS.length] : null;

        return (
          <motion.div
            key={p.seat}
            animate={
              isActive
                ? { boxShadow: ["0 0 0 0 rgba(234,179,8,0)", "0 0 14px 3px rgba(234,179,8,0.5)", "0 0 0 0 rgba(234,179,8,0)"] }
                : {}
            }
            transition={{ repeat: Infinity, duration: 1.4 }}
            className={`
              flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl border transition-all text-center
              ${isActive ? "border-yellow-400/60 bg-yellow-400/5" : teamColor ? `${teamColor.bg} ${teamColor.border}` : "border-white/10 bg-black/20"}
              ${!p.is_connected ? "opacity-40" : ""}
            `}
          >
            {/* Mini card backs */}
            <div className="flex gap-px min-h-[18px] items-end">
              {Array.from({ length: Math.min(p.hand_count, 8) }).map((_, i) => (
                <div key={i} className="w-2.5 h-4 bg-emerald-800 border border-emerald-600/60 rounded-[2px]" />
              ))}
              {p.hand_count > 8 && (
                <span className="text-gray-600 text-[9px] self-center ml-0.5">+{p.hand_count - 8}</span>
              )}
            </div>
            <span className={`text-[11px] font-semibold ${isActive ? "text-yellow-300" : teamColor ? teamColor.text : "text-gray-300"}`}>
              {p.username}{!p.is_connected && " 💤"}
              {teamsEnabled && p.is_captain && <span className="ml-0.5 opacity-60">(C)</span>}
            </span>
            <div className="flex gap-1.5 text-[10px] text-gray-600">
              <span>B:{p.bid >= 0 ? p.bid : "—"}</span>
              <span>W:{p.tricks_won}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

const SUIT_SYMBOL: Record<string, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };

function TrickArea({ cards, trumpSuit }: { cards: GameState["current_trick"]; trumpSuit: string }) {
  if (!cards.length) {
    return (
      <div className="w-56 h-32 rounded-2xl border-2 border-dashed border-white/8 flex items-center justify-center">
        <span className="text-gray-700 text-sm">Table</span>
      </div>
    );
  }

  // Spread positions for up to 7 cards
  const offsets = [
    { x: 0,   y: 0  },
    { x: -36, y: -6 }, { x: 36, y: -6  },
    { x: -24, y: 12 }, { x: 24, y: 12  },
    { x: 0,   y: -20 }, { x: 0, y: 20 },
  ];

  return (
    <div className="relative w-56 h-40 flex items-center justify-center">
      {cards.map((tc, i) => {
        const off = offsets[i] ?? { x: 0, y: 0 };
        const isTrump = tc.suit === trumpSuit;
        return (
          <motion.div
            key={`${tc.suit}-${tc.rank}-${tc.deck_id}-${tc.play_order}`}
            initial={{ scale: 0.3, opacity: 0, y: 60 }}
            animate={{ scale: 1, opacity: 1, x: off.x, y: off.y }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="absolute"
          >
            <div className="relative">
              {isTrump && (
                <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-yellow-400 rounded-full z-10 shadow" />
              )}
              <Card card={{ suit: tc.suit, rank: tc.rank, deck_id: tc.deck_id }} played />
              <span className="absolute -bottom-5 left-0 right-0 text-center text-[9px] text-gray-500 whitespace-nowrap">
                {tc.player_name}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function MobileScoreStrip({
  players,
  currentPlayerIndex,
  myUsername,
  teamsEnabled,
  teams,
}: {
  players: GameState["players"];
  currentPlayerIndex: number;
  myUsername: string;
  teamsEnabled: boolean;
  teams: number[][];
}) {
  if (teamsEnabled && teams.length > 0) {
    return (
      <div className="flex gap-4 text-[11px] whitespace-nowrap">
        {teams.map((seats, ti) => {
          const color   = TEAM_COLORS[ti % TEAM_COLORS.length];
          const members = seats.map((s) => players.find((p) => p.seat === s)).filter(Boolean) as typeof players;
          const score   = members.reduce((n, p) => n + p.total_score, 0);
          return (
            <div key={ti} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg ${color.bg} border ${color.border}`}>
              <span className={`font-bold ${color.text}`}>T{ti + 1}</span>
              <span className="text-gray-400">{members.map((p) => p.username).join(" & ")}</span>
              <span className={`font-bold ${score >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {score > 0 ? `+${score}` : score}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex gap-4 text-[11px] whitespace-nowrap">
      {[...players]
        .sort((a, b) => b.total_score - a.total_score)
        .map((p) => (
          <div key={p.seat} className="flex flex-col items-center gap-0.5">
            <span
              className={`font-semibold ${
                p.username === myUsername
                  ? "text-yellow-400"
                  : players[currentPlayerIndex]?.username === p.username
                  ? "text-white"
                  : "text-gray-400"
              }`}
            >
              {p.username}
            </span>
            <span className={p.total_score >= 0 ? "text-emerald-400" : "text-red-400"}>
              {p.total_score > 0 ? `+${p.total_score}` : p.total_score}
            </span>
          </div>
        ))}
    </div>
  );
}

function GameOverBanner({
  players,
  teamsEnabled,
  teams,
  onNewGame,
}: {
  players: GameState["players"];
  teamsEnabled: boolean;
  teams: number[][];
  onNewGame: () => void;
}) {
  if (teamsEnabled && teams.length > 0) {
    // Team game over
    const teamResults = teams.map((seats, ti) => {
      const members = seats.map((s) => players.find((p) => p.seat === s)).filter(Boolean) as typeof players;
      const score   = members.reduce((n, p) => n + p.total_score, 0);
      return { ti, members, score };
    }).sort((a, b) => b.score - a.score);

    const winner = teamResults[0];
    const color  = TEAM_COLORS[winner.ti % TEAM_COLORS.length];

    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center bg-black/60 border border-yellow-500/30 rounded-2xl px-6 py-5 shadow-2xl max-w-xs w-full"
      >
        <p className="text-4xl mb-2">🏆</p>
        <p className={`text-xl font-bold ${color.text}`}>
          Team {winner.ti + 1} wins!
        </p>
        <p className="text-gray-400 text-xs mt-0.5 mb-4">
          {winner.members.map((p) => p.username).join(" & ")} · {winner.score > 0 ? `+${winner.score}` : winner.score} pts
        </p>
        <div className="space-y-2 mb-5">
          {teamResults.map(({ ti, members, score }, rank) => {
            const c = TEAM_COLORS[ti % TEAM_COLORS.length];
            return (
              <div key={ti} className={`flex justify-between text-sm px-3 py-1.5 rounded-lg ${c.bg} border ${c.border}`}>
                <span className={c.text}>{rank + 1}. Team {ti + 1} — {members.map((p) => p.username).join(" & ")}</span>
                <span className={score >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {score > 0 ? `+${score}` : score}
                </span>
              </div>
            );
          })}
        </div>
        <button
          onClick={onNewGame}
          className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl transition-all"
        >
          New Game →
        </button>
      </motion.div>
    );
  }

  // Solo game over
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  const winner = sorted[0];
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-center bg-black/60 border border-yellow-500/30 rounded-2xl px-6 py-5 shadow-2xl max-w-xs w-full"
    >
      <p className="text-4xl mb-2">🏆</p>
      <p className="text-yellow-400 text-xl font-bold">{winner.username} wins!</p>
      <p className="text-gray-500 text-xs mt-0.5 mb-4">{winner.total_score} points</p>
      <div className="space-y-1.5 mb-5">
        {sorted.map((p, i) => (
          <div key={p.seat} className="flex justify-between text-sm text-gray-300 px-2">
            <span>{i + 1}. {p.username}</span>
            <span className={p.total_score >= 0 ? "text-emerald-400" : "text-red-400"}>
              {p.total_score > 0 ? `+${p.total_score}` : p.total_score}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={onNewGame}
        className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl transition-all"
      >
        New Game →
      </button>
    </motion.div>
  );
}
