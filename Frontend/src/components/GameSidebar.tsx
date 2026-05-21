import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  ChevronsUpDown,
  LogOut,
  Palette,
  Trophy,
  Users,
  MessageSquare,
  Home,
  Settings,
  LayoutDashboard,
  Gamepad2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useUser, useClerk } from "@clerk/react";
import { useGameStore } from "@/store/gameStore";

const sidebarVariants = {
  open: { width: "15rem" },
  closed: { width: "3.05rem" },
};

const contentVariants = {
  open: { display: "block", opacity: 1 },
  closed: { display: "block", opacity: 1 },
};

const variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: { x: { stiffness: 1000, velocity: -100 } },
  },
  closed: {
    x: -20,
    opacity: 0,
    transition: { x: { stiffness: 100 } },
  },
};

const transitionProps = {
  type: "tween" as const,
  ease: "easeOut",
  duration: 0.2,
  staggerChildren: 0.1,
};

const staggerVariants = {
  open: {
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

export function GameSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const location = useLocation();
  const pathname = location.pathname;
  const { user } = useUser();
  const { signOut } = useClerk();
  const { roomId, players, status } = useGameStore();

  const username =
    user?.username || user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "Player";
  const avatarUrl = user?.imageUrl;
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <motion.div
      className={cn("sidebar fixed left-0 z-40 h-full shrink-0 border-r")}
      initial={isCollapsed ? "closed" : "open"}
      animate={isCollapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={transitionProps}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      <motion.div
        className="relative z-40 flex text-muted-foreground h-full shrink-0 flex-col bg-card transition-all"
        variants={contentVariants}
      >
        <motion.ul variants={staggerVariants} className="flex h-full flex-col">
          <div className="flex grow flex-col items-center">

            {/* Header — Room info */}
            <div className="flex h-[64px] w-full shrink-0 border-b p-2 items-center">
              <div className="flex w-full items-center gap-2 px-1">
                <div className="w-5 h-5 shrink-0 rounded bg-primary/20 flex items-center justify-center">
                  <Palette className="w-3 h-3 text-primary" />
                </div>
                <motion.li variants={variants} className="flex w-full items-center gap-1 overflow-hidden">
                  {!isCollapsed && (
                    <>
                      <span className="text-sm font-bold text-foreground truncate">
                        {roomId ? `Room ${roomId}` : "InkArena"}
                      </span>
                      {status === "playing" && (
                        <Badge className="ml-auto flex-shrink-0 h-fit text-[10px] px-1.5 py-0 bg-green-500/15 text-green-400 border-none rounded">
                          LIVE
                        </Badge>
                      )}
                    </>
                  )}
                </motion.li>
              </div>
            </div>

            {/* Nav links */}
            <div className="flex h-full w-full flex-col pt-1">
              <div className="flex grow flex-col gap-4">
                <ScrollArea className="h-16 grow p-2">
                  <div className={cn("flex w-full flex-col gap-1")}>

                    <Link
                      to="/game"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-muted hover:text-primary",
                        (pathname === "/game" || pathname === "/game/") && "bg-muted text-primary"
                      )}
                    >
                      <Gamepad2 className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Arena</p>}
                      </motion.li>
                    </Link>

                    <Link
                      to="/game/dashboard"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-muted hover:text-primary",
                        pathname.includes("dashboard") && "bg-muted text-primary"
                      )}
                    >
                      <LayoutDashboard className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Dashboard</p>}
                      </motion.li>
                    </Link>

                    <Link
                      to="/lobby"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-muted hover:text-primary",
                        pathname.includes("lobby") && "bg-muted text-primary"
                      )}
                    >
                      <Home className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && <p className="ml-2 text-sm font-medium">Lobby</p>}
                      </motion.li>
                    </Link>

                    {/* <Separator className="w-full" /> */}

                    {/* Players count */}
                    {/* <div className="flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 text-muted-foreground">
                      <Users className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <div className="ml-2 flex items-center gap-2">
                            <p className="text-sm font-medium">Players</p>
                            <Badge className="h-fit text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-none rounded">
                              {players.length}
                            </Badge>
                          </div>
                        )}
                      </motion.li>
                    </div> */}

                    {/* Chat */}
                    {/* <div className="flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 text-muted-foreground">
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <p className="ml-2 text-sm font-medium">Chat</p>
                        )}
                      </motion.li>
                    </div> */}

                    {/* Leaderboard */}
                    {/* <div className="flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 text-muted-foreground">
                      <Trophy className="h-4 w-4 shrink-0" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <p className="ml-2 text-sm font-medium">Scores</p>
                        )}
                      </motion.li>
                    </div> */}

                  </div>
                </ScrollArea>
              </div>

              {/* Footer — User menu */}
              <div className="flex flex-col p-2">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger className="w-full">
                    <div className="flex h-8 w-full flex-row items-center gap-2 rounded-md pl-1 py-1.5 transition hover:bg-muted hover:text-primary">
                      <Avatar className="size-6 shrink-0">
                        {avatarUrl && <AvatarImage src={avatarUrl} />}
                        <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                      </Avatar>
                      <motion.li variants={variants} className="flex w-full items-center gap-2 overflow-hidden">
                        {!isCollapsed && (
                          <>
                            <p className="text-sm font-medium truncate">{username}</p>
                            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50" />
                          </>
                        )}
                      </motion.li>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" sideOffset={5} align="start">
                    <div className="flex flex-row items-center gap-2 p-2">
                      <Avatar className="size-6">
                        {avatarUrl && <AvatarImage src={avatarUrl} />}
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-medium">{username}</span>
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {user?.emailAddresses?.[0]?.emailAddress ?? ""}
                        </span>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => signOut({ redirectUrl: "/" })}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

            </div>
          </div>
        </motion.ul>
      </motion.div>
    </motion.div>
  );
}
