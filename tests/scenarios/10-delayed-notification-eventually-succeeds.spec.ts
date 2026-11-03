import { test, expect } from '@playwright/test';
import { CAPTURE_TIMEOUT_MS } from '../constants';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  getPayment,
  waitForPaymentStatus,
} from '../helpers';

test('10 a delayed notification eventually succeeds', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);

  // Nothing has been captured yet. Without this check the test could not tell a
  // notification that was delayed from a service that marked the payment captured
  // before the provider had confirmed anything.
  const pending = await getPayment(request, customer.authHeader, payment.id);
  expect(pending.status).toBe('capture_pending');
  expect(pending.capturedMinor).toBe(0);
  expect(pending.refundableMinor).toBe(0);

  // Slow, but still comfortably inside the timeout window: this is "the
  // notification took a while", not "the notification never came".
  await sendEvent(request, {
    type: 'capture.succeeded',
    paymentId: payment.id,
    delayMs: Math.floor(CAPTURE_TIMEOUT_MS * 0.5),
  });

  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(captured.capturedMinor).toBe(payment.amountMinor);
});
