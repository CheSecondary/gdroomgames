const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  createGame: (
    username: string,
    num_decks: number,
    expected_players: number,
    teams_enabled: boolean,
    num_rounds: number,       // 0 = use formula max
    start_round: number = 1,
  ) =>
    req("/api/game/create/", {
      method: "POST",
      body: JSON.stringify({ username, num_decks, expected_players, teams_enabled, num_rounds, start_round }),
    }),

  joinGame: (username: string, code: string) =>
    req("/api/game/join/", { method: "POST", body: JSON.stringify({ username, code }) }),

  getGame: (code: string) => req(`/api/game/${code}/`),

  resumeFromExport: (username: string, content: string) =>
    req("/api/game/resume-export/", {
      method: "POST",
      body: JSON.stringify({ username, content }),
    }),
};
