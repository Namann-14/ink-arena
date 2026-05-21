import { Outlet } from "react-router-dom";
import { GameSidebar } from "@/components/GameSidebar";
import { useGameSocket } from "@/hooks/useGameSocket";
import { WordSelectionModal } from "@/components/WordSelectionModal";
import { WinnerModal } from "@/components/WinnerModal";
import { CorrectGuessOverlay } from "@/components/CorrectGuessOverlay";

export function GameLayout() {
  useGameSocket();

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-background flex">
      {/* Collapsible sidebar — desktop only */}
      <div className="hidden md:block">
        <GameSidebar />
      </div>

      {/* Main content area — offset by collapsed sidebar width (3.05rem) on desktop */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-[3.05rem] relative">
        <Outlet />
      </div>

      {/* Shared Overlays — visible in both Game and Dashboard views */}
      <WordSelectionModal />
      <WinnerModal />
      <CorrectGuessOverlay />
    </div>
  );
}
