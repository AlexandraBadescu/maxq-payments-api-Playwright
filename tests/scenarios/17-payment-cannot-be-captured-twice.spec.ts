import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  getHistory,
  countEntries,
  expectError,
  expectedTotalMinor,
} from '../helpers';

test('17 a payment cannot be captured twice', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });
  const total = expectedTotalMinor('GBP');

  const first = await requestCapture(request, customer.authHeader, payment.id);
  expect(first.status()).toBe(202);

  // The first capture is still waiting for the provider.
  await expectError(await requestCapture(request, customer.authHeader, payment.id), 409, 'invalid_state');

  const event = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, event.deliveryId, 'applied');
  await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

  // And once it has settled.
  await expectError(await requestCapture(request, customer.authHeader, payment.id), 409, 'invalid_state');

  const after = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(after.capturedMinor).toBe(total);
  expect(after.refundableMinor).toBe(total);
  expect(countEntries(await getHistory(request, customer.authHeader, payment.id), 'capture_settled')).toBe(1);
});
