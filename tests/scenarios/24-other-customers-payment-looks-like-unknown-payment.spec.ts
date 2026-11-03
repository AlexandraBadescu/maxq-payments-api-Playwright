import { test, expect } from '@playwright/test';
import { registerAndLogIn, setUpAuthorisedPayment, expectError } from '../helpers';

// If the two answers differed, anyone could use the API to find out which payment
// IDs are real.
test("24 another customer's payment looks the same as one that does not exist", async ({ request }) => {
  const { payment } = await setUpAuthorisedPayment(request);
  const stranger = await registerAndLogIn(request, 'stranger');

  for (const suffix of ['', '/history']) {
    const real = await request.get(`/payments/${payment.id}${suffix}`, { headers: stranger.authHeader });
    const unknown = await request.get(`/payments/00000000-0000-4000-8000-000000000000${suffix}`, {
      headers: stranger.authHeader,
    });
    const realBody = await expectError(real, 404, 'not_found');
    const unknownBody = await expectError(unknown, 404, 'not_found');
    expect(realBody, `GET /payments/:id${suffix}`).toEqual(unknownBody);
  }
});
