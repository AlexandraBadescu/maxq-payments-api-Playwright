import { test, expect } from '@playwright/test';
import {
  setUpCapturedPayment,
  sendEvent,
  waitForDeliveryStatus,
  requestAcceptedRefund,
  requestRefund,
  getPayment,
} from '../helpers';

test('06 a failed refund releases the reserved balance', async ({ request }) => {
  const { customer, payment, captured } = await setUpCapturedPayment(request);

  const amount = 500;
  const refund = await requestAcceptedRefund(request, customer.authHeader, payment.id, amount);

  // The reservation happens immediately, before any notification, so a second
  // refund in progress at the same time can't add up to more than was captured.
  // This is a single read, not a poll: it has to be true straight away.
  const reserved = await getPayment(request, customer.authHeader, payment.id);
  expect(reserved.status).toBe('captured');
  expect(reserved.refundableMinor).toBe(captured.capturedMinor - amount);

  const failedEvent = await sendEvent(request, {
    type: 'refund.failed',
    paymentId: payment.id,
    refundId: refund.id,
  });
  await waitForDeliveryStatus(request, failedEvent.deliveryId, 'applied');

  const released = await getPayment(request, customer.authHeader, payment.id);
  expect(released.status).toBe('captured');
  expect(released.refundableMinor).toBe(captured.capturedMinor);
  expect(released.pendingRefundMinor).toBe(0);
  expect(released.refundedMinor).toBe(0);

  // The balance really was released, not just reported as released: the
  // same amount can be requested again.
  const retryRes = await requestRefund(request, customer.authHeader, payment.id, amount);
  expect(retryRes.status()).toBe(202);
});
