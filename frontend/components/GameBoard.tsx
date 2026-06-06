"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "./Card";
import Scoreboard from "./Scoreboard";
import BidPanel from "./BidPanel";
import RoundSummary from "./RoundSummary";
import VoiceChat, { type VoiceChatHandle } from "./VoiceChat";
import type { GameState, Card as CardType, RoundScore } from "@/lib/types";
import { TEAM_COLORS } from "@/lib/types";
import type { ChatMessage, Reaction, PeekStatus, TakeoverStatus } from "@/lib/useGameSocket";
import { REACTION_EMOJIS } from "@/lib/useGameSocket";
import { sfxCardPlay, sfxYourTurn, sfxTrickWon, sfxRoundEnd, sfxChatMessage, sfxMention } from "@/lib/sounds";

interface Props {
  state: GameState;
  username: string;
  gameCode: string;
  gameError: string | null;
  roundSummary: { round: number; scores: RoundScore[] } | null;
  roundHistory: { round: number; scores: RoundScore[] }[];
  trickWinner: { winner: string; seat: number } | null;
  chatMessages: ChatMessage[];
  chatToasts: ChatMessage[];
  reactions: Reaction[];
  mention: { from: string; message: string } | null;
  rematchInvite: { code: string; host: string } | null;
  sendChat: (message: string) => void;
  sendReaction: (emoji: string) => void;
  onRematch: () => void;
  onDismissRematch: () => void;
  onClearSummary: () => void;
  onBid: (bid: number) => void;
  onPlayCard: (card: CardType) => void;
  onEndGame: () => void;
  onExtendGame: () => void;
  onFinishGame: () => void;
  // Spectator/peek mode
  isSpectator?: boolean;
  spectateSeat?: number;
  peekStatus?: PeekStatus;
  peekRequest?: { spectator: string; targetSeat: number } | null;
  onRequestPeek?: (targetSeat: number) => void;
  onAcceptPeek?: (spectator: string) => void;
  onDeclinePeek?: (spectator: string) => void;
  // Ownership takeover mode
  isTakeover?: boolean;
  takeoverSeat?: number;
  takeoverStatus?: TakeoverStatus;
  takeoverRequest?: { requester: string; targetSeat: number } | null;
  handedOff?: { to: string; from: string; seat: number } | null;
  onRequestTakeover?: (targetSeat: number) => void;
  onAcceptTakeover?: (requester: string) => void;
  onDeclineTakeover?: (requester: string) => void;
}


/** Per-emoji Framer Motion animation props — each emoji has its own personality. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEmojiAnim(emoji: string, sx: number, seed: number): Record<string, any> {
  const base = { exit: { opacity: 0 } };
  switch (emoji) {
    case "🔥": // fire: wobble side to side while rising
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.7, rotate: 0 },
        animate: { opacity: [1,1,1,0], y: [0,-40,-100,-160], x: [sx, sx+14, sx-10, sx+6, sx+driftX(seed)], scale: [0.7,1.1,1.3,1.1], rotate: [0,8,-8,4,-4,0] },
        transition: { duration: 2.2, ease: "easeOut" },
      };
    case "😂": // laughing: bouncy scale while floating
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.5 },
        animate: { opacity: [1,1,1,0], y: [0,-30,-90,-160], scale: [0.5,1.4,1.0,1.5,1.2,0.9] },
        transition: { duration: 2.0, ease: "easeOut" },
      };
    case "💀": // skull: full spin while rising
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.8, rotate: 0 },
        animate: { opacity: [1,1,1,0], y: [0,-60,-160], scale: [0.8,1.4,1.2], rotate: [0, 180, 360] },
        transition: { duration: 2.4, ease: "linear" },
      };
    case "👏": // clap: pulse in/out like clapping, drifts up
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.8 },
        animate: { opacity: [1,1,1,0], y: [0,-50,-120,-160], scale: [0.8,1.3,0.9,1.3,0.9,1.4,1.0] },
        transition: { duration: 2.1, ease: "easeOut" },
      };
    case "😤": // angry: rapid horizontal shake, then launch
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 1 },
        animate: { opacity: [1,1,1,1,0], y: [0,-10,-10,-90,-160], x: [sx,sx+12,sx-12,sx+8,sx-8,sx+4,sx+driftX(seed)], scale: [1,1.1,1.1,1.3,1.0] },
        transition: { duration: 2.0, ease: "easeOut" },
      };
    case "🎉": // party: zigzag left-right while soaring
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.6, rotate: -20 },
        animate: { opacity: [1,1,1,0], y: [0,-40,-100,-160], x: [sx, sx+30, sx-20, sx+40, sx+driftX(seed)], scale: [0.6,1.2,1.4,1.5], rotate: [-20,15,-10,20,0] },
        transition: { duration: 2.5, ease: "easeOut" },
      };
    case "🫡": // salute: slide straight up, slight tilt
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.9, rotate: -5 },
        animate: { opacity: [1,1,1,0], y: [0,-60,-130,-180], scale: [0.9,1.2,1.3,1.1], rotate: [-5,0,5,0] },
        transition: { duration: 2.0, ease: "easeOut" },
      };
    case "💯": // 100: zoom up super fast, overshoot
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.4 },
        animate: { opacity: [1,1,1,0], y: [0,-30,-140,-200], scale: [0.4,2.0,1.5,1.0] },
        transition: { duration: 1.6, ease: [0.2,1.4,0.5,1] },
      };
    case "🤡": // clown: wobble rotate + float
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.7, rotate: 0 },
        animate: { opacity: [1,1,1,0], y: [0,-50,-130,-160], x: [sx,sx+20,sx-15,sx+10,sx+driftX(seed)], scale: [0.7,1.2,1.4,1.2], rotate: [0,-20,20,-15,10,0] },
        transition: { duration: 2.3, ease: "easeOut" },
      };
    case "😱": // scream: explode outward, fade
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.5 },
        animate: { opacity: [1,1,0.6,0], y: [0,-20,-80,-120], scale: [0.5,2.2,2.5,1.8] },
        transition: { duration: 1.8, ease: "easeOut" },
      };
    case "🤌": // chef's kiss: graceful curve up and out
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.8, rotate: 0 },
        animate: { opacity: [1,1,1,0], y: [0,-50,-120,-180], x: [sx, sx+40, sx+60, sx+50], scale: [0.8,1.2,1.4,1.0], rotate: [0,-10,-20,-30] },
        transition: { duration: 2.2, ease: "easeOut" },
      };
    case "👀": // eyes: slide sideways then zoom up
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.9 },
        animate: { opacity: [1,1,1,0], y: [0,0,-80,-160], x: [sx, sx+50, sx+30, sx+driftX(seed)], scale: [0.9,1.0,1.4,1.2] },
        transition: { duration: 2.1, ease: "easeOut" },
      };
    default:
      return { ...base,
        initial: { opacity: 1, y: 0, x: sx, scale: 0.7 },
        animate: { opacity: [1,1,0], y: [0,-80,-160], scale: [0.7,1.4,1.2] },
        transition: { duration: 2.2, ease: "easeOut" },
      };
  }
}
function driftX(seed: number) { return ((seed % 7) - 3) * 20; }

const SUIT_ORDER: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
const RANK_VAL:  Record<string, number>  = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};
const SUIT_SYMBOL: Record<string, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const SUIT_NAME:   Record<string, string> = { spades: "Spades", hearts: "Hearts", diamonds: "Diamonds", clubs: "Clubs" };
const SUIT_COL:    Record<string, string> = { spades: "text-gray-200", hearts: "text-red-400", diamonds: "text-red-400", clubs: "text-gray-200" };

export default function GameBoard({
  state,
  username,
  gameCode,
  gameError,
  roundSummary,
  roundHistory,
  trickWinner,
  chatMessages,
  chatToasts,
  reactions,
  mention,
  rematchInvite,
  sendChat,
  sendReaction,
  onRematch,
  onDismissRematch,
  onClearSummary,
  onBid,
  onPlayCard,
  onEndGame,
  onExtendGame,
  onFinishGame,
  isSpectator = false,
  spectateSeat,
  peekStatus = "idle",
  peekRequest,
  onRequestPeek,
  onAcceptPeek,
  onDeclinePeek,
  isTakeover = false,
  takeoverSeat,
  takeoverStatus = "idle",
  takeoverRequest,
  handedOff,
  onRequestTakeover,
  onAcceptTakeover,
  onDeclineTakeover,
}: Props) {
  const [ownershipToast, setOwnershipToast] = useState<string | null>(null);
  const [selectedCard,   setSelectedCard]   = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showMenu,       setShowMenu]       = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showVoice,      setShowVoice]      = useState(false);
  const [voiceIsLive,    setVoiceIsLive]    = useState(false);
  const [voiceMutedUids, setVoiceMutedUids] = useState<Set<string>>(new Set());
  const voiceChatRef = useRef<VoiceChatHandle>(null);

  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [lastReadCount, setLastReadCount] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = closed
  const [mentionIndex, setMentionIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [sfxOn, setSfxOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("os_sfx") !== "off";
  });
  const toggleSfx = () => setSfxOn((v) => {
    const next = !v;
    localStorage.setItem("os_sfx", next ? "on" : "off");
    return next;
  });

  const [lastTrick, setLastTrick] = useState<typeof state.current_trick>([]);
  const [showLastTrick, setShowLastTrick] = useState(false);

  // Show brief ownership toast to ALL players when any transfer happens
  useEffect(() => {
    if (handedOff) {
      setOwnershipToast(`🔑 ${handedOff.from} → ${handedOff.to}`);
      const t = setTimeout(() => setOwnershipToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [handedOff?.from, handedOff?.to]);

  // Request notification permission once on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Haptic + tab notification when it becomes MY turn
  const myTurnRef = useRef(false);
  useEffect(() => {
    if (!state) return;
    const isMyTurn = !isSpectator &&
      state.players[state.current_player_index]?.username === username &&
      (state.status === "bidding" || state.status === "playing");

    if (isMyTurn && !myTurnRef.current) {
      // Haptic
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      // Sound
      if (sfxOn) sfxYourTurn();
      // Tab notification only if tab not focused
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("OpenSpades — your turn! 🃏", {
          body: state.status === "bidding" ? "Place your bid" : "Play a card",
          icon: "/favicon.ico",
          tag: "your-turn",
        });
      }
    }
    myTurnRef.current = isMyTurn;
  }, [state?.current_player_index, state?.status]);

  // Sound: card played (trick length increases)
  const trickLenRef = useRef(0);
  useEffect(() => {
    if (!state) return;
    const len = state.current_trick.length;
    if (len > trickLenRef.current && sfxOn) sfxCardPlay();
    trickLenRef.current = len;
  }, [state?.current_trick.length]);

  // Sound + capture last trick when trick is won
  useEffect(() => {
    if (trickWinner) {
      if (sfxOn) sfxTrickWon();
      // Capture the current trick cards before state clears them
      if (state?.current_trick.length) setLastTrick(state.current_trick);
    }
  }, [trickWinner]);

  // Sound: round ended
  useEffect(() => {
    if (roundSummary && sfxOn) sfxRoundEnd();
  }, [roundSummary]);

  // Sound: incoming chat message (only when chat is closed)
  useEffect(() => {
    if (chatToasts.length > 0 && !showChat && sfxOn) sfxChatMessage();
  }, [chatToasts.length]);

  // Sound: @mention
  useEffect(() => {
    if (mention && sfxOn) sfxMention();
  }, [mention]);

  const toggleChat = () => {
    setShowChat(!showChat);
    if (!showChat) {
      setLastReadCount(chatMessages.length);
    }
  };

  const hasNewMessages = chatMessages.length > lastReadCount && !showChat;

  if (showChat && lastReadCount !== chatMessages.length) {
    setLastReadCount(chatMessages.length);
  }

  useEffect(() => {
    if (showChat) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length, showChat]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim());
    setChatInput("");
    setMentionQuery(null);
    setMentionIndex(0);
  };

  const me       = state.players.find((p) => p.username === username);
  // For spectators, display the peeked player's hand instead
  const peekedPlayer = isSpectator && peekStatus === "accepted"
    ? state.players.find((p) => p.seat === spectateSeat) ?? null
    : null;
  const displayedPlayer = isSpectator ? peekedPlayer : me;
  const myTurn   = !isSpectator && !!me && state.players[state.current_player_index]?.username === username;
  const isHost   = !isSpectator && state.host_username === username;

  const cardKey = (c: CardType) => `${c.suit}-${c.rank}-${c.deck_id}`;

  const handleCardClick = (card: CardType) => {
    if (!myTurn || state.status !== "playing") return;
    const key = cardKey(card);
    if (selectedCard === key) { onPlayCard(card); setSelectedCard(null); }
    else                      { setSelectedCard(key); }
  };

  const myHand     = (displayedPlayer?.hand ?? []).filter((c) => !c.hidden);
  const sortedHand = [...myHand].sort(
    (a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || RANK_VAL[a.rank] - RANK_VAL[b.rank]
  );

  // Teams helpers
  const myTeam     = state.teams_enabled && me ? state.teams[me.team_index] : null;
  const captain    = state.teams_enabled && myTeam
    ? state.players.find((p) => p.seat === myTeam[0])
    : null;
  const iAmCaptain = !isSpectator && (!state.teams_enabled || (me?.is_captain ?? true));
  const activeBidder = state.status === "bidding"
    ? state.players[state.current_player_index]
    : null;

  // Use small cards if hand is large
  const useSmallCards = myHand.length > 9;

  const isActive = state.status === "bidding" || state.status === "playing";

  return (
    <div
      className="min-h-screen flex flex-col select-none"
      style={{ background: "linear-gradient(160deg,#0a1f2e 0%,#0d2b1e 50%,#091209 100%)" }}
    >
      {/* ── Compact header ───────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-3 py-1.5 bg-black/55 border-b border-white/5 shrink-0 z-20">
        {/* Left: logo · code (desktop) · round · trump */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-yellow-400 font-extrabold text-sm shrink-0">♠</span>
          <span className="hidden md:inline bg-black/50 text-gray-300 text-xs px-1.5 py-0.5 rounded font-mono border border-white/10 shrink-0">
            {gameCode}
          </span>
          {state.status !== "finished" && (
            <span className="text-xs shrink-0">
              <span className="text-gray-500">R</span>
              <span className="text-yellow-400 font-bold">{state.current_round}</span>
              <span className="text-gray-700">/{state.max_rounds}</span>
            </span>
          )}
          {/* Trump — always visible, symbol + name + rank if present */}
          {state.trump_card ? (
            <span className={`flex items-center gap-1 font-semibold shrink-0 ${SUIT_COL[state.trump_card.suit]}`}>
              <span className="text-gray-600 font-normal text-[10px]">trump</span>
              <span className="text-sm font-extrabold bg-white/10 px-1 py-0.5 rounded leading-none">{state.trump_card.rank}</span>
              <span className="text-2xl leading-none">{SUIT_SYMBOL[state.trump_card.suit]}</span>
            </span>
          ) : state.trump_suit ? (
            <span className={`flex items-center gap-1 font-semibold shrink-0 ${SUIT_COL[state.trump_suit]}`}>
              <span className="text-gray-600 font-normal text-[10px]">trump</span>
              <span className="text-2xl leading-none">{SUIT_SYMBOL[state.trump_suit]}</span>
              <span className="hidden sm:inline text-sm">{SUIT_NAME[state.trump_suit]}</span>
            </span>
          ) : null}
          {/* Current bidder (live) · who starts play — visible on all screen sizes */}
          {isActive && (() => {
            const currentBidder = state.status === "bidding"
              ? state.players[state.current_player_index]
              : null;
            const playLeader = state.players.find(p => p.seat === state.round_play_lead_seat);
            return (
              <span className="flex items-center gap-1 text-[10px] shrink-0 ml-1">
                {currentBidder && (
                  <>
                    <span className="text-gray-600">bid</span>
                    <span className="text-yellow-400 font-semibold truncate max-w-[60px]">{currentBidder.username}</span>
                    <span className="text-gray-700">·</span>
                  </>
                )}
                <span className="text-gray-600">starts</span>
                <span className="text-emerald-400 font-semibold truncate max-w-[60px]">{playLeader?.username ?? "—"}</span>
              </span>
            );
          })()}
        </div>

        {/* Right: chat (always) + desktop inline + hamburger (mobile) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* SFX toggle */}
          <button
            onClick={toggleSfx}
            title={sfxOn ? "Mute sound effects" : "Unmute sound effects"}
            className={`px-1.5 py-1 rounded-lg border text-[10px] font-bold tracking-wide transition-all ${
              sfxOn
                ? "bg-white/5 border-white/10 text-gray-400 hover:text-yellow-400"
                : "bg-white/5 border-white/10 text-gray-700 line-through"
            }`}
          >
            SFX
          </button>

          {/* Chat — always visible, most used */}
          <button
            onClick={toggleChat}
            title="Chat"
            className="relative p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-yellow-400 transition-all border border-white/10 text-sm leading-none"
          >
            💬
            {hasNewMessages && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-gray-900 animate-pulse" />
            )}
          </button>

          {/* Desktop inline (md+) */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => setShowScoreboard(true)}
              title="Scoreboard"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-yellow-400 transition-all border border-white/10 text-sm leading-none"
            >
              📊
            </button>
            <button
              onClick={() => setShowVoice(v => !v)}
              title="Voice chat"
              className={`p-1.5 rounded-lg border text-sm leading-none transition-all ${
                showVoice
                  ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-400"
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-emerald-400"
              }`}
            >
              🎙️
            </button>
            <span className="text-gray-600 text-[11px]">{username}</span>
            {isHost && state.status !== "finished" && (
              <button
                onClick={() => setShowEndConfirm(true)}
                className="text-[10px] text-red-400/70 hover:text-red-400 border border-red-400/20 hover:border-red-400/50 px-1.5 py-0.5 rounded transition-all"
              >
                End
              </button>
            )}
          </div>

          {/* Hamburger — mobile + tablet (< md), both portrait and landscape */}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="md:hidden p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-base leading-none"
          >
            {showMenu ? "✕" : "☰"}
          </button>
        </div>
      </header>

      {/* ── Hamburger menu (mobile) ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="md:hidden overflow-hidden bg-black/75 border-b border-white/5 shrink-0 z-20"
          >
            {/* Room code row */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-white/5">
              <span className="text-gray-500 text-[10px] uppercase tracking-widest">Room</span>
              <span className="bg-black/60 text-yellow-300 text-sm px-2.5 py-1 rounded font-mono border border-yellow-400/20 tracking-widest font-bold select-all">
                {gameCode}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
              <button
                onClick={() => setShowVoice(v => !v)}
                className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  showVoice
                    ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-400"
                    : "bg-white/5 border-white/10 text-gray-300"
                }`}
              >
                🎙️ Voice
              </button>
              <button
                onClick={() => { setShowScoreboard(true); setShowMenu(false); }}
                className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold"
              >
                📊 Scores
              </button>
              <span className="text-gray-500 text-xs">{username}</span>
              {isHost && state.status !== "finished" && (
                <button
                  onClick={() => { setShowEndConfirm(true); setShowMenu(false); }}
                  className="text-xs text-red-400 border border-red-400/30 px-3 py-1 rounded-lg ml-auto"
                >
                  End Game
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Single always-mounted VoiceChat panel ───────────────────────────── */}
      <div
        className="shrink-0 px-3 py-2 bg-black/50 border-b border-white/5 z-10"
        style={{ display: showVoice ? "block" : "none" }}
      >
        <VoiceChat
          ref={voiceChatRef}
          gameCode={gameCode}
          username={username}
          onLiveChange={setVoiceIsLive}
          onMutedUidsChange={setVoiceMutedUids}
        />
      </div>

      {/* ── Error toast ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {gameError && (
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            className="bg-red-900/80 border-b border-red-500/30 text-red-300 text-xs text-center py-1 px-4 shrink-0 z-10"
          >
            {gameError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Peek request toast (shown to target player) ───────────────────────── */}
      <AnimatePresence>
        {peekRequest && me && me.seat === peekRequest.targetSeat && onAcceptPeek && onDeclinePeek && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-yellow-400/30 rounded-2xl px-4 py-3 shadow-2xl text-center w-72"
          >
            <p className="text-white text-sm font-semibold mb-1">
              👁️ <span className="text-yellow-400">{peekRequest.spectator}</span> wants to watch you
            </p>
            <p className="text-gray-400 text-xs mb-3">They&apos;ll only see your hand — not others</p>
            <div className="flex gap-2">
              <button
                onClick={() => onDeclinePeek(peekRequest.spectator)}
                className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold transition-all border border-white/10"
              >
                Decline
              </button>
              <button
                onClick={() => onAcceptPeek(peekRequest.spectator)}
                className="flex-1 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-bold transition-all"
              >
                Allow
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ownership transfer toast (all players) ───────────────────────────── */}
      <AnimatePresence>
        {ownershipToast && (
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-yellow-400/40 text-yellow-300 text-xs font-semibold px-4 py-2 rounded-full shadow-xl"
          >
            {ownershipToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Takeover request toast (shown to target player) ───────────────────── */}
      <AnimatePresence>
        {takeoverRequest && me && me.seat === takeoverRequest.targetSeat && onAcceptTakeover && onDeclineTakeover && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-gray-900 border border-yellow-400/30 rounded-2xl px-4 py-3 shadow-2xl text-center w-72"
          >
            <p className="text-white text-sm font-semibold mb-1">
              🔑 <span className="text-yellow-400">{takeoverRequest.requester}</span> wants to take over your seat
            </p>
            <p className="text-gray-400 text-xs mb-3">They&apos;ll play on your behalf — you&apos;ll be removed</p>
            <div className="flex gap-2">
              <button
                onClick={() => onDeclineTakeover(takeoverRequest.requester)}
                className="flex-1 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold transition-all border border-white/10"
              >
                Decline
              </button>
              <button
                onClick={() => onAcceptTakeover(takeoverRequest.requester)}
                className="flex-1 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-bold transition-all"
              >
                Hand Off
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Handed-off screen (original owner after transfer) ────────────────── */}
      {handedOff && handedOff.from === username && (
        <div className="fixed inset-0 bg-gray-950/95 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
          >
            <p className="text-4xl mb-3">🔑</p>
            <h2 className="text-white font-bold text-lg mb-2">Seat handed off</h2>
            <p className="text-gray-400 text-sm mb-5">
              <span className="text-yellow-400 font-semibold">{handedOff.to}</span> is now playing on your behalf.
              You can safely close this tab.
            </p>
            <button
              onClick={() => { window.location.href = "/lobby"; }}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2.5 rounded-xl transition-all"
            >
              ← Back to lobby
            </button>
          </motion.div>
        </div>
      )}

      {/* ── Takeover pending / declined overlay ──────────────────────────────── */}
      {isTakeover && takeoverStatus !== "idle" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
          >
            {takeoverStatus === "pending" ? (
              <>
                <p className="text-4xl mb-3">🔑</p>
                <h2 className="text-white font-bold text-lg mb-2">Waiting for approval</h2>
                <p className="text-gray-400 text-sm mb-4">
                  Asking {state.players.find(p => p.seat === takeoverSeat)?.username ?? "player"} to hand off their seat…
                </p>
                <div className="flex justify-center">
                  <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                </div>
              </>
            ) : (
              <>
                <p className="text-4xl mb-3">🚫</p>
                <h2 className="text-white font-bold text-lg mb-2">Request Declined</h2>
                <p className="text-gray-400 text-sm mb-4">Pick another player to request a takeover.</p>
                <div className="flex flex-col gap-2">
                  {state.players.map((p) => {
                    const wasDeclined = p.seat === takeoverSeat;
                    return (
                      <button
                        key={p.seat}
                        onClick={() => onRequestTakeover?.(p.seat)}
                        className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all border ${
                          wasDeclined
                            ? "bg-red-500/10 border-red-400/20 hover:bg-red-500/20"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        <span className="text-gray-500 font-mono text-xs">#{p.seat + 1}</span>
                        <span className="text-white font-semibold flex-1">{p.username}</span>
                        {wasDeclined && <span className="text-red-400 text-[10px]">declined</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* ── Spectator pending / declined overlay ─────────────────────────────── */}
      {isSpectator && peekStatus !== "accepted" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
          >
            {peekStatus === "idle" || peekStatus === "pending" ? (
              <>
                <p className="text-4xl mb-3">👁️</p>
                <h2 className="text-white font-bold text-lg mb-2">
                  {peekStatus === "idle" ? "Requesting peek…" : "Waiting for approval"}
                </h2>
                <p className="text-gray-400 text-sm mb-4">
                  {peekedPlayer
                    ? `Waiting for ${state.players.find(p => p.seat === spectateSeat)?.username ?? "player"} to accept.`
                    : "Sending peek request…"
                  }
                </p>
                <div className="flex justify-center">
                  <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                </div>
              </>
            ) : (
              <>
                <p className="text-4xl mb-3">🚫</p>
                <h2 className="text-white font-bold text-lg mb-2">Request Declined</h2>
                <p className="text-gray-400 text-sm mb-4">
                  Pick any player to send a peek request to.
                </p>
                <div className="flex flex-col gap-2">
                  {state.players.map((p) => {
                    const wasDeclined = p.seat === spectateSeat;
                    return (
                      <button
                        key={p.seat}
                        onClick={() => onRequestPeek?.(p.seat)}
                        className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all border ${
                          wasDeclined
                            ? "bg-red-500/10 border-red-400/20 hover:bg-red-500/20"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        <span className="text-gray-500 font-mono text-xs">#{p.seat + 1}</span>
                        <span className="text-white font-semibold flex-1">{p.username}</span>
                        {wasDeclined && (
                          <span className="text-red-400 text-[10px]">declined</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* ── Spectator banner (when accepted) ─────────────────────────────────── */}
      {isSpectator && peekStatus === "accepted" && (
        <div className="shrink-0 bg-yellow-400/10 border-b border-yellow-400/20 px-3 py-1 flex items-center justify-between">
          <span className="text-yellow-400 text-[11px] font-semibold">
            👁️ Spectating {state.players.find(p => p.seat === spectateSeat)?.username ?? "player"} — view only
          </span>
          <button
            onClick={() => { window.location.href = "/lobby"; }}
            className="text-gray-500 hover:text-gray-300 text-[10px] transition-colors"
          >
            Exit ✕
          </button>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      {(!isSpectator || peekStatus === "accepted") && (!isTakeover || takeoverStatus === "idle") && (!handedOff || handedOff.from !== username) && (state.status === "prompt" ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-gray-900 border border-yellow-500/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
          >
            <p className="text-4xl mb-3">🔄</p>
            <h2 className="text-yellow-400 font-bold text-lg mb-2">Round Limit Reached</h2>
            {isHost ? (
              <>
                <p className="text-gray-300 text-sm mb-6">
                  You have completed the scheduled rounds. Would you like to extend the game and play another round?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={onExtendGame}
                    className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl transition-all shadow-md shadow-yellow-400/10 cursor-pointer"
                  >
                    Yes, Play Another Round
                  </button>
                  <button
                    onClick={onFinishGame}
                    className="w-full bg-white/5 hover:bg-white/10 text-gray-300 font-semibold py-2.5 rounded-xl transition-all border border-white/10 cursor-pointer"
                  >
                    No, Show Game Results
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-300 text-sm mb-6">
                  Waiting for the host to decide whether to extend the game or show the final scores...
                </p>
                <div className="flex items-center justify-center py-2">
                  <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                </div>
              </>
            )}
          </motion.div>
        </div>
      ) : state.status === "finished" ? (
        /* Finished: full-center banner */
        <div className="flex-1 flex items-center justify-center p-4">
          <GameOverBanner
            players={state.players}
            teamsEnabled={state.teams_enabled}
            teams={state.teams}
            isHost={state.host_username === username}
            onNewGame={() => { window.location.href = "/lobby"; }}
            onRematch={onRematch}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Opponents — compact strip */}
          <div className="shrink-0 px-2 pt-1 pb-0.5">
            <OtherPlayers
              players={state.players}
              myUsername={username}
              currentPlayerIndex={state.current_player_index}
              teamsEnabled={state.teams_enabled}
              voiceIsLive={voiceIsLive}
              voiceMutedUids={voiceMutedUids}
              onToggleVoiceMute={(uid) => voiceChatRef.current?.toggleMuteUid(uid)}
            />
          </div>

          {/* ── Split: landscape=side-by-side, portrait=stacked ──────────────── */}
          <div className="flex flex-1 gap-2 px-2 pb-1 min-h-0 overflow-hidden landscape:flex-row portrait:flex-col">

            {/* Your hand — LEFT in landscape, BOTTOM in portrait */}
            <div className="landscape:w-[45%] portrait:order-2 portrait:shrink-0 portrait:h-[44%] flex flex-col min-h-0 bg-black/20 rounded-xl border border-white/5 p-2">
              {/* Emoji reaction bar — single scrollable row */}
              {!isSpectator && (
                <div className="flex gap-1.5 mb-1.5 shrink-0 overflow-x-auto no-scrollbar">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      className="text-base leading-none w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/15 active:scale-90 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              {/* Hand header */}
              <div className="flex items-center justify-between mb-1.5 shrink-0">
                <span className="text-gray-400 text-[11px] font-semibold">
                  {isSpectator
                    ? <span>👁️ <span className="text-yellow-400">{displayedPlayer?.username}</span>'s hand</span>
                    : <>Your hand</>
                  }
                  <span className="text-gray-600 ml-1">({myHand.length})</span>
                </span>
                {displayedPlayer && displayedPlayer.bid >= 0 && (
                  <span className="text-[11px] text-gray-400">
                    Bid <span className="text-yellow-400 font-bold">{displayedPlayer.bid}</span>
                    {" "}· Won <span className="text-emerald-400 font-bold">{displayedPlayer.tricks_won}</span>
                  </span>
                )}
              </div>

              {/* Cards — flex-wrap, fully visible, no overlap */}
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-wrap gap-1 content-start">
                  {sortedHand.map((card) => (
                    <motion.div
                      key={cardKey(card)}
                      whileTap={myTurn && isActive ? { scale: 0.93 } : {}}
                    >
                      <Card
                         card={card}
                        small={useSmallCards}
                        selected={selectedCard === cardKey(card)}
                        onClick={
                          state.status === "playing" && myTurn && !trickWinner
                            ? () => handleCardClick(card)
                            : undefined
                        }
                      />
                    </motion.div>
                  ))}
                  {myHand.length === 0 && (
                    <p className="text-gray-600 text-xs py-4 px-2">No cards left</p>
                  )}
                </div>
              </div>

              {/* Play hint */}
              {state.status === "playing" && myTurn && !trickWinner && (
                <p className="text-yellow-300 text-[11px] text-center mt-1.5 shrink-0 font-semibold">
                  {selectedCard ? "Tap again to play →" : "Tap a card to select"}
                </p>
              )}
            </div>

            {/* Trick + status — RIGHT in landscape, TOP in portrait */}
            <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-0 portrait:order-1 portrait:overflow-y-auto">

              {/* Trick grid — each card fully visible with player label */}
              <TrickGrid
                cards={state.current_trick}
                trumpSuit={state.trump_suit}
                playerCount={state.players.length}
              />
              {/* Last trick button — only when trick area is empty and we have history */}
              {state.current_trick.length === 0 && lastTrick.length > 0 && !trickWinner && (
                <button
                  onClick={() => setShowLastTrick(true)}
                  className="text-[10px] text-gray-600 hover:text-gray-400 underline underline-offset-2 transition-colors"
                >
                  👁 last trick
                </button>
              )}

              {/* Status / action area */}
              <div className="w-full max-w-xs flex flex-col items-center gap-1.5 min-h-[40px]">
                {trickWinner ? (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    className="flex flex-col items-center"
                  >
                    <p className="text-emerald-400 font-bold text-sm bg-emerald-400/10 px-4 py-1.5 rounded-full border border-emerald-400/30 shadow-lg mb-1">
                      {trickWinner.winner === username ? "You won the trick!" : `${trickWinner.winner} won the trick!`}
                    </p>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span className="w-2 h-2 border-2 border-gray-500 border-t-transparent rounded-full animate-spin inline-block" />
                      Preparing next trick...
                    </p>
                  </motion.div>
                ) : state.status === "bidding" ? (
                  <>
                    {myTurn ? (
                      <BidPanel
                        maxBid={state.current_round}
                        onBid={onBid}
                        isCapitain={iAmCaptain}
                        captainUsername={captain?.username}
                      />
                    ) : !iAmCaptain && state.teams_enabled ? (
                      <BidPanel
                        maxBid={state.current_round}
                        onBid={onBid}
                        isCapitain={false}
                        captainUsername={captain?.username}
                      />
                    ) : (
                      <motion.p
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 1.8 }}
                        className="text-gray-400 text-sm text-center"
                      >
                        {activeBidder?.username} is bidding…
                      </motion.p>
                    )}
                  </>
                ) : (
                  state.status === "playing" && !myTurn && (
                    <p className="text-gray-600 text-xs text-center">
                      Waiting for {state.players[state.current_player_index]?.username}…
                    </p>
                  )
                )}
              </div>
            </div>
          </div>

          {/* ── Score strip ─────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-white/5 bg-black/40 px-3 py-1 overflow-x-auto">
            <MobileScoreStrip
              players={state.players}
              currentPlayerIndex={state.current_player_index}
              myUsername={username}
              teamsEnabled={state.teams_enabled}
              teams={state.teams}
            />
          </div>
        </div>
      ))}

      {/* ── Scoreboard modal ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showScoreboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
            onClick={() => setShowScoreboard(false)}
          >
            <motion.div
              initial={{ scale: 0.88, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 16 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-yellow-400 font-bold text-sm">
                  Scoreboard — Round {state.current_round}/{state.max_rounds}
                  {state.trump_card ? (
                    <span className={`ml-2 font-normal text-xs ${SUIT_COL[state.trump_card.suit]}`}>
                      Trump: {state.trump_card.rank}{SUIT_SYMBOL[state.trump_card.suit]}
                    </span>
                  ) : state.trump_suit ? (
                    <span className={`ml-2 font-normal text-xs ${SUIT_COL[state.trump_suit]}`}>
                      Trump: {SUIT_SYMBOL[state.trump_suit]} {SUIT_NAME[state.trump_suit]}
                    </span>
                  ) : null}
                </span>
                <button onClick={() => setShowScoreboard(false)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
              </div>
              <Scoreboard
                players={state.players}
                currentPlayerIndex={state.current_player_index}
                myUsername={username}
                teamsEnabled={state.teams_enabled}
                teams={state.teams}
              />

              {/* Round history — horizontal scrollable table */}
              {roundHistory.length > 0 && (() => {
                // collect unique player names in seat order from latest round
                const playerNames = roundHistory[roundHistory.length - 1].scores.map((s) => s.username);
                return (
                  <div className="mt-4">
                    <p className="text-gray-600 text-[10px] uppercase tracking-widest mb-2">Round History</p>
                    <div className="overflow-x-auto rounded-xl border border-white/5">
                      <table className="text-xs w-full min-w-max">
                        <thead>
                          <tr className="bg-black/40">
                            <th className="text-left px-3 py-1.5 text-gray-600 font-normal sticky left-0 bg-black/40">Player</th>
                            {roundHistory.map((r) => (
                              <th key={r.round} className="px-2.5 py-1.5 text-gray-600 font-normal text-center">R{r.round}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {playerNames.map((name) => (
                            <tr key={name} className="border-t border-white/5">
                              <td className={`px-3 py-1.5 sticky left-0 bg-gray-900 font-medium ${name === username ? "text-yellow-300" : "text-gray-300"}`}>
                                {name}
                              </td>
                              {roundHistory.map((r) => {
                                const s = r.scores.find((x) => x.username === name);
                                return (
                                  <td key={r.round} className={`px-2.5 py-1.5 text-center font-semibold ${!s ? "text-gray-700" : s.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                    {s ? (s.delta > 0 ? `+${s.delta}` : s.delta) : "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Round Summary ─────────────────────────────────────────────────────── */}
      {roundSummary && (
        <RoundSummary
          round={roundSummary.round}
          scores={roundSummary.scores}
          onClose={onClearSummary}
        />
      )}

      {/* ── End-game confirm ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center"
            >
              <p className="text-white font-bold text-lg mb-2">End Game?</p>
              <p className="text-gray-400 text-sm mb-6">This ends the game for everyone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onEndGame(); setShowEndConfirm(false); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-all"
                >
                  End Game
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Game Chat drawer ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="fixed top-0 right-0 h-full w-80 bg-gray-950/95 border-l border-white/10 shadow-2xl z-40 flex flex-col p-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <h3 className="text-yellow-400 font-bold text-sm flex items-center gap-1.5">
                💬 Game Chat
              </h3>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-500 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            {/* Message history */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1 text-xs scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {chatMessages.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No messages yet. Say hello!</p>
              ) : (
                chatMessages.map((msg) => {
                  const isMe = msg.username === username;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <span className="text-[10px] text-gray-500 mb-0.5">
                        {msg.isSpectator && <span className="text-yellow-600 mr-0.5">👁️</span>}
                        {msg.username}
                      </span>
                      {(() => {
                        const hasMention = /@\w+/.test(msg.message);
                        const bubbleCls = hasMention
                          ? "bg-red-600/80 text-white shadow-md shadow-red-500/20"
                          : isMe
                          ? "bg-yellow-400 text-gray-900 font-medium shadow-md shadow-yellow-400/10"
                          : msg.isSpectator
                          ? "bg-yellow-400/10 text-yellow-200 border border-yellow-400/20"
                          : "bg-white/10 text-white";
                        return (
                          <div className={`rounded-xl px-3 py-1.5 max-w-[85%] break-words leading-relaxed ${bubbleCls}`}>
                            {msg.message}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input with @mention autocomplete */}
            <div className="shrink-0 relative">
              {/* @mention picker */}
              {mentionQuery !== null && (() => {
                const q = mentionQuery.toLowerCase();
                const suggestions = state.players
                  .filter(p => p.username !== username && p.username.toLowerCase().includes(q));
                const pickSuggestion = (uname: string) => {
                  const before = chatInput.slice(0, chatInput.lastIndexOf("@"));
                  setChatInput(before + "@" + uname + " ");
                  setMentionQuery(null);
                  setMentionIndex(0);
                  chatInputRef.current?.focus();
                };
                return suggestions.length > 0 ? (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-gray-900 border border-white/15 rounded-xl overflow-hidden shadow-xl z-10">
                    {suggestions.map((p, i) => (
                      <button
                        key={p.username}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickSuggestion(p.username); }}
                        className={`w-full text-left px-3 py-2 text-xs text-white flex items-center gap-2 ${i === mentionIndex ? "bg-white/15" : "hover:bg-white/10"}`}
                      >
                        <span className="text-yellow-400 font-semibold">@{p.username}</span>
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setChatInput(val);
                    const atIdx = val.lastIndexOf("@");
                    if (atIdx !== -1 && (atIdx === 0 || val[atIdx - 1] === " ")) {
                      setMentionQuery(val.slice(atIdx + 1));
                      setMentionIndex(0);
                    } else {
                      setMentionQuery(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (mentionQuery === null) return;
                    const q = mentionQuery.toLowerCase();
                    const suggestions = state.players.filter(
                      p => p.username !== username && p.username.toLowerCase().includes(q)
                    );
                    if (!suggestions.length) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionIndex(i => Math.min(i + 1, suggestions.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionIndex(i => Math.max(i - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const before = chatInput.slice(0, chatInput.lastIndexOf("@"));
                      setChatInput(before + "@" + suggestions[mentionIndex].username + " ");
                      setMentionQuery(null);
                      setMentionIndex(0);
                    } else if (e.key === "Escape") {
                      setMentionQuery(null);
                    }
                  }}
                  placeholder="Message… @ to call someone out"
                  maxLength={100}
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-white text-xs placeholder-gray-600 focus:outline-none focus:border-yellow-400/50"
                />
                <button
                  type="submit"
                  className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold px-3 py-2 rounded-xl text-xs transition-all shadow-md shadow-yellow-400/10 shrink-0"
                >
                  Send
                </button>
              </form>
              <p className="text-gray-600 text-[10px] mt-1 px-1">
                💡 type <span className="text-yellow-500 font-mono">@name</span> to call someone out
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Last trick overlay ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLastTrick && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLastTrick(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.88 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.88 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 border border-white/10 rounded-2xl p-5 max-w-xs w-full shadow-2xl"
            >
              <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-3">Last completed trick</p>
              <TrickGrid
                cards={lastTrick}
                trumpSuit={state?.trump_suit ?? ""}
                playerCount={state?.players.length ?? lastTrick.length}
              />
              <button
                onClick={() => setShowLastTrick(false)}
                className="mt-4 w-full text-gray-600 text-xs hover:text-gray-400"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── @mention fullscreen callout ─────────────────────────────────────────── */}
      <AnimatePresence>
        {mention && (
          <motion.div
            key="mention-overlay"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col items-center gap-2 px-8 py-6 rounded-2xl bg-yellow-400/10 border border-yellow-400/40"
            >
              <span className="text-4xl">📣</span>
              <span className="text-yellow-300 font-extrabold text-xl tracking-wide">@{username}</span>
              <span className="text-white/70 text-sm text-center max-w-[240px] leading-snug">
                <span className="text-yellow-400 font-semibold">{mention.from}</span> called you out
              </span>
              <span className="text-white/90 text-sm text-center max-w-[260px] italic leading-snug">
                "{mention.message.replace(new RegExp(`@${username}`, "gi"), `@${username}`)}"
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating emoji reactions ───────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <AnimatePresence>
          {reactions.map((r) => {
            const seed = r.id.charCodeAt(0) + r.id.charCodeAt(1);
            const sx = ((seed % 9) - 4) * 10; // horizontal spread at origin
            const anim = getEmojiAnim(r.emoji, sx, seed);
            return (
              <motion.div
                key={r.id}
                className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center"
                {...anim}
              >
                <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
                <span className="text-[10px] text-white/70 mt-0.5">{r.username}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Chat toasts ────────────────────────────────────────────────────────── */}
      <div className="fixed top-14 right-3 z-50 flex flex-col gap-1.5 items-end">
        <AnimatePresence>
          {chatToasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              onClick={toggleChat}
              className="cursor-pointer bg-black/80 border border-white/10 rounded-xl px-3 py-1.5 max-w-[200px] backdrop-blur-sm hover:border-white/30"
            >
              <span className="text-yellow-300 text-[11px] font-semibold">{t.username}: </span>
              <span className="text-white text-[11px] break-words">{t.message.length > 40 ? t.message.slice(0, 40) + "…" : t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Rematch invite popup (non-host players) ───────────────────────────── */}
      <AnimatePresence>
        {rematchInvite && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <div className="bg-gray-900 border border-yellow-500/40 rounded-2xl px-6 py-5 text-center max-w-xs w-full shadow-2xl">
              <p className="text-2xl mb-2">🔄</p>
              <p className="text-white font-bold text-lg mb-1">Rematch!</p>
              <p className="text-gray-400 text-sm mb-4">{rematchInvite.host} started a new room</p>
              <button
                onClick={() => { window.location.href = `/game/${rematchInvite.code}`; }}
                className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl mb-2"
              >
                Join →
              </button>
              <button
                onClick={onDismissRematch}
                className="w-full text-gray-500 text-sm py-1 hover:text-gray-300"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function OtherPlayers({
  players,
  myUsername,
  currentPlayerIndex,
  teamsEnabled,
  voiceIsLive,
  voiceMutedUids,
  onToggleVoiceMute,
}: {
  players: GameState["players"];
  myUsername: string;
  currentPlayerIndex: number;
  teamsEnabled: boolean;
  voiceIsLive?: boolean;
  voiceMutedUids?: Set<string>;
  onToggleVoiceMute?: (uid: string) => void;
}) {
  const others = players.filter((p) => p.username !== myUsername);
  if (!others.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {others.map((p) => {
        const isActive  = players[currentPlayerIndex]?.username === p.username;
        const teamColor = teamsEnabled && p.team_index >= 0
          ? TEAM_COLORS[p.team_index % TEAM_COLORS.length]
          : null;

        const isVoiceMuted = voiceIsLive && voiceMutedUids?.has(p.username);

        return (
          <motion.div
            key={p.seat}
            animate={
              isActive
                ? { boxShadow: ["0 0 0 0 rgba(234,179,8,0)", "0 0 10px 2px rgba(234,179,8,0.5)", "0 0 0 0 rgba(234,179,8,0)"] }
                : {}
            }
            transition={{ repeat: Infinity, duration: 1.4 }}
            onClick={voiceIsLive ? () => onToggleVoiceMute?.(p.username) : undefined}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] transition-all
              ${voiceIsLive ? "cursor-pointer select-none" : ""}
              ${isVoiceMuted
                ? "border-red-500/40 bg-red-900/10 opacity-50"
                : isActive
                ? "border-yellow-400/60 bg-yellow-400/5 text-yellow-300"
                : teamColor
                ? `${teamColor.bg} ${teamColor.border} ${teamColor.text}`
                : "border-white/10 bg-black/20 text-gray-300"}
              ${!p.is_connected ? "opacity-40" : ""}
            `}
          >
            {/* Player join number */}
            <span className="text-gray-600 font-mono text-[10px] font-bold">#{p.seat + 1}</span>
            <span className="font-semibold">
              {p.username}
              {!p.is_connected && " 💤"}
              {teamsEnabled && p.is_captain && <span className="opacity-50 ml-0.5">(C)</span>}
            </span>
            <span className="text-gray-600 text-[9px]">
              B:{p.bid >= 0 ? p.bid : "—"} W:{p.tricks_won}
            </span>
            {isVoiceMuted && <span className="text-red-400 text-[10px] ml-auto">🔇</span>}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Clean trick display: every played card is fully visible with player name below it. */
function TrickGrid({
  cards,
  trumpSuit,
  playerCount,
}: {
  cards: GameState["current_trick"];
  trumpSuit: string;
  playerCount: number;
}) {
  if (!cards.length) {
    return (
      <div className="w-full max-w-xs h-24 rounded-xl border-2 border-dashed border-white/8 flex flex-col items-center justify-center gap-1">
        <span className="text-gray-700 text-lg">🂠</span>
        <span className="text-gray-700 text-xs">Waiting for first card…</span>
      </div>
    );
  }

  const sorted = [...cards].sort((a, b) => a.play_order - b.play_order);

  return (
    <div className="w-full max-w-xs">
      <p className="text-gray-600 text-[10px] text-center mb-1.5 uppercase tracking-widest">
        Trick · {cards.length}/{playerCount} cards
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {sorted.map((tc) => {
          const isTrump = tc.suit === trumpSuit;
          return (
            <motion.div
              key={`${tc.suit}-${tc.rank}-${tc.deck_id}-${tc.play_order}`}
              initial={{ scale: 0.4, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="flex flex-col items-center gap-0.5"
            >
              <div className="relative">
                {isTrump && (
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-400 rounded-full z-10 shadow-sm" />
                )}
                <Card card={{ suit: tc.suit, rank: tc.rank, deck_id: tc.deck_id }} played />
              </div>
              <span className="text-[10px] text-gray-400 max-w-[56px] truncate text-center">
                {tc.player_name}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function MobileScoreStrip({
  players,
  currentPlayerIndex,
  myUsername,
  teamsEnabled,
  teams,
}: {
  players: GameState["players"];
  currentPlayerIndex: number;
  myUsername: string;
  teamsEnabled: boolean;
  teams: number[][];
}) {
  if (teamsEnabled && teams.length > 0) {
    return (
      <div className="flex gap-3 text-[10px] whitespace-nowrap items-center">
        {teams.map((seats, ti) => {
          const color   = TEAM_COLORS[ti % TEAM_COLORS.length];
          const members = seats.map((s) => players.find((p) => p.seat === s)).filter(Boolean) as typeof players;
          // All team members share the same total_score — use members[0] to avoid doubling
          const score   = members[0]?.total_score ?? 0;
          return (
            <div key={ti} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${color.bg} border ${color.border}`}>
              <span className={`font-bold ${color.text}`}>T{ti + 1}</span>
              <span className="text-gray-500">{members.map((p) => p.username).join(" & ")}</span>
              <span className={`font-bold ml-0.5 ${score >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {score > 0 ? `+${score}` : score}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex gap-3 text-[10px] whitespace-nowrap">
      {[...players].sort((a, b) => b.total_score - a.total_score).map((p) => (
        <div key={p.seat} className="flex items-center gap-1">
          <span className={`font-semibold ${
            p.username === myUsername ? "text-yellow-400"
            : players[currentPlayerIndex]?.username === p.username ? "text-white"
            : "text-gray-400"
          }`}>
            {p.username}
          </span>
          <span className={p.total_score >= 0 ? "text-emerald-400" : "text-red-400"}>
            {p.total_score > 0 ? `+${p.total_score}` : p.total_score}
          </span>
        </div>
      ))}
    </div>
  );
}

function GameOverBanner({
  players,
  teamsEnabled,
  teams,
  isHost,
  onNewGame,
  onRematch,
}: {
  players: GameState["players"];
  teamsEnabled: boolean;
  teams: number[][];
  isHost: boolean;
  onNewGame: () => void;
  onRematch: () => void;
}) {
  if (teamsEnabled && teams.length > 0) {
    const teamResults = teams
      .map((seats, ti) => {
        const members = seats.map((s) => players.find((p) => p.seat === s)).filter(Boolean) as typeof players;
        // All team members share the same total_score — use members[0] to avoid doubling
        const score = members[0]?.total_score ?? 0;
        return { ti, members, score };
      })
      .sort((a, b) => b.score - a.score);

    const winner = teamResults[0];
    const color  = TEAM_COLORS[winner.ti % TEAM_COLORS.length];

    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center bg-black/60 border border-yellow-500/30 rounded-2xl px-6 py-5 shadow-2xl max-w-sm w-full"
      >
        <p className="text-4xl mb-2">🏆</p>
        <p className={`text-xl font-bold ${color.text}`}>Team {winner.ti + 1} wins!</p>
        <p className="text-gray-400 text-xs mt-0.5 mb-4">
          {winner.members.map((p) => p.username).join(" & ")} · {winner.score > 0 ? `+${winner.score}` : winner.score} pts
        </p>
        <div className="space-y-1.5 mb-5">
          {teamResults.map(({ ti, members, score }, rank) => {
            const c = TEAM_COLORS[ti % TEAM_COLORS.length];
            return (
              <div key={ti} className={`flex justify-between text-sm px-3 py-1.5 rounded-lg ${c.bg} border ${c.border}`}>
                <span className={c.text}>{rank + 1}. {members.map((p) => p.username).join(" & ")}</span>
                <span className={score >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {score > 0 ? `+${score}` : score}
                </span>
              </div>
            );
          })}
        </div>
        {isHost && (
          <button onClick={onRematch} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 rounded-xl mb-2">
            🔄 Rematch (same config)
          </button>
        )}
        <button onClick={onNewGame} className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl">
          New Game →
        </button>
        <p className="text-[10px] text-gray-700 mt-2">
          Seat order: {[...players].sort((a, b) => a.seat - b.seat).map(p => `#${p.seat + 1} ${p.username}`).join(" · ")}
        </p>
      </motion.div>
    );
  }

  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  const winner = sorted[0];
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-center bg-black/60 border border-yellow-500/30 rounded-2xl px-6 py-5 shadow-2xl max-w-sm w-full"
    >
      <p className="text-4xl mb-2">🏆</p>
      <p className="text-yellow-400 text-xl font-bold">{winner.username} wins!</p>
      <p className="text-gray-500 text-xs mt-0.5 mb-4">{winner.total_score} points</p>
      <div className="space-y-1.5 mb-5">
        {sorted.map((p, i) => (
          <div key={p.seat} className="flex justify-between text-sm text-gray-300 px-2">
            <span>{i + 1}. {p.username}</span>
            <span className={p.total_score >= 0 ? "text-emerald-400" : "text-red-400"}>
              {p.total_score > 0 ? `+${p.total_score}` : p.total_score}
            </span>
          </div>
        ))}
      </div>
      {isHost && (
        <button onClick={onRematch} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 rounded-xl mb-2">
          🔄 Rematch (same config)
        </button>
      )}
      <button onClick={onNewGame} className="w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl">
        New Game →
      </button>
      <p className="text-[10px] text-gray-700 mt-2">
        Seat order: {[...players].sort((a, b) => a.seat - b.seat).map(p => `#${p.seat + 1} ${p.username}`).join(" · ")}
      </p>
    </motion.div>
  );
}
