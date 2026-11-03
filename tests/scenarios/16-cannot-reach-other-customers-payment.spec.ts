import { test, expect } from '@playwright/test';
import {
  registerAndLogIn,
  setUpAuthorisedPayment,
  requestCapture,
  requestRefund,
  getPayment,
  expectError,
} from '../helpers';

const UNKNOWN_PAYMENT_ID = '00000000-0000-4000-8000-000000000000';

test("16 a customer cannot reach someone else's payment", async ({ request }) => {
  const { customer: owner, payment } = await setUpAuthorisedPayment(request);
  const stranger = await registerAndLogIn(request, 'stranger');

  // Every one of these must look exactly like the payment doesn't exist:
  // 404, not 403, so the API itself can't be used to discover which
  // payment IDs are real.
  const readRes = await request.get(`/payments/${payment.id}`, { headers: stranger.authHeader });
  const readBody = await expectError(readRes, 404, 'not_found');

  await expectError(
    await request.get(`/payments/${payment.id}/history`, { headers: stranger.authHeader }),
    404,
    'not_found',
  );
  await expectError(await requestCapture(request, stranger.authHeader, payment.id), 404, 'not_found');
  await expectError(await requestRefund(request, stranger.authHeader, payment.id, 100), 404, 'not_found');

  // "Looks exactly like" means the whole answer, message included: the reply for
  // another customer's payment is identical to the reply for one that isn't there.
  const unknownRes = await request.get(`/payments/${UNKNOWN_PAYMENT_ID}`, { headers: stranger.authHeader });
  expect(await expectError(unknownRes, 404, 'not_found')).toEqual(readBody);

  // The owner, meanwhile, can still reach their own payment, and nothing the
  // stranger tried has changed it.
  const ownerView = await getPayment(request, owner.authHeader, payment.id);
  expect(ownerView.status).toBe('authorised');
  expect(ownerView.capturedMinor).toBe(0);
  expect(ownerView.refunds).toEqual([]);
});
