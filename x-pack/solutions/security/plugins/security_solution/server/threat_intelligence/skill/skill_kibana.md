## Architecture: Routes Are the Canonical Execution Surface

This skill documents public HTTP routes; **execution happens through
`execute_workflow_step` with `kibana-request`**. Business logic lives in
the plugin's shared service modules (`server/services/`) behind those
routes. The same routes are also callable from ECLI, workflow steps, and
3rd party agents — no rework required as new callers appear.

The inline tool list (`threat_intel.search_reports`, etc.) is a
**thin portability wrapper** for agents that can't reach Kibana APIs
natively (Claude, Cursor). They delegate to the same shared services
these routes call. **Inside Kibana, prefer the routes.**

The agent should invoke routes with `execute_workflow_step` using a `kibana-request`
step (`method: POST`, `path: <one of below>`, `body: { ... }`).

## Rich attachments (inline Canvas UI)

Digest answers **must** show the `threat-intel-report-table` Canvas — not a `text`
attachment or markdown table.

**Never** call `attachments.add` with `threat-intel-report-table`,
`threat-intel-mitre-heatmap`, `threat-intel-severity-timeline`, or
`threat-intel-finding-card` — those types are **read-only** in the
`attachments.add` tool and will error. (They are created by skill tools or the
subscription form, not by the generic add tool.)

**Never** use `type: "json"` or `type: "text"` for a digest.

### Report table (digest / search results)

`threat_intel.search_reports` **automatically** stores a `threat-intel-report-table`
attachment when it returns hits. Its `other` result includes a ready-made `renderTag`
string when the table was persisted.

After `search_reports` with `total > 0`, copy `renderTag` **verbatim** onto its own line
(blank lines before and after), then write your prose summary:

```
<render_attachment id="threat-intel-report-table:digest:…" version="1" />
```

Do **not** build the tag yourself unless `renderTag` is missing (then use
`attachmentId` + a `version` field if returned). Do **not** call `attachments.add`
for the report table.

The inline attachment shows a compact report feed; the analyst can click **Open Intelligence
Hub** to expand the canvas flyout with the full filtered dashboard (stats ribbon, threat radar,
timeline, category breakdown, report cards, environment impact) scoped to the same
`search_reports` query, time range, and category/region filters.

### Other attachment types

- `threat-intel-subscription-confirmation` — **only** type the agent may create via
  `attachments.add` (editable subscription form; not read-only).
- `threat-intel-finding-card` — follow `hunt_behavior` `attachment_hints[]`; cards are
  emitted by the hunt flow, not via `attachments.add`.
- `threat-intel-mitre-heatmap` — `threat_intel.coverage_gap` **automatically** stores the
  heatmap when techniques are returned. Copy `renderTag` verbatim (same rules as report table).
  Do **not** call `attachments.add` for the heatmap.

## Orchestration Rules (Kibana)

### For digest queries ("what's new on X this week?")

1. Call `threat_intel.search_reports` (or `POST /api/threat_intelligence/search_reports`) **immediately**
   with `query` = the user's topic, `time_range` = last 7 days unless they specified
   otherwise, `sort_by: "rank"`, `size: 10`. Map ransomware / supply chain topics to
   `categories: ["ransomware", "supply-chain"]` only on the first attempt; retry without
   `categories` if `total` is 0 (see guardrails above).
2. When `total > 0`: copy the `renderTag` from the `search_reports` tool result verbatim
   so the `threat-intel-report-table` Canvas renders (see **Rich attachments**).
3. Optionally call `threat_intel.synthesize_advisory` for a 2–3 paragraph
   executive lede in prose (do not put the lede in a `text` attachment).
4. Optionally `threat-intel-mitre-heatmap` when techniques are present; `threat-intel-severity-timeline` when the window is wider than 7 days.
5. For high/critical hits only, optionally `POST /api/threat_intelligence/hunt_behavior` — do not block
   the digest on hunt/extraction calls.
6. Only when `total` is 0 after both search attempts: offer paste-ingest, feed setup, or
   subscription (subscription flow below).

### For coverage-gap queries ("what's hot that I don't cover?")

1. Call `threat_intel.coverage_gap` (or `POST /api/threat_intelligence/coverage_gap`) with
   the user's time range and any tag/source filters they specified.
2. When `techniques.length > 0`: copy the `renderTag` from the tool result verbatim so the
   `threat-intel-mitre-heatmap` Canvas renders (see **Rich attachments**). Uncovered techniques
   render red; disabled-rule-only techniques render warning.
3. Branch on `coverage_recommendation` per technique:
   - `enable_existing`: recommend enabling the disabled rule(s) in
     `matching_disabled_rule_ids` (Detection Engine bulk-enable) — do
     **not** call `security.create_detection_rule`.
   - `create_rule`: call `POST /api/threat_intelligence/hunt_behavior` on the
     underlying reports, then propose a durable rule via
     `security.create_detection_rule`.
   - `covered`: no action required.

### For subscription requests ("send me a weekly digest of...")

1. Resolve the proposed parameters (locally or via the
   `threat_intel.manage_subscriptions` portability tool with `confirm=false`); the
   resolved shape carries `status: pending_confirmation`.
2. Call `attachments.add` with `type: "threat-intel-subscription-confirmation"` and
   a `data` object containing the proposed parameters from `manage_subscriptions`
   (for example `{ "type": "threat-intel-subscription-confirmation", "data": { "tags": [...], "severity_threshold": "high", ... } }`).
   Do not pass subscription fields only at the top level without `data`. The card is editable inline — the user can adjust
   tags, severity, schedule, delivery, and connector id before Submit.
3. The Submit button posts directly to
   `/api/threat_intelligence/subscriptions/submit` so the agent does
   NOT need to be re-invoked. Only persist directly (POST to the submit
   route from the agent) when acting non-interactively.
4. For listing or removing subscriptions, issue
   `POST /api/threat_intelligence/subscriptions/list` or
   `POST /api/threat_intelligence/subscriptions/delete`.

## Portability Tools (3rd party agents only)

For agents that can't reach Kibana APIs natively, the same surface is
available as Agent Builder tools that delegate to the exact same shared
services these routes call:

- `threat_intel.search_reports`
- `threat_intel.ingest_report`
- `threat_intel.hunt_behavior`
- `threat_intel.hunt_for_threat`
- `threat_intel.coverage_gap`
- `threat_intel.generalize_from_telemetry`
- `threat_intel.manage_subscriptions`
- `threat_intel.hunt_orchestrated` (registry — one-call Tier 1 + Tier 2 hunt)
- `threat_intel.synthesize_advisory` (registry — cross-report advisory synthesis)
- `threat_intel.extract_iocs` (registry)
- `threat_intel.analyse_environment` (registry)

When invoked from inside Kibana, these tools merely re-execute the
service the corresponding route uses. Inside Kibana orchestration, prefer
the routes — the tools exist for portability.
