import { test, expect, type APIRequestContext } from '@playwright/test';
import { setUpAuthorisedPayment, getPayment, expectError, registerAndLogIn } from '../helpers';

// Every route that needs a customer, called two ways: with no token at all, and
// with a token that was never issued. Each must be refused with 401, and a refused
// request must not have changed anything.
interface Route {
  name: string;
  call: (request: APIRequestContext, headers: Record<string, string>, ids: { paymentId: string; orderId: string }) => Promise<import('@playwright/test').APIResponse>;
}

const PROTECTED_ROUTES: Route[] = [
  {
    name: 'POST /orders',
    call: (request, headers) =>
      request.post('/orders', { headers, data: { currency: 'GBP', items: [{ sku: 'MAXQ-BOX-S', quantity: 1 }] } }),
  },
  {
    name: 'POST /payments',
    call: (request, headers, { orderId }) =>
      request.post('/payments', { headers, data: { orderId, paymentMethod: 'pm_success' } }),
  },
  { name: 'GET /payments/:id', call: (request, headers, { paymentId }) => request.get(`/payments/${paymentId}`, { headers }) },
  {
    name: 'GET /payments/:id/history',
    call: (request, headers, { paymentId }) => request.get(`/payments/${paymentId}/history`, { headers }),
  },
  {
    name: 'POST /payments/:id/capture',
    call: (request, headers, { paymentId }) => request.post(`/payments/${paymentId}/capture`, { headers }),
  },
  {
    name: 'POST /payments/:id/refunds',
    call: (request, headers, { paymentId }) =>
      request.post(`/payments/${paymentId}/refunds`, { headers, data: { amountMinor: 100 } }),
  },
];

const TOKENS: Array<{ label: string; headers: Record<string, string> }> = [
  { label: 'no Authorization header', headers: {} },
  { label: 'a token that was never issued', headers: { Authorization: 'Bearer not-a-real-token' } },
];

test.describe('15 authentication is required', () => {
  for (const route of PROTECTED_ROUTES) {
    for (const { label, headers } of TOKENS) {
      test(`${route.name} with ${label}`, async ({ request }) => {
        // A real order and a real, authorised payment: the request is refused because of
        // the missing credentials, not because the ID it names doesn't exist.
        const { customer, order, payment } = await setUpAuthorisedPayment(request);

        const res = await route.call(request, headers, { paymentId: payment.id, orderId: order.id });
        await expectError(res, 401, 'unauthenticated');

        // Nothing moved: still authorised, no capture requested, no refund recorded.
        const after = await getPayment(request, customer.authHeader, payment.id);
        expect(after.status).toBe('authorised');
        expect(after.capturedMinor).toBe(0);
        expect(after.refunds).toEqual([]);
      });
    }
  }

  test('logging in with the wrong password is refused', async ({ request }) => {
    const customer = await registerAndLogIn(request);
    const res = await request.post('/sessions', {
      data: { email: customer.email, password: 'wrong-password' },
    });
    await expectError(res, 401, 'invalid_credentials');
  });
});
