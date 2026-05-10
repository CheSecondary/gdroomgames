"use client";
import { useState } from "react";
import { motion } from "framer-motion";

interface Props {
  maxBid: number;
  onBid: (bid: number) => void;
  /** In teams mode, non-captains see a waiting message instead of the bid picker */
  isCapitain?: boolean;
  captainUsername?: string;
}

export default function BidPanel({ maxBid, onBid, isCapitain = true, captainUsername }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  // Non-captain teammate waiting view
  if (!isCapitain) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/50 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl text-center max-w-xs w-full"
      >
        <p className="text-4xl mb-3">🤝</p>
        <p className="text-emerald-300 font-bold text-base mb-1">Team Bid</p>
        <p className="text-gray-300 text-sm">
          <span className="text-white font-semibold">{captainUsername ?? "Your captain"}</span> is
          placing your team&apos;s bid.
        </p>
        <p className="text-gray-500 text-xs mt-3 leading-relaxed">
          Discuss your strategy in voice chat! 🎤
        </p>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="mt-4 flex justify-center gap-1"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          ))}
        </motion.div>
      </motion.div>
    );
  }

  const bids = Array.from({ length: maxBid + 1 }, (_, i) => i);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/50 border border-yellow-500/30 rounded-2xl p-5 shadow-2xl text-center w-full max-w-xs"
    >
      <p className="text-yellow-400 font-semibold mb-1 text-lg">Place Your Bid</p>
      <p className="text-gray-500 text-xs mb-4">How many tricks will you take?</p>
      <div className="flex flex-wrap gap-2 justify-center mb-5">
        {bids.map((b) => (
          <button
            key={b}
            onClick={() => setSelected(b)}
            className={`
              w-10 h-10 rounded-full font-bold text-sm transition-all
              ${selected === b
                ? "bg-yellow-400 text-gray-900 scale-110 shadow-lg shadow-yellow-400/30"
                : "bg-white/10 text-white hover:bg-white/20"
              }
            `}
          >
            {b}
          </button>
        ))}
      </div>
      <motion.button
        whileTap={selected !== null ? { scale: 0.95 } : {}}
        disabled={selected === null}
        onClick={() => selected !== null && onBid(selected)}
        className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-bold px-8 py-2.5 rounded-full transition-all text-sm"
      >
        Confirm Bid
      </motion.button>
    </motion.div>
  );
}
