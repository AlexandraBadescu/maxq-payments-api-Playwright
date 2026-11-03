# The same payment risks, tested with Playwright instead of Postman

This is a second test suite for the same fictional payments API, MaxQ: a capture-and-refund flow with asynchronous provider notifications, duplicate events, timeouts and access control.

I started with my [Postman/Newman project](https://github.com/AlexandraBadescu/maxq-payments-api), which uses my original testing approach and scenarios against a fictional API. This is the AI-assisted Playwright/TypeScript implementation of those same scenarios. I wanted to see whether the tests still covered the same risks, and what the change in tools would mean for the test design.


**Skills this shows:** API testing with Playwright's `request` fixture · TypeScript · risk-based test design · asynchronous testing with `expect(...).toPass()` · payment state and balance checks · duplicate and idempotent event handling · access control testing · GBP/EUR parameterisation for scenario 01 · testing the tests with seeded defects · GitHub Actions CI

## The short version

| What | Result |
|---|---|
| Scenarios | 16, each able to run alone |
| Currencies | Scenario 01 runs in both GBP and EUR from the same test (see [below](#one-difference-from-the-postman-version)); the other 15 run in GBP |
| Deliberate bugs | 14 out of 14 caught by the intended scenario ([results](docs/defect-results.md)) |
| Safety guard | Pointed at another host, 0 requests were sent there |
| Dependency audit | `npm audit --audit-level=high` runs in CI on every push, dev dependencies included |
| Browser downloads needed | None — this is a request-only suite |

## Run it yourself

You need [Node.js](https://nodejs.org) 20 or later.

```bash
npm ci
npm test                 # 16 scenarios; scenario 01 runs in GBP and EUR
npm run test:isolation   # each scenario file on its own
npm run test:guard       # proves the safety guard works
npm run test:defects     # runs the suite against each deliberate bug
npm run test:report      # opens the HTML report from the last run
```

`npm test` starts the demo service on local port `4020` by default, then stops it when the run finishes. If that port is already occupied, the run refuses to start rather than accidentally testing a different service. To use another port, set `PORT` before running the suite.

## One difference from the Postman version

The Postman collection needed a separate environment file per currency, each with its own hard-coded expected total. Here, currency is a test parameter instead: `tests/scenarios/01-capture-and-partial-refund.spec.ts` runs the same assertions for GBP and EUR in a loop, against prices in `tests/constants.ts` that are typed out independently of the service's own catalogue — see [`docs/test-design.md`](docs/test-design.md) for why that independence matters, and how I proved it does by injecting a pricing bug and watching the suite catch it.

The trade-off: the Postman collection could be opened and read by someone who's never seen TypeScript. These tests need a reader comfortable with a `.spec.ts` file.

## Why the service in `src/` is identical to the Postman version's

It's deliberate, not an oversight or an accident of copy-paste. This project is about comparing two testing approaches against the same behaviour, so the service itself needed to stay a fixed point — changing it too would have made it unclear whether a difference in results came from the toolchain or from the thing being tested changing underneath it.

## What's in here

| Path | What it is |
|---|---|
| [`docs/test-design.md`](docs/test-design.md) | Risks, decisions, and what's different from the Postman version |
| [`docs/defect-results.md`](docs/defect-results.md) | Generated results for the deliberate bugs |
| [`tests/scenarios/`](tests/scenarios/) | The 16 scenario files |
| [`tests/helpers.ts`](tests/helpers.ts) | Setup, polling and simulator helpers shared across scenarios |
| [`tests/global-setup.ts`](tests/global-setup.ts) | Starts the service and enforces the safety guard before any test runs |
| [`src/`](src/) | The demo service (identical to the Postman version) |
| [`scripts/`](scripts/) | The checks on the tests |

## Limits

- **This is a simulation.** It tests a demo service that I control, and it doesn't show compatibility with any real payment provider.
- **The bugs are ones I chose.** Catching all 14 shows the suite detects those failures, not every possible bug.
- **Scale isn't tested.** The service is in-memory and has no performance, load or concurrency testing.
- **The security checks are narrow.** They cover authentication and access to other customers' payments. This isn't a security review.
- **No 3DS, alternative payment methods or webhook signature checks yet.** See [`docs/test-design.md`](docs/test-design.md) for what I'd add next.

## How it was built

The starting point was my own Postman test design: the business risks, scenarios and assertions I'd developed from my API testing experience. AI helped create the fictional service and the shareable Postman format; I then used AI more extensively to implement the same scenarios in Playwright and TypeScript.

My part in this version was to review the implementation, challenge its assumptions and check whether it was testing what I intended. For example, the first version calculated expected amounts using the application's own prices. That meant the tests could agree with an incorrect price. I changed the approach to use independent expected values — see [the design notes](docs/test-design.md).

I don't claim to have manually written every line of this Playwright implementation. I do want to understand and be able to explain what it tests, what it misses and why I'd trust (or question) the results. Everything uses fictional data and a local simulator, not employer code or internal systems.

## Licence

See [LICENSE](LICENSE). This work is licensed under CC BY-NC-ND 4.0.
