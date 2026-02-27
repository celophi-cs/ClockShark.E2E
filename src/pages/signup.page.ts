import { type Page } from '@playwright/test';

export class SignupPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/Signup');
  }

  async fillEmail(email: string) {
    await this.page.locator('.ClockSharkSignup__email input[name="Email"]').fill(email);
  }

  async fillPassword(password: string) {
    await this.page.locator('.ClockSharkSignup__password input[name="Password"]').fill(password);
  }

  async acceptTerms() {
    await this.page.locator('input[name="OptIntoTermsAndConditions"]').check();
  }

  async submit() {
    await this.page.locator('.ClockSharkSignup__start-trial').click();
  }

  async register(email: string, password: string) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.acceptTerms();
    await this.submit();
  }
}
