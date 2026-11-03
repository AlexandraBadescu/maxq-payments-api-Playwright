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

const PAYMENT_STATUSES = [
  'authorised',
  'declined',
  'capture_pending',
  'captured',
  'capture_failed',
  'capture_timed_out',
  'partially_refunded',
  'refunded',
] as const;

const historyEntry = {
  type: 'object',
  required: ['at', 'type', 'fromStatus', 'toStatus'],
  additionalProperties: false,
  properties: {
    at: { type: 'string' },
    type: {
      enum: [
        'payment_authorised',
        'payment_declined',
        'capture_requested',
        'capture_settled',
        'capture_timed_out',
        'capture_failed',
        'refund_requested',
        'refund_settled',
        'refund_failed',
      ],
    },
    fromStatus: { type: ['string', 'null'], enum: [...PAYMENT_STATUSES, null] },
    toStatus: { enum: [...PAYMENT_STATUSES] },
    amountMinor: { type: 'integer' },
    refundId: { type: 'string' },
    eventId: { type: 'string' },
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
      status: { enum: [...PAYMENT_STATUSES] },
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
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['sku', 'quantity'],
          additionalProperties: false,
          properties: { sku: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } },
        },
      },
      currency: { enum: ['GBP', 'EUR'] },
      totalMinor: { type: 'integer' },
    },
  },
  refund,
  history: {
    type: 'object',
    required: ['paymentId', 'entries'],
    additionalProperties: false,
    properties: { paymentId: { type: 'string' }, entries: { type: 'array', items: historyEntry } },
  },
  delivery: {
    type: 'object',
    required: ['deliveryId', 'eventId', 'status'],
    additionalProperties: false,
    properties: {
      deliveryId: { type: 'string' },
      eventId: { type: 'string' },
      status: { enum: ['queued', 'applied', 'duplicate', 'rejected'] },
      reason: { enum: ['event_already_processed', 'invalid_transition', 'unknown_refund', 'refund_not_pending'] },
    },
  },
  error: {
    type: 'object',
    required: ['error'],
    additionalProperties: false,
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        additionalProperties: false,
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
