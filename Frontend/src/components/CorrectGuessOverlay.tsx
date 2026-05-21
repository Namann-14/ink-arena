import { useGameStore } from "@/store/gameStore";
import { useEffect } from "react";

export const CorrectGuessOverlay = () => {
  const { showCorrectAnimation, setShowCorrectAnimation } = useGameStore();

  // Auto-dismiss after animation
  useEffect(() => {
    if (!showCorrectAnimation) return;
    const t = setTimeout(() => setShowCorrectAnimation(false), 1500);
    return () => clearTimeout(t);
  }, [showCorrectAnimation, setShowCorrectAnimation]);

  if (!showCorrectAnimation) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
      onAnimationEnd={() => setShowCorrectAnimation(false)}
    >
      <div className="animate-correct-pop text-4xl sm:text-5xl font-bold text-success">
        Correct!
      </div>
    </div>
  );
};
