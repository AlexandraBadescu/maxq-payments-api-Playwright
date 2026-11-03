import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestRefund,
} from '../helpers';

test('08 a duplicate refund notification has no second effect', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);
  const captureEvent = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, captureEvent.deliveryId, 'applied');
  await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

  const amount = 500;
  const refund = await (await requestRefund(request, customer.authHeader, payment.id, amount)).json();

  const first = await sendEvent(request, {
    type: 'refund.succeeded',
    paymentId: payment.id,
    refundId: refund.id,
  });
  await waitForDeliveryStatus(request, first.deliveryId, 'applied');
  const afterFirst = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'partially_refunded');
  expect(afterFirst.refundedMinor).toBe(amount);

  const repeat = await sendEvent(request, {
    type: 'refund.succeeded',
    paymentId: payment.id,
    refundId: refund.id,
    eventId: first.eventId,
  });
  await waitForDeliveryStatus(request, repeat.deliveryId, 'duplicate');

  const after = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'partially_refunded');
  expect(after.refundedMinor).toBe(amount);
  expect(after.refundableMinor).toBe(afterFirst.refundableMinor);
});
