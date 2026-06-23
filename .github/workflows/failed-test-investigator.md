---
name: Failed Test Investigator
description: Investigate a failed-test issue, classify the failure, and propose a fix when appropriate.
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: Issue number in this repository to investigate
        required: true
        type: string
  issues:
    types: [opened, labeled, reopened]

permissions:
  contents: read
  issues: read
  pull-requests: read
  actions: read
  checks: read
  models: read

if: "${{ (github.event_name == 'workflow_dispatch' && github.event.inputs.issue_number != '') || (github.event_name == 'issues' && !github.event.issue.pull_request && contains(github.event.issue.labels.*.name, 'failed-test') && (github.event.action != 'labeled' || github.event.label.name == 'failed-test')) }}"

concurrency:
  # Keep one investigation lane per issue. Unrelated label events get their own group suffix so they can skip without canceling an in-flight investigation.
  group: >-
    failed-test-investigator-${{ github.event.issue.number || github.event.inputs.issue_number }}-${{
      (
        github.event.action == 'labeled' &&
        github.event.label.name != 'failed-test' &&
        github.event.label.name
      ) ||
      'investigate'
    }}
  cancel-in-progress: true
  job-discriminator: ${{ github.event.issue.number || github.event.inputs.issue_number }}

env:
  ISSUE_NUMBER: &issue_number ${{ github.event.issue.number || github.event.inputs.issue_number }}
  # Lets the agent omit `-o elastic` on every `bk` invocation (see https://buildkite.com/docs/pipelines/configure/environment-variables)
  BUILDKITE_ORGANIZATION_SLUG: elastic

engine:
  id: claude
  version: '2.1.165'
  model: opus
  max-turns: 120
  env:
    ANTHROPIC_API_KEY: ${{ secrets.LITELLM_API_KEY }}
    ANTHROPIC_BASE_URL: https://elastic.litellm-prod.ai
    ENABLE_PROMPT_CACHING_1H: '1'
    ANTHROPIC_DEFAULT_OPUS_MODEL: llm-gateway/claude-opus-4-8[1m]
    ANTHROPIC_DEFAULT_HAIKU_MODEL: llm-gateway/claude-haiku-4-5
    ANTHROPIC_DEFAULT_SONNET_MODEL: llm-gateway/claude-sonnet-4-6
    CLAUDE_CODE_EFFORT_LEVEL: high
    CLAUDE_CODE_SUBAGENT_MODEL: opus[1m]

tools:
  github:
    toolsets: [default, actions, search]
  web-fetch:
  bash: true

network:
  allowed:
    - defaults
    - buildkite.com
    - '*.buildkite.com'
    - buildkiteartifacts.com
    - ci-stats.kibana.dev
    - github.com
    - api.github.com
    - elastic.litellm-prod.ai
sandbox:
  agent: awf # Migrated from deprecated network setting
steps:
  - name: Install Buildkite CLI and export BUILDKITE_API_TOKEN
    env:
      BK_VERSION: 3.44.0
      BK_SHA256: 88867c0b983ad2afe1efc26f0df6b46b5673577c1aea95eba76992636fb9abe9
      OPS_BUILDKITE_TOKEN: ${{ secrets.OPS_BUILDKITE_TOKEN }}
    run: |
      set -euo pipefail
      tmp="$(mktemp -d)"
      url="https://github.com/buildkite/cli/releases/download/v${BK_VERSION}/bk_${BK_VERSION}_linux_amd64.tar.gz"
      curl -fsSL --retry 3 --retry-delay 2 "${url}" -o "${tmp}/bk.tgz"
      echo "${BK_SHA256}  ${tmp}/bk.tgz" | sha256sum -c -
      tar -xzf "${tmp}/bk.tgz" -C "${tmp}" --strip-components=1 "bk_${BK_VERSION}_linux_amd64/bk"
      install -d "${RUNNER_TEMP}/gh-aw/mcp-cli/bin"
      install -m 0755 "${tmp}/bk" "${RUNNER_TEMP}/gh-aw/mcp-cli/bin/bk"
      "${RUNNER_TEMP}/gh-aw/mcp-cli/bin/bk" --version
      if [ -z "${OPS_BUILDKITE_TOKEN:-}" ]; then
        echo "::error::OPS_BUILDKITE_TOKEN secret is not set" >&2
        exit 1
      fi
      echo "BUILDKITE_API_TOKEN=${OPS_BUILDKITE_TOKEN}" >> "${GITHUB_ENV}"

safe-outputs:
  noop:
    report-as-issue: false
  activation-comments: false
  report-failure-as-issue: false
  add-comment:
    max: 1
    target: *issue_number
    hide-older-comments: true
  add-labels:
    allowed:
      - failure:ai-fixable
      - failure:test-design
      - failure:test-environment
      - failure:application
      - failure:ci-environment
      - failure:inconclusive
    max: 2
    target: *issue_number

strict: false
timeout-minutes: 35
---

# Failed Test Investigator

Investigate a failed-test issue, classify the failure, and propose a fix when appropriate.

This run is killed at a hard timeout and posts a single, write-once comment that cannot be edited or replaced. If you run out of time before posting, nothing is recorded. The objective is a correct comment that ships (an investigation that is "more thorough" but never posts is a failure).

## Target issue

- **`issues` trigger**: use the triggering issue (non-PR, labeled `failed-test`).
- **`workflow_dispatch`**: use issue `${{ github.event.inputs.issue_number }}`. Fetch it explicitly before analysis, and post the final comment there.

## Investigate

Investigate the test failure(s) using the `flaky-test-investigator` skill (path: `.agents/skills/flaky-test-investigator`). Read the files in the folder directly, do not invoke the skill directly as that is disabled in this environment.

Use all of the data at your disposal to reach a conclusion (source code, logs, failure screenshots, etc.).

Every conclusion must cite specific evidence. Do not guess.

## Environment constraints

**Scratch files**: write throwaway files inside the repository checkout (the current working directory). Redirecting (`>`) elsewhere (e.g. `/tmp/...`) may be blocked — use a path under the repo root.

## Classify

Set `classification` based on where the evidence points:

- **`test-design`**: issue lives in the test code (e.g., timing/waits, selectors, fixtures, helpers, setup/teardown, assertion shape).
- **`test-environment`**: test code is fine, but its surroundings are problematic (e.g., leaked state from prior tests, flaky fixture init, missing `data-test-subj` the test relies on, parallel-slot interference).
- **`application`**: real product bug exposed by the test (e.g., race, regression, broken contract, feature-flag bug).
- **`ci-environment`**: outside test + app — CI agent, downed dependency (e.g., ES failed to start), network, credentials, registry.
- **`inconclusive`**: evidence does not support a defensible call.

Set `confidence` to `high` (direct evidence pins the cause), `medium` (strong inference from converging signals), or `low` (plausible but underspecified).

## Fix proposal

- Propose a fix only when you can point to a likely file or code area.
- Prefer the smallest plausible change.
- For test fixes: name the assertion, wait, fixture, setup/teardown, or helper to change.
- For code fixes: name the module, API, or behavior that looks wrong and why.
- If you cannot justify a concrete fix, say what additional evidence would change the conclusion.

## Labels

### Classification label

Add exactly one classification label to the issue that matches the chosen `classification`:

- `failure:test-design`: when `classification` is `test-design`
- `failure:test-environment`: when `classification` is `test-environment`
- `failure:application`: when `classification` is `application`
- `failure:ci-environment`: when `classification` is `ci-environment`
- `failure:inconclusive`: when `classification` is `inconclusive`

### "Is the issue fixable?" label

Add `failure:ai-fixable` to the issue if we are confident that a fix is available (it would imply opening a PR against the codebase).

## Attribution

- Mention a commit (or small set of commits, last 3 months) only when evidence strongly implicates it.
- Never speculate or use attribution as a fallback for weak evidence.

## Comment format

Post exactly one comment on the issue. Keep the content concise and actionable.

Follow the format below exactly. Do not create standalone sections for "what the test does" "evidence," "where the test ran," or "failure screenshot". Integrate these details seamlessly into the sections below if they add value.

The comment has different parts: a compact header that stays visible on the issue page (one `####` headline + metadata + summary), and a `<details>` block that hides everything else, as well as a comment to label the issue to trigger the flaky test fixer workflow (it is only posted under certain conditions, more info below).

**Inside the `<details>` block, every section starts with `#### Section name` on its own line** (e.g., `#### Proposed fix`, `#### Root cause & evidence`).

Add the following snippet of Markdown right after (and outside) the `<details>` block only if a fix is needed and available.

```markdown
> [!TIP]
> Label this issue `ai:fix-flaky` and an agent will **open a fix PR** for you. This usually takes 15–20 minutes, and the PR will appear below this comment. Share early feedback in #appex-qa.
```

If a fix PR is already up (in draft or in review) in the Kibana repository, mention the PR link in the same tip block (instead of suggesting to add the label).

### 1. Visible header (required)

Three things in order, with a blank line between each:

```
#### [{classification}] {One-line description of what broke}

**Confidence:** {level} | **Introduced by:** {commit/PR if known — omit this segment entirely if unknown}

**Summary:** One or two sentences explaining the exact failure point.
```

### 2. Collapsible investigation (required)

Wrap **everything after the summary** in a single `<details>` block so the issue page stays scannable. The sections below live inside the block, in this order:

```
<details>
<summary>Investigation details</summary>

#### Proposed fix

{content — see guidance below}

#### Root cause & evidence

{content — see guidance below}

#### Additional context

{content — optional, omit the whole section if there is nothing high-signal to add}

</details>
```

#### Proposed fix (required)

Provide the most direct path to resolution.

- **Single file:** lead directly with the suggested code diff or specific action.
- **Multiple files:** use a brief table to list affected files, followed by the necessary changes.
- **No concrete fix:** clearly state what additional evidence or investigation is needed to propose one.

#### Root cause & evidence (required)

Explain _why_ the failure occurred, citing specific evidence. Choose the format that best fits the complexity of the bug:

- Use concise paragraphs with inline Markdown links pointing to specific code lines, commits, or files.
- Use an ASCII timeline diagram for race conditions, multi-component bugs, or complex state leaks.
- Fold relevant evidence (like missing `data-test-subj` attributes, failing network calls, or screenshot descriptions) directly into this narrative.

#### Additional context (optional)

Include the following only if they provide high-value, actionable signal:

- **Ruled out:** a brief note on alternative hypotheses that were investigated and dismissed.
- **Verification:** specific steps to reproduce the failure or confirm the fix.
- **Open questions:** unresolved design or environmental issues blocking a definitive fix ("a screenshot would have helped troubleshoot this" is a valid open question).

#### Data collection issues (troubleshooting)

If you couldn't retrieve evidence such as screenshots or logs because of an error, document each failure here so the workflow itself can be debugged. For each one, include:

- the command you ran
- the URL (if applicable)
- the resulting error message
- any other detail that could be useful for the investigation
