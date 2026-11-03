import { test, expect } from '@playwright/test';
import { setUpAuthorisedPayment, requestRefund, getPayment, expectError } from '../helpers';

test('04 a refund before capture is rejected', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });
  expect(payment.status).toBe('authorised');

  await expectError(await requestRefund(request, customer.authHeader, payment.id, 100), 409, 'invalid_state');

  // Nothing was recorded.
  const after = await getPayment(request, customer.authHeader, payment.id);
  expect(after.status).toBe('authorised');
  expect(after.refunds).toEqual([]);
  expect(after.pendingRefundMinor).toBe(0);
  expect(after.refundedMinor).toBe(0);
});
