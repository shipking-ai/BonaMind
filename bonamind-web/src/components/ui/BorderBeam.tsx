import { cn } from "@/lib/utils";

interface BorderBeamProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
}

export function BorderBeam({
  children,
  className,
  duration = 5,
  borderWidth = 1.5,
  colorFrom = "#7c3aed",
  colorTo = "#c4b5fd",
  delay = 0,
}: BorderBeamProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          padding: `${borderWidth}px`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `conic-gradient(from var(--border-beam-angle, 0deg) at 50% 50%, transparent 0%, transparent 60%, ${colorFrom} 80%, ${colorTo} 90%, transparent 100%)`,
            animation: `border-beam-rotate ${duration}s linear ${delay}s infinite`,
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            padding: `${borderWidth}px`,
          }}
        />
      </div>
      <div className="relative z-10">{children}</div>
      <style>{`
        @keyframes border-beam-rotate {
          from { --border-beam-angle: 0deg; }
          to { --border-beam-angle: 360deg; }
        }
        @property --border-beam-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
      `}</style>
    </div>
  );
}
