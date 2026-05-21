import { useQuery } from "@tanstack/react-query";
import { useAuth, useUser } from "@clerk/react";
import { fetchMe, AuthUser } from "@/services/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Trophy, 
  Gamepad2, 
  Target, 
  Star, 
  Shield, 
  Swords, 
  Crown, 
  ArrowLeft,
  Calendar,
  Zap,
  LucideIcon
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const BadgeItem = ({ icon: Icon, title, description, unlocked, color }: { 
  icon: LucideIcon | React.ElementType, 
  title: string, 
  description: string, 
  unlocked: boolean,
  color: string 
}) => (
  <motion.div 
    whileHover={{ scale: 1.02 }}
    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
      unlocked 
        ? `bg-card border-border shadow-sm` 
        : "bg-muted/30 border-transparent opacity-60 grayscale"
    }`}
  >
    <div className={`p-3 rounded-full ${unlocked ? color : "bg-muted"}`}>
      <Icon className={`w-6 h-6 ${unlocked ? "text-white" : "text-muted-foreground"}`} />
    </div>
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm tracking-tight">{title}</span>
        {unlocked && (
          <Badge variant="secondary" className="h-4 text-[9px] uppercase tracking-wider px-1 bg-primary/10 text-primary border-none">
            Unlocked
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  </motion.div>
);

const StatCard = ({ icon: Icon, label, value, description, color }: {
  icon: LucideIcon | React.ElementType,
  label: string,
  value: string | number,
  description: string,
  color: string
}) => (
  <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={`p-3 rounded-2xl ${color} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
        <Zap className="w-3 h-3 text-amber-500" />
        {description}
      </p>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const { getToken } = useAuth();
  const { user: clerkUser } = useUser();
  
  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["me"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return fetchMe(token);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8 flex flex-col gap-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[150px]" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-destructive font-medium">Failed to load dashboard data</p>
        <Button asChild variant="outline">
          <Link to="/lobby">Back to Lobby</Link>
        </Button>
      </div>
    );
  }

  const badges = [
    {
      icon: Shield,
      title: "Soldier",
      description: "Played 10 or more games",
      unlocked: user.gamesPlayed >= 10,
      color: "bg-blue-500"
    },
    {
      icon: Swords,
      title: "Knight",
      description: "Played 50 or more games",
      unlocked: user.gamesPlayed >= 50,
      color: "bg-purple-500"
    },
    {
      icon: Crown,
      title: "King",
      description: "Played 100 or more games",
      unlocked: user.gamesPlayed >= 100,
      color: "bg-amber-500"
    },
    {
      icon: Target,
      title: "Marksman",
      description: "Won 10 or more games",
      unlocked: user.wins >= 10,
      color: "bg-emerald-500"
    },
    {
      icon: Star,
      title: "Legend",
      description: "Won 50 or more games",
      unlocked: user.wins >= 50,
      color: "bg-rose-500"
    },
    {
      icon: Trophy,
      title: "Arena Master",
      description: "Accumulated 10,000 total score",
      unlocked: user.totalScore >= 10000,
      color: "bg-indigo-500"
    }
  ];

  const winRate = user.gamesPlayed > 0 ? ((user.wins / user.gamesPlayed) * 100).toFixed(1) : "0";
  const isNested = window.location.pathname.startsWith('/game');

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <div className="flex items-center gap-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Avatar className="h-24 w-24 border-4 border-card shadow-xl ring-2 ring-primary/20">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                  {user.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </motion.div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-black tracking-tight">{user.username}</h1>
                <Badge className="bg-primary/10 text-primary border-none font-bold uppercase">
                  {user.rankInfo?.currentRank || "Rank I"}
                </Badge>
              </div>
              <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <Calendar className="w-4 h-4" />
                Member since {new Date(clerkUser?.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="rounded-full gap-2 border-border/50 hover:bg-muted group">
            <Link to={isNested ? "/game" : "/lobby"}>
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              {isNested ? "Back to Game" : "Back to Arena"}
            </Link>
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StatCard 
            icon={Gamepad2} 
            label="Games Played" 
            value={user.gamesPlayed} 
            description="Total matches across all rooms"
            color="bg-blue-500"
          />
          <StatCard 
            icon={Trophy} 
            label="Total Wins" 
            value={user.wins} 
            description="First place finishes achieved"
            color="bg-amber-500"
          />
          <StatCard 
            icon={Target} 
            label="Win Rate" 
            value={`${winRate}%`} 
            description="Percentage of games won"
            color="bg-emerald-500"
          />
          <StatCard 
            icon={Star} 
            label="Career Score" 
            value={user.totalScore.toLocaleString()} 
            description="All-time points accumulated"
            color="bg-purple-500"
          />
        </div>

        {/* Main Content Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Badges Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Shield className="w-6 h-6 text-primary" />
                Achievements & Badges
              </h2>
              <p className="text-sm text-muted-foreground font-medium">
                {badges.filter(b => b.unlocked).length} / {badges.length} Unlocked
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {badges.map((badge, idx) => (
                <BadgeItem key={idx} {...badge} />
              ))}
            </div>
          </div>

          {/* Activity/Sidebar Info */}
          <div className="space-y-6">
            <Card className="border-border/50 bg-card/50 backdrop-blur-sm h-fit">
              <CardHeader>
                <CardTitle className="text-lg">Arena Progress</CardTitle>
                <CardDescription>Track your climb to the top</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>{user.rankInfo?.nextRank !== 'Max Rank Reached' ? 'Next Rank Progress' : 'Max Rank'}</span>
                    <span>{user.rankInfo?.progress ?? 0}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${user.rankInfo?.progress ?? 0}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="h-full bg-primary" 
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{user.rankInfo?.description}</p>
                </div>

                <div className="pt-4 border-t border-border/50 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Zap className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Daily Streak</p>
                      <p className="text-xs text-muted-foreground">
                        {user.streak ?? 0} Day{user.streak === 1 ? "" : "s"} playing
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <Star className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Best Score</p>
                      <p className="text-xs text-muted-foreground">
                        {user.bestScore > 0 ? `${user.bestScore.toLocaleString()} in a single game` : "No matches finished"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
