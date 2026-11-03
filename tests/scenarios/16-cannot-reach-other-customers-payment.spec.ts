import { test, expect } from '@playwright/test';
import { registerAndLogIn, createOrder, authorisePayment, requestCapture, requestRefund } from '../helpers';

test("16 a customer cannot reach someone else's payment", async ({ request }) => {
  const owner = await registerAndLogIn(request, 'owner');
  const order = await createOrder(request, owner.authHeader, { currency: 'GBP' });
  const authRes = await authorisePayment(request, owner.authHeader, order.id, 'pm_success');
  const payment = await authRes.json();

  const stranger = await registerAndLogIn(request, 'stranger');

  // Every one of these must look exactly like the payment doesn't exist —
  // 404, not 403 — so the API itself can't be used to discover which
  // payment IDs are real.
  const readRes = await request.get(`/payments/${payment.id}`, { headers: stranger.authHeader });
  expect(readRes.status()).toBe(404);
  expect((await readRes.json()).error.code).toBe('not_found');

  const historyRes = await request.get(`/payments/${payment.id}/history`, { headers: stranger.authHeader });
  expect(historyRes.status()).toBe(404);

  const captureRes = await requestCapture(request, stranger.authHeader, payment.id);
  expect(captureRes.status()).toBe(404);

  const refundRes = await requestRefund(request, stranger.authHeader, payment.id, 100);
  expect(refundRes.status()).toBe(404);

  // The owner, meanwhile, can still reach their own payment.
  const ownerRead = await request.get(`/payments/${payment.id}`, { headers: owner.authHeader });
  expect(ownerRead.status()).toBe(200);
});
