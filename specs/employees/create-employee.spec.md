---
id: create-employee
generated_test: tests/ai-generated/employees/create-employee.generated.spec.ts
spec_hash: null
preconditions:
  - authenticated-admin
timeout: 180000
---

# Employee Management - Create Employee

## Context
This test requires an authenticated admin session. First, register a new company
through the full signup + onboarding flow (same as the signup spec), then navigate
to the Employees page.

The signup flow: /Login -> Sign up -> register with unique email -> complete 3 onboarding steps.
After onboarding, navigate to Admin > Employees via the header navigation.
The Employees page has an "Add Employee" button that opens a modal with fields for
first name, last name, email, and password.

## Steps
1. Navigate to /Login
2. Click the "Sign up" link
3. Register a new account with a unique email (e2e+{timestamp}@test.clockshark.com) and password "TestPass123!"
4. Complete onboarding Step 1: First Name "Test", Last Name "Admin", Phone "5559876543"
5. Complete onboarding Step 2: Company "E2E Employee Test Co", Industry "Construction", Employees "1-10", Country "United States", State "California"
6. Complete onboarding Step 3: Skip the mobile app download
7. Navigate to the Employees page via Admin menu in the header
8. Click the "Add Employee" button
9. Fill in First Name: "Jane"
10. Fill in Last Name: "Doe"
11. Fill in Email with a unique address: e2e+emp+{timestamp}@test.clockshark.com
12. Fill in Password: "EmployeePass123!"
13. Click the "Create Employee" button
14. Wait for the modal to close

## Assertions
- After step 6: URL contains "/App/Welcome"
- After step 14: "Jane" is visible in the employee table
- After step 14: "Doe" is visible in the employee table
