import { test, expect } from '@playwright/test';
import { setUpAuthorisedPayment, requestCapture, waitForPaymentStatus, requestRefund, expectError } from '../helpers';

test('11 a missing notification produces a clear timeout', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);

  // Send no notification at all. The service should give up and say so,
  // rather than leaving the payment pending forever.
  const timedOut = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'capture_timed_out');
  expect(timedOut.capturedMinor).toBe(0);

  // A timeout means "we don't know yet", not "it failed", but a refund
  // still can't be requested until the outcome is actually known.
  await expectError(await requestRefund(request, customer.authHeader, payment.id, 100), 409, 'invalid_state');
});
