"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { GameState, Card, RoundScore } from "./types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
}

export function useGameSocket(gameCode: string, username: string) {
  const ws = useRef<WebSocket | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [roundSummary, setRoundSummary] = useState<{ round: number; scores: RoundScore[] } | null>(null);
  const [trickWinner, setTrickWinner] = useState<{ winner: string; seat: number } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!username) return;
    let socket: WebSocket;
    let timeout: NodeJS.Timeout;

    const connect = () => {
      const url = `${WS_BASE}/ws/game/${gameCode}/?username=${encodeURIComponent(username)}`;
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
          setChatMessages((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(2, 9),
              username: msg.username,
              message: msg.message,
              timestamp: new Date(),
            },
          ]);
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
  }, [gameCode, username]);

  const send = useCallback((data: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  const startGame    = useCallback(() => send({ action: "start_game" }), [send]);
  const cancelGame   = useCallback(() => send({ action: "cancel_game" }), [send]);
  const placeBid     = useCallback((bid: number) => send({ action: "place_bid", bid }), [send]);
  const playCard     = useCallback((card: Card) => send({ action: "play_card", card }), [send]);
  const endGame      = useCallback(() => send({ action: "end_game" }), [send]);
  const clearSummary = useCallback(() => setRoundSummary(null), []);
  const sendChat     = useCallback((message: string) => send({ action: "send_chat", message }), [send]);
  const extendGame   = useCallback(() => send({ action: "extend_game" }), [send]);
  const finishGame   = useCallback(() => send({ action: "finish_game" }), [send]);

  return {
    state,
    error,
    connected,
    roundSummary,
    trickWinner,
    chatMessages,
    clearSummary,
    startGame,
    cancelGame,
    placeBid,
    playCard,
    endGame,
    sendChat,
    extendGame,
    finishGame,
  };
}
