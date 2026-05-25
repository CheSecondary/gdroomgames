"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useGameSocket } from "@/lib/useGameSocket";
import WaitingRoom from "@/components/WaitingRoom";
import GameBoard from "@/components/GameBoard";

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const code   = (params?.code as string ?? "").toUpperCase();
  const spectateParam = searchParams?.get("spectate");
  const spectateSeat  = spectateParam !== null ? Number(spectateParam) : undefined;

  const [username, setUsername] = useState<string | null>(null);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("os_username");
    if (!saved) { router.push("/"); return; }
    setUsername(saved);

    if (spectateSeat !== undefined) {
      // Spectator — don't join as player, just mark ready
      setReady(true);
    } else {
      // joinGame is idempotent — if already in game (any status) it just returns the game
      api.joinGame(saved, code).catch(() => {}).finally(() => setReady(true));
    }
  }, [code, router, spectateSeat]);

  const {
    state, error, connected, roundSummary, trickWinner, clearSummary,
    startGame, cancelGame, placeBid, playCard, endGame, chatMessages, sendChat,
    extendGame, finishGame, peekStatus, peekRequest, requestPeek, acceptPeek, declinePeek,
  } = useGameSocket(code, username ?? "", spectateSeat);

  // Auto-send peek request once we connect as a spectator and state is received
  useEffect(() => {
    if (spectateSeat !== undefined && state && peekStatus === "idle") {
      requestPeek(spectateSeat);
    }
  // Only run once when state first arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state !== null, spectateSeat]);

  // ── Loading states ────────────────────────────────────────────────
  if (!ready || !username) {
    return <Spinner />;
  }

  if (error && !state) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 gap-4">
        <p className="text-red-400 text-center px-4">{error}</p>
        <button onClick={() => router.push("/lobby")} className="text-yellow-400 underline text-sm">
          ← Back to lobby
        </button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 gap-3">
        <Spinner />
        <p className="text-gray-500 text-sm">{connected ? "Loading game…" : "Connecting…"}</p>
      </div>
    );
  }

  // ── Waiting room ─────────────────────────────────────────────────────────
  if (state.status === "waiting") {
    return (
      <WaitingRoom
        state={state}
        username={username}
        gameCode={code}
        onStartGame={startGame}
        onCancelGame={cancelGame}
      />
    );
  }

  // ── Active game ───────────────────────────────────────────────────────────
  return (
    <GameBoard
      state={state}
      username={username}
      gameCode={code}
      gameError={error}
      roundSummary={roundSummary}
      trickWinner={trickWinner}
      chatMessages={chatMessages}
      sendChat={sendChat}
      onClearSummary={clearSummary}
      onBid={placeBid}
      onPlayCard={playCard}
      onEndGame={endGame}
      onExtendGame={extendGame}
      onFinishGame={finishGame}
      isSpectator={spectateSeat !== undefined}
      spectateSeat={spectateSeat}
      peekStatus={peekStatus}
      peekRequest={peekRequest}
      onRequestPeek={requestPeek}
      onAcceptPeek={acceptPeek}
      onDeclinePeek={declinePeek}
    />
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
