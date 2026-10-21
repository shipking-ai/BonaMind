import { cn } from "@/lib/utils";

interface FrostGlassProps {
  children: React.ReactNode;
  className?: string;
  blur?: "sm" | "md" | "lg" | "xl";
  opacity?: number;
  border?: boolean;
  scanline?: boolean;
}

const BLUR_MAP = {
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
};

export function FrostGlass({
  children,
  className,
  blur = "lg",
  opacity = 0.08,
  border = true,
  scanline = false,
}: FrostGlassProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl overflow-hidden",
        BLUR_MAP[blur],
        className
      )}
      style={{
        background: `rgba(17, 17, 24, ${opacity})`,
      }}
    >
      {/* Frost texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='frost'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.035' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23frost)' opacity='0.4'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />
      {/* Scan line effect */}
      {scanline && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
            animation: "frost-scanline 8s linear infinite",
          }}
        />
      )}
      {/* Border */}
      {border && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.08]" />
      )}
      {/* Content */}
      <div className="relative z-10">{children}</div>
      <style>{`
        @keyframes frost-scanline {
          0% { transform: translateY(0); }
          100% { transform: translateY(4px); }
        }
      `}</style>
    </div>
  );
}
