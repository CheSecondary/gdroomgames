"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

type Tab = "create" | "join";

interface PlayerOption {
  seat: number;
  username: string;
}

export default function LobbyPage() {
  const router   = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [tab, setTab]           = useState<Tab>("create");

  // Create form
  const [numPlayers, setNumPlayers] = useState(4);
  const [numDecks,   setNumDecks]   = useState(1);
  const [teamsOn,    setTeamsOn]    = useState(false);

  // Join form
  const [joinCode, setJoinCode] = useState("");

  // Spectator player picker (shown when joining a started game)
  const [spectateGame, setSpectateGame] = useState<{ code: string; players: PlayerOption[] } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const teamsAllowed = numPlayers >= 4 && numPlayers % 2 === 0;
  const maxR = Math.floor((52 * numDecks) / numPlayers);

  const [startRound, setStartRound] = useState(1);

  // Rounds picker (default to max)
  const [numRounds, setNumRounds] = useState(maxR);
  // Keep numRounds and startRound in range whenever player/deck count changes
  useEffect(() => {
    const newMaxRounds = Math.min(numRounds, maxR) || maxR;
    setNumRounds(newMaxRounds);
    setStartRound(Math.min(startRound, newMaxRounds) || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxR]);

  useEffect(() => {
    if (startRound > numRounds) {
      setStartRound(numRounds);
    }
  }, [numRounds]);

  useEffect(() => {
    const saved = localStorage.getItem("os_username");
    if (!saved) { router.push("/"); return; }
    setUsername(saved);
  }, [router]);

  // Reset teams if it becomes disallowed
  useEffect(() => {
    if (!teamsAllowed) setTeamsOn(false);
  }, [teamsAllowed]);

  async function create() {
    if (!username) return;
    setError(""); setLoading(true);
    try {
      const game = await api.createGame(username, numDecks, numPlayers, teamsOn, numRounds, startRound);
      router.push(`/game/${game.code}`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!username) return;
    setError(""); setLoading(true);
    try {
      const data = await api.joinGame(username, joinCode.trim().toUpperCase());
      if ((data as any).game_started) {
        // Game already started — show spectator player picker
        setSpectateGame({ code: (data as any).game_code, players: (data as any).players });
      } else {
        router.push(`/game/${(data as any).code}`);
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function spectatePlayer(seat: number) {
    if (!spectateGame) return;
    router.push(`/game/${spectateGame.code}?spectate=${seat}`);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at center,#1a4731 0%,#0d2b1e 60%,#091a12 100%)" }}
    >
      {/* Logo */}
      <motion.div initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center mb-7">
        <h1 className="text-4xl font-extrabold text-yellow-400 tracking-tight">♠ OpenSpades</h1>
        {username && (
          <p className="text-gray-400 mt-1 text-sm">
            Hey <span className="text-white font-semibold">{username}</span> 👋
          </p>
        )}
      </motion.div>

      <motion.div
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.07 }}
        className="bg-gray-900/85 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
      >
        {/* Tab toggle */}
        <div className="flex rounded-xl bg-black/30 p-1 mb-6">
          {(["create", "join"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all capitalize ${
                tab === t ? "bg-yellow-400 text-gray-900" : "text-gray-400 hover:text-white"
              }`}
            >
              {t === "create" ? "Create Room" : "Join Room"}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "create" ? (
            <motion.div key="create" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}>
              {/* Players */}
              <label className="block text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                Players
              </label>
              <div className="grid grid-cols-7 gap-1.5 mb-5">
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNumPlayers(n)}
                    className={`py-2 rounded-xl font-bold text-sm transition-all ${
                      numPlayers === n
                        ? "bg-yellow-400 text-gray-900"
                        : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {/* Decks */}
              <label className="block text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                Deck Size
              </label>
              <div className="flex gap-2 mb-5">
                {[1, 2].map((d) => (
                  <button
                    key={d}
                    onClick={() => setNumDecks(d)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                      numDecks === d
                        ? "bg-yellow-400 text-gray-900 border-yellow-400"
                        : "bg-white/5 text-gray-400 border-white/10 hover:text-white"
                    }`}
                  >
                    {d === 1 ? "1 Deck (52 cards)" : "2 Decks (104 cards)"}
                  </button>
                ))}
              </div>

              {/* Start Round */}
              <label className="block text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                Start Round
                <span className="ml-2 text-yellow-400 font-bold normal-case tracking-normal">
                  Round {startRound}
                </span>
                <span className="ml-1 text-gray-600 font-normal tracking-normal">({startRound} cards each)</span>
              </label>
              <div className="mb-5">
                <input
                  type="range"
                  min={1}
                  max={numRounds}
                  value={startRound}
                  onChange={(e) => setStartRound(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:bg-yellow-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-600 mt-1">
                  <span>1</span>
                  {numRounds > 2 && <span>{Math.ceil((1 + numRounds) / 2)}</span>}
                  <span>{numRounds}</span>
                </div>
              </div>

              {/* Rounds */}
              <label className="block text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                End Round
                <span className="ml-2 text-yellow-400 font-bold normal-case tracking-normal">
                  Round {numRounds}
                </span>
                <span className="ml-1 text-gray-600 font-normal tracking-normal">/ max {maxR}</span>
              </label>
              <div className="mb-5">
                <input
                  type="range"
                  min={startRound}
                  max={maxR}
                  value={numRounds}
                  onChange={(e) => setNumRounds(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:bg-yellow-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-gray-600 mt-1">
                  <span>{startRound}</span>
                  {maxR > startRound + 1 && <span>{Math.ceil((startRound + maxR) / 2)}</span>}
                  <span>{maxR}</span>
                </div>
              </div>

              {/* Teams — Solo / Teams buttons, same pattern as Deck Size */}
              <label className={`block text-xs font-semibold uppercase tracking-widest mb-2 transition-opacity ${teamsAllowed ? "text-gray-400" : "text-gray-600"}`}>
                Mode {!teamsAllowed && <span className="text-gray-700 font-normal normal-case tracking-normal">(teams need even ≥ 4 players)</span>}
              </label>
              <div className={`flex gap-2 mb-5 transition-opacity ${teamsAllowed ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                {([false, true] as const).map((isTeam) => (
                  <button
                    key={String(isTeam)}
                    onClick={() => teamsAllowed && setTeamsOn(isTeam)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all border ${
                      teamsOn === isTeam && teamsAllowed
                        ? "bg-yellow-400 text-gray-900 border-yellow-400"
                        : "bg-white/5 text-gray-400 border-white/10 hover:text-white"
                    }`}
                  >
                    {isTeam
                      ? `🤝 Teams (${numPlayers / 2}v${numPlayers / 2})`
                      : "Solo"}
                  </button>
                ))}
              </div>

              {/* Info strip */}
              <div className="bg-black/30 rounded-xl px-3 py-2 mb-5 text-xs text-gray-500 space-y-0.5">
                <p>Rounds: <span className="text-gray-300">{startRound} → {numRounds} ({numRounds - startRound + 1} rounds total)</span></p>
                <p>Players: <span className="text-gray-300">{numPlayers} expected</span></p>
                {numRounds < maxR && (
                  <p className="text-amber-500">
                    Game ends after round {numRounds} (not all {maxR} rounds)
                  </p>
                )}
                {numDecks === 2 && numPlayers > 2 && (
                  <p className="text-amber-600">
                    Round {maxR}: {maxR * numPlayers} cards from 104 ({104 - maxR * numPlayers} discarded)
                  </p>
                )}
              </div>

              <button
                onClick={create}
                disabled={loading}
                className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-gray-900 font-extrabold py-3 rounded-xl transition-all"
              >
                {loading ? "Creating…" : "Create Room →"}
              </button>
            </motion.div>
          ) : (
            <motion.div key="join" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <form onSubmit={join} className="flex flex-col gap-4">
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                    Room Code
                  </label>
                  <input
                    type="text"
                    placeholder="ABCDEF"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    maxLength={6}
                    required
                    autoComplete="off"
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || joinCode.length !== 6}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold py-3 rounded-xl transition-all"
                >
                  {loading ? "Joining…" : "Join Room →"}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-400 text-sm text-center mt-3"
          >
            {error}
          </motion.p>
        )}
      </motion.div>

      <button
        onClick={() => { localStorage.removeItem("os_username"); router.push("/"); }}
        className="text-gray-700 hover:text-gray-500 text-xs mt-5 transition-colors"
      >
        ← Change name
      </button>

      {/* Spectator player picker overlay */}
      <AnimatePresence>
        {spectateGame && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h2 className="text-white font-bold text-lg mb-1">Game already started</h2>
              <p className="text-gray-400 text-sm mb-5">
                Pick a player to watch. They&apos;ll need to accept your peek request.
              </p>
              <div className="flex flex-col gap-2">
                {spectateGame.players.map((p) => (
                  <button
                    key={p.seat}
                    onClick={() => spectatePlayer(p.seat)}
                    className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 text-left transition-all"
                  >
                    <span className="text-gray-500 font-mono text-xs">#{p.seat + 1}</span>
                    <span className="text-white font-semibold">{p.username}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSpectateGame(null)}
                className="w-full mt-4 text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
