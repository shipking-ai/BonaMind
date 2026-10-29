export type AndroidDashboardSurface =
  | "web"
  | "android-home"
  | "android-library"
  | "android-study"
  | "android-generator"
  | "android-settings"
  | "shared-chat"
  | "shared-study-runtime";

/**
 * Keep the platform split explicit and testable. The web never receives one
 * of the Android-only surfaces, even if a browser happens to use a narrow
 * viewport.
 */
export function resolveDashboardSurface(isAndroid: boolean, path: string): AndroidDashboardSurface {
  if (!isAndroid) return "web";
  if (path === "/" || path === "") return "android-home";
  if (path === "/decks") return "android-library";
  if (path === "/study") return "android-study";
  if (path === "/generator") return "android-generator";
  if (path === "/settings") return "android-settings";
  if (path === "/chat") return "shared-chat";
  if (path.startsWith("/study/") && path.split("/").length === 3) return "shared-study-runtime";
  return "android-home";
}
