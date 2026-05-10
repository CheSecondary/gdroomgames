"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import type { GameState } from "@/lib/types";

interface Props {
  state: GameState;
  username: string;
  gameCode: string;
  onStartGame: () => void;
}

export default function WaitingRoom({ state, username, gameCode, onStartGame }: Props) {
  const [copied, setCopied] = useState(false);

  const isHost   = state.host_username === username;
  const joined   = state.players.length;
  const expected = state.expected_players;
  const canStart = joined >= 2;

  function copyCode() {
    navigator.clipboard.writeText(gameCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Build seat slots 0…expected-1
  const seats = Array.from({ length: expected }, (_, i) => ({
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
            const isMe   = player?.username === username;
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
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold shadow
                        ${isMe ? "bg-yellow-400 text-gray-900" : "bg-white/20 text-white"}`}
                    >
                      {player.username[0].toUpperCase()}
                    </div>
                    <span
                      className={`text-[10px] font-semibold truncate w-full text-center px-0.5
                        ${isMe ? "text-yellow-300" : "text-gray-300"}`}
                    >
                      {isMe ? "You" : player.username}
                    </span>
                    {isHost_ && (
                      <span className="text-[9px] text-yellow-500 font-bold leading-none">HOST</span>
                    )}
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

        {state.teams_enabled && (
          <p className="text-gray-600 text-[11px] text-center mt-2">
            Teams assigned randomly when game starts
          </p>
        )}
      </motion.div>

      {/* ── Start / Waiting ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col items-center gap-2"
      >
        {isHost ? (
          <>
            <motion.button
              whileHover={canStart ? { scale: 1.06 } : {}}
              whileTap={canStart ? { scale: 0.96 } : {}}
              onClick={onStartGame}
              disabled={!canStart}
              className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-extrabold px-14 py-3.5 rounded-full text-lg shadow-xl shadow-yellow-400/20 transition-all"
            >
              Start Game →
            </motion.button>

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
    </div>
  );
}
