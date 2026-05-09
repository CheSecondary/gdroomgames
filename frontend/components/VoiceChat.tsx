"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  gameCode: string;
  username: string;
}

export default function VoiceChat({ gameCode, username }: Props) {
  const [muted, setMuted] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState<string[]>([]);

  // Agora client stored in ref so it survives re-renders
  const clientRef = useRef<any>(null);
  const localTrackRef = useRef<any>(null);

  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;

  useEffect(() => {
    if (!appId) return; // Agora not configured

    let mounted = true;

    async function join() {
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        // Track who is speaking
        client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
          await client.subscribe(user, mediaType);
          if (mediaType === "audio") {
            user.audioTrack?.play();
            if (mounted) setSpeaking((s) => [...new Set([...s, user.uid as string])]);
          }
        });

        client.on("user-unpublished", (user: any) => {
          if (mounted) setSpeaking((s) => s.filter((u) => u !== user.uid));
        });

        // uid = username for easy identification
        await client.join(appId as string, gameCode, null, username);

        const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localTrackRef.current = micTrack;
        await client.publish([micTrack]);

        if (mounted) setJoined(true);
      } catch (e: any) {
        if (mounted) setError(e.message);
      }
    }

    join();

    return () => {
      mounted = false;
      localTrackRef.current?.close();
      clientRef.current?.leave();
    };
  }, [appId, gameCode, username]);

  const toggleMute = () => {
    const track = localTrackRef.current;
    if (!track) return;
    track.setEnabled(muted); // muted=true → enable (un-mute); muted=false → disable (mute)
    setMuted((m) => !m);
  };

  if (!appId) {
    return (
      <div className="bg-orange-900/30 border border-orange-500/30 rounded-xl p-3 text-center">
        <p className="text-orange-400 text-xs">Voice chat disabled — add <code className="bg-black/40 px-1 rounded">NEXT_PUBLIC_AGORA_APP_ID</code> to <code className="bg-black/40 px-1 rounded">.env.local</code></p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 text-center">
        <p className="text-red-400 text-xs">Voice error: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Voice</span>
        {joined && (
          <span className="flex items-center gap-1 text-emerald-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {!joined && (
        <p className="text-gray-500 text-xs text-center py-2">Connecting…</p>
      )}

      {joined && (
        <button
          onClick={toggleMute}
          className={`
            w-full py-2 rounded-lg font-semibold text-sm transition-all
            ${muted
              ? "bg-red-600/80 hover:bg-red-600 text-white"
              : "bg-emerald-700/60 hover:bg-emerald-700 text-white"
            }
          `}
        >
          {muted ? "🔇 Unmute" : "🎙️ Mute"}
        </button>
      )}
    </div>
  );
}
