import { cn } from "@/lib/utils";

interface ShineBorderProps {
  children: React.ReactNode;
  className?: string;
  shineColor?: string;
  borderWidth?: number;
  duration?: number;
}

export function ShineBorder({
  children,
  className,
  shineColor = "rgba(124, 58, 237, 0.5)",
  borderWidth: _borderWidth = 1,
  duration = 3,
}: ShineBorderProps) {
  return (
    <div
      className={cn("relative rounded-2xl p-[1px] overflow-hidden", className)}
      style={{
        background: `conic-gradient(from var(--shine-angle, 0deg), transparent 60%, ${shineColor} 80%, transparent 100%)`,
        animation: `shine-rotate ${duration}s linear infinite`,
      }}
    >
      <div className="relative z-10 rounded-2xl bg-background h-full w-full">
        {children}
      </div>
      <style>{`
        @keyframes shine-rotate {
          from { --shine-angle: 0deg; }
          to { --shine-angle: 360deg; }
        }
        @property --shine-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
      `}</style>
    </div>
  );
}
