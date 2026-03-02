import { test as base } from '@playwright/test';

/**
 * Extended test fixture that auto-dismisses Chameleon.io product tour modals.
 * These pop up randomly and block interactions with the app.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Dismiss Chameleon tour modals whenever they appear and block actions
    await page.addLocatorHandler(
      page.locator('#chmln .chmln-close'),
      async (overlay) => {
        await overlay.click();
      },
    );

    await use(page);
  },
});

export { expect } from '@playwright/test';
