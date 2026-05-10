"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { RoundScore } from "@/lib/types";
import { TEAM_COLORS } from "@/lib/types";

interface Props {
  round: number;
  scores: RoundScore[];
  onClose: () => void;
}

export default function RoundSummary({ round, scores, onClose }: Props) {
  const teamsEnabled = scores.some((s) => s.team_index >= 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.85, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.85, y: 30 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-yellow-400 text-xl font-bold text-center">Round {round} Done!</h2>
          <p className="text-gray-500 text-xs text-center mt-1 mb-5">Tap anywhere to continue</p>

          {teamsEnabled ? (
            <TeamScores scores={scores} />
          ) : (
            <SoloScores scores={scores} />
          )}

          <button
            onClick={onClose}
            className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl transition-all"
          >
            Next Round →
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SoloScores({ scores }: { scores: RoundScore[] }) {
  const sorted = [...scores].sort((a, b) => b.delta - a.delta);
  return (
    <table className="w-full text-sm mb-5">
      <thead>
        <tr className="text-gray-600 text-xs border-b border-white/5">
          <th className="text-left pb-2">Player</th>
          <th className="pb-2 text-center">Bid</th>
          <th className="pb-2 text-center">Won</th>
          <th className="pb-2 text-right">Points</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => (
          <tr key={s.username} className="border-t border-white/5">
            <td className="py-2 text-white font-medium">{s.username}</td>
            <td className="py-2 text-center text-gray-400">{s.bid}</td>
            <td className="py-2 text-center text-gray-400">{s.tricks_won}</td>
            <td className={`py-2 text-right font-bold ${s.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {s.delta > 0 ? `+${s.delta}` : s.delta}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TeamScores({ scores }: { scores: RoundScore[] }) {
  // Group by team_index, sorted by team total desc
  const teamMap = new Map<number, RoundScore[]>();
  for (const s of scores) {
    const ti = s.team_index >= 0 ? s.team_index : 0;
    if (!teamMap.has(ti)) teamMap.set(ti, []);
    teamMap.get(ti)!.push(s);
  }
  const teams = [...teamMap.entries()].sort(
    (a, b) =>
      b[1].reduce((n, s) => n + s.delta, 0) -
      a[1].reduce((n, s) => n + s.delta, 0)
  );

  return (
    <div className="space-y-3 mb-5">
      {teams.map(([ti, members]) => {
        const color      = TEAM_COLORS[ti % TEAM_COLORS.length];
        const teamDelta  = members.reduce((n, s) => n + s.delta, 0);
        const sorted     = [...members].sort((a, b) => b.delta - a.delta);
        return (
          <div key={ti} className={`rounded-xl border ${color.border} ${color.bg} overflow-hidden`}>
            {/* Team header */}
            <div className="flex justify-between items-center px-3 py-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${color.text}`}>Team {ti + 1}</span>
              <span className={`text-sm font-bold ${teamDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {teamDelta > 0 ? `+${teamDelta}` : teamDelta}
              </span>
            </div>
            {/* Members */}
            <table className="w-full text-xs border-t border-white/5">
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.username} className="border-t border-white/5 first:border-0">
                    <td className="px-3 py-1.5 text-gray-300">{s.username}</td>
                    <td className="px-2 py-1.5 text-center text-gray-500">B:{s.bid}</td>
                    <td className="px-2 py-1.5 text-center text-gray-500">W:{s.tricks_won}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${s.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {s.delta > 0 ? `+${s.delta}` : s.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
