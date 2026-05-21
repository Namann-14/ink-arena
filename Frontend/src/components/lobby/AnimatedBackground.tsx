/**
 * AnimatedBackground
 * Clean, solid dark background with subtle grid overlay.
 * No floating orbs, particle effects, or glassmorphism.
 */
const AnimatedBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {/* Subtle grid overlay */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
            <path d="M 64 0 L 0 0 0 64" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,oklch(0_0_0/0.5)_100%)] pointer-events-none" />
    </div>
  );
};

export default AnimatedBackground;
