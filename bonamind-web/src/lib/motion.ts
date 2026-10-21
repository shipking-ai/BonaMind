/** Web-only motion helpers — native apps (Capacitor) are unchanged elsewhere. */

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isMobileWeb(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768 || "ontouchstart" in window;
}

/** Check if View Transitions API is supported */
export function supportsViewTransitions(): boolean {
  if (typeof window === "undefined") return false;
  return "startViewTransition" in document;
}

/** Lighter transitions for dashboard / tab switches on the public website. */
export function shouldUseLiteMotion(): boolean {
  if (isNativeShell()) return false;
  return prefersReducedMotion() || isMobileWeb();
}

export type PageTransitionVariant = "full" | "lite" | "none";

export function getPageTransitionVariant(pathname: string): PageTransitionVariant {
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/study")) {
    return "lite";
  }
  if (pathname.startsWith("/auth/callback") || pathname.startsWith("/auth/schoology")) {
    return "none";
  }
  return "full";
}

const DASHBOARD_SECTION_BY_PATH: Record<string, string> = {
  "/dashboard": "main",
  "/dashboard/decks": "cards",
  "/dashboard/chat": "chat",
  "/dashboard/generator": "generator",
  "/dashboard/analytics": "analytics",
  "/dashboard/paths": "paths",
  "/dashboard/tutorial": "tutorial",
  "/dashboard/admin": "admin",
  "/dashboard/settings": "settings",
};

export function dashboardPathToSection(pathname: string): string {
  return DASHBOARD_SECTION_BY_PATH[pathname] ?? "main";
}

export function isMarketingRoute(pathname: string): boolean {
  return (
    pathname === "/" || pathname === "/simple" || pathname === "/bright" || pathname === "/working"
  );
}

// View Transitions wrapper for SPA navigation
export async function transitionPage(callback: () => void | Promise<void>) {
  if (supportsViewTransitions() && !prefersReducedMotion()) {
    const transition = (document as any).startViewTransition({
      update: callback,
      types: ["page-transition"],
    });
    await transition.ready;
  } else {
    await callback();
  }
}
