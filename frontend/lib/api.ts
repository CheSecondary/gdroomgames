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
  ) =>
    req("/api/game/create/", {
      method: "POST",
      body: JSON.stringify({ username, num_decks, expected_players, teams_enabled }),
    }),

  joinGame: (username: string, code: string) =>
    req("/api/game/join/", { method: "POST", body: JSON.stringify({ username, code }) }),

  getGame: (code: string) => req(`/api/game/${code}/`),
};
