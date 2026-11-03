import { test, expect } from '@playwright/test';
import { registerAndLogIn, createOrder, authorisePayment, expectError } from '../helpers';

test("23 a customer cannot pay for someone else's order", async ({ request }) => {
  const owner = await registerAndLogIn(request, 'owner');
  const order = await createOrder(request, owner.authHeader, { currency: 'GBP' });
  const stranger = await registerAndLogIn(request, 'stranger');

  // The same "not found" as for an order that does not exist.
  const res = await authorisePayment(request, stranger.authHeader, order.id, 'pm_success');
  await expectError(res, 404, 'not_found');

  // The failed attempt did not use the order up: the owner can still pay for it.
  const ownerRes = await authorisePayment(request, owner.authHeader, order.id, 'pm_success');
  expect(ownerRes.status()).toBe(201);
  expect((await ownerRes.json()).status).toBe('authorised');
});
