import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { name: "landing", path: "/" },
  { name: "signup", path: "/auth" },
  { name: "login", path: "/auth?mode=login" },
  { name: "docs", path: "/docs" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
  { name: "download", path: "/download" },
  { name: "about", path: "/about" },
  { name: "status", path: "/status" },
  { name: "reset-password", path: "/reset-password" },
  { name: "restore-account", path: "/restore-account" },
];

for (const { name, path } of pages) {
  test(`${name} has no WCAG A/AA accessibility violations`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1500);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const violations = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    }));

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
}
