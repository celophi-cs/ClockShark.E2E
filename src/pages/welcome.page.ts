import { type Page } from '@playwright/test';

export class WelcomePage {
  constructor(private page: Page) {}

  // Step 1: Personal Information
  async fillFirstName(name: string) {
    await this.page.locator('#firstName').fill(name);
  }

  async fillLastName(name: string) {
    await this.page.locator('#lastName').fill(name);
  }

  async fillWorkPhone(phone: string) {
    // Blazor phone input component - type into the input inside the component
    await this.page.locator('#step-1 input[type="tel"]').fill(phone);
  }

  async clickNextStep1() {
    await this.page.locator('#step-1 button.btn-orange-primary').click();
  }

  async completeStep1(firstName: string, lastName: string, phone: string) {
    await this.fillFirstName(firstName);
    await this.fillLastName(lastName);
    await this.fillWorkPhone(phone);
    await this.clickNextStep1();
  }

  // Step 2: Company Information
  async fillCompanyName(name: string) {
    await this.page.locator('#company').fill(name);
  }

  async selectIndustry(value: string) {
    await this.page.locator('#industry').selectOption(value);
  }

  async selectEmployeeRange(value: string) {
    await this.page.locator('#employeeRange').selectOption(value);
  }

  async selectCountry(name: string) {
    await this.page.locator('#country').selectOption({ label: name });
  }

  async selectStateProvince(name: string) {
    // Wait for the state dropdown to become visible after country selection
    await this.page.locator('#stateProvince').waitFor({ state: 'visible' });
    await this.page.locator('#stateProvince').selectOption({ label: name });
  }

  async clickNextStep2() {
    await this.page.locator('#step-2 button.btn-orange-primary').click();
  }

  async completeStep2(
    companyName: string,
    industry: string,
    employeeRange: string,
    country: string,
    stateProvince: string,
  ) {
    await this.fillCompanyName(companyName);
    await this.selectIndustry(industry);
    await this.selectEmployeeRange(employeeRange);
    await this.selectCountry(country);
    await this.selectStateProvince(stateProvince);
    await this.clickNextStep2();
  }

  // Step 3: Mobile App Download (skip it)
  async skipMobileApp() {
    await this.page.getByText("I'll do this later").click();
  }
}
