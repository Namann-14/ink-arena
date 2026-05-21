import { useGameStore } from "@/store/gameStore";
import { useEffect, useState } from "react";

export const CountdownTimer = () => {
  const { timeLeft, totalTime } = useGameStore();
  const isWarning = timeLeft <= 10;

  // Animated countdown with demo tick
  const [displayTime, setDisplayTime] = useState(timeLeft);

  useEffect(() => {
    setDisplayTime(timeLeft);
  }, [timeLeft]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayTime((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (displayTime / totalTime) * circumference;

  return (
    <div className={`relative flex items-center justify-center ${isWarning && displayTime > 0 ? "animate-countdown-pulse" : ""}`}>
      <svg width="44" height="44" className="sm:w-[56px] sm:h-[56px] transform -rotate-90">
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="2.5"
          className="sm:[cx:28] sm:[cy:28]"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke={isWarning && displayTime > 0 ? "var(--destructive)" : "var(--primary)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-1000 ease-linear sm:[cx:28] sm:[cy:28]"
          style={{
            filter: isWarning && displayTime > 0
              ? "drop-shadow(0 0 4px oklch(0.704 0.191 22.216 / 0.5))"
              : "drop-shadow(0 0 4px oklch(0.488 0.243 264.376 / 0.4))",
          }}
        />
      </svg>
      <span
        className={`absolute text-sm sm:text-lg font-bold font-mono ${
          isWarning && displayTime > 0 ? "timer-warning" : "text-foreground"
        }`}
      >
        {displayTime}
      </span>
    </div>
  );
};
