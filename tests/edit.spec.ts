import { test, expect } from '@playwright/test';

const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'test1234';

test.describe('edit flow', () => {
  test('login → toggle edit → create item via dialog', async ({ page }) => {
    await page.goto('/');

    // Open login dialog
    await page.getByRole('button', { name: /log in|登录/i }).click();
    await page.getByLabel(/admin password|管理员密码/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|登录/i }).click();

    // After login, EditToggle button appears
    const editBtn = page.getByRole('button', { name: /^edit$|^编辑$/i });
    await expect(editBtn).toBeVisible({ timeout: 5_000 });

    // Toggle edit mode
    await editBtn.click();
    // Visual indicator: body should have edit-mode class
    await expect(page.locator('body.edit-mode')).toBeVisible();

    // Click the first NewItemAffordance ('+' card)
    const newItem = page.getByRole('button', { name: /new nav item|新建导航项/i }).first();
    await newItem.click();

    // Fill ItemEditDialog form
    await page.getByLabel(/edit — name|name/i).first().fill('E2EItem');
    await page.getByLabel(/icon value/i).fill('e2e.png');
    await page.getByLabel(/links/i).fill('{"shangHai":"http://e2e.test"}');

    // Save
    await page.getByRole('button', { name: /^save$|^保存$/i }).click();

    // Verify the new item appears
    await expect(page.locator('button[aria-label="E2EItem"]')).toBeVisible({ timeout: 10_000 });
  });
});
