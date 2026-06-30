# Inbox demo

Local-dev fixtures for exercising the Inbox + Workflows integration end to end.

## What's here

- `workflows/01_string_input.yml` … `workflows/06_required_with_defaults.yml`
six minimal workflows, one per field-type case from
[security-team#16707](https://github.com/elastic/security-team/issues/16707):
string, number, boolean, single-select enum, multi-select array of enum,
and required + defaults.
- `workflows/07_multi_hitl.yml` — two-stage HITL chain (severity ->
isolation approval) on a single workflow run; exercises the inbox
history's continuity across multiple responses on one run.
- `workflows/08_short_timeout.yml` — workflow with a 30s
`settings.timeout` so the run cancels itself if no human responds.
Surfaces the abnormal-settle ("Timed out") badge in the audit feed.
- `seed_inbox_demo.ts` — Imports each workflow into a running Kibana and
triggers a manual run so they pause on `waitForInput` and surface in the
Inbox. Flags:
  - `--respond` — auto-respond to a subset of the seeded rows with mixed
    approve/reject payloads, **rotating channel tags** (so every per-channel
    badge shows up) and **rotating responder identities** (the configured
    admin plus a couple of demo users created on the fly, so the history
    "Responder" facet has more than one bucket). Two categories of rows are
    intentionally left pending so the "Awaiting response" surface isn't empty:
    the `08_short_timeout` workflow (its timeout fires → abnormal-settle
    history row) and a curated set of **reasoning-bearing** workflows (01, 04,
    06, plus the multi-HITL step 2) so the `reasoning` render is visible on
    live pending rows in the Respond flyout.
  - `--reset` — before seeding, delete any existing `inbox-demo-*` workflows
    (cancelling active executions first, then hard-deleting; falls back to a
    soft-delete if a cancellation hasn't settled). Makes re-runs idempotent
    instead of piling up duplicate `inbox-demo-*-N` workflows. Safe to combine
    with `--respond`.

## Pre-reqs

Enable the Inbox plugin in `kibana.dev.yml`:

```yaml
xpack.inbox.enabled: true
```

Start Kibana + ES locally (`yarn start --no-base-path`).

## Run

There are two equivalent ways to seed the demo data — pick whichever fits your workflow.

### Option A — From the `elastic-security` MCP (recommended for customers)

If you already have the [elastic-security MCP app](https://github.com/elastic/example-mcp-app-security)
configured, just call its `generate-inbox-data` tool. The MCP imports the
same eight workflows in-process, so customers can stand up an Inbox demo
without cloning Kibana or running this script directly.

### Option B — From this repo

```bash
node --import tsx x-pack/platform/plugins/shared/inbox/scripts/demo/seed_inbox_demo.ts
```

Override defaults via env:

```bash
KIBANA_URL=http://localhost:5601 \
  KIBANA_USERNAME=elastic \
  KIBANA_PASSWORD=changeme \
  KIBANA_SPACE_ID=default \
  node --import tsx x-pack/platform/plugins/shared/inbox/scripts/demo/seed_inbox_demo.ts
```

> If you run Kibana with a base path (e.g. `yarn start` without
> `--no-base-path`, which mounts everything under `/kbn`), include
> the base path in `KIBANA_URL`:
>
> ```bash
> KIBANA_URL=http://localhost:5601/kbn \
>   node --import tsx x-pack/platform/plugins/shared/inbox/scripts/demo/seed_inbox_demo.ts --respond
> ```

Open `/app/inbox` to see the seeded items, click "Respond" on each, and
exercise the schema-driven flyout.

## Reasoning soft-interface

Several demo workflows (`01`, `03`, `04`, `06`) prepend a `data.set` step
before their `waitForInput`. The inbox resolves a `reasoning` object from the
**output of the step that ran immediately before** the pause and renders it
above the prompt — both in the Respond flyout (awaiting) and in the History
feed (processed). This is a _soft interface_: no new index mappings and no
engine change. Any workflow whose pre-pause step emits a `reasoning` object of
roughly the following shape gets the richer render; anything else degrades to a
copyable JSON block, and a step with no `reasoning` simply shows nothing.

```yaml
- name: analyze
  type: data.set
  with:
    reasoning:
      # Short one-liner shown inline (optional).
      summary: 'Recommending a temporary block pending operator justification.'
      # Free-text rendered inside the collapsible "Full reasoning" panel (optional).
      details: 'Longer narrative…'
      # Ordered sections in the collapsible panel (optional). Each section may
      # carry a `code` string rendered as a verbatim code block.
      sections:
        - title: 'DIAGNOSIS'
          body: '412 failed logins in 5m from a single ASN.'
        - title: 'CHANGES MADE'
          body: 'Proposed firewall rule (not yet applied):'
          code: |
            POST /api/firewall/rules
            { "action": "deny", "source_asn": 12345 }
- name: ask_reason
  type: waitForInput
  with:
    message: 'Why should we proceed?'
    # …schema…
```

Extra keys are tolerated. The shape is intentionally loose so producers
(workflows, MCP apps, future sources) and the inbox consumer stay decoupled.

To additionally populate the inbox-history audit feed with a mix of
approved/rejected rows and per-channel badges (and a timed-out row
once the 30s timeout fires), add `--respond`:

```bash
node --import tsx x-pack/platform/plugins/shared/inbox/scripts/demo/seed_inbox_demo.ts --respond
```

For a clean, idempotent re-seed (wipes prior demo workflows + their inbox rows first):

```bash
node --import tsx x-pack/platform/plugins/shared/inbox/scripts/demo/seed_inbox_demo.ts --reset --respond
```

> Note: the **History** audit feed is intentionally _not_ orphan-filtered — it
> retains processed rows even after their parent workflow is deleted (rows from
> deleted workflows render with a "Workflow deleted" badge). Its **filter
> facets** (Channel / Responder dropdowns) are likewise computed space-wide, so
> after a `--reset` both the list and the facet counts may include rows from
> soft-deleted prior runs until those step-exec docs are hard-deleted. Only the
> **Awaiting response** (pending) list drops actions for deleted workflows,
> since those can no longer be acted on.