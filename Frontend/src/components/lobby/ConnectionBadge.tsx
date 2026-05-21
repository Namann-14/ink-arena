import { motion, AnimatePresence } from "framer-motion";

type Status = "connected" | "connecting" | "disconnected";

interface ConnectionBadgeProps {
  status: Status;
}

const CONFIG: Record<Status, { label: string; dot: string; badge: string }> = {
  connected: {
    label: "Connected",
    dot: "bg-green-400",
    badge: "border-green-500/40 bg-green-500/10 text-green-300",
  },
  connecting: {
    label: "Connecting…",
    dot: "bg-yellow-400",
    badge: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  },
  disconnected: {
    label: "Disconnected",
    dot: "bg-red-400",
    badge: "border-red-500/40 bg-red-500/10 text-red-300",
  },
};

const ConnectionBadge = ({ status }: ConnectionBadgeProps) => {
  const { label, dot, badge } = CONFIG[status];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.25 }}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold tracking-wide ${badge}`}
      >
        {/* Animated dot */}
        <span className="relative flex h-2 w-2">
          {status !== "disconnected" && (
            <motion.span
              className={`absolute inline-flex h-full w-full rounded-full ${dot} opacity-75`}
              animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dot}`} />
        </span>
        {label}
      </motion.div>
    </AnimatePresence>
  );
};

export default ConnectionBadge;
