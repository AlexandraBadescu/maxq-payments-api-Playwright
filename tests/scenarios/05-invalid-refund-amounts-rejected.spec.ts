import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
} from '../helpers';

const INVALID_AMOUNTS: Array<{ label: string; amountMinor: unknown }> = [
  { label: 'zero', amountMinor: 0 },
  { label: 'negative', amountMinor: -500 },
  { label: 'not a whole number', amountMinor: 12.5 },
  { label: 'a string', amountMinor: '500' },
  { label: 'missing', amountMinor: undefined },
];

test.describe('05 invalid refund amounts are rejected', () => {
  for (const { label, amountMinor } of INVALID_AMOUNTS) {
    test(`amountMinor that is ${label}`, async ({ request }) => {
      const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });
      await requestCapture(request, customer.authHeader, payment.id);
      const captureEvent = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
      await waitForDeliveryStatus(request, captureEvent.deliveryId, 'applied');
      await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

      const res = await request.post(`/payments/${payment.id}/refunds`, {
        headers: customer.authHeader,
        data: { amountMinor },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('validation_failed');
    });
  }
});
