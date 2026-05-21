import { useGameStore, type ChatMessage } from "@/store/gameStore";
import { useEffect, useRef, memo } from "react";

const MessageItem = memo(({ msg }: { msg: ChatMessage }) => {
  if (msg.type === "system") {
    return (
      <div className="text-[11px] text-muted-foreground italic text-center py-0.5 animate-float-in">
        {msg.message}
      </div>
    );
  }

  if (msg.type === "correct") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success/10 border border-success/20 animate-correct-pop">
        <span className="text-success font-semibold text-sm">✓ {msg.username}</span>
        <span className="text-success/80 text-xs">{msg.message}</span>
      </div>
    );
  }

  return (
    <div className="animate-float-in">
      <div className="inline-block max-w-[90%] px-3 py-1.5 rounded-2xl rounded-bl-sm bg-secondary/40 border border-border/20">
        <span className="text-[10px] font-semibold text-muted-foreground/80 leading-tight block mb-0.5">{msg.username}</span>
        <span className="text-sm text-foreground/80 break-words leading-relaxed">{msg.message}</span>
      </div>
    </div>
  );
});
MessageItem.displayName = "MessageItem";

export const ChatPanel = () => {
  const messages = useGameStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll — only if user is near the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header — desktop only */}
      <div className="hidden md:block px-4 py-2.5 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Chat</h3>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-1.5 scrollbar-thin min-h-0"
      >
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-4">
            No messages yet
          </p>
        )}
        {messages.map((msg) => (
          <MessageItem key={msg.id} msg={msg} />
        ))}
      </div>
    </div>
  );
};
