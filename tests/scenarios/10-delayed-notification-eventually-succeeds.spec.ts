import { test, expect } from '@playwright/test';
import { CAPTURE_TIMEOUT_MS } from '../constants';
import { setUpAuthorisedPayment, requestCapture, sendEvent, waitForPaymentStatus } from '../helpers';

test('10 a delayed notification eventually succeeds', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);

  // Slow, but still comfortably inside the timeout window — this is "the
  // notification took a while", not "the notification never came".
  await sendEvent(request, {
    type: 'capture.succeeded',
    paymentId: payment.id,
    delayMs: Math.floor(CAPTURE_TIMEOUT_MS * 0.5),
  });

  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(captured.capturedMinor).toBe(payment.amountMinor);
});
