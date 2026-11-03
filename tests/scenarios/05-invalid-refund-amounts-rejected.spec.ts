import { test, expect } from '@playwright/test';
import { setUpCapturedPayment, getPayment, expectError } from '../helpers';

const INVALID_AMOUNTS: Array<{ label: string; amountMinor: unknown }> = [
  { label: 'zero', amountMinor: 0 },
  { label: 'negative', amountMinor: -500 },
  { label: 'not a whole number', amountMinor: 12.5 },
  { label: 'a string', amountMinor: '500' },
  { label: 'null', amountMinor: null },
  { label: 'a boolean', amountMinor: true },
  { label: 'too large to be represented exactly', amountMinor: 1e21 },
  { label: 'missing', amountMinor: undefined },
];

test.describe('05 invalid refund amounts are rejected', () => {
  for (const { label, amountMinor } of INVALID_AMOUNTS) {
    test(`amountMinor that is ${label}`, async ({ request }) => {
      const { customer, payment, captured } = await setUpCapturedPayment(request);

      const res = await request.post(`/payments/${payment.id}/refunds`, {
        headers: customer.authHeader,
        data: { amountMinor },
      });
      await expectError(res, 400, 'validation_failed');

      // The rejected request left the money exactly where it was.
      const after = await getPayment(request, customer.authHeader, payment.id);
      expect(after.status).toBe('captured');
      expect(after.refunds).toEqual([]);
      expect(after.pendingRefundMinor).toBe(0);
      expect(after.refundableMinor).toBe(captured.capturedMinor);
    });
  }
});
