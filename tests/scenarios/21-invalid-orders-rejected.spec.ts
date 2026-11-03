import { test, expect } from '@playwright/test';
import { registerAndLogIn, postOrder, createOrder, expectError } from '../helpers';
import { EXPECTED_CATALOGUE } from '../constants';

const SMALL = 'MAXQ-BOX-S';

// Bad input must give a clear 400: never a server error, and never an order with a
// wrong total.
const INVALID_ORDERS: Array<{ label: string; body: unknown }> = [
  { label: 'a null item', body: { currency: 'GBP', items: [null] } },
  { label: 'an item that is not an object', body: { currency: 'GBP', items: [5] } },
  { label: 'an unknown SKU', body: { currency: 'GBP', items: [{ sku: 'MAXQ-BOX-XL', quantity: 1 }] } },
  { label: 'quantity zero', body: { currency: 'GBP', items: [{ sku: SMALL, quantity: 0 }] } },
  { label: 'a negative quantity', body: { currency: 'GBP', items: [{ sku: SMALL, quantity: -2 }] } },
  { label: 'a fractional quantity', body: { currency: 'GBP', items: [{ sku: SMALL, quantity: 1.5 }] } },
  { label: 'a text quantity', body: { currency: 'GBP', items: [{ sku: SMALL, quantity: '2' }] } },
  { label: 'a quantity above the limit', body: { currency: 'GBP', items: [{ sku: SMALL, quantity: 1001 }] } },
  { label: 'an enormous quantity', body: { currency: 'GBP', items: [{ sku: 'MAXQ-BOX-L', quantity: 1e308 }] } },
  { label: 'no items', body: { currency: 'GBP', items: [] } },
  { label: 'items that are not a list', body: { currency: 'GBP', items: 'abc' } },
  {
    label: 'too many lines',
    body: { currency: 'GBP', items: Array.from({ length: 51 }, () => ({ sku: SMALL, quantity: 1 })) },
  },
  { label: 'an unsupported currency', body: { currency: 'USD', items: [{ sku: SMALL, quantity: 1 }] } },
  { label: 'no currency', body: { items: [{ sku: SMALL, quantity: 1 }] } },
];

test.describe('21 invalid orders are rejected', () => {
  for (const { label, body } of INVALID_ORDERS) {
    test(`order with ${label}`, async ({ request }) => {
      const customer = await registerAndLogIn(request);
      await expectError(await postOrder(request, customer.authHeader, body), 400, 'validation_failed');
    });
  }

  test('an order that is not valid JSON', async ({ request }) => {
    const customer = await registerAndLogIn(request);
    const res = await request.post('/orders', { headers: customer.authHeader, data: '{ "currency": ' });
    await expectError(res, 400, 'invalid_json');
  });

  test('the largest allowed order is accepted with the right total', async ({ request }) => {
    const customer = await registerAndLogIn(request);
    const order = await createOrder(request, customer.authHeader, {
      currency: 'GBP',
      items: [{ sku: SMALL, quantity: 1000 }],
    });
    expect(order.totalMinor).toBe(EXPECTED_CATALOGUE[SMALL].GBP * 1000);
  });
});
