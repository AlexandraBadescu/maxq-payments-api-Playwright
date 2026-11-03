import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
} from '../helpers';

test('12 a late notification after a timeout still settles', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);
  await waitForPaymentStatus(request, customer.authHeader, payment.id, 'capture_timed_out');

  // The notification shows up after the timeout fired. The timeout meant
  // "unknown", so this should still settle the payment, not be rejected as
  // out of sequence.
  const event = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, event.deliveryId, 'applied');

  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(captured.capturedMinor).toBe(payment.amountMinor);
});
