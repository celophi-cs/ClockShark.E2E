import { type Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/Login');
  }

  async login(email: string, password: string) {
    await this.page.locator('input[name="Email"]').fill(email);
    await this.page.locator('input[name="Password"]').fill(password);
    await this.page.getByRole('button', { name: 'Log In' }).click();
  }

  async clickSignUp() {
    await this.page.getByRole('link', { name: 'Sign up' }).click();
  }
}
