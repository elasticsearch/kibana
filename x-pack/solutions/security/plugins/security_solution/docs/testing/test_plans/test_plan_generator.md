# AI-Powered Test Plan Generator — Cursor Setup Guide

This guide walks you through setting up an AI agent in Cursor that automatically generates comprehensive test plans from GitHub issues. The agent reads the issue description, navigates the parent epic and all sub-issues, fetches linked Figma designs and images, and posts the test plan as a comment directly on the issue.

---

## How It Works

1. A GitHub issue is labeled **`needs Test Plan`** — this is a team convention to identify which issues need a test plan. The agent works on any issue regardless of labels.
2. You open Cursor and type: `/test-plan-generator generate test plan for issue #1234`
3. The agent reads the issue, navigates the parent epic (if any), explores all sub-issues, fetches linked Figma designs and images, and generates a structured test plan
4. The test plan is saved locally as a draft at `.agents/tmp/test-plan-#<issue_number>.md` for you to review and edit
5. When you're happy with it, you run: `/test-plan-generator publish test plan for issue #1234`
6. The agent posts the plan as a comment on the GitHub issue — using the `gh` CLI as the primary method, or the GitHub MCP as fallback if `gh` is not available
7. If the issue changes later, run `/test-plan-generator update test plan for issue #1234` — the agent detects only what changed and updates the draft incrementally, without rewriting everything from scratch

---

## Prerequisites

Before starting, make sure you have:

- [ ] [Cursor](https://cursor.com) installed and signed in with your `@elastic.co` Google account
- [ ] Access to [github.com/elastic](https://github.com/elastic)
- [ ] A Figma account with access to Elastic's Figma workspace
- [ ] Node.js 18+ installed (`node --version` to check)

---

## Step 1 — Generate Your GitHub Personal Access Token

The agent needs a token to read and comment on GitHub issues via the `gh` CLI and, optionally, the GitHub MCP server.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it a descriptive name, e.g., `cursor-test-plan-agent`
4. Set expiration to **90 days** (or "No expiration" if your org allows it)
5. Select the `repo` scope (full control of private repositories)
6. Click **Generate token** and **copy it immediately** — you won't see it again

> ⚠️ Keep this token private. Never commit it to a repository.

### Authorize the token for the Elastic organization (required)

This step is critical. Without it, all GitHub API calls to `elastic` repositories will fail with a `403 SAML enforcement` error.

1. On the [tokens page](https://github.com/settings/tokens), find your newly created token
2. Click **"Configure SSO"** next to it
3. Click **"Authorize"** next to the `elastic` organization
4. Complete any SSO prompts that appear

---

## Step 2 — Ensure Figma access

Make sure you can sign in to [figma.com](https://figma.com) with your `@elastic.co` account and open the Kibana / Security Solution designs. If your workspace access is set up correctly, no personal access token is needed — the Figma MCP setup in Step 3 uses OAuth against your account, not a manually generated token.

> **If you had a `cursor-mcp` (or similarly named) personal access token from an earlier setup**, you can revoke it at [figma.com](https://figma.com) → profile avatar → **Settings** → **Personal access tokens**. It is no longer used by the flow below.

---

## Step 3 — Enable the Figma MCP

The Figma MCP allows the agent to fetch design context from linked Figma files. The test-plan-generator skill uses the **official Figma MCP tools** (`get_metadata`, `get_screenshot`, `get_design_context`, `get_figjam`) and drives them by the `fileKey` / `nodeId` extracted from each Figma URL found in an issue — often across multiple Figma files in a single session.

The skill requires a Figma MCP setup that accepts explicit `fileKey` / `nodeId` params on every call, which is what the metadata-first flow in [`references/gathering-context.md`](../../../.agents/skills/test-plan-generator/references/gathering-context.md#figma) relies on. **Both of the following official flows produce that setup and are supported** — pick whichever matches your Cursor version. They install the same MCP server; the connection appears under **Cursor Settings → MCP** either way.

> **Why not the Figma Desktop dev-mode MCP server?** Figma Desktop's local MCP server operates on the file that is currently open in Figma Desktop, not on arbitrary `fileKey` values. It works well for interactive designer flows but breaks the skill's core assumption: given a Figma URL from an issue, resolve its file/node and read it. Using it here risks generating a test plan from whichever file happens to be open in Figma Desktop rather than the one the issue links to, with no obvious error surface. Use either supported flow below instead.

> **Note on the GitHub MCP:** The GitHub MCP is optional. In practice, the agent works more reliably using the `gh` CLI for all GitHub interactions (reading issues, posting comments, navigating sub-issues). When the GitHub MCP is enabled alongside the agent doing complex multi-step work, it can interfere with parallel tool calls and cause Cursor to hang. The recommended setup is to use `gh` CLI as the primary GitHub tool and leave the GitHub MCP disabled unless you have a specific reason to enable it.

### Option A — Cursor plugin flow (`/add-plugin figma` or the Figma install deep link)

This is Figma's currently documented default install path for Cursor. It works from inside the Agent chat and, on newer Cursor builds, also installs any Figma-side skills that ship with the plugin.

1. Open a new Agent chat in Cursor.
2. Type `/add-plugin figma` and press Enter. Alternatively, follow Figma's install deep link from [https://developers.figma.com/docs/figma-mcp-server/](https://developers.figma.com/docs/figma-mcp-server/) — the deep link opens Cursor and drives the same flow.
3. Cursor prompts **Install → Connect → Open → Allow access**. Accept each prompt.
4. Sign in with your `@elastic.co` Figma account when the browser opens, and authorize Cursor.
5. Verify: open **Cursor Settings → MCP** and confirm **Figma** appears with a green status indicator. Hovering over it should show `get_metadata`, `get_screenshot`, `get_design_context`, and `get_figjam` among the available tools.

### Option B — Cursor Integrations UI

If your Cursor build does not expose `/add-plugin` yet, use the Integrations UI. It installs the same Figma MCP server.

1. Open **Cursor Settings** (`⌘ ,` on macOS).
2. Go to the **Integrations** section.
3. Find **Figma** and click **Connect**.
4. Sign in with your `@elastic.co` Figma account and authorize Cursor.
5. Verify: still in Cursor Settings, open the **MCP** tab and confirm Figma appears with a green status indicator. Hovering over it should show `get_metadata`, `get_screenshot`, `get_design_context`, and `get_figjam` among the available tools.

Either way, the integration is managed by Cursor — no manual `mcp.json` entry is required for Figma.

### Migrating from older setups

- **Framelink `figma-developer-mcp` (older npm package).** Earlier versions of this guide asked you to install this package via `npx`. It exposes different tools (`get_figma_data`, `download_figma_images`) that the test-plan-generator skill no longer calls — the metadata-first flow relies on the official tools listed above. Remove any `mcp.json` entry that looks like:
  ```json
  "figma": {
    "command": "npx",
    "args": ["-y", "figma-developer-mcp", "--figma-api-key=…", "--stdio"]
  }
  ```
  before running either supported flow from Step 3. Otherwise Cursor connects to Framelink's server, the skill's Figma calls fail with "tool not found", and the setup silently falls back to metadata-less scenarios.
- **Figma Desktop local dev-mode MCP entry.** If your `mcp.json` has an entry pointing at `http://127.0.0.1:3845/mcp` (Figma Desktop's local MCP server), remove it before running either supported flow from Step 3 — for the reason called out above, it is not a drop-in replacement for URL-driven fetches and can silently target the wrong file.

> If Figma shows as disconnected in Cursor Settings → MCP, sign out of the integration and reconnect. If `mcp.json` has other entries and Cursor reports a JSON error, validate with [jsonlint.com](https://jsonlint.com).

---

## Step 4 — Install the `gh` CLI (required)

The `gh` CLI is GitHub's official command-line tool and is the **primary method** the agent uses to read issues, navigate sub-issues, and post comments. Using `gh` instead of the GitHub MCP avoids the hanging issues that can occur when the MCP is active during complex multi-step agent sessions.

### Install
```bash
brew install gh
```

### Authenticate with SSO

Elastic does not allow HTTPS authentication. When running `gh auth login`, select **Login with a web browser** (not HTTPS):
```bash
gh auth login
```

When prompted:
1. Select **GitHub.com**
2. Select **Login with a web browser**
3. Copy the one-time code shown in the terminal
4. Press Enter — your browser will open automatically
5. Paste the code and authorize the app
6. Return to the terminal — authentication completes automatically

### Verify
```bash
gh auth status
```

You should see your username and a valid token with `repo` scope.

---

## Step 5 — Google Drive (optional, deferred)

Google Drive integration requires a Google Cloud OAuth setup that goes beyond a simple token. It is **not required for the pilot** — GitHub and Figma are sufficient to generate high-quality test plans.

To enable it in the future (e.g., when migrating to a GitHub Actions workflow with a company service account), follow the [official MCP Google Drive setup guide](https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive).

---

## Step 6 — Check Out the Skill

The skill and its reference files were added to the repository by the Engineering Productivity team. Once you have the repo checked out locally and open in Cursor, the skill is automatically available — no manual file creation needed.

The files live at:
```
x-pack/solutions/security/plugins/security_solution/.agents/skills/test-plan-generator/
├── SKILL.md                                        # Agent instructions
├── references/
│   ├── common-mistakes.md                          # 8 common quality mistakes with ❌ Bad / ✅ Good examples; reviewed before every save
│   ├── critical-workflows.md                       # File-lookup convention that routes the skill to the team-owned map below when generating scenarios that touch a Security Solution area
│   ├── critical-workflows-security-solution.md     # Security Solution team's list of critical workflows and impact-based priority rules (P0 / P1) used to raise scenario priorities beyond the default P2
│   ├── document-structure.md                       # Test plan template, required sections, the Pending work pattern, and the Issue Clarity Assessment block
│   ├── draft-coherence-review.md                   # Holistic end-to-end draft review (D1–D9 document coherence + S1–S8 source fidelity); run on the assembled draft before saving
│   ├── example-test-plan.md                        # Fully-worked end-to-end example for a UI feature with a linked PR, including the Figma metadata-first variants
│   ├── example-test-plan-backend.md                # Sibling example for a backend / parser feature without UI and without a linked PR (synthetic issue numbers)
│   ├── gathering-context.md                        # Step 1 in detail: gh CLI commands, URL handling, images, Figma (metadata-first flow + session budget), sub-issues, PRs, test catalog, AC origin tagging, orphan-PR handling
│   ├── issue-clarity-assessment.md                 # Rubric, 5 dimensions, grading anchors, per-issue + combined readability scoring, Coverage Ratio (with the no-PR boundary case), stop-and-ask gate, two worked examples
│   ├── mode-generate.md                            # Generate / regenerate flow (run end-to-end or fill gaps when a draft exists)
│   ├── mode-update.md                              # Incremental update flow with PR re-read, Issue Clarity Assessment re-evaluation, and full-document coherence review
│   ├── optional-scenarios.md                       # Optional sections (RBAC, upgrade, CCS, multi-space, multi-tenant), Gherkin rules, priorities, critical-workflows pointer
│   ├── output-formats.md                           # Scenario format, footer, Sources Summary, Gherkin self-review with sum-checks, assessment markdown layout, per-scenario Execution status block, token usage marker
│   └── security-test-directories.md                # Map of existing test locations in the repo
└── scripts/
    └── publish_test_plan.sh                        # Deterministic publish step (invoked in Step 4)
```

> **Why a skill and not a Cursor rule?** Skills are the current standard for extending AI agents in Kibana, agreed by Kibana tech leads and the AI guild. They are more efficient than rules (loaded on demand, not on every agent session), portable across agents, and version-controlled like any other code.

### How to invoke it

Since the skill uses `disable-model-invocation: true`, it is **not** applied automatically. You must invoke it explicitly by typing `/test-plan-generator` in the Agent chat, followed by your command:
```
/test-plan-generator generate test plan for issue #1234
```
```
/test-plan-generator update test plan for issue #1234
```
```
/test-plan-generator publish test plan for issue #1234
```

---

## Step 7 — Verify the Setup

1. Open Cursor in your repository
2. Open the **Agent** panel and make sure it is in **Agent** mode (not Ask or Edit)
3. Select **`auto`** as the model — this avoids rate-limiting issues that can cause Cursor to hang on complex issues with many sub-issues and PRs
4. Type:
```
   /test-plan-generator generate test plan for issue #1234
```
   Replace `1234` with a real issue number that has a description, acceptance criteria, and ideally some sub-issues.
5. Watch the agent work through the steps — it will show what it reads from GitHub (via `gh` CLI), Figma, and any linked content
6. When finished, open `.agents/tmp/test-plan-#1234.md` in the editor to review the draft
7. When happy with it, run: `/test-plan-generator publish test plan for issue #1234`
8. Check the GitHub issue — the test plan should appear as a new comment posted with your account

---

## Daily Usage

Once set up, generating a test plan is as simple as:
```
/test-plan-generator generate test plan for issue #1234
```

Or with a full URL:
```
/test-plan-generator create a test plan for https://github.com/elastic/kibana/issues/1234
```

### Choosing a verbosity level (optional)

Every command accepts an optional verbosity keyword — `lean`, `standard`, or `detailed` — that controls **prose density and per-scenario metadata only**. It never changes which scenarios are written, their priorities, or which `⚠️` entries appear in *Known Limitations*.

```
/test-plan-generator generate a lean test plan for issue #1234
/test-plan-generator generate a detailed test plan for issue #1234
```

If you omit the keyword, the agent uses `standard` (the current default). The chosen level is persisted as a hidden `<!-- verbosity: … -->` marker in the published comment, so `update` runs preserve it automatically. To flip the level later, just include the keyword in the update invocation — the agent re-renders the whole plan at the new level and announces the change in its post-save message.

**When to reach for `lean`** — small, well-understood changes; issues where the reviewer already knows the domain; drafts you plan to skim.

**When to reach for `detailed`** — cross-team handovers; issues that will be read by people unfamiliar with the feature; drafts that need per-scenario traceability. `detailed` adds a `**Source:**` line that cites the scenario's origin from one of four categories: a consolidated AC (`AC1 (#1234)`), a PR artifact (endpoint / component / saved-object type / etc.), an always-evaluated coverage trigger (upgrade / CRUD per persisted object / dependency data lifecycle), or a code-derived fact discovered outside issue and PR bodies.

#### Before / after — the `Overview` and per-scenario blocks under each level

`standard`:

````markdown
## Overview

This test plan covers the automated escalation policy feature introduced in #1234, which allows security engineers to define time-based escalation rules for security alerts. It validates end-to-end behaviour across rule creation, alert routing, and downstream notification, and confirms that the feature meets the acceptance criteria stated in the epic and the linked PR.

...

#### Scenario: Editor can create a new escalation rule

**Priority:** P0

**Automation coverage**: 2 unit tests (`escalation_rule_form.test.tsx` — "renders create form", "submits valid payload"), 1 e2e test (`escalation_rules.cy.ts` — "creates rule from empty state")

```gherkin
...
```
````

`lean`:

````markdown
## Overview

Validates the automated escalation policy feature from #1234 end-to-end (rule creation, alert routing, notifications).

...

#### Scenario: Editor can create a new escalation rule

**Priority:** P0

**Automation coverage**: 🤖 automated (3 tests)

```gherkin
...
```
````

`detailed` (adds `**Source:**` between `**Priority:**` and `**Automation coverage**` — everything else identical to `standard`):

````markdown
#### Scenario: Editor can create a new escalation rule

**Priority:** P0

**Source:** AC1 (#1234); PR #5678 (endpoint `POST /rules`); PR #5678 (component `EscalationRuleForm`)

**Automation coverage**: 2 unit tests (`escalation_rule_form.test.tsx` — "renders create form", "submits valid payload"), 1 e2e test (`escalation_rules.cy.ts` — "creates rule from empty state")

```gherkin
...
```
````

The `Assumptions` section shrinks similarly under `lean` — only bullets whose value was **confirmed from a concrete source** (issue body, PR, Figma, sub-issue) are rendered as a compact `; `-separated line, and unconfirmed bullets remain in *Known Limitations* with their `⚠️` unchanged. The agent never invents defaults just to fill the section — that would violate the skill's core "never assume, always ask" rule. If nothing was confirmed, the section renders `See _Known Limitations_ for open assumptions.` and points there.

### Updating an existing test plan

If the issue changes and you need to update the plan:
```
/test-plan-generator update test plan for issue #1234
```

The agent fetches the published comment as the current state, re-reads the issue to detect what changed, and automatically checks all linked PRs for new activity since the plan was published — re-reading any PR that has had new commits or review comments. It applies only the differences and saves the result as a new draft for you to review before publishing.

If you want to force a full re-read of all linked PRs regardless of activity:
```
/test-plan-generator update test plan for issue #1234 including PRs
```

### Publishing a reviewed draft
```
/test-plan-generator publish test plan for issue #1234
```

The agent uses the `gh` CLI as the primary method, invoking `scripts/publish_test_plan.sh` for a deterministic publish — it detects any existing test plan comment, decides between PATCH and POST, posts the content, and deletes the local draft. If `gh` is not available, the agent falls back to the GitHub MCP and performs the same flow manually. Either way, the comment is posted (or updated) on the issue and the local draft is deleted.

---

## Troubleshooting

### "403 SAML enforcement" error when reading issues

Your GitHub token is not authorized for the Elastic organization. Go to [github.com/settings/tokens](https://github.com/settings/tokens), find your token, click **"Configure SSO"**, and authorize it for the `elastic` org. See Step 1 for the full procedure.

### GitHub MCP shows as disconnected in Cursor

The GitHub MCP is optional — the agent uses `gh` CLI as the primary method for all GitHub interactions. If you have enabled the GitHub MCP and it shows as disconnected, check that the `mcp.json` entry uses `"type": "http"` and the URL `https://api.githubcopilot.com/mcp/`. Ensure your GitHub token is correctly placed in the `Authorization` header value (after `Bearer `). Fully quit and reopen Cursor after any changes to `mcp.json`. If you continue to have issues, simply disable the GitHub MCP and rely on `gh` CLI — the agent works more reliably that way.

### Figma MCP not connecting

Both supported flows from Step 3 (`/add-plugin figma` / Figma install deep link, or Cursor Integrations) surface the Figma connection under **Cursor Settings → MCP**. If that entry is red / disconnected:

- **Option A path** — re-run `/add-plugin figma` from the Agent chat, or open the Figma install deep link again. Accept the *Install → Connect → Open → Allow access* prompts, sign in with your `@elastic.co` Figma account when the browser opens, and fully quit and reopen Cursor after connecting.
- **Option B path** — open Cursor Settings → **Integrations** → **Figma** and re-run **Connect**. Sign in with your `@elastic.co` Figma account and fully quit and reopen Cursor after connecting.
- **If you followed an older version of this guide** and installed Framelink's `figma-developer-mcp` npm package via `npx`, remove that entry from `mcp.json` — the skill no longer calls Framelink's tools and Cursor will surface a "tool not found" style error when the skill runs. See the migration note at the bottom of Step 3.
- **If your `mcp.json` has a Figma Desktop local dev-mode entry** (`http://127.0.0.1:3845/mcp`), remove it before running either flow. That server does not accept `fileKey` params, so the skill can silently generate a test plan against whichever file happens to be open in Figma Desktop instead of the one the issue links to. See the note in Step 3 for why neither of the two supported flows uses it.

### "Cannot read Figma file"

Make sure the Figma file is shared with your `@elastic.co` account and that the Figma MCP OAuth session (installed in Step 3 via either `/add-plugin figma` / the install deep link, or Cursor Settings → Integrations → Figma) is using that account. The MCP can only access files your account can view.

### The agent says it cannot connect to GitHub and falls back to `gh` CLI

This is expected behaviour — it means the GitHub MCP tools were not exposed to the agent in this particular session. The agent will automatically use `gh` to publish the comment. As long as `gh auth status` shows a valid session, everything will work normally. If `gh` is not installed or not authenticated, see Step 4.

### `gh auth status` fails or shows no valid token

Run `gh auth login` again. When prompted for the authentication method, select **Login with a web browser** — do not select HTTPS, as Elastic does not allow it. See Step 4 for the full procedure.

### `gh auth login` — authentication fails or HTTPS is rejected

Make sure you select **Login with a web browser** when prompted, not the HTTPS option. Elastic enforces SSO and does not allow HTTPS-based authentication for the `elastic` GitHub organization.

### `gh` CLI posts the comment but the update flow is broken on the next run

The agent looks for a comment whose first two lines are exactly:
```
<!-- test-plan-generated -->
<!-- generated-by: [model] -->
```
to detect existing test plans and avoid duplicates. If those markers are missing or not at the very top of the comment, the agent will create a new comment instead of updating the existing one. Open the published comment on GitHub, make sure both lines are present and are the very first lines, save, and the update flow will work correctly from then on.

### `publish_test_plan.sh` exits with an error code

When publishing, the agent runs `scripts/publish_test_plan.sh`. If the script fails, you will see a message like `error: ...` followed by an exit code. The most common ones:

| Exit code | Meaning | Fix |
|---|---|---|
| 65 | The draft does not start with `<!-- test-plan-generated -->` | The agent should have prepended the marker. If you see this, the draft was edited externally — open `.agents/tmp/test-plan-#<issue>.md` and make sure the first two lines are the marker and `generated-by:` lines. |
| 66 | Draft file does not exist | Run `generate test plan for issue #<n>` first to create the draft. |
| 69 | `gh` CLI is not installed | Run `brew install gh` (Step 4). |
| 70 | Unexpected response from GitHub API (could not resolve comment id, or API returned no URL) | Usually a transient API issue. Re-run the publish command. If it persists, check `gh api /repos/<owner>/<repo>/issues/<n>/comments` manually to confirm the comment is reachable. |
| 77 | `gh` CLI is not authenticated | Run `gh auth login` (Step 4). |
| 64 | Argument or usage error | Re-run the publish command. If it persists, open an issue. |

### Cursor hangs or stops responding during generation

This is most commonly caused by the GitHub MCP being enabled at the same time the agent is doing complex multi-step work. The MCP can interfere with parallel tool calls and cause the session to freeze. **The recommended fix is to disable the GitHub MCP in `mcp.json` and use `gh` CLI exclusively** — this has proven to resolve hanging issues completely. See Step 3 for instructions on how to configure `mcp.json` without the GitHub MCP entry.

If the GitHub MCP is already disabled and you still see hangs, it is likely due to the issue having many sub-issues and PRs with large diffs. In that case, split the work:

**For `update` mode:** the agent automatically checks all linked PRs for activity since the plan was published and only re-reads the ones that changed, so PR context is refreshed without extra effort. If you still see hangs, try running the update without the issue having too many concurrent open PRs.

**For `generate` mode:** if it hangs, split the work into two commands. First: `/test-plan-generator generate test plan for issue #1234, only read the issue and sub-issues, skip PRs`. Once that finishes: `/test-plan-generator update test plan for issue #1234 including PRs`.

After a hang, close and reopen Cursor. The draft is not lost if it was saved before the hang.

### JSON syntax error in mcp.json

Use [jsonlint.com](https://jsonlint.com) to validate the file. A missing closing brace `}` or an extra comma are the most common causes.

---

## FAQ

**Can I use this for any repository in the elastic org?**
Yes, as long as your GitHub token has access to that repository and has been SSO-authorized for the `elastic` org. The target issue (the one named in your command, where the test plan comment will be posted) can live in a different repo than the one you currently have open in Cursor — for example, you can run the skill from your local `elastic/kibana` checkout but publish to an issue in `elastic/security-team`. The skill passes the right `--repo <owner>/<repo>` flag to the publish script automatically based on the issue URL or context.

**What if the issue has no Figma or Google Docs links?**
The agent skips those steps and works only with the issue text and sub-issues. The quality of the test plan depends on the quality of the issue description.

**Can the agent read screenshots and images in issues?**
Yes, as long as you are using a vision-capable model in Cursor. Use the **`auto`** model setting — it selects the best available model for each step and avoids rate-limiting issues. The agent fetches and analyzes image URLs found in the issue body and comments — typically screenshots at `user-images.githubusercontent.com`. If an image requires authentication, the agent will note it could not be read.

**What if the issue has a parent epic?**
The agent automatically reads the parent issue one level up — including its body, images, and Figma designs — and uses it as background context. If the parent already has a published test plan, the agent reads it too and uses it to avoid duplicating scenarios. It does not read the siblings (other sub-issues of the same parent) and does not navigate further up the hierarchy.

**What if a sub-issue already has a published test plan?**
The agent reads it and uses it to understand what is already covered. It will not duplicate those scenarios in the current issue's test plan. If everything is already covered by sub-issue test plans, the agent will stop and ask how you want to proceed — offering a summary plan with links, a full self-contained plan, or cancellation.

**What if the issue is an epic and some sub-issues are not yet implemented?**
The agent applies the *Pending work pattern* defined in `references/document-structure.md`: unimplemented sub-issue acceptance criteria are written as forward-looking scenarios under a collapsible "Pending work — forward-looking gaps from open sub-issues" section, each marked with `(Pending #N)` against its source sub-issue. The Test Coverage Summary then includes a dedicated "Pending work" row that counts those scenarios as `Manual only` (they cannot be exercised today). Implemented-but-unreleased sub-issues are treated as in scope and get regular scenarios instead. The pattern is applied only to true epics with open sub-issues — for standalone issues it is skipped.

**What if the issue itself already has a published test plan and I run `generate`?**
The agent will detect the existing test plan and ask whether you want to check if it is still up to date, generate from scratch, or cancel. If you choose to check, it will re-read all sources and add only what is missing — it will not rewrite what is already correct.

**Do I need both the GitHub MCP and `gh` CLI?**
No — `gh` CLI is the primary and recommended method. The GitHub MCP is optional and in practice causes hanging issues when enabled during complex agent sessions. Install and authenticate `gh` CLI (Step 4) and you will have everything you need. The GitHub MCP can be left disabled.

**Who maintains the skill?**
The skill files live in the repository under `x-pack/solutions/security/plugins/security_solution/.agents/skills/test-plan-generator/`. Any team member can propose changes via PR, just like any other code file.

**How does the agent self-review the draft before saving?**
Three layers, all run during Step 3 just before the draft is written, in this order:
1. The *Red flags — STOP and ask* table at the top of `SKILL.md` (right below the Core rule). It maps the most common "I'll just rationalise this" thoughts (e.g. *"the image fetch failed, I'll describe it from alt text"*, *"the total scenarios count looks close enough — I'll round"*, *"the issue is thin but the PR fills the gaps"*, *"I found a PR that obviously implements this scope, but no issue cross-references it — I'll add it to the corpus"*) to the correct alternative behaviour. If the agent catches itself in any of those, it stops and asks instead of inventing.
2. The expanded `references/common-mistakes.md` file. 8 frequent quality issues (hallucinated scenarios, duplicated sub-issue coverage, speculative optional sections, UI-step Gherkin, overlooked sub-issue ACs, overlooked PR artifacts, inconsistent Known Limitations, ignoring the Core rule) — each entry has a one-paragraph description, a concrete ❌ Bad example (most sourced from observed agent runs), and a ✅ Good alternative. On top of that, the Gherkin self-review in `references/output-formats.md` includes three mechanical sum-checks on the Test Coverage Summary table to catch undercounts and a structural check on the Issue Clarity Assessment block.
3. The *draft coherence review* in `references/draft-coherence-review.md` — a holistic end-to-end re-read of the assembled draft against the gathered context corpus. The previous two layers are itemised (per-scenario rules, per-category mistakes, sum-checks); this layer compares sections of the draft against each other and against the issue / PR / Figma sources gathered in Step 1. It is split into two short tables: *Document-as-whole coherence* (D1–D9: e.g. *Overview* matches what scenarios actually test, *Scope* bullets map to scenarios bidirectionally, *Known Limitations* claims match the document, voice and detail level consistent across scenarios) and *Source fidelity* (S1–S8: e.g. ACs verbatim from the issue, *Feature Background* motivation traceable to source, UI element names / error strings / feature-flag names matching their origin tag). Each row is graded Consistent / Drift / Incoherent — Drift and Incoherent findings are fixed on the draft before saving, or recorded as a `⚠️` entry in *Known Limitations* if unresolvable. This layer is not published — its only externally visible effects are draft edits and new `⚠️` entries.

If something still looks off in the published comment, edit the source file in `references/` and open a PR — the skill improves the same way any other code does.

**What is the *Issue Clarity Assessment* section at the bottom of every test plan?**
A built-in metric that grades how clear the **issue descriptions** are for the purpose of deriving a test plan. It is computed in two halves — per-issue + combined scores after Step 1, Coverage Ratio after Step 3 — and renders as a collapsible section at the bottom of every published test plan. It contains:

- A **1–5 score per issue** read in Step 1 (target, parent, every sub-issue) with a short *critical gaps* note. The rubric grades five dimensions: Acceptance Criteria, Scope, UX/UI, Data & Roles, Edge cases. Dimensions that do not apply (e.g. UI grade for an API-only change) are marked N/A.
- A **combined readability score (1–5)** that is **not** an average — it is graded independently on the union of all issues, so a weak sub-issue can be compensated by a strong parent and the set can score higher than any individual issue.
- A quantitative **Issue Coverage Ratio**: the fraction of scenarios in the final draft that are derivable from issue text alone, with a breakdown of which fact categories (UI labels, error strings, telemetry fields, feature flag names) required pulling from the PR or code. The denominator equals *Total Scenarios* in the Test Coverage Summary.
- **Actionable feedback bullets** identifying specific issues and gaps — included only when at least one issue scored ≤ 3 or the Coverage Ratio is below 60% (otherwise omitted to keep the section concise).

PR descriptions, PR review comments, PR diffs, and code do **not** count toward the score — only what appears in issue bodies and issue comments (including images, Figma nodes, and Google Docs linked from those bodies). The full rubric, procedure, and tie-breakers live in `references/issue-clarity-assessment.md`. If the combined readability is **1**, the skill stops and asks before continuing — the issue corpus is too thin to derive a test plan from text alone.

**Why is the Issue Clarity Assessment published in the GitHub comment instead of just shown in the chat?**
Because the audience for the feedback is the PMs and writers who own the issue, not just the engineer running the skill. Putting the assessment inside the published test plan means anyone reading the GitHub comment sees the score; tracking it across runs gives the team a quality KPI for issue authoring without any separate dashboard. The section is wrapped in `<details>` and collapsed by default so it never crowds the actual scenarios.

**Is there a worked example for backend / parser features (no UI, no PR linked)?**
Yes — `references/example-test-plan-backend.md`. It uses synthetic issue numbers (`#90100` parent, `#90201` target) and a fictional FooBar parser to demonstrate the patterns that the UI example does not cover: two dimensions marked **N/A** in the Issue Clarity Assessment (UX/UI and Data & Roles), the *no-PR linked* boundary case for the Coverage Ratio, the `TARGET_VERSION` user-unavailable fallback, and optional sections (RBAC / Multi-space / Multi-tenant / Upgrade / CCS) explicitly omitted with justification. Pick the example that matches the shape of your feature, not its domain — `example-test-plan.md` for a UI feature with a linked PR, `example-test-plan-backend.md` otherwise.

**The agent asked me whether to include a PR I didn't expect. What happened?**
The agent detected an **orphan PR** — a PR whose title or scope clearly relates to the target issue (or one of its sub-issues) but no formal cross-reference exists in either direction (no `Closes #N`, no mention in any issue body, no reference in the timeline). Orphan PRs are the single most common source of silent scope creep, so the skill never absorbs them quietly. You will see a short table from the agent listing the PR number, title, best-guess relation to the target, and a default action if you do not respond. Decide based on whether the PR really implements scope of your target issue — if yes, tell the agent to include it; if no or unsure, decline and the agent will record it under *Known Limitations* with a `⚠️`. The full handling is defined in `references/gathering-context.md` under *Orphan PRs*.

**The agent flagged `TARGET_VERSION` as not specified. What does that mean and what should I do?**
`TARGET_VERSION` is the Kibana release this work targets. The agent looks for it in (in priority order) the issue's milestone, project fields (`Target`, `Fix version`, etc.), version-pattern labels (`v9.5`, `release:9.5`), or explicit mentions in the issue body / comments. When none of those resolve and you are present, the agent will ask you directly. When you are not available — async runs, dry-runs, batch generation — the agent applies the *user-unavailable fallback* defined in `SKILL.md` Step 2: it marks `TARGET_VERSION` as `⚠️ Not specified — please confirm before publishing` in the *Assumptions* section, and omits the optional Upgrade scenarios entirely rather than guess. If the feature is a pure parser or pure compute with no upgrade surface, the omission is the correct outcome. Otherwise, set the milestone / label and re-run the skill in `update` mode to add the Upgrade section before publishing.

**The draft has a new ⚠️ entry in *Known Limitations* I don't recognise. Is that a bug?**
Probably not — it is the *draft coherence review* (the third self-review layer) doing its job. It re-reads the assembled draft end-to-end and compares sections of the document against each other (D1–D9) and against the gathered context (S1–S8). When it finds a contradiction the agent cannot resolve from the sources alone, it records it as a `⚠️` entry instead of guessing. Read the `⚠️` line, decide which side is correct based on your knowledge of the feature, edit the draft to resolve it, and publish. If the same kind of `⚠️` appears repeatedly across runs, the underlying issue or PR likely has a real inconsistency worth fixing at the source.

**Can I run this without being inside the repository folder in Cursor?**
No — the skill only loads when you have the repository open in Cursor. The MCP servers work globally, but the skill is repo-specific.

**Why is Google Drive not included in the pilot?**
It requires a Google Cloud OAuth application setup with credentials stored locally, which adds significant complexity for individual developers. When migrating to a GitHub Actions workflow, a company-provided service account can handle it without any local setup.

---

*Guide maintained by the Engineering Productivity team. For questions or improvements, open an issue or reach out on Slack.*