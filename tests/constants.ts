// Shared timing and test data for setup and scenarios.

// Keep the simulator timeout short enough for fast tests, but long enough
// to distinguish delayed notifications from late ones.
export const CAPTURE_TIMEOUT_MS = 1500;

// Standard order used by the payment scenarios.
export const ORDER_ITEMS = [{ sku: 'MAXQ-BOX-L', quantity: 1 }] as const;

// Keep expected prices separate from the service catalogue.
// Otherwise a wrong price could make both the application and test agree.
export const EXPECTED_CATALOGUE = {
  'MAXQ-BOX-S': { GBP: 450, EUR: 520 },
  'MAXQ-BOX-L': { GBP: 1250, EUR: 1450 },
} as const;

// Less than the expected order total in either currency.
export const PARTIAL_REFUND_MINOR = 500;

export type Currency = 'GBP' | 'EUR';
export const CURRENCIES: Currency[] = ['GBP', 'EUR'];
