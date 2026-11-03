import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestRefund,
} from '../helpers';

test('03 a refund larger than the balance is rejected', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);
  const captureEvent = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, captureEvent.deliveryId, 'applied');
  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

  const res = await requestRefund(request, customer.authHeader, payment.id, captured.capturedMinor + 1);

  expect(res.status()).toBe(422);
  const body = await res.json();
  expect(body.error.code).toBe('refund_exceeds_balance');

  // The rejected request must not have reserved any of the balance.
  const unchanged = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(unchanged.refundableMinor).toBe(captured.capturedMinor);
});
