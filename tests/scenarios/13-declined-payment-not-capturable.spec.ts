import { test, expect } from '@playwright/test';
import { registerAndLogIn, createOrder, authorisePayment, requestCapture } from '../helpers';

test('13 a declined payment cannot be captured', async ({ request }) => {
  const customer = await registerAndLogIn(request);
  const order = await createOrder(request, customer.authHeader, { currency: 'GBP' });

  const authRes = await authorisePayment(request, customer.authHeader, order.id, 'pm_declined');
  expect(authRes.status()).toBe(201);
  const payment = await authRes.json();
  expect(payment.status).toBe('declined');

  const captureRes = await requestCapture(request, customer.authHeader, payment.id);
  expect(captureRes.status()).toBe(409);
  const body = await captureRes.json();
  expect(body.error.code).toBe('invalid_state');
});
