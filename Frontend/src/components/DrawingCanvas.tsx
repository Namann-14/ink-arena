import { useEffect, useRef, useState, useCallback } from "react";
import { useGameStore } from "@/store/gameStore";
import { socket } from "@/services/socket";
import type { Stroke } from "@/types/socket";

interface Point { x: number; y: number; }

const COLORS = [
  "#FFFFFF", "#C0C0C0", "#808080", "#000000",
  "#FF0000", "#FF6B35", "#FFD700", "#FFEB3B",
  "#4CAF50", "#00BCD4", "#2196F3", "#3F51B5",
  "#9C27B0", "#E91E63", "#795548", "#FF9800",
];

const BRUSH_SIZES = [2, 4, 8, 14, 22];

export const DrawingCanvas = () => {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawingStroke, setIsDrawingStroke] = useState(false);
  const lastPointRef  = useRef<Point | null>(null);

  // Batch outgoing strokes — flush every animation frame
  const strokeBatchRef = useRef<Stroke[]>([]);
  const rafRef         = useRef<number | null>(null);

  const { brushSize, brushColor, setBrushSize, setBrushColor, localPlayerId, currentDrawer, roomId, players } =
    useGameStore();

  const isDrawer = localPlayerId === currentDrawer;
  const drawerName = players.find((p) => p.id === currentDrawer)?.username;

  //  Canvas helpers 
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
      const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height,
      };
    },
    []
  );

  const drawSegment = useCallback(
    (from: Point, to: Point, color: string, size: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = color;
      ctx.lineWidth   = size;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.stroke();
    },
    []
  );

  const renderStroke = useCallback(
    (stroke: Stroke) => {
      drawSegment(
        { x: stroke.prevX, y: stroke.prevY },
        { x: stroke.x,     y: stroke.y     },
        stroke.color,
        stroke.size
      );
    },
    [drawSegment]
  );

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  //  Init canvas 
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#1c1c1c";
      ctx.fillRect(0, 0, 800, 600);
    }
  }, []);

  //  Socket: receive remote drawing events 
  useEffect(() => {
    const onDrawStroke = (p: { stroke: Stroke }) => {
      renderStroke(p.stroke);
    };

    const onDrawStrokeBatch = (p: { strokes: Stroke[] }) => {
      p.strokes.forEach(renderStroke);
    };

    const onSyncStrokes = (p: { strokes: Stroke[] }) => {
      clearCanvas();
      p.strokes.forEach(renderStroke);
    };

    const onClearCanvas = () => {
      clearCanvas();
    };

    socket.on("draw_stroke",       onDrawStroke       as Parameters<typeof socket.on>[1]);
    socket.on("draw_stroke_batch", onDrawStrokeBatch  as Parameters<typeof socket.on>[1]);
    socket.on("sync_strokes",      onSyncStrokes      as Parameters<typeof socket.on>[1]);
    socket.on("clear_canvas",      onClearCanvas      as Parameters<typeof socket.on>[1]);

    // Request initial stroke sync when mounting the canvas
    if (roomId) {
      socket.emit("request_sync_strokes", { roomId });
    }

    return () => {
      socket.off("draw_stroke",       onDrawStroke       as Parameters<typeof socket.on>[1]);
      socket.off("draw_stroke_batch", onDrawStrokeBatch  as Parameters<typeof socket.on>[1]);
      socket.off("sync_strokes",      onSyncStrokes      as Parameters<typeof socket.on>[1]);
      socket.off("clear_canvas",      onClearCanvas      as Parameters<typeof socket.on>[1]);
    };
  }, [renderStroke, clearCanvas, roomId]);

  //  RAF flush: send batched strokes 
  const flushBatch = useCallback(() => {
    rafRef.current = null;
    const batch = strokeBatchRef.current;
    if (batch.length === 0 || !roomId) return;
    strokeBatchRef.current = [];
    socket.emit("draw_stroke_batch", { roomId, strokes: batch });
  }, [roomId]);

  const scheduleBatchFlush = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushBatch);
    }
  }, [flushBatch]);

  //  Canvas mouse/touch events 
  const handleStart = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawer) return;
      e.preventDefault();
      const point = getCanvasPoint(e);
      if (!point) return;
      setIsDrawingStroke(true);
      lastPointRef.current = point;
      // Draw a dot at the start point
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = brushColor;
        ctx.fill();
      }
    },
    [isDrawer, getCanvasPoint, brushSize, brushColor]
  );

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!isDrawingStroke || !isDrawer) return;
      e.preventDefault();
      const point = getCanvasPoint(e);
      if (!point || !lastPointRef.current) return;
      const prev = lastPointRef.current;
      // Draw locally
      drawSegment(prev, point, brushColor, brushSize);
      // Queue for batch emit
      strokeBatchRef.current.push({
        x:     point.x,
        y:     point.y,
        prevX: prev.x,
        prevY: prev.y,
        color: brushColor,
        size:  brushSize,
      });
      scheduleBatchFlush();
      lastPointRef.current = point;
    },
    [isDrawingStroke, isDrawer, getCanvasPoint, drawSegment, brushColor, brushSize, scheduleBatchFlush]
  );

  const handleEnd = useCallback(() => {
    setIsDrawingStroke(false);
    lastPointRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    clearCanvas();
    if (roomId) socket.emit("draw_stroke_batch", { roomId, strokes: [] }); // trigger server clear via reset? 
    // Note: actual canvas clear is coordinated server-side by endRound/clear_canvas event
  }, [clearCanvas, roomId]);

  return (
    <div className="flex flex-col h-full gap-1 sm:gap-2" ref={containerRef}>
      {/* Canvas */}
      <div className="flex-1 relative rounded-lg overflow-hidden border border-border">
        <canvas
          ref={canvasRef}
          className={`w-full h-full ${isDrawer ? "cursor-crosshair" : "cursor-default"}`}
          style={{ touchAction: "none" }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
        {/* Spectator overlay */}
        {!isDrawer && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none">
            <span className="text-[11px] sm:text-xs text-muted-foreground/50 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-full">
              {drawerName ? `Watching ${drawerName} draw…` : "Waiting…"}
            </span>
          </div>
        )}
      </div>

      {/* Tools (drawer only) */}
      {isDrawer && (
        <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-3 py-1.5 sm:py-2 bg-card/60 backdrop-blur-md border border-border/40 rounded-xl animate-float-in overflow-x-auto scrollbar-thin">
          {/* Colors — grid on mobile, row on desktop */}
          <div className="flex flex-wrap gap-[4px] sm:gap-1.5 max-w-[140px] sm:max-w-none">
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setBrushColor(color)}
                className={`w-[20px] h-[20px] sm:w-6 sm:h-6 rounded-[4px] sm:rounded-md transition-all duration-150 active:scale-110 ${
                  brushColor === color ? "ring-2 ring-primary/40 scale-110 shadow-sm" : "ring-1 ring-border/30 hover:ring-border/60"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-6 sm:h-8 bg-border/30 shrink-0" />

          {/* Brush sizes */}
          <div className="flex items-center gap-1 sm:gap-2">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setBrushSize(size)}
                className={`flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg transition-all ${
                  brushSize === size ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary/40 active:bg-secondary"
                }`}
              >
                <div
                  className="rounded-full bg-foreground/80"
                  style={{ width: Math.min(size, 16), height: Math.min(size, 16) }}
                />
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-px h-6 sm:h-8 bg-border/30 shrink-0" />

          {/* Clear */}
          <button
            onClick={handleClear}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg bg-destructive/10 text-destructive/80 hover:bg-destructive/20 active:scale-95 transition-all font-medium shrink-0"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
