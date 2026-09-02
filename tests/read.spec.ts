import { test, expect } from '@playwright/test';

test.describe('read flow', () => {
  test('site loads with title and at least one nav item', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/, { timeout: 10_000 });

    // Wait for some NavItem button to render (nav items are <button>)
    const items = page.locator('button[aria-label]').filter({
      hasNot: page.locator('[aria-label="Toggle theme"]')
    });
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search filters', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('searchbox');
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill('Router');

    // After filtering, items containing "Router" should still be there.
    await expect(page.locator('button[aria-label*="Router"]').first()).toBeVisible({ timeout: 5_000 });
  });
});
