// The Engineering of Awe: 2026 Elite Animation Standards
// Hardware-accelerated, physics-based, accessibility-first animation system

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins
try { gsap.registerPlugin(ScrollTrigger) } catch { /* intentionally ignored */ }

// Physics-based spring constants for premium feel
export const SPRING_PRESETS = {
  // Critically damped - snappy, no bounce
  decisive: { stiffness: 400, damping: 40, mass: 1 },
  
  // Light bounce - single subtle overshoot
  light: { stiffness: 200, damping: 15, mass: 1 },
  
  // Playful - multiple oscillations
  playful: { stiffness: 180, damping: 8, mass: 2 },
  
  // Heavy/weighty - slow, significant momentum
  heavy: { stiffness: 120, damping: 14, mass: 3 },
  
  // Instant - near-critical, highly responsive
  instant: { stiffness: 300, damping: 30, mass: 1 },
  
  // Smooth - gentle, professional transitions
  smooth: { stiffness: 250, damping: 25, mass: 1 }
};

// Custom cubic-bezier curves for brand personality
export const EASING_PRESETS = {
  // Fast start, smooth deceleration - "emphasized entrance"
  entrance: 'cubic-bezier(0.2, 0, 0, 1)',
  
  // Quick acceleration, fast exit - reduces user wait time
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  
  // Premium "snap" feel - high responsiveness
  snap: 'cubic-bezier(0.16, 1, 0.3, 1)',
  
  // Natural, organic motion
  organic: 'cubic-bezier(0.4, 0, 0.2, 1)',
  
  // Bouncy, playful feel
  bouncy: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  
  // Smooth, professional
  professional: 'cubic-bezier(0.4, 0, 0.2, 1)'
};

// Hardware-accelerated properties only (Rule of Two)
export const HW_ACCELERATED_PROPS = [
  'transform',
  'opacity',
  'filter',
  'backdropFilter'
];

// Performance targets for award-winning sites
export const PERFORMANCE_TARGETS = {
  lcp: 1500, // < 1.5s
  inp: 100,   // < 100ms
  cls: 0.05,  // < 0.05
  fps: 60,    // Consistent 60fps
  weight: 3   // < 3MB
};

// Bento 2.0 design system
export const BENTO_2_0 = {
  backgrounds: {
    primary: '#f9fafb',
    card: '#ffffff',
    border: 'rgba(148, 163, 184, 0.5)'
  },
  spacing: {
    card: 'p-8',
    cardLarge: 'p-10',
    container: 'gap-6'
  },
  radius: {
    card: 'rounded-[2.5rem]',
    button: 'rounded-xl',
    small: 'rounded-lg'
  },
  shadows: {
    diffusion: 'shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]',
    card: 'shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)]',
    glass: 'shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]'
  }
};

// Liquid glass effect classes
export const LIQUID_GLASS = {
  base: 'bg-white/10 backdrop-blur-xl border border-white/20',
  inner: 'border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
  outer: 'shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]'
};

// Magnetic button physics
export const MAGNETIC_BUTTON = {
  pullRadius: 100,    // pixels
  pullStrength: 0.3,  // 0-1 multiplier
  damping: 0.15,      // smoothness of movement
  maxDistance: 50     // max pixels from cursor
};

// Scroll-driven animation configurations
export const SCROLL_CONFIG = {
  parallax: {
    speed: 0.5,        // relative to scroll speed
    direction: 'vertical',
    smooth: true
  },
  reveal: {
    trigger: 'center', // when element reaches center
    duration: 0.8,
    ease: 'power2.out'
  },
  timeline: {
    scrub: 1,          // 1 second per scroll pixel
    pin: true,         // pin during animation
    anticipatePin: 1   // anticipate pinning
  }
};

// Accessibility-first motion preferences
export const ACCESSIBILITY = {
  reducedMotion: 'prefers-reduced-motion',
  skipAnimations: 'data-skip-animations',
  focusVisible: 'focus-visible',
  highContrast: 'prefers-contrast:more'
};

// Generate spring animation values for Framer Motion
export const createSpring = (preset: keyof typeof SPRING_PRESETS) => {
  const config = SPRING_PRESETS[preset];
  // Return the config object for use with framer-motion's useSpring
  return config;
};

// Hardware-accelerated animation wrapper
export const animateWithGPU = (element: HTMLElement, props: Record<string, any>) => {
  // Filter to only hardware-accelerated properties
  const gpuProps = Object.keys(props).reduce((acc, key) => {
    if (HW_ACCELERATED_PROPS.includes(key)) {
      acc[key] = props[key];
    }
    return acc;
  }, {} as Record<string, any>);
  
  return gsap.to(element, gpuProps);
};

// Scroll-triggered reveal animation
export const createScrollReveal = (
  elements: HTMLElement[],
  options: Partial<typeof SCROLL_CONFIG.reveal> = {}
) => {
  const config = { ...SCROLL_CONFIG.reveal, ...options };
  
  elements.forEach((element) => {
    gsap.set(element, { 
      opacity: 0, 
      y: 50,
      scale: 0.95 
    });
    
    ScrollTrigger.create({
      trigger: element,
      start: 'top 80%',
      end: 'top 20%',
      onEnter: () => {
        gsap.to(element, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: config.duration,
          ease: config.ease
        });
      },
      onLeaveBack: () => {
        gsap.to(element, {
          opacity: 0,
          y: 50,
          scale: 0.95,
          duration: config.duration * 0.5,
          ease: 'power2.in'
        });
      }
    });
  });
};

// Magnetic cursor interaction
export const createMagneticButton = (button: HTMLElement) => {
  const rect = button.getBoundingClientRect();
  let x = 0;
  let y = 0;
  
  const handleMouseMove = (e: MouseEvent) => {
    const { clientX, clientY } = e;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = (clientX - centerX) / MAGNETIC_BUTTON.pullRadius;
    const deltaY = (clientY - centerY) / MAGNETIC_BUTTON.pullRadius;
    
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance < 1) {
      x = deltaX * MAGNETIC_BUTTON.pullStrength * MAGNETIC_BUTTON.maxDistance;
      y = deltaY * MAGNETIC_BUTTON.pullStrength * MAGNETIC_BUTTON.maxDistance;
    } else {
      x *= 0.95;
      y *= 0.95;
    }
    
    gsap.to(button, {
      x,
      y,
      rotation: x * 0.1,
      duration: 0.3,
      ease: 'power2.out'
    });
  };
  
  const handleMouseLeave = () => {
    gsap.to(button, {
      x: 0,
      y: 0,
      rotation: 0,
      duration: 0.3,
      ease: 'elastic.out(1, 0.5)'
    });
  };
  
  button.addEventListener('mousemove', handleMouseMove);
  button.addEventListener('mouseleave', handleMouseLeave);
  
  return () => {
    button.removeEventListener('mousemove', handleMouseMove);
    button.removeEventListener('mouseleave', handleMouseLeave);
  };
};

export const monitorPerformance = () => {
  const observer = new PerformanceObserver(() => {});
  observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input'] });
  return observer;
};

// Reduced motion detection
export const checkReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Initialize elite animation system
export const initializeAweSystem = () => {
  // Check for reduced motion preference
  if (checkReducedMotion()) {
    gsap.globalTimeline.timeScale(0.1); // Slow down animations
  }
  
  // Start performance monitoring
  const perfObserver = monitorPerformance();
  
  // Set GSAP defaults for elite performance
  gsap.defaults({
    ease: 'power2.out',
    duration: 0.6,
    force3D: true
  });
  
  return {
    performanceObserver: perfObserver,
    gsap,
    ScrollTrigger
  };
};

export default {
  SPRING_PRESETS,
  EASING_PRESETS,
  BENTO_2_0,
  LIQUID_GLASS,
  PERFORMANCE_TARGETS,
  createSpring,
  animateWithGPU,
  createScrollReveal,
  createMagneticButton,
  initializeAweSystem
};


