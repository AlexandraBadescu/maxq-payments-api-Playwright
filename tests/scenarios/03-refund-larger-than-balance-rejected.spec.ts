import { test, expect } from '@playwright/test';
import { PARTIAL_REFUND_MINOR } from '../constants';
import {
  setUpCapturedPayment,
  requestRefund,
  requestAcceptedRefund,
  getPayment,
  expectError,
} from '../helpers';

test('03 a refund larger than the balance is rejected', async ({ request }) => {
  const { customer, payment, captured } = await setUpCapturedPayment(request);

  const res = await requestRefund(request, customer.authHeader, payment.id, captured.capturedMinor + 1);
  await expectError(res, 422, 'refund_exceeds_balance');

  // The rejected request must not have reserved any of the balance.
  const unchanged = await getPayment(request, customer.authHeader, payment.id);
  expect(unchanged.status).toBe('captured');
  expect(unchanged.pendingRefundMinor).toBe(0);
  expect(unchanged.refundableMinor).toBe(captured.capturedMinor);

  // A refund that is still in progress has already reserved its amount, so a second
  // request can only ask for what is left. Two refunds in flight must never add up
  // to more than was captured.
  await requestAcceptedRefund(request, customer.authHeader, payment.id, PARTIAL_REFUND_MINOR);
  const tooMuch = captured.capturedMinor - PARTIAL_REFUND_MINOR + 1;
  await expectError(
    await requestRefund(request, customer.authHeader, payment.id, tooMuch),
    422,
    'refund_exceeds_balance',
  );

  const after = await getPayment(request, customer.authHeader, payment.id);
  expect(after.pendingRefundMinor).toBe(PARTIAL_REFUND_MINOR);
  expect(after.refundableMinor).toBe(captured.capturedMinor - PARTIAL_REFUND_MINOR);
  expect(after.refunds).toHaveLength(1);
});
