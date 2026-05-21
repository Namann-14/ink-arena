/**
 * WordSelectionModal
 * ──────────────────────────────────────────────────────────────────────────
 * Shown only to the active drawer when the backend sends `word_options`.
 * Drawer picks one of 3 words within the selection timeout; if they don't,
 * the backend auto-selects for them and this modal auto-hides.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil } from "lucide-react";
import { useGameStore } from "@/store/gameStore";
import { socket } from "@/services/socket";

export function WordSelectionModal() {
  const {
    showWordSelection,
    wordOptions,
    localPlayerId,
    currentDrawer,
    roomId,
    setShowWordSelection,
    setWordOptions,
  } = useGameStore();

  const [timeLeft, setTimeLeft]   = useState(10);
  const [chosen, setChosen]       = useState<string | null>(null);
  const timerRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDrawer = localPlayerId === currentDrawer;
  const visible  = showWordSelection && isDrawer && wordOptions.length > 0;

  // Start / reset countdown whenever the modal opens
  useEffect(() => {
    if (!visible) {
      setTimeLeft(10);
      setChosen(null);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setTimeLeft(10);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Backend will auto-select; just hide the modal
          setShowWordSelection(false);
          setWordOptions([]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePick = (word: string) => {
    if (chosen) return; // already picked
    setChosen(word);
    if (timerRef.current) clearInterval(timerRef.current);

    socket.emit("select_word", { roomId, word }, (res) => {
      if (!res?.success) {
        console.warn("[WordSelectionModal] select_word failed:", res?.error);
      }
    });

    // Dismiss immediately — backend will broadcast word info
    setTimeout(() => {
      setShowWordSelection(false);
      setWordOptions([]);
    }, 300);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="word-selection-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            key="word-selection-panel"
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-[0_4px_24px_oklch(0_0_0/0.6)] p-5 sm:p-8 flex flex-col gap-4 sm:gap-6 mx-2"
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary" />
                <h2 className="text-lg sm:text-xl font-bold text-foreground">Choose a word</h2>
              </div>
              {/* Countdown ring */}
              <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="absolute inset-0 w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeOpacity={0.15}
                  />
                  <circle
                    cx="18" cy="18" r="15"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="3"
                    strokeDasharray={`${(timeLeft / 10) * 94.25} 94.25`}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className="text-sm font-bold tabular-nums text-foreground z-10">
                  {timeLeft}
                </span>
              </div>
            </div>

            <p className="text-sm sm:text-base text-muted-foreground -mt-2">
              Pick quickly \u2014 if you don\u2019t choose, one will be selected for you.
            </p>

            {/* Word cards */}
            <div className="flex flex-col gap-2 sm:gap-3">
              {wordOptions.map((word) => (
                <motion.button
                  key={word}
                  onClick={() => handlePick(word)}
                  disabled={!!chosen}
                  className={`
                    w-full py-4 sm:py-5 px-4 sm:px-6 rounded-xl border text-left text-base sm:text-lg font-semibold
                    transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                    ${chosen === word
                      ? "bg-primary/20 border-primary text-primary"
                      : chosen
                      ? "opacity-40 cursor-not-allowed bg-secondary border-border text-foreground"
                      : "bg-secondary border-border text-foreground hover:bg-primary/10 hover:border-primary/50 hover:text-primary cursor-pointer"
                    }
                  `}
                  whileHover={!chosen ? { scale: 1.02 } : {}}
                  whileTap={!chosen ? { scale: 0.97 } : {}}
                >
                  {word}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
