"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";

type Tab = "create" | "join";

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

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const teamsAllowed = numPlayers >= 4 && numPlayers % 2 === 0;

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
      const game = await api.createGame(username, numDecks, numPlayers, teamsOn);
      router.push(`/game/${game.code}`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!username) return;
    setError(""); setLoading(true);
    try {
      const game = await api.joinGame(username, joinCode.trim().toUpperCase());
      router.push(`/game/${game.code}`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  const maxR = Math.floor((52 * numDecks) / numPlayers);

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
              <div className="grid grid-cols-6 gap-1.5 mb-5">
                {[2, 3, 4, 5, 6, 7].map((n) => (
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

              {/* Teams toggle (only for even ≥ 4) */}
              <div className={`mb-5 transition-opacity ${teamsAllowed ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                <label className="block text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                  Teams {!teamsAllowed && "(need even players ≥ 4)"}
                </label>
                <button
                  onClick={() => teamsAllowed && setTeamsOn(!teamsOn)}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all border ${
                    teamsOn
                      ? "bg-emerald-500/30 text-emerald-300 border-emerald-500/50"
                      : "bg-white/5 text-gray-500 border-white/10"
                  }`}
                >
                  {teamsOn
                    ? `✓ Teams on — ${numPlayers / 2} teams of 2`
                    : "No teams (solo)"}
                </button>
              </div>

              {/* Info strip */}
              <div className="bg-black/30 rounded-xl px-3 py-2 mb-5 text-xs text-gray-500 space-y-0.5">
                <p>Rounds: <span className="text-gray-300">1 → {maxR} cards each</span></p>
                <p>Players: <span className="text-gray-300">{numPlayers} expected</span></p>
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
    </div>
  );
}
