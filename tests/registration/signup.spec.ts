import { test, expect } from '../../src/fixtures/base.fixture';
import { LoginPage } from '../../src/pages/login.page';
import { SignupPage } from '../../src/pages/signup.page';
import { WelcomePage } from '../../src/pages/welcome.page';

test.describe('Company Registration', () => {
  test('can sign up and complete onboarding', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const signupPage = new SignupPage(page);
    const welcomePage = new WelcomePage(page);

    // Navigate to login and click the sign-up link
    await loginPage.goto();
    await loginPage.clickSignUp();
    await expect(page).toHaveURL(/\/Signup/);

    // Register a new account
    const timestamp = Date.now();
    const email = `e2e+${timestamp}@test.clockshark.com`;
    const password = 'TestPass123!';

    await signupPage.register(email, password);

    // Should redirect to the welcome/onboarding page
    await expect(page).toHaveURL(/\/App\/Welcome/, { timeout: 30_000 });

    // Step 1: Personal Information
    await welcomePage.completeStep1('Test', 'User', '5551234567');

    // Step 2: Company Information
    await welcomePage.completeStep2(
      'E2E Test Company',
      'Construction',
      '1-10',
      'United States',
      'California',
    );

    // Step 3: Skip mobile app download
    await welcomePage.skipMobileApp();

    // Should remain on the welcome page after completing all steps
    await expect(page).toHaveURL(/\/App\/Welcome/);
  });
});
