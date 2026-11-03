import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  expectedTotalMinor,
} from '../helpers';

// A notification that arrives too early changes nothing. If the provider sends it
// again once the payment is ready, it must take effect, and not be thrown away as a
// duplicate of something that never happened.
test('20 a rejected notification can still be applied when sent again', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });
  const total = expectedTotalMinor('GBP');

  const early = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  const rejected = await waitForDeliveryStatus(request, early.deliveryId, 'rejected');
  expect(rejected.reason).toBe('invalid_transition');

  const captureRes = await requestCapture(request, customer.authHeader, payment.id);
  expect(captureRes.status()).toBe(202);

  const again = await sendEvent(request, {
    type: 'capture.succeeded',
    paymentId: payment.id,
    eventId: early.eventId,
  });
  await waitForDeliveryStatus(request, again.deliveryId, 'applied');

  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(captured.capturedMinor).toBe(total);
  expect(captured.refundableMinor).toBe(total);
});
