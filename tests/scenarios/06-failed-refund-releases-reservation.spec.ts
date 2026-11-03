import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestRefund,
} from '../helpers';

test('06 a failed refund releases the reserved balance', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);
  const captureEvent = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, captureEvent.deliveryId, 'applied');
  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

  const amount = 500;
  const refund = await (await requestRefund(request, customer.authHeader, payment.id, amount)).json();

  // The reservation happens immediately, before any notification — a
  // second refund in progress at the same time can't add up to more than
  // was captured.
  const reserved = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(reserved.refundableMinor).toBe(captured.capturedMinor - amount);

  const failedEvent = await sendEvent(request, {
    type: 'refund.failed',
    paymentId: payment.id,
    refundId: refund.id,
  });
  await waitForDeliveryStatus(request, failedEvent.deliveryId, 'applied');

  const released = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(released.refundableMinor).toBe(captured.capturedMinor);
  expect(released.refundedMinor).toBe(0);

  // The balance really was released, not just reported as released: the
  // same amount can be requested again.
  const retryRes = await requestRefund(request, customer.authHeader, payment.id, amount);
  expect(retryRes.status()).toBe(202);
});
