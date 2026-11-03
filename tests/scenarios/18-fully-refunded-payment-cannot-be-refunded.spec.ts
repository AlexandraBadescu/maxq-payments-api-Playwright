import { test, expect } from '@playwright/test';
import {
  setUpCapturedPayment,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestAcceptedRefund,
  requestRefund,
  expectError,
  expectedTotalMinor,
} from '../helpers';

test('18 a fully refunded payment cannot be refunded again', async ({ request }) => {
  const { customer, payment } = await setUpCapturedPayment(request);
  const total = expectedTotalMinor('GBP');

  const refund = await requestAcceptedRefund(request, customer.authHeader, payment.id, total);
  const event = await sendEvent(request, { type: 'refund.succeeded', paymentId: payment.id, refundId: refund.id });
  await waitForDeliveryStatus(request, event.deliveryId, 'applied');
  await waitForPaymentStatus(request, customer.authHeader, payment.id, 'refunded');

  // There is nothing left to return, so this is the wrong state for a refund
  // (409 invalid_state), not an amount that is too large (422).
  await expectError(await requestRefund(request, customer.authHeader, payment.id, 1), 409, 'invalid_state');

  const after = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'refunded');
  expect(after.refundedMinor).toBe(total);
  expect(after.refundableMinor).toBe(0);
  expect(after.pendingRefundMinor).toBe(0);
  expect(after.refunds).toHaveLength(1);
});
