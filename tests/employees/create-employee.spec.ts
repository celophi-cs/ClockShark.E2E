import { test, expect } from '../../src/fixtures/base.fixture';
import { registerCompany } from '../../src/helpers/registration.helper';
import { EmployeesPage } from '../../src/pages/employees.page';

test.describe('Employee Management', () => {
  test('can create a new employee', async ({ page }) => {
    // Register a new company to get an authenticated admin session
    await registerCompany(page);

    // Navigate to employees page via the Admin header dropdown
    const employeesPage = new EmployeesPage(page);
    await employeesPage.navigateViaHeader();

    // Open the Add Employee modal and fill in details
    const employeeEmail = `e2e+emp+${Date.now()}@test.clockshark.com`;
    await employeesPage.addEmployee({
      firstName: 'Jane',
      lastName: 'Doe',
      email: employeeEmail,
      password: 'EmployeePass123!',
    });

    // Verify the modal closes and the employee appears in the list
    await employeesPage.expectModalClosed();
    await expect(page.locator('table').getByText('Jane')).toBeVisible();
    await expect(page.locator('table').getByText('Doe')).toBeVisible();
  });
});
