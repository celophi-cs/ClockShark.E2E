import { test, expect } from '@playwright/test';
import { LoginPage } from '../../src/pages/login.page';
import { SignupPage } from '../../src/pages/signup.page';

test.describe('Company Registration', () => {
  test('can sign up for a new account from the login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);

    // Navigate to login and click the sign-up link
    await loginPage.goto();
    await loginPage.clickSignUp();
    await expect(page).toHaveURL(/\/Signup/);

    // Register a new account
    const timestamp = Date.now();
    const email = `e2e+${timestamp}@test.clockshark.com`;
    const password = 'TestPass123!';

    await signupPage.register(email, password);

    // After successful registration, should redirect to the welcome/onboarding page
    await expect(page).toHaveURL(/\/(App\/Welcome|App)/, { timeout: 30_000 });
  });
});
