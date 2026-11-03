import { test, expect } from '@playwright/test';
import {
  setUpCapturedPayment,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestAcceptedRefund,
  getHistory,
  countEntries,
} from '../helpers';

test('08 a duplicate refund notification has no second effect', async ({ request }) => {
  const { customer, payment } = await setUpCapturedPayment(request);

  const amount = 500;
  const refund = await requestAcceptedRefund(request, customer.authHeader, payment.id, amount);

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
  const outcome = await waitForDeliveryStatus(request, repeat.deliveryId, 'duplicate');
  expect(outcome.reason).toBe('event_already_processed');

  const after = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'partially_refunded');
  expect(after.refundedMinor).toBe(amount);
  expect(after.refundableMinor).toBe(afterFirst.refundableMinor);

  // The refund settled once, and the history says so once.
  expect(countEntries(await getHistory(request, customer.authHeader, payment.id), 'refund_settled')).toBe(1);
});
