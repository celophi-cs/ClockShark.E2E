import { test, expect } from '@playwright/test';

test('playwright can launch a browser and navigate', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example Domain');
  await expect(page.locator('h1')).toHaveText('Example Domain');
});
