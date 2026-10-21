import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TextGlitchProps {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  glitchOnHover?: boolean;
  autoGlitch?: boolean;
  autoGlitchInterval?: number;
  autoGlitchDuration?: number;
}

const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`";
const _NUM_LAYERS = 3;

export function TextGlitch({
  text,
  className,
  as: Tag = "span",
  glitchOnHover = true,
  autoGlitch = false,
  autoGlitchInterval = 4000,
  autoGlitchDuration = 200,
}: TextGlitchProps) {
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchText, setGlitchText] = useState(text);

  const glitch = useCallback(() => {
    if (isGlitching) return;
    setIsGlitching(true);

    let iteration = 0;
    const maxIterations = 6;

    const interval = setInterval(() => {
      setGlitchText(
        text
          .split("")
          .map((char, _i) => {
            if (char === " ") return " ";
            if (Math.random() < 0.3 * (1 - iteration / maxIterations)) {
              return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
            }
            return char;
          })
          .join("")
      );

      iteration++;
      if (iteration >= maxIterations) {
        clearInterval(interval);
        setGlitchText(text);
        setIsGlitching(false);
      }
    }, autoGlitchDuration / maxIterations);

    return () => clearInterval(interval);
  }, [text, isGlitching, autoGlitchDuration]);

  useEffect(() => {
    if (!autoGlitch) return;
    const interval = setInterval(glitch, autoGlitchInterval);
    return () => clearInterval(interval);
  }, [autoGlitch, autoGlitchInterval, glitch]);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={glitchOnHover ? glitch : undefined}
    >
      {/* Glitch layers (clipped duplicates) */}
      {isGlitching && (
        <>
          <Tag
            className={cn(
              "absolute inset-0 select-none opacity-80",
              className
            )}
            style={{
              clipPath: `inset(${Math.random() * 40}% 0 ${Math.random() * 40}% 0)`,
              transform: `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 2}px)`,
              color: "rgba(124, 58, 237, 0.8)",
            }}
            aria-hidden="true"
          >
            {glitchText}
          </Tag>
          <Tag
            className={cn(
              "absolute inset-0 select-none opacity-80",
              className
            )}
            style={{
              clipPath: `inset(${Math.random() * 40}% 0 ${Math.random() * 40}% 0)`,
              transform: `translate(${(Math.random() - 0.5) * 6}px, ${(Math.random() - 0.5) * 2}px)`,
              color: "rgba(196, 181, 253, 0.8)",
            }}
            aria-hidden="true"
          >
            {glitchText}
          </Tag>
        </>
      )}
      {/* Main text */}
      <Tag
        className={cn(
          "relative",
          isGlitching && "animate-pulse",
          className
        )}
      >
        {isGlitching ? glitchText : text}
      </Tag>
    </div>
  );
}
