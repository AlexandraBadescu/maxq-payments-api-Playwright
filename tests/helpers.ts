import { expect, type APIRequestContext } from '@playwright/test';
import { EXPECTED_CATALOGUE, ORDER_ITEMS, type Currency } from './constants';

type Headers = Record<string, string>;

let counter = 0;
function uniqueEmail(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.test`;
}

export interface Customer {
  email: string;
  token: string;
  authHeader: Headers;
}

// New customer per scenario to avoid shared test data.
export async function registerAndLogIn(
  request: APIRequestContext,
  prefix = 'customer',
): Promise<Customer> {
  const email = uniqueEmail(prefix);
  const password = 'correct horse battery staple';

  const created = await request.post('/customers', {
    data: { name: 'Test Customer', email, password },
  });
  expect(created.status(), 'customer registration').toBe(201);

  const session = await request.post('/sessions', { data: { email, password } });
  expect(session.status(), 'login').toBe(201);
  const { token } = (await session.json()) as { token: string };

  return { email, token, authHeader: { Authorization: `Bearer ${token}` } };
}

// Expected totals come from test data, not the service's price catalogue.
export function expectedTotalMinor(currency: Currency, items = ORDER_ITEMS): number {
  return items.reduce(
    (sum, { sku, quantity }) => sum + EXPECTED_CATALOGUE[sku][currency] * quantity,
    0,
  );
}

export async function createOrder(
  request: APIRequestContext,
  authHeader: Headers,
  { items = ORDER_ITEMS, currency = 'GBP' as Currency } = {},
) {
  const res = await request.post('/orders', { headers: authHeader, data: { items, currency } });
  expect(res.status(), 'order creation').toBe(201);
  return res.json();
}

export async function authorisePayment(
  request: APIRequestContext,
  authHeader: Headers,
  orderId: string,
  paymentMethod: 'pm_success' | 'pm_declined' = 'pm_success',
) {
  return request.post('/payments', { headers: authHeader, data: { orderId, paymentMethod } });
}

// Common setup for payment scenarios.
export async function setUpAuthorisedPayment(
  request: APIRequestContext,
  { currency = 'GBP' as Currency, items = ORDER_ITEMS } = {},
) {
  const customer = await registerAndLogIn(request);
  const order = await createOrder(request, customer.authHeader, { items, currency });
  const res = await authorisePayment(request, customer.authHeader, order.id, 'pm_success');
  expect(res.status(), 'payment authorisation').toBe(201);
  const payment = await res.json();
  return { customer, order, payment };
}

export async function requestCapture(
  request: APIRequestContext,
  authHeader: Headers,
  paymentId: string,
) {
  return request.post(`/payments/${paymentId}/capture`, { headers: authHeader });
}

export async function requestRefund(
  request: APIRequestContext,
  authHeader: Headers,
  paymentId: string,
  amountMinor: number,
) {
  return request.post(`/payments/${paymentId}/refunds`, { headers: authHeader, data: { amountMinor } });
}

export async function getPayment(request: APIRequestContext, authHeader: Headers, paymentId: string) {
  const res = await request.get(`/payments/${paymentId}`, { headers: authHeader });
  expect(res.status(), 'reading the payment').toBe(200);
  return res.json();
}

export async function getHistory(request: APIRequestContext, authHeader: Headers, paymentId: string) {
  const res = await request.get(`/payments/${paymentId}/history`, { headers: authHeader });
  expect(res.status(), 'reading the history').toBe(200);
  return res.json();
}

interface EventInput {
  type: 'capture.succeeded' | 'capture.failed' | 'refund.succeeded' | 'refund.failed';
  paymentId: string;
  refundId?: string;
  delayMs?: number;
  eventId?: string;
}

// Reuse the event ID when testing duplicate notifications.
// Scenarios 07 and 08 check that the balance isn't affected twice.
export async function sendEvent(request: APIRequestContext, event: EventInput) {
  const eventId = event.eventId ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await request.post('/simulator/payment-events', { data: { ...event, eventId } });
  expect(res.status(), 'the simulator accepting the event').toBe(202);
  const delivery = (await res.json()) as { deliveryId: string; eventId: string; status: string };
  return { ...delivery, eventId };
}

export async function getDelivery(request: APIRequestContext, deliveryId: string) {
  const res = await request.get(`/simulator/deliveries/${deliveryId}`);
  expect(res.status(), 'reading the delivery').toBe(200);
  return res.json();
}

// Poll for up to 6 seconds rather than relying on a fixed wait.
// If it times out, report the last state we received.
async function pollUntil<T>(
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
  describe: (last: T | undefined) => string,
): Promise<T> {
  let last: T | undefined;
  await expect(async () => {
    const value = await read();
    last = value;
    expect(isDone(value), describe(last)).toBe(true);
  }).toPass({ intervals: [200], timeout: 6000 });
  return last as T;
}

export async function waitForPaymentStatus(
  request: APIRequestContext,
  authHeader: Headers,
  paymentId: string,
  expected: string | string[],
) {
  const wanted = Array.isArray(expected) ? expected : [expected];
  return pollUntil(
    () => getPayment(request, authHeader, paymentId),
    (payment) => wanted.includes(payment.status),
    (last) => `payment ${paymentId} did not reach "${wanted.join('" or "')}"; last seen: "${last?.status}"`,
  );
}

// Wait for processing, not just acceptance; otherwise queued events can hide bugs.
export async function waitForDeliveryStatus(
  request: APIRequestContext,
  deliveryId: string,
  expected: string | string[],
) {
  const wanted = Array.isArray(expected) ? expected : [expected];
  return pollUntil(
    () => getDelivery(request, deliveryId),
    (delivery: any) => wanted.includes(delivery.status),
    (last: any) => `delivery ${deliveryId} did not reach "${wanted.join('" or "')}"; last seen: "${last?.status}"`,
  );
}
