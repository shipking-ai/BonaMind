// Scroll-Driven Animations & Scrollytelling: The Engineering of Awe
// Hardware-accelerated scroll animations with narrative pacing

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { checkReducedMotion } from '../styles/animations/awe';

// Register ScrollTrigger
try { gsap.registerPlugin(ScrollTrigger) } catch { /* intentionally ignored */ }

export interface ScrollAnimationConfig {
  trigger?: string;
  start?: string;
  end?: string;
  scrub?: boolean | number;
  pin?: boolean;
  anticipatePin?: number;
  toggleActions?: string;
  onEnter?: () => void;
  onLeave?: () => void;
  onEnterBack?: () => void;
  onLeaveBack?: () => void;
  onUpdate?: (self: any) => void;
}

export interface ScrollRevealConfig extends ScrollAnimationConfig {
  from?: {
    opacity?: number;
    y?: number;
    x?: number;
    scale?: number;
    rotation?: number;
  };
  to?: {
    opacity?: number;
    y?: number;
    x?: number;
    scale?: number;
    rotation?: number;
  };
  duration?: number;
  ease?: string;
  stagger?: number;
}

export interface ParallaxConfig {
  speed?: number;
  direction?: 'vertical' | 'horizontal';
  ease?: string;
}

// Parallax effect for scroll-driven motion
export const useParallax = (config: ParallaxConfig = {}) => {
  const elementRef = useRef<HTMLElement>(null);
  const { speed = 0.5, direction = 'vertical', ease = 'none' } = config;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Skip parallax for reduced motion
    if (checkReducedMotion()) return;

    const isHorizontal = direction === 'horizontal';
    const property = isHorizontal ? 'x' : 'y';

    gsap.set(element, {
      [property]: 0,
      force3D: true
    });

    ScrollTrigger.create({
      trigger: element,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => {
        const progress = self.progress;
        const movement = (progress - 0.5) * window.innerHeight * speed;
        gsap.set(element, {
          [property]: movement,
          force3D: true
        });
      }
    });
  }, [speed, direction, ease]);

  return elementRef;
};

// Scroll-triggered reveal animation
export const useScrollReveal = (config: ScrollRevealConfig = {}) => {
  const elementRef = useRef<HTMLElement>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  const {
    from = { opacity: 0, y: 50, scale: 0.95 },
    to = { opacity: 1, y: 0, scale: 1 },
    duration = 0.8,
    ease = 'power2.out',
    trigger,
    start = 'top 80%',
    end = 'top 20%',
    onEnter,
    onLeave,
    onEnterBack,
    onLeaveBack,
    stagger
  } = config;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Set initial state
    gsap.set(element, from);

    // Create scroll trigger
    ScrollTrigger.create({
      trigger: trigger || element,
      start,
      end,
      onEnter: () => {
        setIsRevealed(true);
        gsap.to(element, {
          ...to,
          duration,
          ease,
          stagger,
          onComplete: onEnter
        });
      },
      onLeave: () => {
        setIsRevealed(false);
        gsap.to(element, {
          ...from,
          duration: duration * 0.5,
          ease: 'power2.in',
          onComplete: onLeave
        });
      },
      onEnterBack: () => {
        setIsRevealed(true);
        gsap.to(element, {
          ...to,
          duration,
          ease,
          stagger,
          onComplete: onEnterBack
        });
      },
      onLeaveBack: () => {
        setIsRevealed(false);
        gsap.to(element, {
          ...from,
          duration: duration * 0.5,
          ease: 'power2.in',
          onComplete: onLeaveBack
        });
      }
    });
  }, [from, to, duration, ease, trigger, start, end, onEnter, onLeave, onEnterBack, onLeaveBack, stagger]);

  return { elementRef, isRevealed };
};

// Timeline-based scroll animation
export const useScrollTimeline = (config: ScrollAnimationConfig = {}) => {
  const elementRef = useRef<HTMLElement>(null);
  const timelineRef = useRef(gsap.timeline());

  const {
    trigger,
    start = 'top top',
    end = 'bottom bottom',
    scrub = 1,
    pin = true,
    anticipatePin = 1,
    toggleActions,
    onUpdate
  } = config;

  useEffect(() => {
    const element = elementRef.current;
    const timeline = timelineRef.current;
    
    if (!element) return;

    ScrollTrigger.create({
      trigger: trigger || element,
      start,
      end,
      scrub,
      pin,
      anticipatePin,
      toggleActions,
      onUpdate: (self) => {
        timeline.progress(self.progress);
        onUpdate?.(self);
      }
    });
  }, [trigger, start, end, scrub, pin, anticipatePin, toggleActions, onUpdate]);

  return { elementRef, timeline: timelineRef.current };
};

// Multi-layer parallax for depth
export const useParallaxLayers = (layers: Array<{
  element: HTMLElement;
  speed: number;
  direction?: 'vertical' | 'horizontal';
}>) => {
  useEffect(() => {
    if (checkReducedMotion()) return;

    layers.forEach(({ element, speed, direction = 'vertical' }) => {
      const isHorizontal = direction === 'horizontal';
      const property = isHorizontal ? 'x' : 'y';

      gsap.set(element, {
        [property]: 0,
        force3D: true
      });

      ScrollTrigger.create({
        trigger: element,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
        onUpdate: (self) => {
          const progress = self.progress;
          const movement = (progress - 0.5) * window.innerHeight * speed;
          gsap.set(element, {
            [property]: movement,
            force3D: true
          });
        }
      });
    });
  }, [layers]);
};

// Scroll-based counter animation
export const useScrollCounter = (target: number, duration = 2) => {
  const elementRef = useRef<HTMLElement>(null);
  const [currentValue, setCurrentValue] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const obj = { value: 0 };

    ScrollTrigger.create({
      trigger: element,
      start: 'top 80%',
      end: 'bottom 20%',
      onEnter: () => {
        gsap.to(obj, {
          value: target,
          duration,
          ease: 'power2.out',
          onUpdate: () => {
            setCurrentValue(Math.round(obj.value));
          }
        });
      },
      onLeaveBack: () => {
        gsap.to(obj, {
          value: 0,
          duration: duration * 0.5,
          ease: 'power2.in',
          onUpdate: () => {
            setCurrentValue(Math.round(obj.value));
          }
        });
      }
    });
  }, [target, duration]);

  return { elementRef, currentValue };
};

// Scroll progress indicator
export const useScrollProgress = () => {
  const progressRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const scrollTop = window.pageYOffset;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = (scrollTop / docHeight) * 100;
      setProgress(scrollPercent);
    };

    ScrollTrigger.create({
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        setProgress(self.progress * 100);
      }
    });

    window.addEventListener('scroll', updateProgress);
    return () => window.removeEventListener('scroll', updateProgress);
  }, []);

  return { progressRef, progress };
};

// Magnetic scroll indicator
export const useScrollIndicator = () => {
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;

    gsap.set(indicator, { scaleY: 0, transformOrigin: 'top' });

    ScrollTrigger.create({
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        gsap.to(indicator, {
          scaleY: self.progress,
          ease: 'none'
        });
      }
    });
  }, []);

  return indicatorRef;
};

// Section-based scroll navigation
export const useSectionScroll = (sections: string[]) => {
  const [activeSection, setActiveSection] = useState(sections[0]);

  useEffect(() => {
    const sectionElements = sections
      .map((id) => document.getElementById(id))
      // Type predicate: .filter(Boolean) does not narrow away null in TS.
      .filter((el): el is HTMLElement => el !== null);

    sectionElements.forEach((section) => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top center',
        end: 'bottom center',
        onEnter: () => {
          setActiveSection(section.id);
        }
      });
    });
  }, [sections]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      gsap.to(window, {
        duration: 1,
        scrollTo: { y: element.offsetTop, autoKill: false },
        ease: 'power2.inOut'
      });
    }
  };

  return { activeSection, scrollToSection };
};

// Cleanup function for scroll animations
export const cleanupScrollAnimations = () => {
  ScrollTrigger.getAll().forEach(trigger => trigger.kill());
};

// Initialize scroll animation system
export const initializeScrollAnimations = () => {
  // Refresh ScrollTrigger on load
  ScrollTrigger.refresh();
  
  // Handle resize
  const handleResize = () => {
    ScrollTrigger.refresh();
  };

  window.addEventListener('resize', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
    cleanupScrollAnimations();
  };
};

// Main hook for initializing scroll animations
export const useScrollAnimations = () => {
  useEffect(() => {
    return initializeScrollAnimations();
  }, []);
  
  return {
    cleanup: cleanupScrollAnimations,
    refresh: () => ScrollTrigger.refresh()
  };
};

export default {
  useParallax,
  useScrollReveal,
  useScrollTimeline,
  useParallaxLayers,
  useScrollCounter,
  useScrollProgress,
  useScrollIndicator,
  useSectionScroll,
  useScrollAnimations,
  cleanupScrollAnimations,
  initializeScrollAnimations
};


