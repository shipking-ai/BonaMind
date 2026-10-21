/**
 * ParticleField — ambient particle drift that fills its parent container.
 * Hand-rolled replacement for Magic UI's `<Particles/>` (which uses
 * tsparticles). Honors prefers-reduced-motion (renders nothing).
 */
import { useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

export interface ParticleFieldProps {
  /** Fill density (particles per 10000 pixels²). Default 0.4. */
  density?: number;
  /** Particle color. Default theme-violet. */
  color?: string;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export function ParticleField({
  density = 0.4,
  color = 'rgba(124, 58, 237, 0.42)',
  className,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // Spawn particles proportional to area.
    const area = container.clientWidth * container.clientHeight;
    const n = Math.max(20, Math.round(area * density / 10000));
    const list: Particle[] = Array.from({ length: n }, () => ({
      x: Math.random() * container.clientWidth,
      y: Math.random() * container.clientHeight,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: 1 + Math.random() * 2,
      alpha: 0.3 + Math.random() * 0.6,
    }));

    const ctx = canvas.getContext('2d');
    if (!ctx) return () => observer.disconnect();
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of list) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x += container.clientWidth;
        if (p.x > container.clientWidth) p.x -= container.clientWidth;
        if (p.y < 0) p.y += container.clientHeight;
        if (p.y > container.clientHeight) p.y -= container.clientHeight;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [color, density, reduced]);

  if (reduced) return null;
  return (
    <canvas
      ref={canvasRef}
      data-testid="particle-field-canvas"
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
