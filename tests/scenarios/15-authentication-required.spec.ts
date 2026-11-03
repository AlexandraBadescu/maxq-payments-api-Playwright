import { test, expect } from '@playwright/test';
import { registerAndLogIn, createOrder } from '../helpers';

test.describe('15 authentication is required', () => {
  test('no Authorization header at all', async ({ request }) => {
    const res = await request.post('/orders', {
      data: { items: [{ sku: 'MAXQ-BOX-S', quantity: 1 }], currency: 'GBP' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe('unauthenticated');
  });

  test('a token that was never issued', async ({ request }) => {
    const res = await request.post('/orders', {
      headers: { Authorization: 'Bearer not-a-real-token' },
      data: { items: [{ sku: 'MAXQ-BOX-S', quantity: 1 }], currency: 'GBP' },
    });
    expect(res.status()).toBe(401);
  });

  test('a previously valid token still has to be sent', async ({ request }) => {
    const customer = await registerAndLogIn(request);
    const order = await createOrder(request, customer.authHeader, { currency: 'GBP' });

    const res = await request.get(`/payments/does-not-matter-${order.id}`);
    expect(res.status()).toBe(401);
  });
});
