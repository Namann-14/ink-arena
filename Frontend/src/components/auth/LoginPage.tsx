import { motion } from "framer-motion";
import { SignInButton, SignUpButton } from "@clerk/react";
import AnimatedBackground from "@/components/lobby/AnimatedBackground";

/* ── Canvas illustration (floating SVG sketch) ─────────────────────────── */
const CanvasIllustration = () => (
  <motion.div
    animate={{ y: [0, -12, 0] }}
    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    className="w-full max-w-[320px] mx-auto select-none pointer-events-none"
  >
    <svg
      viewBox="0 0 340 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full"
    >
      {/* Canvas frame */}
      <rect
        x="20" y="20" width="300" height="200" rx="12"
        fill="oklch(0.185 0.02 260)"
        stroke="oklch(0.28 0.015 260)"
        strokeWidth="1.5"
      />
      {/* Toolbar bar */}
      <rect
        x="20" y="20" width="300" height="36" rx="12"
        fill="oklch(0.22 0.018 260)"
      />
      {/* Tool dots */}
      <circle cx="44"  cy="38" r="6" fill="oklch(0.54 0.25 264 / 0.6)" />
      <circle cx="64"  cy="38" r="6" fill="oklch(0.54 0.25 264 / 0.4)" />
      <circle cx="84"  cy="38" r="6" fill="oklch(0.54 0.25 264 / 0.25)" />
      {/* Brush strokes */}
      <path
        d="M 60 100 Q 110 70 160 110 Q 210 150 270 90"
        stroke="oklch(0.54 0.25 264 / 0.6)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 50 150 Q 120 130 180 155 Q 230 175 280 140"
        stroke="oklch(0.62 0.19 260 / 0.5)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Guess bubbles */}
      <rect x="28"  y="172" width="90"  height="22" rx="11"
        fill="oklch(0.22 0.018 260)"
        stroke="oklch(0.28 0.015 260)" strokeWidth="1"
      />
      <rect x="126" y="172" width="70"  height="22" rx="11"
        fill="oklch(0.54 0.25 264 / 0.15)"
        stroke="oklch(0.54 0.25 264 / 0.3)" strokeWidth="1"
      />
      <rect x="204" y="172" width="108" height="22" rx="11"
        fill="oklch(0.22 0.018 260)"
        stroke="oklch(0.28 0.015 260)" strokeWidth="1"
      />
    </svg>
  </motion.div>
);

/* ── Feature bullet ─────────────────────────────────────────────────────── */
interface FeatureProps {
  icon: React.ReactNode;
  text: string;
  delay: number;
}

const Feature = ({ icon, text, delay }: FeatureProps) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.5, delay }}
    className="flex items-center gap-3 text-muted-foreground text-sm"
  >
    <span className="text-primary shrink-0">{icon}</span>
    {text}
  </motion.div>
);

/* ── Inline icon SVGs ───────────────────────────────────────────────────── */
const IconLightning = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const IconTrophy = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

const IconPalette = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
    />
  </svg>
);

/* ── Decorative glow accent ─────────────────────────────────────────────── */
const GlowAccent = () => (
  <div
    aria-hidden="true"
    className="
      absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2
      w-[500px] h-[500px] rounded-full
      bg-primary/5
      blur-[120px]
      pointer-events-none
    "
  />
);

/* ── LoginPage ──────────────────────────────────────────────────────────── */
const LoginPage = () => {
  return (
    <div className="relative h-screen w-screen overflow-hidden flex">
      <AnimatedBackground />
      <GlowAccent />

      {/* ── Left branding panel — desktop only ─────────────────────────── */}
      <div
        className="
          relative z-10 hidden lg:flex flex-col justify-center items-start
          w-1/2 xl:w-[55%] px-16 xl:px-24 gap-10
        "
      >
        {/* Logo + tagline */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-3"
        >
          <div className="flex items-end gap-1">
            <h1 className="text-7xl xl:text-8xl font-black tracking-tighter text-white leading-none">
              Ink
            </h1>
            <h1 className="text-7xl xl:text-8xl font-black tracking-tighter leading-none text-primary drop-shadow-[0_0_30px_oklch(0.54_0.25_264/0.5)]">
              Arena
            </h1>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-xl text-muted-foreground font-medium tracking-[0.15em] uppercase"
          >
            Draw · Guess · Dominate
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-sm text-muted-foreground/80 max-w-xs leading-relaxed"
          >
            A fast-paced multiplayer drawing game where creativity meets
            competition. Sketch, guess, and climb the ranks.
          </motion.p>
        </motion.div>

        {/* Canvas illustration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="w-full"
        >
          <CanvasIllustration />
        </motion.div>

        {/* Feature bullets */}
        <div className="space-y-4">
          <Feature
            delay={0.55}
            text="Real-time multiplayer drawing"
            icon={<IconLightning />}
          />
          <Feature
            delay={0.65}
            text="Competitive scoring and leaderboard"
            icon={<IconTrophy />}
          />
          <Feature
            delay={0.75}
            text="AI-generated drawing words"
            icon={<IconPalette />}
          />
        </div>
      </div>

      {/* ── Right login panel ───────────────────────────────────────────── */}
      <div
        className="
          relative z-10
          flex flex-1 flex-col items-center justify-center
          px-6 py-10
          lg:items-end lg:justify-center lg:pr-16 xl:pr-24
        "
      >
        {/* Mobile-only logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:hidden flex items-end gap-1 mb-10"
        >
          <span className="text-5xl font-black tracking-tighter text-white leading-none">
            Ink
          </span>
          <span className="text-5xl font-black tracking-tighter leading-none text-primary drop-shadow-[0_0_20px_oklch(0.54_0.25_264/0.5)]">
            Arena
          </span>
        </motion.div>

        {/* Login card */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ boxShadow: "0 24px 60px oklch(0.54 0.25 264 / 0.18)" }}
          className="
            w-full max-w-sm
            rounded-2xl
            bg-card/80 backdrop-blur-xl
            border border-blue-500/20
            p-8
            shadow-2xl shadow-blue-500/10
            transition-shadow duration-500
          "
        >
          {/* Header */}
          <div className="mb-8 text-center space-y-1.5">
            <h2 className="text-2xl font-black tracking-tight text-foreground">
              Enter{" "}
              <span className="text-primary drop-shadow-[0_0_12px_oklch(0.54_0.25_264/0.6)]">
                InkArena
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in to start drawing
            </p>
          </div>

          {/* Clerk Sign In */}
          <div className="space-y-3">
            <SignInButton mode="modal">
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 0 28px oklch(0.54 0.25 264 / 0.4)" }}
                whileTap={{ scale: 0.98 }}
                className="
                  relative flex items-center justify-center gap-2.5 group
                  w-full h-12 rounded-xl
                  font-semibold text-base tracking-wide
                  transition-all duration-200
                  bg-gradient-to-r from-primary to-blue-400
                  text-white
                  overflow-hidden
                "
              >
                {/* Shimmer sweep */}
                <span
                  aria-hidden="true"
                  className="
                    absolute inset-0 -skew-x-12 -translate-x-full
                    group-hover:translate-x-[220%]
                    transition-transform duration-700
                    bg-gradient-to-r from-transparent via-white/15 to-transparent
                    pointer-events-none
                  "
                />
                Sign In
              </motion.button>
            </SignInButton>

            {/* Divider */}
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground tracking-[0.2em] uppercase">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Clerk Sign Up */}
            <SignUpButton mode="modal">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="
                  relative flex items-center justify-center gap-2.5
                  w-full h-12 rounded-xl
                  font-semibold text-base tracking-wide
                  transition-all duration-200
                  bg-secondary border border-border
                  text-foreground
                  hover:bg-accent
                  overflow-hidden
                "
              >
                Create Account
              </motion.button>
            </SignUpButton>
          </div>

          {/* Footer */}
          <p className="mt-7 text-center text-xs text-muted-foreground/60">
            Powered by Clerk · Secure authentication
          </p>
        </motion.div>

        {/* Mobile feature bullets */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="lg:hidden mt-8 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground"
        >
          <span>⚡ Real-time multiplayer</span>
          <span>🏆 Live leaderboard</span>
          <span>🎨 AI words</span>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
