# The same payment risks, tested with Playwright instead of Postman

This is a second test suite for the same fictional payments API, MaxQ: a capture-and-refund flow with asynchronous provider notifications, duplicate events, timeouts and access control.

I started with my [Postman/Newman project](https://github.com/AlexandraBadescu/maxq-payments-api-Postman), which uses my original testing approach and scenarios against a fictional API. This is the AI-assisted Playwright/TypeScript implementation of those same scenarios. I wanted to see whether the tests still covered the same risks, and what the change in tools would mean for the test design.

**Skills this shows:** API testing with Playwright's `request` fixture · TypeScript · risk-based test design · asynchronous testing with `expect(...).toPass()` · JSON Schema checks with Ajv · payment state and balance checks · duplicate and idempotent event handling · access control testing · GBP/EUR parameterisation for scenario 01 · testing the tests with seeded defects · GitHub Actions CI

## The short version

| What | Result |
|---|---|
| Scenarios | 24, each able to run alone (67 tests, about 15 seconds) |
| Currencies | Scenario 01 runs in both GBP and EUR from the same test (see [below](#one-difference-from-the-postman-version)); the other 23 run in GBP |
| Response shapes | Every payment, order, refund and error response is checked against a JSON Schema that rejects unexpected fields |
| Deliberate bugs | 30 out of 30 caught by the intended scenario ([results](docs/defect-results.md)) |
| Repeat runs | `npm run test:repeat` runs the suite 10 times in a row, with no retries; it also runs in CI |
| Safety guard | Pointed at another host, 0 requests were sent there |
| Dependency audit | `npm audit --audit-level=high` runs in CI on every push, dev dependencies included |
| Type checking | `npm run typecheck` runs in CI. Playwright strips types without checking them, so it needs its own step |
| Browser downloads needed | None. This is a request-only suite |

## How the two suites compare

The question this project was built to answer is whether an AI-assisted port still tests the risks I started with. The answer was "not at first". When both suites were run against the same bugs, the Playwright version caught fewer, and the reason was visible in its own results table: the bug "a capture is marked as captured before the provider confirms it" failed 13 Postman scenarios but only 10 Playwright ones.

An outside review then seeded 10 extra bugs. The first version of this suite caught 1 of them, and the Postman suite caught 3. All 30 bugs are now in both suites and all are caught.

| | Postman | Playwright |
|---|---|---|
| Scenarios | 24 folders, 345 checks | 24 spec files, 67 tests |
| Bugs caught | 30 of 30 | 30 of 30 |
| Response shape checks | JSON Schema on every payment and error response | The same rules, with Ajv, on payment, order, refund and error responses |
| Checks that a refused request changed nothing | Yes | Yes (added after review) |
| Currencies | Whole suite in GBP and EUR, from environment files | Scenario 01 only |
| Retries hiding a flaky test | None | None (CI used to retry once; it no longer does) |
| Who can read and run it | Anyone with Postman | Someone comfortable with TypeScript |
| Debugging a failure | Collection Runner output | Playwright trace viewer |

What the first Playwright version had lost, and what it does now:

| Scenario | What was missing | Now |
|---|---|---|
| 03 | A second refund while the first is still in progress | Checked: the reserved amount counts against the limit |
| 04, 05, 13 | That a refused request changed nothing | The payment is read afterwards and compared |
| 07, 08 | That the history shows the money moved once | The history entries are counted |
| 10 | That nothing is captured before the delayed notification | Checked before the notification is sent |
| 11 | The error code, not just the 409 | Status, code and shape are checked |
| 15 | Authentication on any route except `POST /orders`, and the wrong-password login | Every protected route, with no token and with a made-up token, each checking that nothing changed |
| 16 | That the answer for another customer's payment is identical to the one for an unknown ID | The two replies are compared, message included |

Playwright also did some things the Postman suite didn't at first: scenario 14b (a declined attempt doesn't block a retry) and a capture attempt by another customer in 16. Both have been added to the Postman collection. Scenario 05 here also tries more invalid refund amounts (`null`, a boolean, a number too large to represent exactly, and a missing amount); the Postman collection still only tries four.

## Run it yourself

You need [Node.js](https://nodejs.org) 20 or later.

```bash
npm ci
npm test                 # 24 scenarios; scenario 01 runs in GBP and EUR
npm run typecheck        # checks the TypeScript, which npm test doesn't
npm run test:isolation   # each scenario file on its own
npm run test:guard       # proves the safety guard works
npm run test:repeat      # 10 runs in a row, no retries
npm run test:defects     # runs the suite against each deliberate bug
npm run test:report      # opens the HTML report from the last run
```

`npm test` starts the demo service on local port `4020` by default, using Playwright's `webServer` setting, and stops it when the run finishes. The service's own output appears in the test output. If that port is already occupied, the run refuses to start rather than accidentally testing a different service. To use another port, set `PORT` before running the suite. To test a service you started yourself, set `BASE_URL` to a local address.

## One difference from the Postman version

The Postman collection needed a separate environment file per currency, each with its own hard-coded expected total. Here, currency is a test parameter instead: `tests/scenarios/01-capture-and-partial-refund.spec.ts` runs the same assertions for GBP and EUR in a loop, against prices in `tests/constants.ts` that are typed out independently of the service's own catalogue. See [`docs/test-design.md`](docs/test-design.md) for why that independence matters, and how I proved it does by injecting a pricing bug and watching the suite catch it.

The trade-off: the Postman collection could be opened and read by someone who's never seen TypeScript. These tests need a reader comfortable with a `.spec.ts` file.

## Why the service in `src/` is identical to the Postman version's

It's deliberate, not an oversight or an accident of copy-paste. This project is about comparing two testing approaches against the same behaviour, so the service itself needs to stay a fixed point. Changing it in one repository only would make it unclear whether a difference in results came from the toolchain or from the thing being tested changing underneath it. When the service changes, it changes in both repositories together, and the two `src/` folders are byte-for-byte the same.

## What's in here

| Path | What it is |
|---|---|
| [`docs/test-design.md`](docs/test-design.md) | Risks, decisions, and what's different from the Postman version |
| [`docs/defect-results.md`](docs/defect-results.md) | Generated results for the deliberate bugs |
| [`tests/scenarios/`](tests/scenarios/) | The 24 scenario files |
| [`tests/helpers.ts`](tests/helpers.ts) | Typed setup, polling and simulator helpers shared across scenarios |
| [`tests/schemas.ts`](tests/schemas.ts) | The response shapes, checked with Ajv |
| [`tests/global-setup.ts`](tests/global-setup.ts) | Enforces the safety guard before any test runs |
| [`playwright.config.ts`](playwright.config.ts) | Starts the service with `webServer`, and sets no retries |
| [`src/`](src/) | The demo service (identical to the Postman version) |
| [`scripts/`](scripts/) | The checks on the tests |

## Limits

- **This is a simulation.** It tests a demo service that I control, and it doesn't show compatibility with any real payment provider.
- **The bugs are ones I chose, mostly.** Catching all 30 shows the suite detects those failures, not every possible bug. The first 14 were written alongside the first version of the tests. The other 16 were added after an outside review that seeded bugs of its own, so they are a fairer test.
- **Only one scenario runs in both currencies.** I'd parameterise the others before describing the whole suite as multi-currency.
- **Scale isn't tested.** The service is in-memory and has no performance, load or concurrency testing.
- **The security checks are narrow.** They cover authentication, access to other customers' payments and orders, and input validation. This isn't a security review.
- **No 3DS, alternative payment methods or webhook signature checks yet.** See [`docs/test-design.md`](docs/test-design.md) for what I'd add next.

## How it was built

The starting point was my own Postman test design: the business risks, scenarios and assertions I'd developed from my API testing experience. AI helped create the fictional service and the shareable Postman format; I then used AI more extensively to implement the same scenarios in Playwright and TypeScript.

My part in this version was to review the implementation, challenge its assumptions and check whether it was testing what I intended. For example, the first version calculated expected amounts using the application's own prices. That meant the tests could agree with an incorrect price. I changed the approach to use independent expected values. See [the design notes](docs/test-design.md).

I then had both projects reviewed from three angles (QA manager, senior QA, senior developer). The review compared the two suites against the same bugs, seeded extra bugs of its own, and probed the service by hand. It found that the port had lost several checks (the table above), and that the service had real problems, such as crashing on an order with a `null` item. Scenarios 17 to 24 and the stronger checks in the others came from that review.

I don't claim to have manually written every line of this Playwright implementation. I do want to understand and be able to explain what it tests, what it misses and why I'd trust (or question) the results. Everything uses fictional data and a local simulator, not employer code or internal systems.

## Licence

See [LICENSE](LICENSE). This work is licensed under CC BY-NC-ND 4.0.
