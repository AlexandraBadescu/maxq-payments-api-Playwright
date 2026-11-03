import { test, expect } from '@playwright/test';
import {
  setUpAuthorisedPayment,
  requestCapture,
  sendEvent,
  waitForPaymentStatus,
  waitForDeliveryStatus,
  getHistory,
  countEntries,
} from '../helpers';

test('07 a duplicate capture notification has no second effect', async ({ request }) => {
  const { customer, payment } = await setUpAuthorisedPayment(request, { currency: 'GBP' });

  await requestCapture(request, customer.authHeader, payment.id);
  const first = await sendEvent(request, { type: 'capture.succeeded', paymentId: payment.id });
  await waitForDeliveryStatus(request, first.deliveryId, 'applied');
  const captured = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');

  // Re-send the exact same event: same eventId, same everything. A real
  // provider can and does redeliver a notification more than once.
  const repeat = await sendEvent(request, {
    type: 'capture.succeeded',
    paymentId: payment.id,
    eventId: first.eventId,
  });

  // Wait for the duplicate to be processed before checking the balance.
  // Otherwise the test could pass while the event is still queued.
  const outcome = await waitForDeliveryStatus(request, repeat.deliveryId, 'duplicate');
  expect(outcome.reason).toBe('event_already_processed');

  const after = await waitForPaymentStatus(request, customer.authHeader, payment.id, 'captured');
  expect(after.capturedMinor).toBe(captured.capturedMinor);

  // The money moved once, and the history says so once.
  expect(countEntries(await getHistory(request, customer.authHeader, payment.id), 'capture_settled')).toBe(1);
});
