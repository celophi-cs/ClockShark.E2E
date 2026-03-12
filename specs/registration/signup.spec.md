---
id: signup-flow
generated_test: tests/ai-generated/registration/signup.generated.spec.ts
spec_hash: 80b0d536929144c4b821796c08ce8cf0318fb8f103bfa5b649d7bc4bf7134d65
preconditions:
  - clean-session
timeout: 120000
---

# Company Registration - Signup Flow

## Context
The ClockShark signup flow allows new users to create a trial account.
The login page is at /Login and has a "Sign up" link.
The signup page has fields for email, password, a terms checkbox, and a "Start Trial" button.
After signup, the user is redirected to /App/Welcome for onboarding.

Onboarding has 3 steps:
- Step 1: First Name, Last Name, Work Phone
- Step 2: Company Name, Industry (dropdown), Employee Range (dropdown), Country (dropdown), State/Province (dropdown)
- Step 3: Mobile app prompt with a "I'll do this later" skip link

## Steps
1. Navigate to /Login
2. Click the "Sign up" link to go to the signup page
3. Enter a unique email address using the pattern e2e+{timestamp}@test.clockshark.com
4. Enter "TestPass123!" as the password
5. Check the terms and conditions checkbox
6. Click the "Start Trial" button
7. Wait for redirect to /App/Welcome (up to 30 seconds)
8. Fill in First Name: "Test", Last Name: "User", Work Phone: "5551234567"
9. Click the Next button to proceed to Step 2
10. Fill in Company Name: "E2E Test Company"
11. Select Industry: "Construction"
12. Select Employee Range: "1-10"
13. Select Country: "United States"
14. Select State: "California"
15. Click the Next button to proceed to Step 3
16. Click "I'll do this later" to skip the mobile app step

## Assertions
- After step 2: URL contains "/Signup"
- After step 7: URL contains "/App/Welcome"
- After step 16: URL contains "/App/Welcome"
