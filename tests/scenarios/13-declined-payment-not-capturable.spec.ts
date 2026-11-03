import { test, expect } from '@playwright/test';
import {
  registerAndLogIn,
  createOrder,
  authorisePayment,
  requestCapture,
  getPayment,
  expectError,
  type Payment,
} from '../helpers';

test('13 a declined payment cannot be captured', async ({ request }) => {
  const customer = await registerAndLogIn(request);
  const order = await createOrder(request, customer.authHeader, { currency: 'GBP' });

  const authRes = await authorisePayment(request, customer.authHeader, order.id, 'pm_declined');
  expect(authRes.status()).toBe(201);
  const payment = (await authRes.json()) as Payment;
  expect(payment.status).toBe('declined');

  await expectError(await requestCapture(request, customer.authHeader, payment.id), 409, 'invalid_state');

  // No money moved.
  const after = await getPayment(request, customer.authHeader, payment.id);
  expect(after.status).toBe('declined');
  expect(after.capturedMinor).toBe(0);
  expect(after.refundableMinor).toBe(0);
});
