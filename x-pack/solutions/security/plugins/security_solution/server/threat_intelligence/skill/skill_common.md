## When to Use This Skill

Use this skill when the user:
- Asks for a digest/summary of recent threat intelligence on a topic, actor, or technique class
- Pastes a URL, blog post, vendor advisory, or postmortem and wants it ingested + analyzed
- Wants to subscribe to or manage scheduled threat-intel digests delivered via email/Slack
- Mentions `CISO News`, `threat intel`, `emerging threats`, `CVE in the wild`, `vendor advisory`
- Wants behavioral detection rules generated from a report (NOT just IOC matching)

Do **not** use this skill when:
- The user wants raw alert triage on existing detections (use the `alert-analysis` skill)
- The user wants a hypothesis-driven hunt across their own data (use the `threat-hunting` skill)
- The user is asking about PCI/SOC2/HIPAA compliance (use the `pci-compliance` skill)

## Critical guardrails (digest / topic queries)

Threat intelligence reports live **only** in `.kibana-threat-reports-*`, accessed via
`threat_intel.search_reports` or `POST /api/threat_intelligence/search_reports`. They are **not** in
customer telemetry (`logs-*`, `.alerts-security.*`, CloudTrail, Azure audit, endpoint events).

For digest, advisory, or "what's new on X" questions:

1. **Always call `search_reports` first** — before answering, before suggesting feed setup,
   and before searching any other index. Never claim the database is empty without a
   successful `search_reports` response whose `total` you read.
2. **Never redirect to the `threat-hunting` skill** for digest requests — that skill
   searches the customer's environment, not ingested threat feeds.
3. When `total > 0`, **deliver the digest** (see orchestration below). Do **not** offer
   "configure feeds" or "paste a report" onboarding — those apply only when both search
   attempts below return `total: 0`.
4. If the first search uses `categories[]` and returns `total: 0`, **retry once** with
   the same `query` and `time_range` but **omit `categories`** — most ingested
   reports lack `extracted.categories` until `nl_extraction_behavioral` runs. Only
   after both attempts are zero may you suggest ingestion or subscriptions.
5. Prefer `sort_by: "rank"` and `time_range: { from: "now-7d", to: "now" }` for weekly
   digests; call `threat_intel.synthesize_advisory` (or
   `POST /api/threat_intelligence/synthesize_advisory`) for an executive narrative when `total >= 3`.

## Detection Model

This skill operates across two implemented detection layers:

1. **IOC matching (Layer 1)** — Brittle. Adversaries rotate identifiers cheaply.
   Used for retro correlation only ("we saw this hash 3 days ago in our environment").
2. **Behavioral Detection Engine rules (Layer 2)** — Durable. Constrained by the OS,
   not the adversary. The primary output of `hunt_behavior` →
   `security.create_detection_rule`.

A third layer — long-running ES|QL behavioral detection on streams data via the
`streams` plugin's Query Knowledge Indicators — is described in
`docs/rfcs/0001_streams_layer3_grounded_hypothesis_flow.md` but is **not
implemented in this release**. Do not promise Streams Query KIs to the user
until the cross-team contract in that RFC ships.

The headline claim: **IOC matching is brittle because adversaries rotate
identifiers; behavior is durable because it's constrained by the OS.**

## HTTP Endpoints (Canonical Execution Surface)

All paths are scoped to `/api/threat_intelligence/...`. Each
endpoint is gated by the threat-intelligence Kibana feature privilege
tier listed.

### `POST /api/threat_intelligence/search_reports` (read)
Hybrid semantic + BM25 search over `.kibana-threat-reports-*`. Use as
the entry point for digest / topic queries. Body: `{ query, size?,
source_types?, min_severity?, time_range?, categories?, regions?, sort_by? }`.
Returns `{ total, reports[], ui_hints[] }`.

### `POST /api/threat_intelligence/ingest_report` (write)
Ingest one analyst-paste / ad-hoc URL / vendor advisory into the
threat-reports data stream. Content-fingerprinted — re-pasting the same
content is a no-op. Body: `{ title, body_text, source_name, source_url?,
severity?, language? }`. Returns `{ status: 'ingested' | 'duplicate',
report_id, content_fingerprint, message }`.

### `POST /api/threat_intelligence/hunt_behavior` (read)
Two-step extraction: (1) LLM extracts candidate MITRE ATT&CK technique
IDs with evidence quotes; (2) each candidate is validated against the
canonical Kibana ATT&CK catalog. Returns surviving behaviors enriched
with technique name, tactics, parent-technique metadata, severity, risk
score, a stable `finding_id`, a `proposed_esql_rule` body ready for
handoff to `security.create_detection_rule`, and one
`attachment_hints[]` entry per finding. Body: `{ text, report_id?,
llm_confidence_threshold? }`. Returns 503 when no GenAI connector is
configured — fall back to IOC matching.

### `POST /api/threat_intelligence/hunt_for_threat` (read)
Active forward hunt across the customer environment indices
(`.alerts-security.alerts-*`, `metrics-endpoint.*`,
`logs-vulnerability.*`, `logs-aws.*`, `logs-network_traffic.*`) for a
report's IOCs and ATT&CK technique IDs. Returns the top matching
documents AND an `affected_assets` aggregation (unique hosts + users).
Body: `{ report_id?, iocs?, techniques?, time_range?, size?, max_assets? }`.
Either `report_id` or explicit `iocs[]` / `techniques[]` is required.

### `POST /api/threat_intelligence/hunt_orchestrated` (read)
One-call orchestrated hunt: Tier 1 (`hunt_for_threat`) → Tier 2
(`hunt_behavior`) with the Tier 1 affected-asset + sample-event context
threaded into the Tier 2 LLM prompt for tradecraft-style corroboration.
Tier 2 gating is controlled by `tier2_when`: `"on_hits"` (default —
only when Tier 1 matched), `"always"` (propose rules from the report
text even without current activity, used by digest / advisory flows),
or `"never"` (Tier 1 only). When no GenAI connector is configured the
route degrades gracefully — Tier 1 still runs and the response carries
`tier2_skipped_reason: "no_inference"` so the digest workflow can
produce an IOC-only digest rather than failing. Body: `{ report_id?,
text?, iocs?, techniques?, time_range?, size?, max_assets?,
llm_confidence_threshold?, tier2_when?, max_tier2_sample_events? }`.
Prefer this route over manually chaining `hunt_for_threat` +
`hunt_behavior` when you want both tiers in the same call.

### `POST /api/threat_intelligence/synthesize_advisory` (read/write)
Cross-report advisory synthesis — pulls the top-N reports for a window
(sorted by hunt-feedback-corroborated rank), groups
by threat actor / category / region, and asks the LLM to produce a
2-3 paragraph narrative + recommended-actions list. Optionally
persists into the `.kibana-threat-intel-advisories` companion index
under a deterministic `theme_id` so re-runs over the same input set
can be detected by the UI. Returns a structured `no_inference` status
(not a 503) when no GenAI connector is configured, so the dashboard
can still render the aggregate counts. Body: `{ time_range,
categories?, regions?, min_severity?, max_reports?, description?,
persist? }`. Prefer this over manually chaining `search_reports` +
ad-hoc summarisation when an analyst asks for a "weekly threat
advisory" or a "what's been happening" digest beyond the per-source
bullet list a subscription produces.

### `POST /api/threat_intelligence/coverage_gap` (read)
Join in-the-wild ATT&CK techniques in `.kibana-threat-reports-*` against
Detection Engine rules (enabled and disabled). Each technique row includes
`coverage_recommendation`: `covered` (enabled rule exists),
`enable_existing` (disabled rule(s) — enable via bulk-enable, do not
duplicate), or `create_rule` (no matching rule). The `attachment_hint`
payload renders as `threat-intel-mitre-heatmap` with `mode: "coverage"`.
Body: `{ time_range, tags?, source_types?, min_severity?, max_techniques? }`.
Returns `{ …, ui_hints[] }`.

### `POST /api/threat_intelligence/generalize_from_telemetry` (write)
Phase C — closes the brittle-alert → durable-behavioral-rule loop.
Pre-fetched alert samples in, validated behaviors out (same shape as
`hunt_behavior`); a synthetic `source.type: 'telemetry'` row is
persisted to the threat-reports data stream so the same finding shows up
in `coverage_gap` / `search_reports` / the dashboard. Body: `{ question,
alerts: [{ alert_id, rule_name?, technique_ids?, summary }],
llm_confidence_threshold?, persist_synthetic_report? }`.
Returns 503 when no GenAI connector is configured.

### `POST /api/threat_intelligence/extract_iocs` (read)
Fast regex-based IOC extraction (hashes, IPs, domains, URLs). No LLM.
Body: `{ text, defang? }`. Returns `{ count, iocs[], ioc_set_hash }`.

### `POST /api/threat_intelligence/analyse_environment` (read)
Coarse environment profile (active integration data streams + OS family
mix + cloud-provider mix). Call before recommending which threat-intel
sources to enable. Body: `{ lookback_days?, index_patterns? }`.

### Subscription routes
- `POST /api/threat_intelligence/subscriptions/submit` (write) — persist a fully-formed subscription. Body: `{ tags, severity_threshold, schedule_rrule, delivery: { type, target, connector_id? }, template_id? }`.
- `POST /api/threat_intelligence/subscriptions/list` (read) — list active subscriptions visible from the current space. Body: `{ size? }`.
- `POST /api/threat_intelligence/subscriptions/delete` (write) — remove a subscription by id. Body: `{ subscription_id }`.

## Other Tools the Skill Coordinates With

- `security.create_detection_rule` — AI-driven Detection Engine rule
  creation (gated behind `aiRuleCreationEnabled`).
- `security.security_labs_search` — search Elastic Security Labs publications.
- `platform.core.cases` — open cases for critical findings.

## Orchestration Rules (shared)

### For analyst paste ("here's a Mandiant blog, what should we do?")

1. Issue `POST /api/threat_intelligence/ingest_report` with the pasted text and source name.
2. Issue `POST /api/threat_intelligence/hunt_behavior` against the same text using the
   returned `report_id` for provenance.
3. For each entry in the response's `attachment_hints[]` (one per
   surviving behavior), emit a `threat-intel-finding-card` per the hint payload.
   The hint's `payload_partial` is already complete except for
   `report_title` and `report_source_name` — fill those in from the
   prior ingest / search response before emitting. Each card surfaces
   three action buttons: **Deploy** (copies the ES|QL body and opens the
   Detection Engine rule create page), **Dismiss** (client-side hide),
   and **Investigate** (opens a pre-populated Case).
4. Additionally, when `security.create_detection_rule` is available
   (`aiRuleCreationEnabled` experimental flag on), call it for the
   highest-confidence behavior with `user_query` describing the technique
   + evidence quote and `behavior.proposed_esql_rule` as the canonical
   query body, and render the resulting rule attachment alongside the
   finding cards. If the tool returns "not available", do nothing extra
   — the finding cards already let the analyst deploy via the UI.

### For environment-impact questions ("are we affected by this advisory?")

1. Optionally issue `POST /api/threat_intelligence/ingest_report` first if the
   advisory was pasted by the user; otherwise pick the relevant
   `report_id` via `POST /api/threat_intelligence/search_reports`.
2. Issue `POST /api/threat_intelligence/hunt_for_threat` with that `report_id`
   (or explicit `iocs[]` / `techniques[]` when the report has not been
   extracted yet). The route returns top matching documents and an
   `affected_assets` block (unique hosts + users).
3. Summarize the result in chat: counts per index, top affected hosts/users,
   and a recommended next step (open a case via `platform.core.cases`
   when any host is matched in `.alerts-security.alerts-*`).

### For alert-generalization requests ("generalize this alert")

1. Call `security.alerts` to pull 3-10 recent samples of the alert
   pattern the user is asking about. Filter on
   `kibana.alert.rule.name` and/or a shared technique id when known.
2. For each alert, compose a one-paragraph `summary` of the relevant
   ECS fields (`host.name`, `process.name`, `process.command_line`,
   `file.hash.sha256`, `source.ip`, ...). Skip noisy fields that
   don't help characterize the behavior.
3. Issue `POST /api/threat_intelligence/generalize_from_telemetry` with the
   user's analyst question and the alert samples. The route persists a
   synthetic `.kibana-threat-reports-*` row and returns the same
   `behaviors` + `attachment_hints` shape as
   `POST /api/threat_intelligence/hunt_behavior`.
4. Emit one `threat-intel-finding-card` per surviving behavior (the
   hints already carry `report_title` / `report_source_name`). When
   `security.create_detection_rule` is available, call it for the
   highest-confidence behavior with the proposed ES|QL body.

### For Streams-hunt requests ("turn that behavior into a Streams KI")

If the user asks for a long-running Streams hunt, materialization of a
behavior into a Query KI, or anything that would land as a Streams-side
detection, respond that the cross-team Streams Query KI contract is not yet
implemented and point at `docs/rfcs/0001_streams_layer3_grounded_hypothesis_flow.md`.
Continue serving the behavioral path through Layer 2
(`POST /api/threat_intelligence/hunt_behavior` → `security.create_detection_rule`)
which is fully functional today.

### For critical findings

If `POST /api/threat_intelligence/hunt_behavior` reports any behavior with
`severity: critical` AND the source report mentions an active campaign,
open a case via `platform.core.cases` so the user has a tracking
artifact regardless of whether the rule was created or queued.

## Discoverability phrasings (do not require, just recognize)

The user may surface this skill with any of:
- "threat intel on Volt Typhoon"
- "CISO News digest"
- "what vendor advisories cover the XZ backdoor"
- "this Mandiant blog describes a new technique — build a detection"
- "incident postmortem to durable rule"
- "hunt for the behavior class behind these IOCs"
- "generalize this alert"
- "this alert keeps firing on rotating hashes — make a durable rule"
