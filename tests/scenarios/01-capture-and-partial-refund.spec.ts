import { test, expect } from '@playwright/test';
import { CURRENCIES } from '../constants';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  requestRefund,
  getHistory,
  expectedTotalMinor,
} from '../helpers';

// Run the same payment flow for GBP and EUR.
// Currency is a test parameter here, rather than a separate environment.
for (const currency of CURRENCIES) {
  test(`01 capture then partial refund settles correctly (${currency})`, async ({ request }) => {
    const { customer, payment } = await setUpAuthorisedPayment(request, { currency });
    const total = expectedTotalMinor(currency);
    expect(payment.amountMinor).toBe(total);

    const captureRes = await requestCapture(request, customer.authHeader, payment.id);
    expect(captureRes.status()).toBe(202);
    expect((await captureRes.json()).status).toBe('capture_pending');

    const captureEvent = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
    await waitForDeliveryStatus(request, captureEvent.deliveryId, 'applied');

    const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
    expect(captured.capturedMinor).toBe(total);
    expect(captured.refundedMinor).toBe(0);
    expect(captured.refundableMinor).toBe(total);

    const partialAmount = 500;
    const refundRes = await requestRefund(request, customer.authHeader, payment.id, partialAmount);
    expect(refundRes.status()).toBe(202);
    const refund = await refundRes.json();

    const refundEvent = await sendEvent(request, {
      type: 'refund.succeeded',
      paymentId: payment.id,
      refundId: refund.id,
    });
    await waitForDeliveryStatus(request, refundEvent.deliveryId, 'applied');

    const partiallyRefunded = await waitForPaymentStatus(
      request,
      customer.authHeader,
      payment.id,
      'partially_refunded',
    );
    expect(partiallyRefunded.refundedMinor).toBe(partialAmount);
    expect(partiallyRefunded.refundableMinor).toBe(total - partialAmount);

    // Guards against a capture or refund that reports the wrong amount: a
    // payment can say "captured" and still hold the wrong figure.
    const history = await getHistory(request, customer.authHeader, payment.id);
    const captureEntry = history.entries.find((e: any) => e.type === 'capture_settled');
    const refundEntry = history.entries.find((e: any) => e.type === 'refund_settled');
    expect(captureEntry.amountMinor).toBe(total);
    expect(refundEntry.amountMinor).toBe(partialAmount);
  });
}
