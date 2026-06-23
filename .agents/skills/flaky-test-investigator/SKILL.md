---
name: flaky-test-investigator
description: Investigate Scout and FTR flaky test failures in Kibana. Use when triaging a failed-test issue, a Buildkite-reported failure, a test path that has been failing intermittently, or any time the user asks to look at a flaky test, deflake a test, or stabilize a test.
disable-model-invocation: true
---

# Flaky Test Investigator

Investigate a flaky Scout or FTR test failure and determine what should be done about it.

- The outcome should be an accurate diagnosis, not a quick fix that treats the symptom.
- Valid outcomes include "this is a real product bug, escalate to the owning team", "this is environmental and will likely self-resolve", or "there isn't enough data to draw a confident conclusion".

## Required input

A link to a GitHub issue with the `failed-test` label is required. If none is provided, ask for one before proceeding.

Ignore any prior root-cause analyses or fix proposals posted by automations; treat them as if they weren't there and reach your own conclusion. Failure-notification comments from `kibanamachine` are still useful as a history signal.

## Investigation

### Understand the test environment

- **Is it failing on `kibana-on-merge` (local pipeline), on Cloud pipelines, or both?**
  - _Why it matters:_ tells you whether the test is compatible with Elastic Cloud at all, and whether the failure is more likely environmental (more common on Cloud) or a defect in the test itself (more common when both fail).
  - Recommended: learn more about local versus Elastic Cloud pipelines in `references/pipelines.md`
- **Did it fail in Buildkite builds with many other unrelated test failures?**
  - _Why it matters:_ broad failure across unrelated tests points to an environment or infrastructure problem, not a problem with this test.
- **Understand the test server configuration.** Are Scout tests using the **default** or a **custom** test server configuration? Do FTR tests belong to a test config that defines custom server arguments that aren't supported on e.g., Elastic Cloud?
  - _Why it matters:_ custom server configurations are a common source of flakiness — they diverge from the configurations used by the broader test suite, so issues affecting only them won't surface elsewhere. They also tend to be less actively maintained.
- **For Scout, which lane and neighbors shared servers with the failure?** Scout configs in the same Playwright lane share Kibana/Elasticsearch test servers — state can leak between configs. Map the job's `step_key` (e.g. `scout_test_lane_4`) to its config list by downloading `.scout/test_lane_loads.json` from the build's `Scout Test Run Builder` job (`step_key: build_scout_tests`). The same key is scheduled separately per `<arch>/<server-config>`; the job `name` (e.g. "Scout Lane #4 - stateful-classic / default") disambiguates the physical lane. Parallel configs (`parallel.playwright.config.ts`, `workers > 1`) also have multiple workers competing for the same servers, which can surface as transient timeouts under load.
  - _Why it matters:_ if the same neighbor configs and arch/server-config combo recur across failing builds, suspect lane pollution rather than a test bug. Resource pressure in parallel configs can look test-specific but isn't on its own a reason to drop `workers` to 1.

### Inspect the failure artifacts

Before you go deep on scope or root-cause hypotheses, look at the artifacts the CI run produced. For UI tests in particular, the screenshot at the moment of failure often resolves the diagnosis in under a minute — and skipping this step is a common reason an investigation ends up in the wrong tier of fix.

For every failure, try to retrieve:

- **Screenshot at the failure point.** What is actually on the page? Is the awaited element present but the selector wrong? Is a loading indicator still visible? Is there an error toast or unexpected modal? Is the page blank (app crash) or on a different route than expected?
- **DOM / HTML snapshot at the failure point.** Confirms whether the element the test was looking for actually existed in the DOM (selector issue vs. rendering issue vs. product missing the element entirely).
- **Server logs** (`kibana.log`, `elasticsearch.log` when present). Cross-reference the failure timestamp with any errors in the logs — a server-side 500 or unexpected warning is strong evidence the failure is a product bug, not a test bug.
- **Full session trace** when the framework supports it (Scout / Playwright). Lets you scrub through every step, locator query, network call, and DOM snapshot.

Things to specifically check in the artifacts before forming a root-cause hypothesis:

- **Did the expected element render at all?** If yes and the selector missed it → flaky selector (Tier 2 fix territory). If no → real rendering / race / data issue (Tier 1 territory).
- **Is there an error visible in the UI** (toast, banner, console error in the HTML report)? If yes → product side, not test side.
- **Is the page in an unexpected state** (different URL, different user's data, different space)? → cleanup or isolation issue, often points at `afterEach` / `afterAll`.
- **Does the screenshot timestamp match the failure timestamp**? Stale artifacts from a prior step can mislead.

If artifacts are not available (expired, not uploaded, no `read_artifacts` token), say so in the report rather than fabricating a hypothesis. "Screenshot would have resolved this; not available" is a valid open question.

### List failure artifacts

`bk artifacts list <build> -p <pipeline> --job-uuid <jobId> --json` returns a JSON listing of every artifact uploaded for the failing job. Pass `--job-uuid <jobId>` for the failed attempt (without it, `bk` only returns the latest attempt and hides retried failures). If a build retried to green, failure artifacts only live on the failed job's listing; don't conclude "no screenshot" until you've scoped to the right job UUID.

### Understand the scope

Work through all of these questions:

- **How often is the test failing? Are there time spans when it failed most?** Place the test on the spectrum from "fails very occasionally" (e.g. twice this year) to "fails on every CI run".
  - _Why it matters:_ concentrated failures point to a specific cause tied to that window (a bad commit, an infrastructure incident, a dependency change).
- **When did the test last fail?**
  - _Why it matters:_ if the last failure was 2–3 weeks ago and there are no new comments on the `failed-test` issue, the flakiness may have already resolved itself — intentionally or as a side effect of unrelated changes.
- **Does the test still exist on the branch that's failing?** A test can be deleted or migrated (e.g. FTR → Scout) on `main` while it still runs on a release branch. Identify the branch of the most recent failure and inspect the file there, not on `main`.
  - _Why it matters:_ if the file is gone from `main`, the failure is branch-local — a fix (if any) belongs on the release branch, and reasoning from `main`'s code will be wrong.
  - Don't spend time on tests that no longer exist (the CI build may have not picked up the latest branch changes). Acknowledge the deletion and move on.
- **Are other tests in the same suite or config failing with similar or identical errors?**
  - _Why it matters:_ shared failure modes point to shared building blocks (page objects, fixtures, setup) and usually call for a structural change rather than a per-test patch.
- **Did it fail on a specific version branch?**
  - _Why it matters:_ if the failure isn't happening on `main`, compare the branches to identify what's different. The branch that passes tells you what `main` is missing (or what it added).
- **When did it first fail, and when did it last pass?**
  - _Why it matters:_ narrows down the Kibana commit or PR that may have introduced the flakiness.
- **Has this issue or a related one been closed and reopened before?**
  - _Why it matters:_ a reopen is the single strongest signal that the previous diagnosis did not hold. Don't repeat the previous line of reasoning.
- **Is there a chain of fix attempts on this test or test file?** Look for multiple PRs in the last 12 months whose titles mention this test or area (e.g. "address flaky X", "fix flaky X", "another attempt at X").
  - _Why it matters:_ a significant share of "fix" PRs are followed within months by another fix PR on the same area. If you are about to be the third or fourth attempt, the previous shape was almost certainly wrong. Do not repeat it.
- **What did the previous fix change, and what did it claim to address?**
  - _Why it matters:_ if it touched only test code and the test recurred, weigh the product side more heavily this time. If it touched product code and still recurred, the real bug is likely deeper than the previous diff captured.

### Does the test follow best practices?

Common best-practice violations that cause flakiness:

- **Pick the right test type** (`docs/extend/scout/best-practices#pick-the-right-test-type`). UI tests are notoriously more flaky than component, API, and Jest unit/integration tests.
- **Prefer APIs for setup and teardown** (`docs/extend/scout/ui-best-practices#prefer-kibana-apis-over-ui-for-setup-and-teardown`). Driving setup/teardown through the UI is slower and flakier.
- **Wait for UI updates after actions** (`docs/extend/scout/ui-best-practices#wait-for-ui-updates-when-the-next-action-requires-it`). Confirm the action produced the expected result and the UI has rendered before continuing.
- **Wait for complex UI to finish rendering** (`docs/extend/scout/ui-best-practices#wait-for-complex-components-to-fully-render`).

Scout and FTR tests should also follow the general best practices in `docs/extend/scout/best-practices.md`, the UI best practices in `docs/extend/scout/ui-best-practices.md`, and the API best practices in `docs/extend/scout/api-best-practices.md`.

### Investigation pitfalls

Watch out for these pitfalls when investigating the failure:

- **Ignoring the bigger picture**: ensure you have as much data as you can about the test environment and related failures (in the same test file, test config or elsewhere).
- **Recommending a timeout bump as the primary fix**: timeout bumps consistently fail to hold in Kibana. Investigate what never happened — confirm the slow operation is intrinsic to the product (e.g. index creation, SLO calculation) rather than a missing `waitForResponse`/`waitForSelector` upstream.
- **Never recommend wrapping the assertion in `retry()` as the fix.** Wrapping the assertion in `retry()` without addressing the underlying cause frequently recurs. Acceptable only as a temporary unblock; in that case the recommendation must explicitly say "this is a stopgap" and link a follow-up issue for the real fix.
- **Never recommend only test-side async hooks (`await`, `waitFor`, `waitUntil`) when there is evidence of a production-side race.** This is the most common pattern that looks like a fix but isn't — popular precisely because it appears principled, but it lets the test wait _longer_ without fixing the race.
- **Weakening assertions**: don't recommend making assertions more lenient or narrowing their scope just to make the test pass — this hides regressions instead of catching them. Generic test-only refactors that loosen assertions often regress.
- **Reducing coverage surface**: don't recommend stripping tags to skip the test in certain environments (e.g. Cloud) or project types (e.g. serverless Security) unless you have a real reason it shouldn't run there. "It's flaky here" is not a real reason.
- **Trusting flaky-test-runner alone**: a green 30/30 or 60/60 run does not prove a fix held. The runner runs tests in isolation, which isn't always the case (Scout test runs share the same test servers for multiple test configs).
- **Assuming "fix the test, not the product"**: always ask first whether the product could be at fault. Test-only fixes are meaningfully less durable than fixes that change production code.
- **Reporting false certainty**: "I don't know, here are the two plausible explanations and what would distinguish them" is more useful to the owning team than a confident wrong answer.

### Is a fix worth it?

Consider alternatives before recommending a code fix. Once you have a diagnosis, the right next step is not always a code change. Consider:

- **Delete the test.** Do other tests already cover what this one is testing?
- **Refactor or downgrade the test.** See "Pick the right test type" in `docs/extend/scout/best-practices.md`. A functional test can often become an API, component, or Jest unit/integration test.
- **Update the tags.** Are the test's tags still appropriate? Should it run on Cloud? Should it be excluded from certain serverless solution types (e.g. Security)?
- **Escalate to the owning team.** If this is a recurring offender or you suspect a product bug, the most useful conclusion may be a writeup handed to the owners, not a fix attempt.

## Reporting

When you report your conclusion, include these details:

1. **What the test does** (one paragraph)
2. **What failed and when** (most recent failure + count of failures over time)
3. **Where it ran** (Cloud or local pipelines, or both)
4. **Root cause hypothesis** (a few sentences describing the outcome of the investigation)
5. **Evidence supporting that hypothesis**, and evidence against it (if you considered alternative hypotheses, include them alongside their confidence level)
6. **Failure screenshot description**: what did you observe in the failure screenshot?
7. **Recommended next step** (this won't always be a code change). If you are recommending a code fix, give an honest note on expected durability
8. **Open questions** the investigation could not resolve
