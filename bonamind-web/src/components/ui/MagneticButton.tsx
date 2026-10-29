import { useRef, useCallback, useState } from "react";

interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  as?: "button" | "a";
  href?: string;
}

export function MagneticButton({ children, className = "", onClick, as = "button", href }: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const maxDist = 150;
    if (dist > maxDist) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    const strength = 1 - dist / maxDist;
    setOffset({ x: dx * strength * 0.25, y: dy * strength * 0.25 });
  }, []);

  const handleLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  const style = {
    transform: `translate(${offset.x}px, ${offset.y}px)`,
    transition: offset.x === 0 && offset.y === 0 ? "transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)" : "transform 0.08s ease-out",
  } as React.CSSProperties;

  if (as === "a") {
    return (
      <a
        ref={ref}
        href={href}
        className={className}
        style={style}
        onMouseMove={handleMouse}
        onMouseLeave={handleLeave}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={className}
      style={style}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
    >
      {children}
    </button>
  );
}
