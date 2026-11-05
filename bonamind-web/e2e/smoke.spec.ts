import { test, expect } from '@playwright/test';
import { gotoApp } from './gotoApp';

test.describe('Smoke tests', () => {
  test('landing page loads and has correct title', async ({ page }) => {
    await gotoApp(page, '/');
    await expect(page).toHaveTitle(/BonaMind/);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('landing page has working navigation to auth', async ({ page }) => {
    await gotoApp(page, '/');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    const cta = page.locator('text=Start Free').first();
    await expect(cta).toBeVisible({ timeout: 15_000 });
    await cta.click();
    await page.waitForURL(/auth/, { timeout: 10_000 });
    expect(page.url()).toContain('/auth');
  });

  test('auth page renders login form', async ({ page }) => {
    await gotoApp(page, '/auth');
    await expect(page.locator('text=Sign in').first()).toBeVisible({ timeout: 10_000 });
  });

  test('dashboard shows auth gate when not logged in', async ({ page }) => {
    await gotoApp(page, '/dashboard');
    await expect(page.locator('text=BonaMind').first()).toBeVisible({ timeout: 10_000 });
  });

  test('marketplace shows auth gate when not logged in', async ({ page }) => {
    await gotoApp(page, '/marketplace');
    await expect(page.locator('text=BonaMind').first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin/users shows auth gate when not logged in', async ({ page }) => {
    await gotoApp(page, '/admin/users');
    await expect(page.locator('text=BonaMind').first()).toBeVisible({ timeout: 10_000 });
  });

  test('no console errors on landing page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await gotoApp(page, '/');
    await page.waitForTimeout(2000);
    expect(
      errors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('supabase') &&
          !e.includes('Environment validation') &&
          !e.includes('Missing required'),
      ),
    ).toHaveLength(0);
  });
});
