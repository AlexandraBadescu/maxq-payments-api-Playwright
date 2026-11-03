# How I designed the tests

This is the AI-assisted Playwright implementation of the scenarios from my Postman project. It tests the same fictional service and the same business risks. These notes explain what carried over, what changed in TypeScript, and which decisions I would make differently. The full risk table and expected behaviour are in the [Postman repository](https://github.com/AlexandraBadescu/maxq-payments-api-Postman) (`docs/test-design.md` and `docs/api-behaviour.md`).

## What carried over unchanged

- **The risk table.** Wrong amount recorded, refund more or less than was taken, duplicate or out-of-order events, late or missing notifications, a reserved balance that never gets released, declined payments, double payments, and the two access-control risks. Same risks, same service, same 24 scenarios (01 to 16 from the original project, 17 to 24 added after review).
- **Bounded polling, not a fixed wait.** `expect(...).toPass({ intervals: [200], timeout: 6000 })` is Playwright's own version of the same idea the Postman collection needed a custom pre-request script for: check repeatedly, give up after a fixed budget, and report what was last seen rather than a generic timeout error. See `waitForPaymentStatus` and `waitForDeliveryStatus` in `tests/helpers.ts`.
- **Proving a duplicate was actually processed before checking nothing changed.** Scenarios 07 and 08 still wait for the delivery to reach `duplicate` before reading the balance. Without that wait, the balance assertion could pass while the event is still queued.
- **The environment guard.** The Postman collection checked `baseUrl` in a pre-request script before every request. Here the same check happens once, in `tests/global-setup.ts`, before any test runs at all: if `BASE_URL` is set and its host isn't `localhost` or `127.0.0.1`, the whole run refuses before a single request goes out. `npm run test:guard` proves it the same way the Postman version does — by pointing at an instrumented address and confirming zero requests arrived.
- **Testing the tests.** `npm run test:defects` starts the service with one deliberate bug at a time (the same 32 bugs, the same `src/defects.js`) and checks that the scenario meant to catch it actually fails. Each run has to exit with a failure and use a report written by that run, so a stale report from an earlier run can't count as a catch. Results in `docs/defect-results.md`, including the first test that failed.

### A dependency audit gate

A pinned Playwright version, or any dependency, can fall behind without anyone noticing until someone happens to run `npm audit` by hand. From experience, that's not a check worth leaving to memory.

`npm run audit` (`npm audit --audit-level=high`) now runs in its own CI job, on every push and pull request, against the full dependency tree, dev dependencies included. A high or critical advisory in anything fails the build before it can merge. I proved it actually blocks a merge by pointing it at a version of Playwright with a known high-severity advisory (`GHSA-7mvr-c777-76hp`, browsers downloaded without verifying the SSL certificate) and confirming the job failed, then restored the patched version.

## What the first port lost

"Same scenarios" turned out to be too generous. The first version of this suite kept the names and the main steps of every Postman scenario, but dropped some of the checks that make the scenarios worth having. The evidence was in the two defect tables: the bug "a capture is marked as captured before the provider confirms it" failed 13 Postman scenarios and only 10 Playwright ones, and "a settled refund is missing from the history" failed two Postman scenarios and one Playwright scenario. When an outside review then seeded 10 more bugs, the first version of this suite caught 1 and the Postman suite caught 3.

The checks that had gone missing were mostly of one kind: the ones that confirm a refused request, or a repeated one, changed nothing.

- **03:** a second refund while the first is still in progress. The reserved amount has to count against the limit.
- **04, 05, 13:** that the payment was left alone after the refusal. A 4xx alone doesn't show that.
- **07, 08:** that the history shows the money moved once.
- **10:** that nothing is captured before the delayed notification. Without this, the test can't tell a delayed notification from a service that marked the payment captured straight away.
- **15, 16:** authentication on every route, not just one, and that another customer's payment gets exactly the same reply as an ID that doesn't exist.

All of these are back, and 07 and 08 now count the history entries too. The lesson I'd keep is a practical one: when you port a suite with AI, compare what the old and new versions each catch, not just whether the new one is green. A green suite that checks less is the worst outcome, because nobody goes looking.

## What's different, and why

### Config-driven currency became a test parameter, not a file

The Postman version needed a `local-gbp` and a `local-eur` environment file, each with its own hard-coded `expectedOrderTotalMinor`. Here, `tests/scenarios/01-capture-and-partial-refund.spec.ts` loops over both currencies in one file instead, against prices in `tests/constants.ts`.

**Scope:** only scenario 01 runs in both currencies. The other 23 run in GBP. I'd parameterise the relevant cases before describing the *whole* suite as multi-currency.

### An independent test oracle, not a shared one

My first version of `expectedTotalMinor()` read prices straight from the service's own `CATALOGUE`, exported from `src/app.js` for exactly that purpose. It worked, and it meant one fewer place to keep a number in sync.

It was also a mistake. If the application price is wrong and the test reads its expected price from the application, the assertion can still pass. I tested that by changing a price in `app.js`: the shared-catalogue version stayed green. With an independent `EXPECTED_CATALOGUE` in `tests/constants.ts`, the affected scenarios failed instead.

`src/app.js` no longer exports `CATALOGUE` at all — it's back to being identical to the Postman version's copy, and the test's prices live only in the test.

**The cost:** two places now hold the same numbers, and nothing stops them drifting apart on purpose. I think that's the right trade for a financial assertion: a shared source removes drift at the cost of removing the test's ability to disagree with the implementation, which is the one thing a test is for.

### The safety guard moved from "every request" to "before the run starts"

Postman's pre-request script ran the guard check on every single request, because a collection can be re-pointed mid-run by someone editing a variable. Playwright's `baseURL` is fixed once, in config, for the whole run — so the check only needs to happen once, in `globalSetup`, before any test file is even loaded. Functionally the same protection; structurally simpler, because the tool's own lifecycle does more of the work.

### Starting the service: `webServer`, not a hand-written process manager

The first version started the service from `globalSetup` with `child_process.spawn`, discarded its output, and recorded its process ID in a file for `globalTeardown` to kill. That works until it doesn't. If setup fails after the process starts, teardown may never run and a stray server keeps the port. A stale process ID left by a crash can point at some other process by the time it is used. And with the output thrown away, the service's own warnings, such as which seeded bug is switched on, and its stack traces were invisible.

Playwright's `webServer` setting does all of it: it starts the service, waits for `/health`, shows its output, stops it afterwards, and, with `reuseExistingServer: false`, refuses to start if the port is already taken. `globalSetup` is now only the safety guard. `BASE_URL` still points the suite at a service you started yourself.

### No retries

CI used to retry a failed test once. A retry that passes turns a flaky test into a green run, which is the thing the repeat checks are there to rule out. `retries` is now 0, and `npm run test:repeat` runs every test 10 times (`--repeat-each=10`) with no retries, in CI as well. That is not the same as ten complete runs one after another: Playwright runs the repeats in parallel across its workers. It still shows whether any test fails once in ten, and the Postman repo's `test:repeat` is the one that runs the whole suite ten times in sequence.

### Typed helpers, and schema checks

The helpers used to return `any`, so a field renamed in a response would only show up as a confusing `undefined`. They are now typed (`Payment`, `Order`, `Refund`, `Delivery`), and the payment, order, refund, error, history and simulator delivery responses that the helpers read are also checked against a JSON Schema with Ajv, including the rule that rejects fields that aren't listed. A second review pointed out that my first schemas were looser than the README said: payment status was any string, order items were any array, and history and delivery responses weren't checked. The schemas now list the real statuses, history entry types and delivery reasons, and check each order item. `getPayment` checks the schema every time, so every poll in every scenario checks the shape for free.

The setup helper also checks that a new payment belongs to the order that was paid for, with the right amount and currency. A payment can be `authorised` and still be attached to the wrong order.

Playwright removes types without checking them, so a type error doesn't fail `npm test`. `npm run typecheck` runs `tsc --noEmit` in CI.

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

And two specific to this version:

- Run the other 23 scenarios in EUR as well. Scenario 01 is the only one parameterised by currency.
- A shared fixture that applies the schema checks to every response automatically, instead of the helpers calling `expectSchema` one by one. A response the helpers don't touch, such as a raw `request.post` in a scenario, isn't checked yet.
