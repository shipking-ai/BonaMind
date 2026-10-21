import { test, expect } from "@playwright/test";

const screens = ["home", "library", "study", "generator", "settings"] as const;

test.describe("Android Prism shell", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  // The app loads webfonts from Google Fonts. Their arrival is network-timed
  // and racy, so a screenshot can catch text in a fallback font or a loaded
  // webfont — the baselines must render deterministically or every run races.
  // Block the font requests so every run (baseline capture included) renders
  // the same fallback layout. This is a shell-contract regression test, not a
  // font rendering test.
  test.beforeEach(async ({ page }) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  });

  for (const screen of screens) {
    test(`${screen} surface keeps the Android shell contract`, async ({ page }) => {
      await page.goto(`/__e2e/android?screen=${screen}`);
      await expect(page.getByTestId("android-preview-shell")).toBeVisible();
      await expect(page.locator(".android-mobile-topbar")).toBeVisible();
      await expect(page.locator(".android-mobile-bottom-nav")).toBeVisible();
      await expect(page.locator("aside")).toHaveCount(0);

      if (screen === "generator") {
        await expect(page.getByTestId("android-generator-screen")).toBeVisible();
      }
      if (screen === "settings") {
        await expect(page.getByTestId("android-settings-screen")).toBeVisible();
      }

      await expect(page).toHaveScreenshot(`android-${screen}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.03,
      });
    });
  }

  test("Android preview has a distinct visual surface from the desktop landing page", async ({
    page,
  }) => {
    await page.goto("/__e2e/android?screen=home");
    const androidBackground = await page
      .locator('[data-testid="android-preview-shell"]')
      .evaluate((element) => getComputedStyle(element).backgroundImage);

    await page.goto("/");
    const desktopBackground = await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).backgroundImage);

    expect(androidBackground).not.toBe(desktopBackground);
  });
});
