import { useGameStore } from "@/store/gameStore";
import { LogOut, Pencil, Users } from "lucide-react";
import { CountdownTimer } from "./CountdownTimer";
import { useNavigate } from "react-router-dom";
import { socket } from "@/services/socket";

export const TopBar = () => {
  const {
    roomId,
    currentRound,
    totalRounds,
    players,
    currentDrawer,
    word,
    wordHint,
    localPlayerId,
    status,
    selectedRounds,
    setSelectedRounds,
    hostId,
  } = useGameStore();

  const navigate = useNavigate();
  const isDrawer = localPlayerId === currentDrawer;
  const drawerPlayer = players.find((p) => p.id === currentDrawer);
  const isHost = hostId !== "" && hostId === localPlayerId;

  const handleStartGame = () => {
    if (!roomId) return;
    socket.emit("start_game", { roomId, totalRounds: selectedRounds });
  };

  const handleExit = () => navigate("/lobby");

  /*  Lobby / Waiting Room  */
  if (status === "lobby") {
    return (
      <header className="shrink-0 flex items-center justify-between px-3 sm:px-6 border-b border-border/50 bg-card/80 backdrop-blur-md gap-2 sm:gap-4 min-h-[56px] sm:min-h-[64px]">
        {/* Room + player count */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-mono hidden sm:block opacity-70">
            Room
          </span>
          <span className="text-sm sm:text-base font-mono font-bold text-foreground/90 truncate max-w-[100px] sm:max-w-[140px]">
            {roomId || "\u2014"}
          </span>
          <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground bg-secondary/60 px-2 py-1 rounded-full border border-border/30">
            <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-70" />
            <span>{players.length}</span>
          </div>
        </div>

        {/* Host controls or waiting message */}
        <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-center min-w-0">
          {isHost ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <label className="text-sm text-muted-foreground hidden sm:block opacity-70">Rounds</label>
              <select
                value={selectedRounds}
                onChange={(e) => setSelectedRounds(Number(e.target.value))}
                className="h-9 sm:h-10 px-2 sm:px-3 rounded-xl bg-secondary/50 border border-border/50 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer transition-all"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                onClick={handleStartGame}
                disabled={players.length < 2}
                title={players.length < 2 ? "Need at least 2 players" : "Start the game"}
                className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 h-10 sm:h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
                           hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Start
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-secondary/40 border border-border/30 text-sm text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-pulse" />
              <span className="hidden sm:inline">Waiting for host to start</span>
              <span className="sm:hidden">Waiting…</span>
            </div>
          )}
        </div>

        {/* Exit */}
        <button
          onClick={handleExit}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-sm text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4 opacity-70" />
          <span className="hidden sm:inline">Exit</span>
        </button>
      </header>
    );
  }

  /*  Playing / Round-end  */
  const roundProgress = totalRounds > 0 ? (currentRound / totalRounds) * 100 : 0;

  // Render word hint as individual character blocks for mobile clarity
  const renderWordHint = () => {
    const hint = wordHint || "_ _ _";
    const chars = hint.split("");
    return (
      <div className="flex items-center gap-[2px] sm:gap-1 flex-wrap justify-center">
        {chars.map((ch, i) =>
          ch === " " ? (
            <span key={i} className="w-2 sm:w-3" />
          ) : (
            <span
              key={i}
              className={`font-mono font-bold text-base sm:text-lg ${ch === "_"
                  ? "text-muted-foreground/60 border-b-2 border-muted-foreground/20 w-4 sm:w-5 text-center inline-block"
                  : "text-foreground/90"
                }`}
            >
              {ch}
            </span>
          )
        )}
      </div>
    );
  };

  return (
    <header className="shrink-0 border-b border-border/50 bg-card/80 backdrop-blur-md">
      {/* Main bar */}
      <div className="flex items-center justify-between px-2 sm:px-6 py-1.5 sm:py-2.5 gap-2 sm:gap-4 min-h-[46px] sm:min-h-[64px]">
        {/* Left: Round info + Drawer */}
        <div className="flex items-center gap-1.5 sm:gap-4 min-w-0 shrink-0">
          <span className="font-mono font-bold text-foreground/80 text-sm hidden sm:block truncate max-w-[120px]">
            {roomId}
          </span>
          <div className="flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm shrink-0">
            <span className="text-muted-foreground/70 hidden sm:inline">Round</span>
            <span className="font-bold text-foreground/90">{currentRound}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-muted-foreground/70">{totalRounds}</span>
          </div>
          {drawerPlayer && (
            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
              <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary/70 shrink-0" />
              <span className="font-medium text-foreground/80 truncate max-w-[60px] sm:max-w-[140px]">
                {drawerPlayer.username}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground bg-secondary/60 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-border/30">
            <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-70" />
            <span>{players.length}</span>
          </div>
        </div>

        {/* Center: Word display */}
        <div className="flex-1 flex justify-center min-w-0 px-1">
          {status === "round_end" ? (
            <div className="px-3 sm:px-5 py-1 sm:py-1.5 rounded-xl bg-secondary/50 border border-border/40 max-w-full">
              <span className="font-mono font-bold text-foreground/90 tracking-widest text-base sm:text-lg truncate block">
                {word}
              </span>
            </div>
          ) : isDrawer ? (
            <div className="px-3 sm:px-5 py-1 sm:py-1.5 rounded-xl bg-primary/5 border border-primary/20 max-w-full">
              <span className="font-mono font-bold text-primary tracking-widest text-base sm:text-lg truncate block">
                {word}
              </span>
            </div>
          ) : (
            <div className="px-2 sm:px-5 py-1 sm:py-1.5 rounded-xl bg-secondary/40 border border-border/30 max-w-full overflow-hidden">
              {renderWordHint()}
            </div>
          )}
        </div>

        {/* Right: Timer + Exit */}
        <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
          <CountdownTimer />
          <button
            onClick={handleExit}
            className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-70" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </div>

      {/* Round progress bar */}
      <div className="h-[2px] bg-border/30">
        <div
          className="h-full bg-primary/40 transition-all duration-500 ease-out"
          style={{ width: `${roundProgress}%` }}
        />
      </div>
    </header>
  );
};
