import { type Page, type Locator } from '@playwright/test';

export class EmployeesPage {
  private readonly modal: Locator;

  constructor(private page: Page) {
    this.modal = page.locator('#add-edit-employee-modal');
  }

  // Navigation
  async navigateViaHeader() {
    await this.page.getByRole('button', { name: 'Admin' }).click();
    await this.page.getByRole('link', { name: 'Employees' }).click();
    await this.page.waitForURL(/\/App\/Employees/);
    // Wait for Knockout/Sammy.js initialization and employee API calls to complete
    await this.page.waitForLoadState('networkidle');
  }

  // Add Employee modal
  async clickAddEmployee() {
    const addButton = this.page.locator('a.btn-primary', { hasText: 'Add Employee' });
    await addButton.click();
    await this.modal.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async fillFirstName(name: string) {
    await this.modal.getByPlaceholder('First Name').fill(name);
  }

  async fillLastName(name: string) {
    await this.modal.getByPlaceholder('Last Name').fill(name);
  }

  async fillEmail(email: string) {
    await this.modal.locator('input[autocomplete="new-email"]').fill(email);
  }

  async fillPassword(password: string) {
    await this.modal.locator('input[autocomplete="new-password"]').fill(password);
  }

  async clickCreateEmployee() {
    const btn = this.modal.locator('button', { hasText: 'Create Employee' });
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async expectModalClosed() {
    await this.modal.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  // Convenience method for the full add employee flow
  async addEmployee(details: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    await this.clickAddEmployee();
    await this.fillFirstName(details.firstName);
    await this.fillLastName(details.lastName);
    await this.fillEmail(details.email);
    await this.fillPassword(details.password);
    await this.clickCreateEmployee();
  }
}
