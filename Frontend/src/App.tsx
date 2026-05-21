import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@clerk/react";
import Lobby from "./pages/Lobby";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import JoinRoom from "./pages/JoinRoom";
import NotFound from "./pages/NotFound";
import Dashboard from "./components/Dashboard";
import LoginPage from "./components/auth/LoginPage";

import { GameLayout } from "./components/layout/GameLayout";

const queryClient = new QueryClient();

/** Redirects unauthenticated users to /login */
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null; // wait for Clerk to initialize
  return isSignedIn ? <>{children}</> : <Navigate to="/login" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Landing page - always visible */}
          <Route path="/" element={<Landing />} />
          {/* Login page */}
          <Route path="/login" element={<LoginPage />} />
          {/* Lobby — requires auth */}
          <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
          {/* Dashboard — requires auth */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          {/* Invite link — requires auth so username is available */}
          <Route path="/join/:roomId" element={<ProtectedRoute><JoinRoom /></ProtectedRoute>} />
          {/* Game — requires auth */}
          <Route path="/game" element={<ProtectedRoute><GameLayout /></ProtectedRoute>}>
            <Route index element={<Index />} />
            <Route path="dashboard" element={<Dashboard />} />
          </Route>
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
