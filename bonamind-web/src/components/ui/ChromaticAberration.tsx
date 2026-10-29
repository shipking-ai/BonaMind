import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ChromaticAberrationProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export function ChromaticAberration({
  children,
  className,
  intensity = 3,
}: ChromaticAberrationProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = (e.clientX - centerX) / (rect.width / 2);
      const dy = (e.clientY - centerY) / (rect.height / 2);
      setOffset({ x: dx * intensity, y: dy * intensity });
    },
    [intensity]
  );

  const handleMouseLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="pointer-events-none absolute inset-0 mix-blend-screen opacity-70"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          filter: "url(#chromatic-r)",
        }}
      >
        <div className="absolute inset-0 rounded-[inherit]" style={{ background: "rgba(255,0,0,0.08)" }} />
      </div>
      <div
        className="pointer-events-none absolute inset-0 mix-blend-screen opacity-70"
        style={{
          transform: `translate(${-offset.x}px, ${-offset.y}px)`,
          filter: "url(#chromatic-b)",
        }}
      >
        <div className="absolute inset-0 rounded-[inherit]" style={{ background: "rgba(0,0,255,0.08)" }} />
      </div>
      <div className="relative z-10">{children}</div>
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="chromatic-r">
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            />
          </filter>
          <filter id="chromatic-b">
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
