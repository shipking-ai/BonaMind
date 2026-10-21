import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface TextAnimateProps {
  text: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  speed?: number;
  scrambleChars?: string;
  triggerOnView?: boolean;
  once?: boolean;
  delay?: number;
}

const DEFAULT_SCRAMBLE_CHARS =
  "!@#$%^&*()_+-=[]{}|;:,.<>?/~`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function TextAnimate({
  text,
  className,
  as: Tag = "span",
  speed = 30,
  scrambleChars = DEFAULT_SCRAMBLE_CHARS,
  triggerOnView = true,
  once = true,
  delay = 0,
}: TextAnimateProps) {
  const [displayText, setDisplayText] = useState(
    triggerOnView ? "" : text
  );
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const animate = useCallback(() => {
    if (isAnimating || (once && hasAnimated)) return;
    setIsAnimating(true);

    const chars = text.split("");
    const maxLen = Math.max(...chars.map((c) => (c === " " ? 0 : scrambleChars.length)));
    let iteration = 0;

    const interval = setInterval(() => {
      setDisplayText(
        chars
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < iteration) return char;
            return scrambleChars[Math.floor(Math.random() * maxLen)];
          })
          .join("")
      );

      iteration += 1 / 3;
      if (iteration >= chars.length) {
        clearInterval(interval);
        setDisplayText(text);
        setIsAnimating(false);
        setHasAnimated(true);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, scrambleChars, isAnimating, once, hasAnimated]);

  useEffect(() => {
    if (!triggerOnView || !ref.current) {
      if (!triggerOnView) {
        const timeout = setTimeout(animate, delay);
        return () => clearTimeout(timeout);
      }
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const timeout = setTimeout(animate, delay);
          return () => clearTimeout(timeout);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [triggerOnView, animate, delay]);

  return (
    <div ref={ref} className="inline-block">
      <Tag
        className={cn(
          "font-mono tabular-nums [word-break:break-word]",
          className
        )}
        aria-label={text}
      >
        {displayText}
      </Tag>
    </div>
  );
}
