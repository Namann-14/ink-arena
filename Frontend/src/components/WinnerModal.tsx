import { useGameStore } from "@/store/gameStore";
import { Trophy, X } from "lucide-react";

export const WinnerModal = () => {
  const { status, players, setStatus } = useGameStore();

  if (status !== "game_end") return null;

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 animate-float-in p-4">
      <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-md w-full text-center animate-correct-pop shadow-[0_4px_24px_oklch(0_0_0/0.6)]">
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setStatus("lobby")}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-warning/20 flex items-center justify-center">
            <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-warning" />
          </div>
        </div>

        <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">Game Over!</h2>
        <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
          <span className="text-primary font-semibold">{winner?.username}</span> wins!
        </p>

        <div className="space-y-2 mb-6 sm:mb-8">
          {sorted.slice(0, 5).map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl ${
                i === 0
                  ? "bg-warning/10 border border-warning/30"
                  : "bg-secondary/50"
              }`}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="font-mono text-sm sm:text-base text-muted-foreground w-6">
                  #{i + 1}
                </span>
                <span className="font-medium text-sm sm:text-base text-foreground">{player.username}</span>
              </div>
              <span className="font-mono font-bold text-sm sm:text-base text-primary">{player.score}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => setStatus("lobby")}
          className="w-full h-11 sm:h-12 rounded-xl bg-primary text-primary-foreground text-sm sm:text-base font-semibold hover:bg-primary/90 active:scale-95 transition-all"
        >
          Play Again
        </button>
      </div>
    </div>
  );
};
