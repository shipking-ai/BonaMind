import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils';

/**
 * GlassCard - A versatile glassmorphism card component
 * Optimized for Tailwind v4 and Radix UI composition
 */
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'neural' | 'bordered' | 'elevated' | 'interactive' | 'loading' | 'cosmic';
  size?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  blur?: 0 | 4 | 8 | 12 | 16 | 20 | 24;
  animated?: boolean;
  hoverable?: boolean;
  clickable?: boolean;
  asChild?: boolean;
  onClick?: () => void;
}

const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className,
  variant = 'default',
  size = 'md',
  shadow = 1,
  blur = 12,
  animated = false,
  hoverable = false,
  clickable = false,
  asChild = false,
  onClick
}) => {
  const Component = asChild ? Slot : 'div';

  // Size configurations
  const sizeConfig = {
    none: "",
    sm: "p-4",
    md: "p-6",
    lg: "p-8"
  }[size];

  // Shadow configurations mapped for Tailwind v4
  const shadowConfig = {
    0: "shadow-none",
    1: "shadow-xs",   // v3 shadow-sm
    2: "shadow-sm",   // v3 shadow
    3: "shadow-md",
    4: "shadow-lg",
    5: "shadow-xl",
    6: "shadow-2xl",
    7: "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]"
  }[shadow] || "shadow-xs";

  // Blur configuration mapping for Tailwind v4
  const blurConfig = {
    0: "backdrop-blur-none",
    4: "backdrop-blur-xs",
    8: "backdrop-blur-sm",
    12: "backdrop-blur-md",
    16: "backdrop-blur-lg",
    20: "backdrop-blur-xl",
    24: "backdrop-blur-2xl"
  }[blur] || "backdrop-blur-md";

  // Variant configurations
  const variantConfig = {
    default: "border border-zinc-700/20 bg-zinc-950/50",
    neural: "border border-zinc-700/20 bg-zinc-950/60 before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTAgMEg0MFY0MEg0MFYwWiIgZmlsbD0iIzAwREJFOSIgZmlsbC1vcGFjaXR5PSIwLjAzIi8+CjxwYXRoIGQ9Ik0wIDIwSDQwVjQwSDBWMjBaIiBmaWxsPSIjMDBEQkU5IiBmaWxsLW9wYWNpdHk9IjAuMDMiLz4KPHBhdGggZD0iTTIwIDBIMDBWMjBIMjBaIiBmaWxsPSIjMDBEQkU5IiBmaWxsLW9wYWNpdHk9IjAuMDMiLz4KPC9zdmc+')] before:opacity-20",
    bordered: "border-primary/30 bg-primary/5",
    elevated: "shadow-md bg-zinc-950/60",
    interactive: "hover:bg-zinc-900/30 hover:border-zinc-600/50 transition-all duration-300",
    cosmic: "border-cosmic/30 bg-cosmic/5 shadow-[0_0_40px_rgba(168,85,247,0.1)]",
    loading: "relative after:absolute after:inset-0 after:bg-gradient-to-r from-transparent via-zinc-950/10 to-transparent after:animate-[loadingBar_2s_ease-in-out_infinite]",
  }[variant] || "";

  // Animation configuration
  const animationConfig = animated ? "animate-neural-pulse" : "";

  // Hover configuration
  const hoverConfig = hoverable ? "hover:scale-[1.01] hover:shadow-lg transition-all duration-300 ease-out" : "";

  // Clickable configuration
  const clickableConfig = clickable ? "cursor-pointer active:scale-[0.98] select-none" : "";

  return (
    <Component
      className={cn(
        "relative overflow-hidden rounded-xl isolation transition-all",
        sizeConfig,
        shadowConfig,
        blurConfig,
        variantConfig,
        animationConfig,
        hoverConfig,
        clickableConfig,
        className
      )}
      onClick={onClick}
      {...(clickable ? { role: "button", tabIndex: 0 } : {})}
    >
      {/* 
          If asChild is true, we don't wrap in anything as Slot will merge.
          Otherwise, we use a relative z-10 container.
      */}
      {asChild ? children : (
        <div className="relative z-10 w-full h-full">
          {children}
        </div>
      )}
      
      {variant === 'loading' && (
        <div className="absolute inset-0 bg-zinc-950/40 pointer-events-none" />
      )}
    </Component>
  );
};

export default GlassCard;



