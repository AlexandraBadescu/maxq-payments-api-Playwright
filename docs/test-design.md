# How I designed the tests

This is the AI-assisted Playwright implementation of the scenarios from my Postman project. It tests the same fictional service and the same business risks. These notes explain what carried over, what changed in TypeScript, and which decisions I would make differently. The full risk table and expected behaviour are in the [Postman repository](https://github.com/AlexandraBadescu/maxq-payments-api) (`docs/test-design.md` and `docs/api-behaviour.md`).

## What carried over unchanged

- **The risk table.** Wrong amount recorded, refund more or less than was taken, duplicate or out-of-order events, late or missing notifications, a reserved balance that never gets released, declined payments, double payments, and the two access-control risks. Same risks, same service, same 16 scenarios.
- **Bounded polling, not a fixed wait.** `expect(...).toPass({ intervals: [200], timeout: 6000 })` is Playwright's own version of the same idea the Postman collection needed a custom pre-request script for: check repeatedly, give up after a fixed budget, and report what was last seen rather than a generic timeout error. See `waitForPaymentStatus` and `waitForDeliveryStatus` in `tests/helpers.ts`.
- **Proving a duplicate was actually processed before checking nothing changed.** Scenarios 07 and 08 still wait for the delivery to reach `duplicate` before reading the balance. Without that wait, the balance assertion could pass while the event is still queued.
- **The environment guard.** The Postman collection checked `baseUrl` in a pre-request script before every request. Here the same check happens once, in `tests/global-setup.ts`, before any test runs at all: if `BASE_URL` is set and its host isn't `localhost` or `127.0.0.1`, the whole run refuses before a single request goes out. `npm run test:guard` proves it the same way the Postman version does — by pointing at an instrumented address and confirming zero requests arrived.
- **Testing the tests.** `npm run test:defects` starts the service with one deliberate bug at a time (same 14 bugs, same `src/defects.js`) and checks that the scenario meant to catch it actually fails. Results in `docs/defect-results.md`.

### A dependency audit gate

A pinned Playwright version, or any dependency, can fall behind without anyone noticing until someone happens to run `npm audit` by hand. From experience, that's not a check worth leaving to memory.

`npm run audit` (`npm audit --audit-level=high`) now runs in its own CI job, on every push and pull request, against the full dependency tree, dev dependencies included. A high or critical advisory in anything fails the build before it can merge. I proved it actually blocks a merge by pointing it at a version of Playwright with a known high-severity advisory (`GHSA-7mvr-c777-76hp`, browsers downloaded without verifying the SSL certificate) and confirming the job failed, then restored the patched version.

## What's different, and why

### Config-driven currency became a test parameter, not a file

The Postman version needed a `local-gbp` and a `local-eur` environment file, each with its own hard-coded `expectedOrderTotalMinor`. Here, `tests/scenarios/01-capture-and-partial-refund.spec.ts` loops over both currencies in one file instead, against prices in `tests/constants.ts`.

**Scope:** only scenario 01 runs in both currencies. The other 15 run in GBP. I'd parameterise the relevant cases before describing the *whole* suite as multi-currency.

### An independent test oracle, not a shared one

My first version of `expectedTotalMinor()` read prices straight from the service's own `CATALOGUE`, exported from `src/app.js` for exactly that purpose. It worked, and it meant one fewer place to keep a number in sync.

It was also a mistake. If the application price is wrong and the test reads its expected price from the application, the assertion can still pass. I tested that by changing a price in `app.js`: the shared-catalogue version stayed green. With an independent `EXPECTED_CATALOGUE` in `tests/constants.ts`, the affected scenarios failed instead.

`src/app.js` no longer exports `CATALOGUE` at all — it's back to being identical to the Postman version's copy, and the test's prices live only in the test.

**The cost:** two places now hold the same numbers, and nothing stops them drifting apart on purpose. I think that's the right trade for a financial assertion: a shared source removes drift at the cost of removing the test's ability to disagree with the implementation, which is the one thing a test is for.

### The safety guard moved from "every request" to "before the run starts"

Postman's pre-request script ran the guard check on every single request, because a collection can be re-pointed mid-run by someone editing a variable. Playwright's `baseURL` is fixed once, in config, for the whole run — so the check only needs to happen once, in `globalSetup`, before any test file is even loaded. Functionally the same protection; structurally simpler, because the tool's own lifecycle does more of the work.

### No Postman app to fall back on

The Postman version could be opened and run from the Collection Runner by someone who's never touched a terminal. This suite can't: reading or running it means being comfortable with TypeScript and `npx playwright test`. In exchange, failures come with Playwright's trace viewer — a timeline of every request, response and assertion for a failing test — which is a stronger debugging tool than a JUnit report, but only useful to someone who knows to reach for it.

### No browser, so no browser install

These are API tests using Playwright's `request` fixture, which talks HTTP directly and never launches a browser. CI never runs `playwright install`, which would otherwise download Chromium, Firefox and WebKit for no reason this suite needs them.

## What I'd add next

Same list as the Postman version, since it's the same service:

- 3DS challenges and soft declines, where the payment pauses for cardholder verification and the test needs to handle the redirect and the delayed outcome
- Alternative payment methods (Klarna, PayPal), each with its own authorisation and refund lifecycle
- Webhook signature verification, so the service rejects a notification that wasn't signed by the provider
- Checkout rules: discounts, delivery and invalid addresses, using a data file of inputs and expected totals
- An OpenAPI description, checked against the responses
- An `Idempotency-Key` on refund requests, so a retried request can't create a second refund
- Performance testing, which this project doesn't cover

And one specific to this version: a custom Playwright reporter or fixture that asserts on the JSON schema of each response, the way the Postman collection's `expectSchema` helper does — right now this suite checks individual fields, not the whole response shape.
