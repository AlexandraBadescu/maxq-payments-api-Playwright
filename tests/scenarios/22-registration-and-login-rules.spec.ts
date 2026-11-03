import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogIn, expectError } from '../helpers';

const unique = (prefix: string) => `${prefix}-${randomUUID()}@example.test`;

test.describe('22 registration and login rules', () => {
  test('the same email cannot register twice', async ({ request }) => {
    const customer = await registerAndLogIn(request);
    const res = await request.post('/customers', {
      data: { name: 'Again', email: customer.email, password: customer.password },
    });
    await expectError(res, 409, 'email_taken');
  });

  test('the same email in a different case cannot register again', async ({ request }) => {
    const customer = await registerAndLogIn(request);
    const res = await request.post('/customers', {
      data: { name: 'Again', email: customer.email.toUpperCase(), password: customer.password },
    });
    await expectError(res, 409, 'email_taken');
  });

  test('a password that is too short is refused', async ({ request }) => {
    const res = await request.post('/customers', {
      data: { name: 'Short', email: unique('short'), password: 'short' },
    });
    await expectError(res, 400, 'validation_failed');
  });

  test('a customer with no name is refused', async ({ request }) => {
    const res = await request.post('/customers', {
      data: { email: unique('noname'), password: 'correct horse battery staple' },
    });
    await expectError(res, 400, 'validation_failed');
  });

  test('the email is matched without regard to case when logging in', async ({ request }) => {
    const customer = await registerAndLogIn(request);
    const res = await request.post('/sessions', {
      data: { email: customer.email.toUpperCase(), password: customer.password },
    });
    expect(res.status()).toBe(201);
    expect(typeof (await res.json()).token).toBe('string');
  });

  // Every kind of failed login gets the same answer, so a caller cannot tell
  // "no such account" from "wrong password".
  const FAILED_LOGINS = [
    { label: 'a wrong password', body: (email: string) => ({ email, password: 'wrong-password' }) },
    { label: 'an unknown email', body: () => ({ email: unique('nobody'), password: 'correct horse battery staple' }) },
    { label: 'a password that is not text', body: (email: string) => ({ email, password: 12345678 }) },
  ];
  for (const { label, body } of FAILED_LOGINS) {
    test(`logging in with ${label} is refused`, async ({ request }) => {
      const customer = await registerAndLogIn(request);
      const res = await request.post('/sessions', { data: body(customer.email) });
      const error = await expectError(res, 401, 'invalid_credentials');
      expect(error.error.message).toBe('Email or password is incorrect.');
    });
  }
});
