"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "./Card";
import Scoreboard from "./Scoreboard";
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
const SUIT_SYMBOL: Record<string, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const SUIT_NAME:   Record<string, string> = { spades: "Spades", hearts: "Hearts", diamonds: "Diamonds", clubs: "Clubs" };
const SUIT_COL:    Record<string, string> = { spades: "text-gray-200", hearts: "text-red-400", diamonds: "text-red-400", clubs: "text-gray-200" };

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
  const [selectedCard,   setSelectedCard]   = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showMenu,       setShowMenu]       = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);

  const me       = state.players.find((p) => p.username === username);
  const myTurn   = !!me && state.players[state.current_player_index]?.username === username;
  const isHost   = state.host_username === username;

  const cardKey = (c: CardType) => `${c.suit}-${c.rank}-${c.deck_id}`;

  const handleCardClick = (card: CardType) => {
    if (!myTurn || state.status !== "playing") return;
    const key = cardKey(card);
    if (selectedCard === key) { onPlayCard(card); setSelectedCard(null); }
    else                      { setSelectedCard(key); }
  };

  const myHand     = (me?.hand ?? []).filter((c) => !c.hidden);
  const sortedHand = [...myHand].sort(
    (a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_VAL[a.rank] - RANK_VAL[b.rank]
  );

  // Teams helpers
  const myTeam     = state.teams_enabled && me ? state.teams[me.team_index] : null;
  const captain    = state.teams_enabled && myTeam
    ? state.players.find((p) => p.seat === myTeam[0])
    : null;
  const iAmCaptain = !state.teams_enabled || (me?.is_captain ?? true);
  const activeBidder = state.status === "bidding"
    ? state.players[state.current_player_index]
    : null;

  // Use small cards if hand is large
  const useSmallCards = myHand.length > 9;

  const isActive = state.status === "bidding" || state.status === "playing";

  return (
    <div
      className="landscape-required min-h-screen flex flex-col select-none"
      style={{ background: "linear-gradient(160deg,#0a1f2e 0%,#0d2b1e 50%,#091209 100%)" }}
    >
      {/* ── Compact header ───────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-3 py-1.5 bg-black/55 border-b border-white/5 shrink-0 z-20">
        {/* Left: logo · code · round · trump */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-yellow-400 font-extrabold text-sm shrink-0">♠</span>
          <span className="bg-black/50 text-gray-300 text-xs px-1.5 py-0.5 rounded font-mono border border-white/10 shrink-0">
            {gameCode}
          </span>
          {state.status !== "finished" && (
            <span className="text-xs shrink-0">
              <span className="text-gray-500">R</span>
              <span className="text-yellow-400 font-bold">{state.current_round}</span>
              <span className="text-gray-700">/{state.max_rounds}</span>
            </span>
          )}
          {/* Trump — always visible, symbol + name */}
          {state.trump_suit && (
            <span className={`flex items-center gap-1 text-xs font-semibold shrink-0 ${SUIT_COL[state.trump_suit]}`}>
              <span className="text-gray-600 font-normal text-[10px]">trump</span>
              <span>{SUIT_SYMBOL[state.trump_suit]}</span>
              <span className="hidden sm:inline">{SUIT_NAME[state.trump_suit]}</span>
            </span>
          )}
        </div>

        {/* Right: scoreboard btn + desktop extras + hamburger */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowScoreboard(true)}
            title="Scoreboard"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-yellow-400 transition-all border border-white/10 text-sm leading-none"
          >
            📊
          </button>

          {/* Desktop inline */}
          <div className="hidden sm:flex items-center gap-2">
            <VoiceChat gameCode={gameCode} username={username} />
            <span className="text-gray-600 text-[11px]">{username}</span>
            {isHost && state.status !== "finished" && (
              <button
                onClick={() => setShowEndConfirm(true)}
                className="text-[10px] text-red-400/70 hover:text-red-400 border border-red-400/20 hover:border-red-400/50 px-1.5 py-0.5 rounded transition-all"
              >
                End
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="sm:hidden p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-base leading-none"
          >
            {showMenu ? "✕" : "☰"}
          </button>
        </div>
      </header>

      {/* ── Mobile menu dropdown ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="sm:hidden overflow-hidden bg-black/75 border-b border-white/5 shrink-0 z-20"
          >
            <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
              <VoiceChat gameCode={gameCode} username={username} />
              <span className="text-gray-500 text-xs flex-1">{username}</span>
              {isHost && state.status !== "finished" && (
                <button
                  onClick={() => { setShowEndConfirm(true); setShowMenu(false); }}
                  className="text-xs text-red-400 border border-red-400/30 px-3 py-1 rounded-lg"
                >
                  End Game
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error toast ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {gameError && (
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            className="bg-red-900/80 border-b border-red-500/30 text-red-300 text-xs text-center py-1 px-4 shrink-0 z-10"
          >
            {gameError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      {state.status === "finished" ? (
        /* Finished: full-center banner */
        <div className="flex-1 flex items-center justify-center p-4">
          <GameOverBanner
            players={state.players}
            teamsEnabled={state.teams_enabled}
            teams={state.teams}
            onNewGame={() => { window.location.href = "/lobby"; }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Opponents — compact strip */}
          <div className="shrink-0 px-2 pt-1 pb-0.5">
            <OtherPlayers
              players={state.players}
              myUsername={username}
              currentPlayerIndex={state.current_player_index}
              teamsEnabled={state.teams_enabled}
            />
          </div>

          {/* ── Split: LEFT = hand · RIGHT = trick + status ─────────────────── */}
          <div className="flex flex-1 gap-2 px-2 pb-1 min-h-0 overflow-hidden">

            {/* LEFT — Your hand */}
            <div className="w-[45%] flex flex-col min-h-0 bg-black/20 rounded-xl border border-white/5 p-2">
              {/* Hand header */}
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <span className="text-gray-400 text-[11px] font-semibold">
                  Your hand
                  <span className="text-gray-600 ml-1">({myHand.length})</span>
                </span>
                {me && me.bid >= 0 && (
                  <span className="text-[11px] text-gray-400">
                    Bid <span className="text-yellow-400 font-bold">{me.bid}</span>
                    {" "}· Won <span className="text-emerald-400 font-bold">{me.tricks_won}</span>
                  </span>
                )}
              </div>

              {/* Cards — flex-wrap, fully visible, no overlap */}
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-wrap gap-1 content-start">
                  {sortedHand.map((card) => (
                    <motion.div
                      key={cardKey(card)}
                      whileTap={myTurn && isActive ? { scale: 0.93 } : {}}
                    >
                      <Card
                        card={card}
                        small={useSmallCards}
                        selected={selectedCard === cardKey(card)}
                        onClick={
                          state.status === "playing" && myTurn
                            ? () => handleCardClick(card)
                            : undefined
                        }
                      />
                    </motion.div>
                  ))}
                  {myHand.length === 0 && (
                    <p className="text-gray-600 text-xs py-4 px-2">No cards left</p>
                  )}
                </div>
              </div>

              {/* Play hint */}
              {state.status === "playing" && myTurn && (
                <p className="text-yellow-300 text-[11px] text-center mt-1.5 shrink-0 font-semibold">
                  {selectedCard ? "Tap again to play →" : "Tap a card to select"}
                </p>
              )}
            </div>

            {/* RIGHT — Trick + status + opponents scroll */}
            <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-0">

              {/* Trick grid — each card fully visible with player label */}
              <TrickGrid
                cards={state.current_trick}
                trumpSuit={state.trump_suit}
                playerCount={state.players.length}
              />

              {/* Status / action area */}
              <div className="w-full max-w-xs flex flex-col items-center gap-1.5">
                {state.status === "bidding" && (
                  <>
                    {myTurn ? (
                      <BidPanel
                        maxBid={state.current_round}
                        onBid={onBid}
                        isCapitain={iAmCaptain}
                        captainUsername={captain?.username}
                      />
                    ) : !iAmCaptain && state.teams_enabled ? (
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
                        className="text-gray-400 text-sm text-center"
                      >
                        {activeBidder?.username} is bidding…
                      </motion.p>
                    )}
                  </>
                )}

                {state.status === "playing" && !myTurn && (
                  <p className="text-gray-600 text-xs text-center">
                    Waiting for {state.players[state.current_player_index]?.username}…
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Score strip ─────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-white/5 bg-black/40 px-3 py-1 overflow-x-auto">
            <MobileScoreStrip
              players={state.players}
              currentPlayerIndex={state.current_player_index}
              myUsername={username}
              teamsEnabled={state.teams_enabled}
              teams={state.teams}
            />
          </div>
        </div>
      )}

      {/* ── Scoreboard modal ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showScoreboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
            onClick={() => setShowScoreboard(false)}
          >
            <motion.div
              initial={{ scale: 0.88, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 16 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-yellow-400 font-bold text-sm">
                  Scoreboard — Round {state.current_round}/{state.max_rounds}
                  {state.trump_suit && (
                    <span className={`ml-2 font-normal text-xs ${SUIT_COL[state.trump_suit]}`}>
                      Trump: {SUIT_SYMBOL[state.trump_suit]} {SUIT_NAME[state.trump_suit]}
                    </span>
                  )}
                </span>
                <button onClick={() => setShowScoreboard(false)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
              </div>
              <Scoreboard
                players={state.players}
                currentPlayerIndex={state.current_player_index}
                myUsername={username}
                teamsEnabled={state.teams_enabled}
                teams={state.teams}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Round Summary ─────────────────────────────────────────────────────── */}
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
    <div className="flex flex-wrap gap-1.5 justify-center">
      {others.map((p) => {
        const isActive  = players[currentPlayerIndex]?.username === p.username;
        const teamColor = teamsEnabled && p.team_index >= 0
          ? TEAM_COLORS[p.team_index % TEAM_COLORS.length]
          : null;

        return (
          <motion.div
            key={p.seat}
            animate={
              isActive
                ? { boxShadow: ["0 0 0 0 rgba(234,179,8,0)", "0 0 10px 2px rgba(234,179,8,0.5)", "0 0 0 0 rgba(234,179,8,0)"] }
                : {}
            }
            transition={{ repeat: Infinity, duration: 1.4 }}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] transition-all
              ${isActive
                ? "border-yellow-400/60 bg-yellow-400/5 text-yellow-300"
                : teamColor
                ? `${teamColor.bg} ${teamColor.border} ${teamColor.text}`
                : "border-white/10 bg-black/20 text-gray-300"}
              ${!p.is_connected ? "opacity-40" : ""}
            `}
          >
            {/* Mini card count */}
            <div className="flex gap-px items-end">
              {Array.from({ length: Math.min(p.hand_count, 6) }).map((_, i) => (
                <div key={i} className="w-1.5 h-3 bg-emerald-800 border border-emerald-600/50 rounded-[1px]" />
              ))}
              {p.hand_count > 6 && <span className="text-gray-600 text-[9px] ml-0.5">+{p.hand_count - 6}</span>}
            </div>
            <span className="font-semibold">
              {p.username}
              {!p.is_connected && " 💤"}
              {teamsEnabled && p.is_captain && <span className="opacity-50 ml-0.5">(C)</span>}
            </span>
            <span className="text-gray-600 text-[9px]">
              B:{p.bid >= 0 ? p.bid : "—"} W:{p.tricks_won}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Clean trick display: every played card is fully visible with player name below it. */
function TrickGrid({
  cards,
  trumpSuit,
  playerCount,
}: {
  cards: GameState["current_trick"];
  trumpSuit: string;
  playerCount: number;
}) {
  if (!cards.length) {
    return (
      <div className="w-full max-w-xs h-24 rounded-xl border-2 border-dashed border-white/8 flex flex-col items-center justify-center gap-1">
        <span className="text-gray-700 text-lg">🂠</span>
        <span className="text-gray-700 text-xs">Waiting for first card…</span>
      </div>
    );
  }

  const sorted = [...cards].sort((a, b) => a.play_order - b.play_order);

  return (
    <div className="w-full max-w-xs">
      <p className="text-gray-600 text-[10px] text-center mb-1.5 uppercase tracking-widest">
        Trick · {cards.length}/{playerCount} cards
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {sorted.map((tc) => {
          const isTrump = tc.suit === trumpSuit;
          return (
            <motion.div
              key={`${tc.suit}-${tc.rank}-${tc.deck_id}-${tc.play_order}`}
              initial={{ scale: 0.4, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="relative">
                {isTrump && (
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full z-10 shadow-sm" />
                )}
                <Card card={{ suit: tc.suit, rank: tc.rank, deck_id: tc.deck_id }} played />
              </div>
              <span className="text-[10px] text-gray-400 max-w-[56px] truncate text-center">
                {tc.player_name}
              </span>
            </motion.div>
          );
        })}
      </div>
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
      <div className="flex gap-3 text-[10px] whitespace-nowrap items-center">
        {teams.map((seats, ti) => {
          const color   = TEAM_COLORS[ti % TEAM_COLORS.length];
          const members = seats.map((s) => players.find((p) => p.seat === s)).filter(Boolean) as typeof players;
          // All team members share the same total_score — use members[0] to avoid doubling
          const score   = members[0]?.total_score ?? 0;
          return (
            <div key={ti} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${color.bg} border ${color.border}`}>
              <span className={`font-bold ${color.text}`}>T{ti + 1}</span>
              <span className="text-gray-500">{members.map((p) => p.username).join(" & ")}</span>
              <span className={`font-bold ml-0.5 ${score >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {score > 0 ? `+${score}` : score}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex gap-3 text-[10px] whitespace-nowrap">
      {[...players].sort((a, b) => b.total_score - a.total_score).map((p) => (
        <div key={p.seat} className="flex items-center gap-1">
          <span className={`font-semibold ${
            p.username === myUsername ? "text-yellow-400"
            : players[currentPlayerIndex]?.username === p.username ? "text-white"
            : "text-gray-400"
          }`}>
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
    const teamResults = teams
      .map((seats, ti) => {
        const members = seats.map((s) => players.find((p) => p.seat === s)).filter(Boolean) as typeof players;
        // All team members share the same total_score — use members[0] to avoid doubling
        const score = members[0]?.total_score ?? 0;
        return { ti, members, score };
      })
      .sort((a, b) => b.score - a.score);

    const winner = teamResults[0];
    const color  = TEAM_COLORS[winner.ti % TEAM_COLORS.length];

    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center bg-black/60 border border-yellow-500/30 rounded-2xl px-6 py-5 shadow-2xl max-w-sm w-full"
      >
        <p className="text-4xl mb-2">🏆</p>
        <p className={`text-xl font-bold ${color.text}`}>Team {winner.ti + 1} wins!</p>
        <p className="text-gray-400 text-xs mt-0.5 mb-4">
          {winner.members.map((p) => p.username).join(" & ")} · {winner.score > 0 ? `+${winner.score}` : winner.score} pts
        </p>
        <div className="space-y-1.5 mb-5">
          {teamResults.map(({ ti, members, score }, rank) => {
            const c = TEAM_COLORS[ti % TEAM_COLORS.length];
            return (
              <div key={ti} className={`flex justify-between text-sm px-3 py-1.5 rounded-lg ${c.bg} border ${c.border}`}>
                <span className={c.text}>{rank + 1}. {members.map((p) => p.username).join(" & ")}</span>
                <span className={score >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {score > 0 ? `+${score}` : score}
                </span>
              </div>
            );
          })}
        </div>
        <button onClick={onNewGame} className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl">
          New Game →
        </button>
      </motion.div>
    );
  }

  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  const winner = sorted[0];
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-center bg-black/60 border border-yellow-500/30 rounded-2xl px-6 py-5 shadow-2xl max-w-sm w-full"
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
      <button onClick={onNewGame} className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl">
        New Game →
      </button>
    </motion.div>
  );
}
