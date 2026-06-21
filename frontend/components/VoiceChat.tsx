"use client";
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";

interface Props {
  gameCode: string;
  username: string;
  onMutedUidsChange?: (uids: Set<string>) => void;
  onLiveChange?: (live: boolean) => void;
}

export interface VoiceChatHandle {
  toggleMuteUid: (uid: string) => void;
}

const VoiceChat = forwardRef<VoiceChatHandle, Props>(function VoiceChat(
  { gameCode, username, onMutedUidsChange, onLiveChange },
  ref
) {
  const [phase, setPhase] = useState<"idle" | "joining" | "live" | "error">("idle");
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [mutedUids, setMutedUids] = useState<Set<string>>(new Set());
  const clientRef = useRef<any>(null);
  const localTrackRef = useRef<any>(null);
  // track audio tracks by uid so toggleMuteUid can play/stop them
  const audioTracksRef = useRef<Map<string, any>>(new Map());

  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;

  // Propagate mutedUids up
  useEffect(() => {
    onMutedUidsChange?.(mutedUids);
  }, [mutedUids, onMutedUidsChange]);

  // Propagate live state up
  useEffect(() => {
    onLiveChange?.(phase === "live");
  }, [phase, onLiveChange]);

  // Expose toggleMuteUid to parent
  useImperativeHandle(ref, () => ({
    toggleMuteUid: (uid: string) => {
      const track = audioTracksRef.current.get(uid);
      setMutedUids(prev => {
        const next = new Set(prev);
        if (next.has(uid)) {
          track?.play();
          next.delete(uid);
        } else {
          track?.stop();
          next.add(uid);
        }
        return next;
      });
    },
  }));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      localTrackRef.current?.close();
      clientRef.current?.leave().catch(() => {});
    };
  }, []);

  const joinVoice = useCallback(async () => {
    if (!appId) return;
    setPhase("joining");

    try {
      // Fetch token from backend (returns null token if no certificate configured)
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      // uid=0 means "any uid" — Agora assigns one at join time
      const tokenRes = await fetch(`${API_BASE}/api/game/agora-token/?channel=${encodeURIComponent(gameCode)}&uid=0`);
      const tokenData = tokenRes.ok ? await tokenRes.json() : {};
      const token = tokenData.token ?? null;

      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      AgoraRTC.setLogLevel(3);

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") {
          const uid = String(user.uid);
          audioTracksRef.current.set(uid, user.audioTrack);
          // Only play if not locally muted
          setMutedUids(prev => {
            if (!prev.has(uid)) user.audioTrack?.play();
            return prev;
          });
        }
      });

      client.on("user-unpublished", (user: any, mediaType: "audio" | "video") => {
        if (mediaType === "audio") {
          audioTracksRef.current.delete(String(user.uid));
        }
      });

      client.on("user-left", (user: any) => {
        audioTracksRef.current.delete(String(user.uid));
        // Remove from muted set too so they start fresh if they rejoin
        setMutedUids(prev => {
          const next = new Set(prev);
          next.delete(String(user.uid));
          return next;
        });
      });

      await client.join(appId, gameCode, token, null);

      const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      localTrackRef.current = micTrack;
      await client.publish([micTrack]);

      setPhase("live");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Voice error");
      setPhase("error");
    }
  }, [appId, gameCode, username]);

  const toggleMute = () => {
    const track = localTrackRef.current;
    if (!track) return;
    const next = !muted;
    track.setEnabled(!next);
    setMuted(next);
  };

  const leaveVoice = async () => {
    localTrackRef.current?.close();
    localTrackRef.current = null;
    await clientRef.current?.leave().catch(() => {});
    clientRef.current = null;
    audioTracksRef.current.clear();
    setPhase("idle");
    setMuted(false);
    setMutedUids(new Set());
  };

  if (!appId) {
    return (
      <div className="bg-orange-900/20 border border-orange-500/20 rounded-xl p-3 text-center">
        <p className="text-orange-400 text-xs leading-relaxed">
          Voice disabled — add<br />
          <code className="bg-black/30 px-1 rounded text-[11px]">NEXT_PUBLIC_AGORA_APP_ID</code><br />
          to <code className="bg-black/30 px-1 rounded text-[11px]">.env.local</code>
        </p>
      </div>
    );
  }

  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Voice</span>
        {phase === "live" && (
          <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live · tap a name to mute
          </span>
        )}
      </div>

      {phase === "idle" && (
        <button
          onClick={joinVoice}
          className="w-full py-2 rounded-lg bg-emerald-700/50 hover:bg-emerald-700 text-white text-sm font-semibold transition-all"
        >
          🎙️ Join Voice
        </button>
      )}

      {phase === "joining" && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-xs">Joining…</span>
        </div>
      )}

      {phase === "live" && (
        <div className="flex gap-2">
          <button
            onClick={toggleMute}
            className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${
              muted
                ? "bg-red-600/80 hover:bg-red-600 text-white"
                : "bg-emerald-700/60 hover:bg-emerald-700 text-white"
            }`}
          >
            {muted ? "🔇 Unmute me" : "🎙️ Mute me"}
          </button>
          <button
            onClick={leaveVoice}
            title="Leave voice"
            className="px-2.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-sm transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-1">
          <p className="text-red-400 text-xs text-center leading-snug">{errorMsg}</p>
          <button
            onClick={() => { setPhase("idle"); setErrorMsg(""); }}
            className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-all"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
});

export default VoiceChat;
