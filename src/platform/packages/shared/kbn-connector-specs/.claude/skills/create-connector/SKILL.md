---
name: create-connector
description: Creates a new connector spec for Kibana. Use when asked to create (or add) a new connector, integration, or data source.
allowed-tools: WebFetch, WebSearch, Read, Grep, Glob, Write, Edit, Bash, Skill
context: fork
argument-hint: "[3rd-party-service-name]"
---

# Create a Connector

We're going to create a new connector spec for **$0**. The connector will enable Kibana to interact with the third-party service and expose operations as tools for AI agents.

## Reference Materials

- **[reference/connector-patterns.md](reference/connector-patterns.md)** — Directory structure, file templates, and registration patterns
- **[reference/pr-validation-table.md](reference/pr-validation-table.md)** — Format for the `## Validated` action-by-action table required in every connector PR description

## Step 1: Determine the Connector Strategy

Check if $0 has an official hosted MCP server. If so, creating an MCP-native connector is preferred.

**MCP server available?** → Read [reference/mcp-connector-setup.md](reference/mcp-connector-setup.md) and follow its steps.

**No MCP server available?** → Read [reference/custom-connector-setup.md](reference/custom-connector-setup.md) and follow its steps.

Follow only the steps for the chosen path. Do not mix them.

### Research the vendor API before writing schemas or handlers

For a custom (non-MCP) connector, do this before Step 2. For each action you plan to implement, find the
vendor's real API docs and verify — don't assume: update semantics (partial vs. full-replace), how array
query params are encoded, whether optional modifier params (`scope`, filters, flags) on `POST`/`PATCH`
actions belong in the query string or the JSON body, the auth scope each action actually needs, and
whether the service has regional/self-hosted domain variants. See "Research the Vendor API Before Writing
Any Code" in
[reference/custom-connector-setup.md](reference/custom-connector-setup.md) for the full checklist. Bugs
found late (during manual testing or review) that trace back to skipping this step are expensive to fix
one action at a time — verifying up front is cheaper.

**If the vendor API is GraphQL**, docs examples and general familiarity are not enough to get input type
names and field selections right — verify every hardcoded type/field name against the real schema via
introspection before writing the handler. See "Verify GraphQL Schemas via Introspection" in
[reference/custom-connector-setup.md](reference/custom-connector-setup.md).

## Step 2: Create the Connector Spec

Create the connector spec in `src/platform/packages/shared/kbn-connector-specs/src/specs/{connector_name}/`.

Follow the patterns in [reference/connector-patterns.md](reference/connector-patterns.md):

1. **`{connector_name}.ts`** — ConnectorSpec definition with metadata, auth, schema, and actions
2. **`types.ts`** — Zod input schemas and inferred TypeScript types for each action
3. **`{connector_name}.test.ts`** — Unit tests
4. **`icon/index.tsx`** — Brand icon component

Register in `src/platform/packages/shared/kbn-connector-specs/src/all_specs.ts` and `connector_icons_map.ts`.

### `supportedFeatureIds` on a brand-new connector: two-step release

A new connector type must reach Production-NonCanary before it can declare user-facing features.
Serverless rollouts and rollbacks leave nodes on different Kibana versions for a while, and a user action
referencing a connector type that a node does not have breaks on that node. So the first PR ships
`supportedFeatureIds: ['agentBuilder']`.

Do not put `'workflows'` or any other user-facing feature ID in the first PR. Those are added in a
follow-up PR once the connector is registered in every Production-NonCanary version.

Mention the required follow-up PR in the first PR's description so it is not forgotten.

**MCP connectors**: Use [reference/mcp-connector-setup.md](reference/mcp-connector-setup.md) as the direct starting template for the spec — it has concrete, copy-ready examples with the correct `lazySchema`, `callToolJson`/`callToolContent`, and test-mock patterns already in place. Do not reverse-engineer from existing connectors.

**Type every handler explicitly.** Annotate each action's `input` parameter with its `z.infer`-derived
type from `types.ts` (`handler: async (ctx, input: SearchInput) => { ... }`). Without the annotation it
silently resolves to `any` — nothing fails to compile, but the handler gets zero type checking against
its own Zod schema. Do this for every action as you write it, not as a later cleanup pass; with a dozen
or more actions in one file it's easy to leave some untyped if you defer it.

**Keep `test.enabled: true`.** The scaffold generates `test: { enabled: true, handler: ... }` — don't
drop `enabled` when you flesh out the handler body.

**Do not add `events`.** Optional inbound `ConnectorSpec.events` is gated by
`SPECS_ALLOWED_EVENTS` in `src/specs_allowed_events.ts`. Omit `events` unless the
connector id is in that allowlist (connectors may eventually declare both `actions` and
`events`). 

Replace the placeholder icon with a proper brand icon. Do NOT generate an icon, use the official brand icon or tell the
user you could not find one. Search for existing SVG/PNG files in:
- `src/platform/packages/shared/kbn-connector-specs/src/specs/*/icon/`
- `x-pack/platform/plugins/shared/stack_connectors/public/connector_types/{connector}/`

## Step 3: Write LLM-Quality Descriptions and Skill Content

AI agents rely on descriptions to choose the right action and construct valid inputs. Every action and parameter must have high-quality descriptive text.

### `isTool`, `scope`, and action descriptions

Actions should set `isTool: true` to be discoverable by AI agents in Agent Builder. This is the default for most actions. Use `isTool: false` only for actions that should not be invoked autonomously (e.g. destructive or admin-only operations).

Every `isTool: true` action **must** also have an explicit `scope` field — never omit it. Classify each action:

- `scope: 'read'` — pure reads; no external state modified (GET-only, searches, listings, downloads)
- `scope: 'write'` — creates or appends new data without touching existing state (send message, create resource, add comment)
- `scope: 'destroy'` — overwrites, updates, or deletes existing state (resolve/update/delete anything, patch a record); also use for generic escape-hatch actions (`request`, `callTool`, `callRestApi`) since they can do anything

When uncertain, prefer `'destroy'` over `'write'` — it's safer to over-classify. See the `scope` section in [reference/connector-patterns.md](reference/connector-patterns.md) for the full table and examples.

Every entry MUST have a `description` field (plain string, NOT `i18n.translate()`) that explains:
- What the action does
- When an agent should use it (vs. other actions)
- What it returns
- For download/binary actions: a WARNING about large base64 payloads and the need for post-processing

### Parameter descriptions

Every Zod parameter in input schemas MUST have a `.describe()` call that includes:
- What the parameter controls
- Concrete examples or allowed values
- Any constraints (format, length, required vs. optional behavior)

See the ServiceNow, Slack, and GitHub connector specs for examples of strong description quality.

### The `skill` property

Add a `skill` property to the ConnectorSpec — a markdown string providing higher-level LLM guidance:
- Multi-step workflow patterns (e.g., "to create an incident, first call X, then Y")
- Common gotchas and error cases
- Best practices for the service

Use the `[...].join('\n')` pattern to keep the string readable in source:

```ts
skill: [
  '## $0 Connector',
  '',
  'Use this connector to ...',
  '',
  '### Common patterns',
  '- To do X, first call `actionA` then `actionB`',
].join('\n'),
```

## Step 4: Create Tests

Add tests following the existing examples:

1. **Connector spec tests** — See `google_drive/google_drive.test.ts` or `slack/slack.test.ts` for the pattern.

You do not need to execute the tests — just create the files. You should, however, run
`node scripts/eslint <path>` on every file you create or edit (including test files) before moving on.
This is fast, requires no running Kibana/Elasticsearch, and catches mechanical rule violations — e.g. a
forbidden non-null assertion (`@typescript-eslint/no-non-null-assertion`) in a test file's
`Connector.action!.handler` — that a code-reading self-review or an AI PR reviewer can miss, and that
otherwise only surface once CI's lint step fails the build.

Unit tests that mock `ctx.client`/`ctx.request` yourself cannot catch bugs where the mock encodes the same
wrong assumption as the handler (e.g. asserting on the axios default array-param serialization when the
vendor actually needs a different form, or asserting that an optional modifier param is sent as a query
param when the vendor actually expects it in the body). For any handler you flagged during vendor API
research as having non-obvious update, serialization, or query-string-vs-body semantics, add a test that
asserts on the *exact* request shape sent (URL, method, body, and params/paramsSerializer) against what the
docs say the vendor expects — not just that the handler resolves without throwing.

### Self-review before handing off

Before treating the connector as done, re-read the whole diff once, end to end, specifically hunting for:

- Any `isTool: true` action missing a `scope` field — every tool action must have one
- A `scope` that looks wrong: a "get"/"list"/"search" action marked `write` or `destroy`, or an update/delete/patch action marked `read`
- Handlers still typed with implicit `any` (missing the `input: XInput` annotation)
- `test.enabled` missing or set to `false`
- Leftover schemas/constants from earlier iterations that are no longer referenced anywhere
- Repeated calls to the same helper (e.g. building a base URL twice) that should be a single local variable
- `z.record(z.string(), ...)` or `z.array(z.record(...))` keys without a `.max()` bound
- Update-action inputs where every field is optional — should they `.refine()` to require at least one?
- ID/GUID-like fields that flow into a query or filter string without a format constraint (regex) — an
  unconstrained value here is an injection risk
- A user-supplied or config-derived value (ID, slug, org name) interpolated into a URL path segment
  without `encodeURIComponent()` — search the whole file for `` `${baseUrl} `` and check every `${...}`
  after it
- Auth scopes mentioned inconsistently across the three places a user might see them: the auth field's
  `helpText`, the docs page's "Authentication" summary line, and the docs page's "Get API credentials"
  setup steps. Grep for the scope names across all three files/sections and confirm every action's
  required scope appears in all of them, not just one
- Naming/casing inconsistencies vs. sibling connectors (e.g. `webpackChunkName` casing)
- Doc wording that could misread "required" as applying only to the last-listed parameter
- `POST`/`PATCH` actions with optional modifier params (`scope`, filters, flags) — confirm against the
  vendor's docs whether each one belongs in the query string or the JSON body, checked per action against
  the docs rather than assumed from a similar-looking sibling action in the same file
- For GraphQL-backed connectors: every input type name and response field selection in a hardcoded
  query/mutation string has been checked against the real schema via introspection, not just written from
  a docs example or general knowledge — see "Verify GraphQL Schemas via Introspection" in
  [reference/custom-connector-setup.md](reference/custom-connector-setup.md)

This mirrors what the `review-connector` skill checks — running it yourself first means real review
cycles catch new problems instead of re-flagging things you could have caught alone.

## Step 5: Write Documentation

Create a connector doc page in `docs/reference/connectors-kibana/{name}-action-type.md`.

### Prerequisites

This step requires documentation skills from https://github.com/elastic/elastic-docs-skills. Check availability by invoking `docs-check-style` (use the Skill tool). If it fails with "skill not found", stop and tell the user:

> Documentation skills are not installed. Please install them:
>
> ```bash
> curl -sSL https://raw.githubusercontent.com/elastic/elastic-docs-skills/main/install.sh | bash
> ```
>
> Then re-run this step.

### Write the doc page

1. Read 1-2 existing connector docs from `docs/reference/connectors-kibana/` as templates (for example, `zendesk-action-type.md`, `jira-cloud-action-type.md`). Follow the same structure.
2. Write the new doc page. Use `docs-syntax-help` if unsure about MyST Markdown syntax.
3. Run these skills on the new file and fix any issues:
   - `frontmatter-description` — generate the `description` frontmatter field
   - `page-opening-optimizer` — verify H1 and opening paragraph
   - `applies-to-tagging` — validate `applies_to` block
   - `docs-check-style` — check Elastic style guide compliance

### Update navigation and listings

1. Add an entry in `docs/reference/toc.yml` under the `data-context-sources-connectors.md` section (the
   scaffold generator does this automatically) — **not** the `elastic-connectors.md` section, which is
   reserved for the small, fixed set of Kibana-native connectors (Cases, Index, ServerLog, Obs AI Assistant).
2. Add a row in `docs/reference/connectors-kibana/_snippets/data-context-sources-connectors-list.md`
   (the generator inserts a placeholder row here too — replace its `TODO` description), ordered
   alphabetically within the correct category (most connectors belong in "Third-party search"; check for
   a better-fitting category like "Threat intelligence" or "Identity management" first).

Once you are done developing the connector spec, tests, and documentation, let the user review your work before next steps.

### If this connector's PR hasn't been opened yet

Whenever this connector's PR is opened — whether by `build-connector`'s Task 12, a later session, or a
human — its description must include a `## Validated` section: a table listing every action the spec
exposes and whether it's been observed working. If you ran this skill standalone (not via
`build-connector`) and no live testing happened yet, still note this requirement to the user so the table
doesn't get skipped when the PR is written. See
[reference/pr-validation-table.md](reference/pr-validation-table.md) for the exact format.

The PR must also carry the `release_note:feature` and `Feature:Actions/ConnectorTypes` labels. If you open
the PR yourself, add them with `gh pr create --label "release_note:feature" --label "Feature:Actions/ConnectorTypes" ...`
(or `gh pr edit <number> --add-label ...` afterward). If a human opens the PR, remind them to add both.

## Important Notes

- **Stop if architectural gaps emerge** — This skill is for adding connectors to the catalog, not for enhancing platform features
- **Write rich descriptions** — Every action and parameter must have descriptive text that helps LLMs choose the right action and construct valid inputs; add a `skill` property with multi-step patterns and gotchas
- **Follow existing patterns** — Look at Slack, GitHub, Google Drive, and ServiceNow connectors for reference
- **DO NOT modify existing documentation** — There may be existing connectors with similar names. Do not modify their documentation files.
