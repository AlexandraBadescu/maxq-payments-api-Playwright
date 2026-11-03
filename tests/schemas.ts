import { expect } from '@playwright/test';
import Ajv, { type ValidateFunction } from 'ajv';

// The same response shapes the Postman collection checks with expectSchema.
// additionalProperties: false matters: it fails if an internal field such as
// customerId ever leaks into a response.
const refund = {
  type: 'object',
  required: ['id', 'amountMinor', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    amountMinor: { type: 'integer' },
    status: { enum: ['pending', 'succeeded', 'failed'] },
  },
};

export const SCHEMAS = {
  payment: {
    type: 'object',
    required: [
      'id',
      'orderId',
      'status',
      'currency',
      'amountMinor',
      'capturedMinor',
      'refundedMinor',
      'pendingRefundMinor',
      'refundableMinor',
      'refunds',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      orderId: { type: 'string' },
      status: { type: 'string' },
      currency: { enum: ['GBP', 'EUR'] },
      amountMinor: { type: 'integer' },
      capturedMinor: { type: 'integer' },
      refundedMinor: { type: 'integer' },
      pendingRefundMinor: { type: 'integer' },
      refundableMinor: { type: 'integer' },
      refunds: { type: 'array', items: refund },
    },
  },
  order: {
    type: 'object',
    required: ['id', 'items', 'currency', 'totalMinor'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      items: { type: 'array' },
      currency: { enum: ['GBP', 'EUR'] },
      totalMinor: { type: 'integer' },
    },
  },
  refund,
  error: {
    type: 'object',
    required: ['error'],
    additionalProperties: false,
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
} as const;

export type SchemaName = keyof typeof SCHEMAS;

const ajv = new Ajv({ allErrors: true });
const validators = Object.fromEntries(
  Object.entries(SCHEMAS).map(([name, schema]) => [name, ajv.compile(schema)]),
) as Record<SchemaName, ValidateFunction>;

// A missing schema fails the test. It must never count as a pass.
export function expectSchema(name: SchemaName, body: unknown): void {
  const validate = validators[name];
  expect(validate, `schema "${name}" is defined`).toBeDefined();
  const ok = validate(body);
  expect(ok, `response matches the ${name} schema: ${ajv.errorsText(validate.errors)}`).toBe(true);
}
