"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  gameCode: string;
  username: string;
}

// Generate a unique Agora UID per browser session so the same player
// can open multiple tabs without a UID_CONFLICT error.
function makeAgoraUid(username: string): string {
  const key = `os_agora_uid_${username}`;
  let uid = sessionStorage.getItem(key);
  if (!uid) {
    uid = `${username.slice(0, 12)}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(key, uid);
  }
  return uid;
}

export default function VoiceChat({ gameCode, username }: Props) {
  const [phase, setPhase] = useState<"idle" | "joining" | "live" | "error">("idle");
  const [muted, setMuted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const clientRef = useRef<any>(null);
  const localTrackRef = useRef<any>(null);

  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;

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
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

      // Silence Agora's noisy console logs in dev
      AgoraRTC.setLogLevel(3); // 3 = ERROR only

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") user.audioTrack?.play();
      });

      // Unique UID per session tab — prevents UID_CONFLICT across tabs/browsers
      const uid = makeAgoraUid(username);
      await client.join(appId, gameCode, null, uid);

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
    setPhase("idle");
    setMuted(false);
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
            Live
          </span>
        )}
      </div>

      {phase === "idle" && (
        /* Require explicit click → satisfies browser autoplay policy */
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
            {muted ? "🔇 Unmuted" : "🎙️ Mute"}
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
}
