import { expect, type Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { SignupPage } from '../pages/signup.page';
import { WelcomePage } from '../pages/welcome.page';

export interface RegisteredCompany {
  email: string;
  password: string;
}

export async function registerCompany(page: Page): Promise<RegisteredCompany> {
  const loginPage = new LoginPage(page);
  const signupPage = new SignupPage(page);
  const welcomePage = new WelcomePage(page);

  // Navigate to signup
  await loginPage.goto();
  await loginPage.clickSignUp();
  await expect(page).toHaveURL(/\/Signup/);

  // Register a new account with a unique email
  const timestamp = Date.now();
  const email = `e2e+${timestamp}@test.clockshark.com`;
  const password = 'TestPass123!';
  await signupPage.register(email, password);

  // Wait for redirect to the welcome/onboarding page
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

  // Verify onboarding completed
  await expect(page).toHaveURL(/\/App\/Welcome/);

  return { email, password };
}
