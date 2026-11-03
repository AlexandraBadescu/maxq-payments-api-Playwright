import { test, expect } from '@playwright/test';
import { PARTIAL_REFUND_MINOR } from '../constants';
import {
  setUpCapturedPayment,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestAcceptedRefund,
  getHistory,
  countEntries,
  expectedTotalMinor,
} from '../helpers';

// A repeated notification is usually caught by its event ID (scenario 08). Here the
// provider sends the same refund result under a different ID, so the service has to
// notice that the refund itself has already settled.
test('19 a new event ID cannot settle the same refund twice', async ({ request }) => {
  const { customer, payment } = await setUpCapturedPayment(request);
  const total = expectedTotalMinor('GBP');

  const refund = await requestAcceptedRefund(request, customer.authHeader, payment.id, PARTIAL_REFUND_MINOR);
  const first = await sendEvent(request, { type: 'refund.succeeded', paymentId: payment.id, refundId: refund.id });
  await waitForDeliveryStatus(request, first.deliveryId, 'applied');
  await waitForPaymentStatus(request, customer.authHeader, payment.id, 'partially_refunded');

  const second = await sendEvent(request, { type: 'refund.succeeded', paymentId: payment.id, refundId: refund.id });
  expect(second.eventId).not.toBe(first.eventId);
  const outcome = await waitForDeliveryStatus(request, second.deliveryId, 'rejected');
  expect(outcome.reason).toBe('refund_not_pending');

  const after = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'partially_refunded');
  expect(after.refundedMinor).toBe(PARTIAL_REFUND_MINOR);
  expect(after.refundableMinor).toBe(total - PARTIAL_REFUND_MINOR);
  expect(countEntries(await getHistory(request, customer.authHeader, payment.id), 'refund_settled')).toBe(1);
});
