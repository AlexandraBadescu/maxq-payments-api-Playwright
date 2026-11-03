import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { EXPECTED_CATALOGUE, ORDER_ITEMS, type Currency } from './constants';
import { expectSchema } from './schemas';

type Headers = Record<string, string>;

// A random ID, not a timestamp plus a counter: parallel workers can start in the
// same millisecond, and a clash would fail a test for no reason.
function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export interface Customer {
  email: string;
  password: string;
  token: string;
  authHeader: Headers;
}

export interface Refund {
  id: string;
  amountMinor: number;
  status: 'pending' | 'succeeded' | 'failed';
}

export type PaymentStatus =
  | 'authorised'
  | 'declined'
  | 'capture_pending'
  | 'captured'
  | 'capture_failed'
  | 'capture_timed_out'
  | 'partially_refunded'
  | 'refunded';

export interface Payment {
  id: string;
  orderId: string;
  status: PaymentStatus;
  currency: Currency;
  amountMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  pendingRefundMinor: number;
  refundableMinor: number;
  refunds: Refund[];
}

export interface Order {
  id: string;
  items: Array<{ sku: string; quantity: number }>;
  currency: Currency;
  totalMinor: number;
}

export interface HistoryEntry {
  type: string;
  fromStatus: string | null;
  toStatus: string;
  amountMinor?: number;
  refundId?: string;
  eventId?: string;
}

export interface Delivery {
  deliveryId: string;
  eventId: string;
  status: 'queued' | 'applied' | 'duplicate' | 'rejected';
  reason?: string;
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

  return { email, password, token, authHeader: { Authorization: `Bearer ${token}` } };
}

// Expected totals come from test data, not the service's price catalogue.
export function expectedTotalMinor(currency: Currency, items = ORDER_ITEMS): number {
  return items.reduce(
    (sum, { sku, quantity }) => sum + EXPECTED_CATALOGUE[sku][currency] * quantity,
    0,
  );
}

// Checks the status, the error code and the shape of an error response in one go.
// Returns the parsed body so a test can look at the message too.
export async function expectError(res: APIResponse, status: number, code: string) {
  expect(res.status(), `expected a ${status} ${code} response`).toBe(status);
  const body = await res.json();
  expectSchema('error', body);
  expect(body.error.code).toBe(code);
  return body as { error: { code: string; message: string } };
}

export async function createOrder(
  request: APIRequestContext,
  authHeader: Headers,
  { items = ORDER_ITEMS as unknown as Order['items'], currency = 'GBP' as Currency } = {},
): Promise<Order> {
  const res = await request.post('/orders', { headers: authHeader, data: { items, currency } });
  expect(res.status(), 'order creation').toBe(201);
  const order = await res.json();
  expectSchema('order', order);
  return order;
}

export async function postOrder(request: APIRequestContext, authHeader: Headers, data: unknown) {
  return request.post('/orders', { headers: authHeader, data });
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
  { currency = 'GBP' as Currency, items = ORDER_ITEMS as unknown as Order['items'] } = {},
) {
  const customer = await registerAndLogIn(request);
  const order = await createOrder(request, customer.authHeader, { items, currency });
  const res = await authorisePayment(request, customer.authHeader, order.id, 'pm_success');
  expect(res.status(), 'payment authorisation').toBe(201);
  const payment = (await res.json()) as Payment;
  expectSchema('payment', payment);
  // A payment in the right state can still belong to the wrong order or currency.
  expect(payment.status, 'new payment status').toBe('authorised');
  expect(payment.orderId, 'payment is linked to the order that was paid for').toBe(order.id);
  expect(payment.amountMinor, 'payment amount matches the order total').toBe(order.totalMinor);
  expect(payment.currency, 'payment currency matches the order').toBe(currency);
  return { customer, order, payment };
}

// Setup for scenarios that start from a captured payment.
export async function setUpCapturedPayment(
  request: APIRequestContext,
  { currency = 'GBP' as Currency } = {},
) {
  const setup = await setUpAuthorisedPayment(request, { currency });
  const capture = await requestCapture(request, setup.customer.authHeader, setup.payment.id);
  expect(capture.status(), 'capture request').toBe(202);
  const event = await sendEvent(request, { type: 'capture.succeeded', paymentId: setup.payment.id });
  await waitForDeliveryStatus(request, event.deliveryId, 'applied');
  const captured = await waitForPaymentStatus(request, setup.customer.authHeader, setup.payment.id, 'captured');
  return { ...setup, captured };
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

// Asks for a refund that should be accepted, and returns it.
export async function requestAcceptedRefund(
  request: APIRequestContext,
  authHeader: Headers,
  paymentId: string,
  amountMinor: number,
): Promise<Refund> {
  const res = await requestRefund(request, authHeader, paymentId, amountMinor);
  expect(res.status(), 'refund request').toBe(202);
  const refund = (await res.json()) as Refund;
  expectSchema('refund', refund);
  expect(refund.status).toBe('pending');
  return refund;
}

export async function getPayment(
  request: APIRequestContext,
  authHeader: Headers,
  paymentId: string,
): Promise<Payment> {
  const res = await request.get(`/payments/${paymentId}`, { headers: authHeader });
  expect(res.status(), 'reading the payment').toBe(200);
  const payment = await res.json();
  expectSchema('payment', payment);
  return payment;
}

export async function getHistory(
  request: APIRequestContext,
  authHeader: Headers,
  paymentId: string,
): Promise<{ paymentId: string; entries: HistoryEntry[] }> {
  const res = await request.get(`/payments/${paymentId}/history`, { headers: authHeader });
  expect(res.status(), 'reading the history').toBe(200);
  const history = await res.json();
  expectSchema('history', history);
  return history;
}

// How many times a type of money movement appears in the history. The rules promise
// each settled capture or refund appears exactly once; they don't promise a total
// number of entries, so tests count one type at a time.
export function countEntries(history: { entries: HistoryEntry[] }, type: string): number {
  return history.entries.filter((entry) => entry.type === type).length;
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
  const eventId = event.eventId ?? `evt-${randomUUID()}`;
  const res = await request.post('/simulator/payment-events', { data: { ...event, eventId } });
  expect(res.status(), 'the simulator accepting the event').toBe(202);
  const delivery = (await res.json()) as Delivery;
  expectSchema('delivery', delivery);
  return { ...delivery, eventId };
}

export async function getDelivery(request: APIRequestContext, deliveryId: string): Promise<Delivery> {
  const res = await request.get(`/simulator/deliveries/${deliveryId}`);
  expect(res.status(), 'reading the delivery').toBe(200);
  const delivery = await res.json();
  expectSchema('delivery', delivery);
  return delivery;
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
    (delivery) => wanted.includes(delivery.status),
    (last) => `delivery ${deliveryId} did not reach "${wanted.join('" or "')}"; last seen: "${last?.status}"`,
  );
}
