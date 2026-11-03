import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestRefund,
  expectedTotalMinor,
} from '../helpers';

test('02 refunding the remaining balance completes the refund', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });
  const total = expectedTotalMinor('GBP');

  await requestCapture(request, customer.authHeader, payment.id);
  const captureEvent = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, captureEvent.deliveryId, 'applied');
  await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

  const firstAmount = 500;
  const firstRefund = await (await requestRefund(request, customer.authHeader, payment.id, firstAmount)).json();
  const firstEvent = await sendEvent(request, {
    type: 'refund.succeeded',
    paymentId: payment.id,
    refundId: firstRefund.id,
  });
  await waitForDeliveryStatus(request, firstEvent.deliveryId, 'applied');
  const afterFirst = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'partially_refunded');
  expect(afterFirst.refundableMinor).toBe(total - firstAmount);

  // Refund exactly what's left — the balance, not an amount the test
  // calculated separately and could get wrong in the same way twice.
  const secondAmount = afterFirst.refundableMinor;
  const secondRefund = await (
    await requestRefund(request, customer.authHeader, payment.id, secondAmount)
  ).json();
  const secondEvent = await sendEvent(request, {
    type: 'refund.succeeded',
    paymentId: payment.id,
    refundId: secondRefund.id,
  });
  await waitForDeliveryStatus(request, secondEvent.deliveryId, 'applied');

  const refunded = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'refunded');
  expect(refunded.refundedMinor).toBe(total);
  expect(refunded.refundableMinor).toBe(0);
});
