"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GameState } from "@/lib/types";
import type { GameStartOverrides } from "@/lib/useGameSocket";

interface Props {
  state: GameState;
  username: string;
  gameCode: string;
  onStartGame: (overrides?: GameStartOverrides) => void;
  onCancelGame: () => void;
}

// Mirrors engine.assign_teams: seat i pairs with seat i+half
function previewTeams(order: string[]): string[][] {
  const half = Math.floor(order.length / 2);
  return Array.from({ length: half }, (_, i) => [order[i], order[i + half]].filter(Boolean));
}

export default function WaitingRoom({ state, username, gameCode, onStartGame, onCancelGame }: Props) {
  const [copied,            setCopied]            = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showControls,      setShowControls]      = useState(false);

  // ── Manual control state ───────────────────────────────────────────────────
  const joinedUsernames = [...state.players].sort((a, b) => a.seat - b.seat).map(p => p.username);

  const [playerOrder, setPlayerOrder] = useState<string[]>(joinedUsernames);
  const [leadSeat,    setLeadSeat]    = useState(0);
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});

  // Sync playerOrder when new players join (append newcomers to end)
  useEffect(() => {
    const current = [...state.players].sort((a, b) => a.seat - b.seat).map(p => p.username);
    setPlayerOrder(prev => {
      const prevSet = new Set(prev);
      const added   = current.filter(u => !prevSet.has(u));
      const still   = prev.filter(u => current.includes(u));
      return [...still, ...added];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.players.length]);

  // Keep leadSeat valid when order shrinks
  useEffect(() => {
    if (leadSeat >= playerOrder.length) setLeadSeat(0);
  }, [playerOrder.length, leadSeat]);

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= playerOrder.length) return;
    const next = [...playerOrder];
    [next[idx], next[target]] = [next[target], next[idx]];
    setPlayerOrder(next);
  }

  function handleStart() {
    const overrides: GameStartOverrides = {};

    // Only send seat_order if host actually changed something
    const defaultOrder = [...state.players].sort((a, b) => a.seat - b.seat).map(p => p.username);
    const orderChanged = playerOrder.some((u, i) => u !== defaultOrder[i]);
    if (orderChanged || leadSeat !== 0) {
      overrides.seatOrder       = playerOrder;
      overrides.leadPlayerIndex = leadSeat;
    }

    const scores: Record<string, number> = {};
    for (const [u, v] of Object.entries(scoreInputs)) {
      const n = parseInt(v);
      if (!isNaN(n) && n !== 0) scores[u] = n;
    }
    if (Object.keys(scores).length > 0) overrides.scoreOverride = scores;

    onStartGame(Object.keys(overrides).length > 0 ? overrides : undefined);
  }

  const isHost   = state.host_username === username;
  const joined   = state.players.length;
  const expected = state.expected_players;
  const canStart = joined >= 2;

  const teams        = state.teams_enabled ? previewTeams(playerOrder) : [];
  const TEAM_COLORS  = ["text-red-400", "text-blue-400", "text-emerald-400", "text-amber-400"];

  function copyCode() {
    navigator.clipboard.writeText(gameCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Build seat slots 0…expected-1
  const seats    = Array.from({ length: expected }, (_, i) => ({
    seat: i,
    player: state.players.find((p) => p.seat === i) ?? null,
  }));
  const colsClass = expected <= 4 ? "grid-cols-4" : expected <= 6 ? "grid-cols-3" : "grid-cols-4";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-5 p-4"
      style={{ background: "radial-gradient(ellipse at center,#1a4731 0%,#0d2b1e 60%,#091a12 100%)" }}
    >
      {/* ── Logo ──────────────────────────────────────────────────────────────── */}
      <motion.div initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
        <h1 className="text-3xl font-extrabold text-yellow-400 tracking-tight">♠ OpenSpades</h1>
        <p className="text-gray-500 text-sm mt-1">Waiting for players…</p>
      </motion.div>

      {/* ── Room code card ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.08 }}
        className="bg-black/50 border border-white/10 rounded-2xl px-6 py-4 text-center w-full max-w-sm shadow-xl"
      >
        <p className="text-gray-500 text-[11px] uppercase tracking-widest mb-1">Room Code</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl font-black font-mono text-white tracking-[0.35em]">{gameCode}</span>
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={copyCode}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 transition-all font-semibold border border-white/10"
          >
            {copied ? "✓ Copied!" : "Copy"}
          </motion.button>
        </div>
        <p className="text-gray-600 text-xs mt-2">Share this code with your friends</p>
      </motion.div>

      {/* ── Player seats ──────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="bg-gray-900/85 border border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-2xl"
      >
        <div className="flex justify-between items-center mb-4">
          <span className="text-gray-400 text-xs uppercase tracking-widest font-semibold">Players</span>
          <span className="text-gray-400 text-xs">
            <span className="text-white font-bold">{joined}</span>
            <span className="text-gray-600"> / {expected}</span>
          </span>
        </div>

        <div className={`grid ${colsClass} gap-2.5`}>
          {seats.map(({ seat, player }) => {
            const isMe    = player?.username === username;
            const isHost_ = player?.username === state.host_username;
            return (
              <motion.div
                key={seat}
                initial={{ scale: 0.75, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.04 * seat, type: "spring", stiffness: 260, damping: 20 }}
                className={`
                  flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 border transition-all
                  ${player
                    ? isMe
                      ? "bg-yellow-400/10 border-yellow-400/50"
                      : "bg-white/5 border-white/15"
                    : "bg-black/20 border-white/5 border-dashed"
                  }
                `}
              >
                {player ? (
                  <>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold shadow ${isMe ? "bg-yellow-400 text-gray-900" : "bg-white/20 text-white"}`}>
                      {player.username[0].toUpperCase()}
                    </div>
                    <span className={`text-[10px] font-semibold truncate w-full text-center px-0.5 ${isMe ? "text-yellow-300" : "text-gray-300"}`}>
                      {isMe ? "You" : player.username}
                    </span>
                    {isHost_ && <span className="text-[9px] text-yellow-500 font-bold leading-none">HOST</span>}
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center">
                      <motion.span
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2.2, delay: seat * 0.3 }}
                        className="text-gray-600 text-sm font-bold"
                      >
                        ?
                      </motion.span>
                    </div>
                    <span className="text-[10px] text-gray-700">Empty</span>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Settings strip */}
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-2 justify-center text-[11px] text-gray-500">
          <span className="bg-black/30 rounded-md px-2 py-1 border border-white/5">
            {state.num_decks === 1 ? "1 Deck" : "2 Decks"}
          </span>
          <span className="bg-black/30 rounded-md px-2 py-1 border border-white/5">
            {Math.floor((52 * state.num_decks) / expected)} max rounds
          </span>
          {state.teams_enabled && (
            <span className="bg-emerald-500/15 text-emerald-400 rounded-md px-2 py-1 border border-emerald-500/25">
              🤝 Teams on
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Manual game controls (host only, collapsible) ─────────────────────── */}
      {isHost && canStart && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="w-full max-w-sm"
        >
          <button
            onClick={() => setShowControls(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white text-xs font-semibold transition-all"
          >
            <span>⚙ Game Controls <span className="text-gray-600 font-normal">(seat order · first bidder · starting scores)</span></span>
            <span className="text-gray-600">{showControls ? "▲" : "▼"}</span>
          </button>

          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="bg-gray-900/80 border border-white/10 border-t-0 rounded-b-xl p-4 space-y-5">

                  {/* ── Seat order ──────────────────────────────────────────── */}
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">
                      Seat Order
                      <span className="ml-1.5 text-gray-700 normal-case tracking-normal font-normal">
                        {state.teams_enabled ? "· controls team pairings" : "· controls play order"}
                      </span>
                    </p>
                    <div className="space-y-1.5">
                      {playerOrder.map((uname, idx) => {
                        const teamIdx   = teams.findIndex(t => t.includes(uname));
                        const teamColor = teamIdx >= 0 ? TEAM_COLORS[teamIdx % TEAM_COLORS.length] : "text-gray-400";
                        return (
                          <div key={uname} className="flex items-center gap-2 bg-black/30 rounded-lg px-2.5 py-1.5 border border-white/5">
                            <span className="text-gray-600 font-mono text-[10px] w-5 text-center shrink-0">#{idx + 1}</span>
                            <span className={`flex-1 text-sm font-semibold ${teamColor}`}>
                              {uname}
                              {uname === username && <span className="text-gray-600 font-normal text-[10px] ml-1">(you)</span>}
                            </span>
                            {teamIdx >= 0 && (
                              <span className={`text-[10px] font-semibold ${teamColor}`}>T{teamIdx + 1}</span>
                            )}
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => move(idx, -1)}
                                disabled={idx === 0}
                                className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/15 disabled:opacity-20 text-gray-300 text-[11px] font-bold transition-all"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => move(idx, 1)}
                                disabled={idx === playerOrder.length - 1}
                                className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/15 disabled:opacity-20 text-gray-300 text-[11px] font-bold transition-all"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Team preview */}
                    {state.teams_enabled && teams.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {teams.map((members, ti) => (
                          <span key={ti} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${TEAM_COLORS[ti % TEAM_COLORS.length]}`}>
                            T{ti + 1}: {members.join(" & ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── First bidder ─────────────────────────────────────────── */}
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-2">First Bidder</p>
                    <div className="flex flex-wrap gap-1.5">
                      {playerOrder.map((uname, idx) => (
                        <button
                          key={uname}
                          onClick={() => setLeadSeat(idx)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                            leadSeat === idx
                              ? "bg-yellow-400 text-gray-900 border-yellow-400"
                              : "bg-white/5 text-gray-400 border-white/10 hover:text-white"
                          }`}
                        >
                          #{idx + 1} {uname}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Starting scores ──────────────────────────────────────── */}
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-1">
                      Starting Scores
                      <span className="ml-1.5 text-gray-700 normal-case tracking-normal font-normal">optional · for resuming a past game</span>
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {playerOrder.map((uname) => (
                        <div key={uname} className="flex items-center gap-1.5 bg-black/30 rounded-lg px-2.5 py-1.5 border border-white/5">
                          <span className="text-gray-400 text-xs font-semibold flex-1 truncate">{uname}</span>
                          <input
                            type="number"
                            value={scoreInputs[uname] ?? ""}
                            onChange={e => setScoreInputs(prev => ({ ...prev, [uname]: e.target.value }))}
                            placeholder="0"
                            className="w-16 bg-black/40 border border-white/10 rounded-md px-1.5 py-0.5 text-white text-xs text-right font-mono focus:outline-none focus:border-yellow-400/50 transition-colors"
                          />
                        </div>
                      ))}
                    </div>
                    {state.teams_enabled && (
                      <p className="text-[10px] text-gray-700 mt-1.5">
                        Teams share scores — give both teammates the same value.
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Start / Waiting ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col items-center gap-2"
      >
        {isHost ? (
          <>
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={canStart ? { scale: 1.06 } : {}}
                whileTap={canStart ? { scale: 0.96 } : {}}
                onClick={handleStart}
                disabled={!canStart}
                className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-extrabold px-10 py-3.5 rounded-full text-lg shadow-xl shadow-yellow-400/20 transition-all"
              >
                Start Game →
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowCancelConfirm(true)}
                className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white font-semibold px-4 py-3.5 rounded-full text-sm transition-all border border-red-500/30"
              >
                Cancel Room
              </motion.button>
            </div>

            {!canStart && (
              <p className="text-gray-600 text-xs">Need at least 2 players to start</p>
            )}
            {canStart && joined < expected && (
              <p className="text-gray-500 text-xs">
                {expected - joined} seat{expected - joined !== 1 ? "s" : ""} still empty — you can still start!
              </p>
            )}
            {canStart && joined >= expected && (
              <p className="text-emerald-500 text-xs font-semibold">All players ready!</p>
            )}
          </>
        ) : (
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-gray-400 text-sm text-center"
          >
            Waiting for{" "}
            <span className="text-white font-semibold">{state.host_username}</span>{" "}
            to start…
          </motion.p>
        )}
      </motion.div>

      <p className="text-gray-700 text-xs">
        Logged in as <span className="text-gray-500 font-medium">{username}</span>
      </p>

      {/* ── Cancel confirm modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCancelConfirm && (
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
              <p className="text-white font-bold text-lg mb-2">Cancel Room?</p>
              <p className="text-gray-400 text-sm mb-6">This will permanently delete this room and kick everyone out to the lobby.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-semibold transition-all"
                >
                  Go Back
                </button>
                <button
                  onClick={() => { onCancelGame(); setShowCancelConfirm(false); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-all"
                >
                  Cancel Room
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
