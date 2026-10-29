import { describe, expect, it } from "vitest";
import { resolveDashboardSurface } from "../components/native/androidSurface";

describe("resolveDashboardSurface", () => {
  it("keeps the web surface on every dashboard path for browsers", () => {
    expect(resolveDashboardSurface(false, "/")).toBe("web");
    expect(resolveDashboardSurface(false, "/generator")).toBe("web");
    expect(resolveDashboardSurface(false, "/settings")).toBe("web");
  });

  it("maps Android destinations to dedicated surfaces", () => {
    expect(resolveDashboardSurface(true, "/")).toBe("android-home");
    expect(resolveDashboardSurface(true, "/decks")).toBe("android-library");
    expect(resolveDashboardSurface(true, "/study")).toBe("android-study");
    expect(resolveDashboardSurface(true, "/generator")).toBe("android-generator");
    expect(resolveDashboardSurface(true, "/settings")).toBe("android-settings");
  });

  it("keeps chat and a live deck session on their specialized routes", () => {
    expect(resolveDashboardSurface(true, "/chat")).toBe("shared-chat");
    expect(resolveDashboardSurface(true, "/study/deck-123")).toBe("shared-study-runtime");
  });
});
