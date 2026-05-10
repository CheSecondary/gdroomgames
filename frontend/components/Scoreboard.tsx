"use client";
import type { PlayerState } from "@/lib/types";
import { TEAM_COLORS } from "@/lib/types";

interface Props {
  players: PlayerState[];
  currentPlayerIndex: number;
  myUsername: string;
  teamsEnabled?: boolean;
  teams?: number[][];
}

export default function Scoreboard({
  players,
  currentPlayerIndex,
  myUsername,
  teamsEnabled = false,
  teams = [],
}: Props) {
  const activeUsername = players[currentPlayerIndex]?.username;

  if (teamsEnabled && teams.length > 0) {
    return <TeamScoreboard players={players} teams={teams} myUsername={myUsername} activeUsername={activeUsername} />;
  }

  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);

  return (
    <div className="bg-black/40 rounded-xl border border-white/10 overflow-hidden">
      <div className="px-3 py-2 bg-black/30 border-b border-white/10">
        <span className="text-yellow-400 font-semibold text-xs uppercase tracking-widest">Scoreboard</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-600 text-xs">
            <th className="text-left px-3 py-1">Player</th>
            <th className="px-2 py-1 text-center">Bid</th>
            <th className="px-2 py-1 text-center">Won</th>
            <th className="px-2 py-1 text-right pr-3">Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const isActive = p.username === activeUsername;
            const isMe     = p.username === myUsername;
            return (
              <tr key={p.seat} className={`border-t border-white/5 ${isActive ? "bg-yellow-400/8" : ""}`}>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />}
                    <span
                      className={`font-medium truncate max-w-[80px] ${isMe ? "text-yellow-300" : p.is_connected ? "text-white" : "text-gray-600"}`}
                      title={p.username}
                    >
                      {p.username}
                    </span>
                    {isMe && <span className="text-gray-600 text-[10px]">(you)</span>}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{p.bid >= 0 ? p.bid : "—"}</td>
                <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{p.tricks_won}</td>
                <td className={`px-3 py-1.5 text-right font-bold text-sm ${scoreColor(p.total_score)}`}>
                  {p.total_score > 0 ? `+${p.total_score}` : p.total_score}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function scoreColor(n: number) {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-red-400";
  return "text-gray-400";
}

function TeamScoreboard({
  players,
  teams,
  myUsername,
  activeUsername,
}: {
  players: PlayerState[];
  teams: number[][];
  myUsername: string;
  activeUsername?: string;
}) {
  return (
    <div className="bg-black/40 rounded-xl border border-white/10 overflow-hidden">
      <div className="px-3 py-2 bg-black/30 border-b border-white/10">
        <span className="text-yellow-400 font-semibold text-xs uppercase tracking-widest">Scoreboard</span>
      </div>

      {teams.map((teamSeats, ti) => {
        const color       = TEAM_COLORS[ti % TEAM_COLORS.length];
        const teamPlayers = teamSeats
          .map((seat) => players.find((p) => p.seat === seat))
          .filter(Boolean) as PlayerState[];
        const teamScore   = teamPlayers.reduce((s, p) => s + p.total_score, 0);
        const teamTricks  = teamPlayers.reduce((s, p) => s + p.tricks_won, 0);
        const captain     = teamPlayers.find((p) => p.is_captain);

        return (
          <div key={ti} className={`border-b border-white/5 last:border-0 ${color.bg} ${color.border} border-l-2`}>
            {/* Team header */}
            <div className="flex justify-between items-center px-3 py-1.5">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${color.text}`}>
                Team {ti + 1}
                {captain && (
                  <span className="ml-1 text-gray-500 font-normal normal-case tracking-normal">
                    · {captain.username}
                    {captain.bid >= 0 && ` bid ${captain.bid}`}
                  </span>
                )}
              </span>
              <span className={`text-xs font-bold ${scoreColor(teamScore)}`}>
                {teamScore > 0 ? `+${teamScore}` : teamScore}
              </span>
            </div>

            {/* Team members */}
            <table className="w-full text-xs mb-1">
              <tbody>
                {teamPlayers.map((p) => {
                  const isActive = p.username === activeUsername;
                  const isMe     = p.username === myUsername;
                  return (
                    <tr key={p.seat} className={`${isActive ? "bg-yellow-400/8" : ""}`}>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-1.5">
                          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />}
                          <span className={`truncate max-w-[70px] ${isMe ? "text-yellow-300 font-semibold" : "text-gray-300"}`}>
                            {p.username}
                          </span>
                          {isMe && <span className="text-gray-600 text-[9px]">(you)</span>}
                          {p.is_captain && <span className={`text-[9px] font-bold ${color.text}`}>C</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1 text-center text-gray-500">
                        {p.bid >= 0 ? p.bid : "—"}
                      </td>
                      <td className="px-2 py-1 text-center text-gray-500">{p.tricks_won}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
