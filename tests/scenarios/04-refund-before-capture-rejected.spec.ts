import { test, expect } from '@playwright/test';
import { setUpAuthorisedPayment, requestRefund } from '../helpers';

test('04 a refund before capture is rejected', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });
  expect(payment.status).toBe('authorised');

  const res = await requestRefund(request, customer.authHeader, payment.id, 100);

  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.error.code).toBe('invalid_state');
});
