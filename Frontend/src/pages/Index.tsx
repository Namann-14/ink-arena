import { useState, useCallback, memo } from "react";
import { Users, MessageSquare, Trophy } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { ChatPanel } from "@/components/ChatPanel";
import { PlayerList } from "@/components/PlayerList";
import { GuessInput } from "@/components/GuessInput";
import { useGameStore } from "@/store/gameStore";

/* ── Mobile tab types ────────────────────────────────────────────────── */
type MobileTab = "chat" | "players" | "leaderboard";

const TAB_CONFIG: { id: MobileTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "players", label: "Players", icon: Users },
  { id: "leaderboard", label: "Scores", icon: Trophy },
];

/* ── Mobile Tab Bar ──────────────────────────────────────────────────── */
const MobileTabBar = memo(
  ({ activeTab, onTabChange }: { activeTab: MobileTab; onTabChange: (t: MobileTab) => void }) => (
    <div className="flex border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
      {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold tracking-wide uppercase transition-colors ${
            activeTab === id
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground"
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
);
MobileTabBar.displayName = "MobileTabBar";

/* ── Leaderboard (scores-focused view) ───────────────────────────────── */
const Leaderboard = memo(() => {
  const players = useGameStore((s) => s.players);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const sorted = [...players].sort((a, b) => b.score - a.score);

  const medal = (i: number, score: number) => {
    if (score === 0) return `#${i + 1}`;
    if (i === 0) return "🥇";
    if (i === 1) return "🥈";
    if (i === 2) return "🥉";
    return `#${i + 1}`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
      {sorted.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground pt-8">No scores yet</p>
      ) : (
        sorted.map((player, i) => {
          const isLocal = player.id === localPlayerId;
          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                i === 0 && player.score > 0
                  ? "bg-amber-500/5 border border-amber-500/20 shadow-sm"
                  : isLocal
                  ? "bg-accent/50 border border-border/50 shadow-sm"
                  : "bg-secondary/30 border border-transparent hover:bg-secondary/50"
              }`}
            >
              <span className={`text-sm font-bold w-7 text-center shrink-0 ${i === 0 && player.score > 0 ? "text-amber-500/80" : "text-muted-foreground/60"}`}>
                {medal(i, player.score)}
              </span>
              <span className="font-medium text-sm text-foreground/80 flex-1 truncate">
                {player.username}
                {isLocal && <span className="text-muted-foreground/60 text-[11px] ml-1.5 font-normal">(you)</span>}
              </span>
              <span className={`font-mono font-bold text-sm tabular-nums ${isLocal ? "text-primary/80" : "text-muted-foreground/70"}`}>
                {player.score}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
});
Leaderboard.displayName = "Leaderboard";

/* ── Main Game Page ──────────────────────────────────────────────────── */
const Index = () => {
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  const handleTabChange = useCallback((tab: MobileTab) => {
    setMobileTab(tab);
  }, []);

  return (
    <>
      {/* Top Control Bar */}
      <TopBar />

      {/* Main Content */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Desktop: Left panel — Players */}
        <aside className="hidden md:flex flex-col w-56 xl:w-64 shrink-0 border-r border-border overflow-hidden">
          <PlayerList />
        </aside>

        {/* Canvas area */}
        <main className="shrink-0 h-[56dvh] md:h-auto md:flex-1 min-w-0 flex flex-col p-1.5 sm:p-3 gap-1.5 sm:gap-2 overflow-hidden">
          <div className="flex-1 min-h-0 relative">
            <DrawingCanvas />
          </div>
        </main>

        {/* Desktop: Right panel — Chat + Input */}
        <aside className="hidden md:flex flex-col w-72 xl:w-80 shrink-0 border-l border-border overflow-hidden">
          <ChatPanel />
          <GuessInput />
        </aside>

        {/* Mobile: Tabs + Tab content below canvas */}
        <div className="md:hidden flex flex-col flex-1 min-h-0 border-t border-border bg-card">
          <MobileTabBar activeTab={mobileTab} onTabChange={handleTabChange} />
          <div className="flex-1 min-h-0 overflow-hidden">
            {mobileTab === "chat" && <ChatPanel />}
            {mobileTab === "players" && <PlayerList />}
            {mobileTab === "leaderboard" && <Leaderboard />}
          </div>
        </div>
      </div>

      {/* Mobile: Sticky Guess Input */}
      <div className="md:hidden shrink-0">
        <GuessInput />
      </div>
    </>
  );
};

export default Index;
