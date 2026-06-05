"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { GameState, Card, RoundScore } from "./types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
  isSpectator?: boolean;
}

export type PeekStatus     = "idle" | "pending" | "accepted" | "declined";
export type TakeoverStatus = "idle" | "pending" | "declined";

export interface Reaction {
  id: string;
  username: string;
  seat: number;
  emoji: string;
}

export const REACTION_EMOJIS = ["🔥", "😂", "💀", "👏", "😤", "🎉"] as const;

export interface GameStartOverrides {
  seatOrder?: string[];
  leadPlayerIndex?: number;
  scoreOverride?: Record<string, number>;
}

export function useGameSocket(gameCode: string, username: string, spectateSeat?: number, takeoverSeat?: number) {
  const ws = useRef<WebSocket | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [roundSummary, setRoundSummary] = useState<{ round: number; scores: RoundScore[] } | null>(null);
  const [trickWinner, setTrickWinner] = useState<{ winner: string; seat: number } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatToasts, setChatToasts]     = useState<ChatMessage[]>([]);
  const [reactions, setReactions]       = useState<Reaction[]>([]);
  const [rematchInvite, setRematchInvite] = useState<{ code: string; host: string } | null>(null);
  const [peekStatus, setPeekStatus] = useState<PeekStatus>("idle");
  const [peekRequest, setPeekRequest] = useState<{ spectator: string; targetSeat: number } | null>(null);
  const [takeoverStatus, setTakeoverStatus] = useState<TakeoverStatus>("idle");
  const [takeoverRequest, setTakeoverRequest] = useState<{ requester: string; targetSeat: number } | null>(null);
  const [handedOff, setHandedOff] = useState<{ to: string; from: string; seat: number } | null>(null);

  useEffect(() => {
    if (!username) return;
    let socket: WebSocket;
    let timeout: NodeJS.Timeout;

    const connect = () => {
      const spectateParam = spectateSeat !== undefined ? `&spectate=${spectateSeat}` : "";
      const url = `${WS_BASE}/ws/game/${gameCode}/?username=${encodeURIComponent(username)}${spectateParam}`;
      socket = new WebSocket(url);
      ws.current = socket;

      socket.onopen = () => { setConnected(true); setError(null); };
      socket.onclose = () => {
        setConnected(false);
        // Auto-reconnect after 2 seconds if disconnected (e.g., mobile browser slept)
        timeout = setTimeout(connect, 2000);
      };
      socket.onerror = () => setError("Connection lost — check the server is running.");

      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "state") {
          setState(msg);
          if (msg.current_trick && msg.current_trick.length === 0) {
            setTrickWinner(null);
          }
        } else if (msg.type === "error") {
          setError(msg.message);
          setTimeout(() => setError(null), 3000);
        } else if (msg.type === "round_ended") {
          setRoundSummary({ round: msg.round, scores: msg.scores });
        } else if (msg.type === "trick_winner") {
          setTrickWinner({ winner: msg.winner, seat: msg.seat });
        } else if (msg.type === "chat_message") {
          const entry: ChatMessage = {
            id: Math.random().toString(36).substring(2, 9),
            username: msg.username,
            message: msg.message,
            timestamp: new Date(),
            isSpectator: msg.is_spectator ?? false,
          };
          setChatMessages((prev) => [...prev, entry]);
          // Show toast popup — auto-removed after 4s
          setChatToasts((prev) => [...prev.slice(-2), entry]); // keep max 3
          setTimeout(() => {
            setChatToasts((prev) => prev.filter((t) => t.id !== entry.id));
          }, 4000);
        } else if (msg.type === "reaction") {
          const r: Reaction = {
            id: Math.random().toString(36).substring(2, 9),
            username: msg.username,
            seat:     msg.seat,
            emoji:    msg.emoji,
          };
          setReactions((prev) => [...prev, r]);
          setTimeout(() => {
            setReactions((prev) => prev.filter((x) => x.id !== r.id));
          }, 2500);
        } else if (msg.type === "rematch_invite") {
          setRematchInvite({ code: msg.new_code, host: msg.host });
        } else if (msg.type === "peek_requested") {
          setPeekRequest({ spectator: msg.spectator, targetSeat: msg.target_seat });
        } else if (msg.type === "peek_response") {
          if (msg.spectator === username) {
            setPeekStatus(msg.accepted ? "accepted" : "declined");
          }
        } else if (msg.type === "takeover_requested") {
          setTakeoverRequest({ requester: msg.requester, targetSeat: msg.target_seat });
        } else if (msg.type === "takeover_response") {
          if (msg.requester === username) {
            setTakeoverStatus(msg.accepted ? "idle" : "declined");
          }
        } else if (msg.type === "ownership_transferred") {
          // Always set handedOff — GameBoard uses it for toasts for ALL players
          setHandedOff({ to: msg.to_username, from: msg.from_username, seat: msg.seat });
          if (msg.to_username === username) {
            setTakeoverStatus("idle"); // accepted — now a normal player
            setTakeoverRequest(null);
          }
        } else if (msg.type === "player_kicked") {
          if (msg.username === username) {
            window.location.href = "/lobby";
          }
        } else if (msg.type === "game_cancelled") {
          window.location.href = "/lobby";
        }
      };
    };

    connect();

    // Ping Render backend every 3 minutes to prevent free-tier from sleeping during a long game
    // WebSockets don't count as HTTP traffic for Render's 15-minute inactivity timeout.
    const pingInterval = setInterval(async () => {
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        await fetch(`${API_BASE}/api/game/health/`, { cache: 'no-store' });
      } catch {}
    }, 3 * 60 * 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(pingInterval);
      if (socket) {
        socket.onclose = null; // Prevent auto-reconnect on unmount
        socket.close();
      }
    };
  }, [gameCode, username, spectateSeat, takeoverSeat]);

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  const startGame    = useCallback((overrides?: GameStartOverrides) => send({
    action: "start_game",
    ...(overrides?.seatOrder        && { seat_order: overrides.seatOrder }),
    ...(overrides?.leadPlayerIndex != null && { lead_player_index: overrides.leadPlayerIndex }),
    ...(overrides?.scoreOverride    && { score_override: overrides.scoreOverride }),
  }), [send]);
  const cancelGame   = useCallback(() => send({ action: "cancel_game" }), [send]);
  const kickPlayer   = useCallback((targetUsername: string) => send({ action: "kick_player", target_username: targetUsername }), [send]);
  const placeBid     = useCallback((bid: number) => send({ action: "place_bid", bid }), [send]);
  const playCard     = useCallback((card: Card) => send({ action: "play_card", card }), [send]);
  const endGame      = useCallback(() => send({ action: "end_game" }), [send]);
  const clearSummary = useCallback(() => setRoundSummary(null), []);
  const sendChat      = useCallback((message: string) => send({ action: "send_chat", message }), [send]);
  const sendReaction  = useCallback((emoji: string)  => send({ action: "send_reaction", emoji }), [send]);
  const rematch       = useCallback(() => send({ action: "rematch" }), [send]);
  const dismissRematch = useCallback(() => setRematchInvite(null), []);
  const extendGame   = useCallback(() => send({ action: "extend_game" }), [send]);
  const finishGame   = useCallback(() => send({ action: "finish_game" }), [send]);
  const requestPeek     = useCallback((targetSeat: number) => {
    setPeekStatus("pending");
    send({ action: "request_peek", target_seat: targetSeat });
  }, [send]);
  const acceptPeek      = useCallback((spectator: string) => {
    send({ action: "accept_peek", spectator });
    setPeekRequest(null);
  }, [send]);
  const declinePeek     = useCallback((spectator: string) => {
    send({ action: "decline_peek", spectator });
    setPeekRequest(null);
  }, [send]);
  const requestTakeover = useCallback((targetSeat: number) => {
    setTakeoverStatus("pending");
    send({ action: "request_takeover", target_seat: targetSeat });
  }, [send]);
  const acceptTakeover  = useCallback((requester: string) => {
    send({ action: "accept_takeover", requester });
    setTakeoverRequest(null);
  }, [send]);
  const declineTakeover = useCallback((requester: string) => {
    send({ action: "decline_takeover", requester });
    setTakeoverRequest(null);
  }, [send]);

  return {
    state,
    error,
    connected,
    roundSummary,
    trickWinner,
    chatMessages,
    chatToasts,
    reactions,
    rematchInvite,
    peekStatus,
    peekRequest,
    takeoverStatus,
    takeoverRequest,
    handedOff,
    clearSummary,
    startGame,
    cancelGame,
    kickPlayer,
    placeBid,
    playCard,
    endGame,
    sendChat,
    sendReaction,
    rematch,
    dismissRematch,
    extendGame,
    finishGame,
    requestPeek,
    acceptPeek,
    declinePeek,
    requestTakeover,
    acceptTakeover,
    declineTakeover,
  };
}
