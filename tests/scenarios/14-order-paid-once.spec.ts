import { test, expect } from '@playwright/test';
import { registerAndLogIn, createOrder, authorisePayment } from '../helpers';

test('14 an order can only be paid once', async ({ request }) => {
  const customer = await registerAndLogIn(request);
  const order = await createOrder(request, customer.authHeader, { currency: 'GBP' });

  const first = await authorisePayment(request, customer.authHeader, order.id, 'pm_success');
  expect(first.status()).toBe(201);

  const second = await authorisePayment(request, customer.authHeader, order.id, 'pm_success');
  expect(second.status()).toBe(409);
  const body = await second.json();
  expect(body.error.code).toBe('order_already_paid');
});

test('14b a declined attempt does not block a retry on the same order', async ({ request }) => {
  const customer = await registerAndLogIn(request);
  const order = await createOrder(request, customer.authHeader, { currency: 'GBP' });

  const declined = await authorisePayment(request, customer.authHeader, order.id, 'pm_declined');
  expect(declined.status()).toBe(201);
  expect((await declined.json()).status).toBe('declined');

  // The customer trying again on a declined order is the normal path, not
  // a double payment.
  const retry = await authorisePayment(request, customer.authHeader, order.id, 'pm_success');
  expect(retry.status()).toBe(201);
  expect((await retry.json()).status).toBe('authorised');
});
