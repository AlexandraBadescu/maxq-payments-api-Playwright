import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
} from '../helpers';

test("09 an out-of-order failure cannot undo a settled capture", async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);
  const succeeded = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, succeeded.deliveryId, 'applied');
  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

  // A late, out-of-order failure for the same capture — the kind of thing
  // that can happen when a provider's own retries race each other.
  const failed = await sendEvent(request, { type: 'capture.failed', paymentId: payment.id });
  await waitForDeliveryStatus(request, failed.deliveryId, 'rejected');

  const after = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(after.capturedMinor).toBe(captured.capturedMinor);
});
