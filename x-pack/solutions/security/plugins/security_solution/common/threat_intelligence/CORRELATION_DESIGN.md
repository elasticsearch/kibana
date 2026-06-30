**Mustard → IntelligenceHub**

Threat Correlation Integration Design

*v3 — Phase 0 cleared, ready for Phase 1*

Author: Seth (isaac.goodwin@elastic.co)Status: Draft v3 · 2026-06-02

# **Contents**

**1\.   Executive summary**

**2\.   Background**

2.1   IntelligenceHub today

2.2   Mustard today

2.3   Naming and tradecraft framing

2.4   Where they already agree

**3\.   Architectural fit analysis**

3.1   Diamond extraction is enrichment, not a new pipeline

3.2   Correlation is a new top-level service

3.3   Per-vertex retrieval: four parallel msearch, not RRF

3.4   Cluster-first findings shape

**4\.   Pipeline architecture**

4.1   Stage diagram

4.2   Stage detail

**5\.   Schema additions**

5.1   Index template v14 — diamond and source-snapshot fields

5.2   CorrelationFindings (cluster-first)

5.3   ClusterDeepSynthesis

**6\.   Module-by-module mapping**

**7\.   Phased implementation plan**

        Phase 1 — Schema \+ ingest \+ backfill

        Phase 2 — Retrieval surfaces

        Phase 3 — Clustering \+ triage \+ synthesis \+ deep synthesis

        Phase 4 — Discovery \+ scout workflow steps

        Phase 5 — UI surfaces \+ reactive hint warming

        Phase 6 — Evals, baseline, comparison

        Phase 7 — Deferred work

**8\.   Privilege and connector model**

8.1   Privilege tier

8.2   Connector pair

**9\.   Operational concerns**

9.1   Backfill safety

9.2   Cost tracking

9.3   Concurrency and rate-limiting

9.4   Error handling

9.5   Persistence model for CorrelationFindings

9.6   Sunset of standalone Mustard

**10\.  Risks and open items**

**11\.  Appendix**

11.1   File index — IntelligenceHub (target)

11.2   Suggested new files (this work)

11.3   Mustard (source)

11.4   Decisions log (resolved during design Q\&A)

# **1\. Executive summary**

Mustard is a Python threat-correlation tool that extracts the four vertices of the Diamond Model (adversary, capability, infrastructure, victim) from CTI reports, embeds each vertex independently via Jina v5 small, and uses per-vertex semantic search plus a multi-stage LLM triage/synthesis loop to surface evidence linking a new observation to indexed reports. IntelligenceHub is a Kibana plugin embedded in the security\_solution fork that already does threat-report ingestion (workflow framework with pluggable adapters), hybrid retrieval over .kibana-threat-reports-\*, advisory synthesis via @kbn/inference-plugin, and dashboard surfacing of digests, MITRE coverage, and subscriptions.

This document is a selective port of Mustard's differentiator into IntelligenceHub's service / route / workflow scaffolding, plus retirement of the components Mustard duplicates that IntelligenceHub already handles. The port adds five new server services, two new workflow steps, ten new index-template fields, one new privilege tier, two new connector references, and one new UI panel. No new index patterns, no new plugin packages, no new abstractions invented — every addition follows an existing IntelHub pattern.

*Tradecraft framing: the system produces correlation and evidence, not attribution. The analyst is the only party who attributes. Naming, schemas, and prompts throughout this document reflect that: services are named* correlate\_\* *not* attribute\_\**, output schemas surface supporting evidence AND counter-evidence per candidate, and prompts explicitly forbid attribution conclusions.*

Single-call Diamond extraction with graceful per-vertex fallback on context overflow; explicit Jina v5 small (configurable) on the diamond semantic\_text fields; msearch \+ client-side reducer for per-vertex retrieval (preserving the operator-visible per-vertex score table); cluster-first findings shape that groups same-intrusion reports across vendors; analyst-triggered deep synthesis to pull cluster supporters when the lead's evidence isn't enough. The Phase 6 acceptance gate is no recall@5 regression beyond 5% versus the existing Python Mustard baseline, no MRR regression beyond 0.05, same-intrusion clustering ≥80%, and deep-synthesis false-positive rate on unique\_to\_supporting claims ≤10%.

# **2\. Background**

## **2.1 IntelligenceHub today**

Location in the fork:

x-pack/solutions/security/plugins/security\_solution/{server,common,public}/threat\_intelligence/

The plugin is built on six structural patterns:

* **Services:** stateless async functions in server/threat\_intelligence/services/. Signature is (esClient, logger, spaceId, params) → Result. No classes. LLM-using services additionally accept a ScopedModel from @kbn/agent-builder-server.

* **LLM transport:** @kbn/inference-plugin via inference.getChatModel({ request, connectorId }) → chatModel.withStructuredOutput(zodSchema).invoke(prompt). Connector defaults to the genAi:defaultAIConnector advanced setting.

* **Search:** raw esClient.search() with the retrievers DSL. search\_reports already uses RRF over a BM25 \+ semantic-field hybrid. Per-space filtering is appended inline to every bool.filter.

* **Routes:** router.versioned with @kbn/config-schema for request validation, gated by THREAT\_INTELLIGENCE\_API\_PRIVILEGES.

* **Workflows:** @kbn/workflows-extensions step framework. Existing fetch\_source step dispatches to RSS / STIX / TAXII / vendor\_api / email / manual / telemetry adapters; downstream enrichment steps (notably nl\_extraction\_behavioral) run LLM-driven extraction, classification, and persistence.

* **Indices:** .kibana-threat-reports-\* data stream (currently template v13), plus companions .kibana-threat-intel-{sources,subscriptions,digests,indicators,advisories}. All declared with dynamic: 'strict'; field additions require a versioned template bump.

* **Surfaces:** Intelligence Hub dashboard panel at public/threat\_intelligence/modules/intelligence\_hub/; Agent Builder tool wrappers for every service in public/agent\_builder/attachment\_types/threat\_intelligence/; case integration through attachment-save flow from inside Agent Builder.

## **2.2 Mustard today**

Mustard is a single-repo Python tool (one entrypoint mustard.py plus \~12 modules). The pipeline runs in 8 stages: load source text → extract Diamond vertices via LLM → per-vertex kNN against indexed corpus → compact / dedup candidates → Sonnet triage to pick 6–12 → confidence-floor at 0.65 → bulk-fetch full reports → Opus synthesis with REPL follow-up. Around it sit four ancillary surfaces:

* Discovery: discover.py scans CTI aggregators, accumulates sighting counts in vendors.csv, asks an LLM to KEEP / IGNORE candidate domains.

* Scout: scout.py crawls vetted vendor blogs / RSS, runs heuristic \+ Anthropic classifier, appends winners to mustard-urls.csv.

* Ingest: ingest.py / mustard\_ingest.py call extract\_vertices() per report, index to mustard-intel, rely on a custom Elasticsearch ingest pipeline for embeddings via Jina v5 small.

* Bot: bot/mustard\_bot.py is a Slack Socket-Mode bot that proxies @mustard mentions to a Kibana Agent Builder agent. Currently single-user, no production usage.

Evals (eval.py, eval\_queries.py, generate\_synthetic.py, qrels.json) produce Recall@k / MRR over hand-curated ground-truth campaign matches.

## **2.3 Naming and tradecraft framing**

Mustard's pipeline produces what the standalone tool calls an "attribution verdict." That phrasing is tradecraft-incorrect for an automated system. Attribution is an analytic-confidence claim that a specific actor or group is responsible for an observed activity — a judgment an analyst makes, after weighing evidence the system surfaces.

Naming and schemas throughout this document reflect this:

| Mustard term | IntelHub term | Why |
| :---- | :---- | :---- |
| attribution | correlation | we surface degree of correlation between observation and reports, not attribution of responsibility |
| attribute\_threat / verdict | correlate\_threat / CorrelationFindings | function name and output schema reflect "evidence, not conclusion" |
| judge stage | synthesize\_correlations stage | parallels existing synthesize\_advisory naming; removes courtroom framing |
| confidence verdict per candidate | supporting\_evidence \+ counter\_evidence per candidate | evidence is presented in both directions; the analyst weighs them |
| "ATTRIBUTED: APT29" | "Strongest correlation: REF3864 (4 anchor hits, capability 0.87)" | BLUF describes evidence strength, not actor identity |

Domain terms that stay: Diamond Model, vertices, triage, IOCs, TTPs. None of these carry the attribution sense.

## **2.4 Where they already agree**

Several Mustard components are direct duplicates of capability that already exists in IntelligenceHub. Recognising this prevents porting code that should be deleted:

| Mustard component | IntelHub equivalent already in place |
| :---- | :---- |
| scout.py vendor blog fetching \+ classification | fetch\_source workflow step with RSS, STIX, TAXII, vendor\_api, email, manual, telemetry adapters under server/threat\_intelligence/adapters/ |
| ingest.py document indexing | .kibana-threat-reports-\* data stream plus nl\_extraction\_behavioral step that already runs LLM enrichment, severity scoring, IOC extraction, category/region tagging |
| Anthropic SDK \+ LiteLLM \+ ES inference triplet | @kbn/inference-plugin abstraction with structured-output zod schemas and connector-pluggable providers |
| mustard-urls.csv | .kibana-threat-intel-sources companion index seeded by seed\_default\_sources.ts |
| bot/mustard\_bot.py Slack proxy | Agent Builder tool registry \+ Connectors v2 (Slack/email) — no production Slack usage to preserve |
| extracted.ioc\_set\_hash (per-report) | Already written at ingest as part of Workflow 2 cross-report correlation pass. Mustard reads, does not write. |
| provenance.related\_reports (cross-report links) | Already populated by Workflow 2\. Mustard uses for clustering. |

# **3\. Architectural fit analysis**

## **3.1 Diamond extraction is enrichment, not a new pipeline**

Mustard runs its own ingestion pipeline because no equivalent existed standalone. Inside IntelligenceHub the report ingestion pipeline already runs an LLM enrichment step (nl\_extraction\_behavioral) producing severity, categories, regions, IOCs, and a relevance score. Diamond-vertex extraction is the same kind of LLM-driven enrichment over the same report text — it lives as one more step in that pipeline, writing to extracted.diamond.{adversary,capability,infrastructure,victim}.{signal,summary} fields, with embeddings produced automatically by semantic\_text on the summary fields.

No separate "mustard-intel" index. New reports get Diamond fields automatically; existing reports get filled by a one-shot backfill task (Task Manager pattern, mirrors ioc\_indicator\_sync.ts) gated by a dialog-driven cost/time confirmation.

## **3.2 Correlation is a new top-level service**

synthesize\_advisory.ts produces a many-to-one narrative (compress N reports into one executive summary). Mustard's judge pass is one-to-many (given a single new observation, find the reports it correlates with). These are distinct domain capabilities. Following the existing convention — one service per domain action — the right shape is a new correlate\_threat orchestrator that internally calls extract\_anchors, search\_by\_anchors, extract\_diamond, search\_by\_diamond, audit\_keyword\_coverage, cluster\_candidates, triage\_diamond\_candidates, and synthesize\_correlations. Each sub-service is independently testable; the orchestrator is thin.

## **3.3 Per-vertex retrieval: four parallel msearch, not RRF**

The idiomatic Elasticsearch shape for four-retriever fusion is one search call with four standard retrievers wrapped in retriever.rrf. Mustard's today runs four separate queries client-side and reduces them into a per-vertex score table — the column-per-vertex grid an operator reads to debug "why did this candidate get picked?"

RRF fuses the four into a single score per doc and does not surface per-retriever scores in the response by default. You can ask for explain: true and dig per-retriever rank info out of \_explanation, but it isn't a clean replacement for the operator-visible debug table.

*Decision: keep* msearch *\+ client-side reducer. The four-call pattern preserves the per-vertex debug view that operators rely on, costs one ES round-trip in wall time (four queries in parallel), and the client-side reducer is the literal mechanical port of Mustard's* compact\_output()*. RRF stays available as a Phase 6 optimization candidate only if eval shows the four-call pattern is the bottleneck.*

Score scale shifts under semantic\_text. ES's dense semantic query is a knn under the hood and returns (cosine\_similarity \+ 1\) / 2 — non-negative — rather than raw cosine. Where Mustard shows 0.85 against Jina v5 today, semantic\_text shows \~0.925 for the same retrieval. Same ordering; different absolute number. Confidence-floor calibration and UI score display recalibrate to the new scale, per-endpoint (sparse ELSER scores are dot-products, not bounded in \[0,1\]).

## **3.4 Cluster-first findings shape**

Empirical observation from prior Mustard usage: a meaningful fraction of not\_synthesized candidates were reports by other vendors describing the same intrusion as a synthesized lead. Surfacing them as a flat ranked list under-represents the cross-vendor consensus signal.

CorrelationFindings groups candidates into clusters before synthesis. Cluster identity is structural (factual, not interpretive): shared IOCs, exact ioc\_set\_hash match, shared threat actors, shared MITRE techniques, and edges in provenance.related\_reports. Per cluster, the highest-admiralty / highest-score report becomes the lead and goes through synthesis; the rest become cluster\_supporting with their score components preserved. The synthesis prompt is told which supporting reports exist in cluster context (without sending their full text) so the model can reason about cross-vendor consensus token-cheaply.

Analyst-triggered deep\_synthesize\_cluster expands a single cluster by sending all supporting reports as inputs, returning what details exist only in supporting reports, where vendors diverge, and what changed versus the initial finding.

# **4\. Pipeline architecture**

The correlation request flow is implemented as a thin orchestrator (correlate\_threat.ts) that fans work out to independently testable services. Stages run sequentially where ordered by data dependency and in parallel where independent.

## **4.1 Stage diagram**

## ![Pipeline stages: parallel anchor and diamond branches fan into a merge, then sequential clustering, triage, and synthesis stages producing CorrelationFindings. Optional analyst-triggered deep\_synthesize\_cluster path shown separately.][image1] **4.2 Stage detail**

| Stage | Service | Input | Output / notes |
| :---- | :---- | :---- | :---- |
| 1\. Load input | (inline in orchestrator) | text | url | report\_id | case\_id | case\_id branch pulls case.title \+ description \+ comments (free text → diamond) AND attached alert IOCs \+ MITRE refs (structured → anchors). Both feed downstream. |
| 1a. Extract anchors | extract\_anchors.ts | observation text \+ (for case) structured alert fields | { iocs\[\], ttps\[\], actors\[\], families\[\] } via regex \+ pattern match; no LLM. |
| 1b. Search by anchors | search\_by\_anchors.ts | extracted anchors | AnchorHit\[\] from one ES query against extracted.iocs.value / .ttps.techniques / .threat\_actors. Includes a cheap ioc\_set\_hash term query for incidental dedup (rarely hits, but free). Runs in parallel with stage 2\. |
| 2\. Extract Diamond | extract\_diamond.ts (cascade) | observation text | Single-call structured output → 4 vertex {signal, summary} pairs. Failure → per-vertex fallback. extraction\_mode \+ model\_id stamped on result. |
| 3\. Search by Diamond | search\_by\_diamond.ts | Diamond dict from stage 2 | 4 msearch queries (one semantic per non-NONE vertex field), client-side reducer → per-vertex score table. |
| 3a. Merge | (inline) | anchor\_hits \+ knn\_hits | Candidate\[\] with origin\[\] tags (ioc\_hit, knn\_cap, etc.) and match\_evidence. |
| 4\. Keyword gap-fill | audit\_keyword\_coverage.ts | observation \+ merged candidates | LLM identifies under-represented tokens, fires match\_phrase against content.body\_text\_bm25, adds new candidates with origin: keyword\_boost. |
| 5\. Cluster | cluster\_candidates.ts | augmented candidate pool | Graph build over shared IOCs \+ ioc\_set\_hash \+ actors \+ techniques \+ related\_reports edges. Connected components \= clusters. |
| 6\. Triage | triage\_diamond\_candidates.ts | clustered candidates | LLM picks 6–12 across clusters; cluster labels emitted for operator UI but not passed to synthesis. |
| 6a. Cluster collapse | (inline in orchestrator) | triage picks | Per cluster: pick lead by (admiralty desc, score desc). Demote other cluster members to cluster\_supporting. |
| 7\. Synthesize | synthesize\_correlations.ts | cluster leads \+ observation | Structured output → CorrelationFindings. Prompt receives per-lead cluster\_members\_not\_provided list for cross-vendor consensus reasoning. |
| 8\. Deep synthesize (optional) | deep\_synthesize\_cluster.ts | cluster\_id from prior CorrelationFindings | Sends lead \+ all supporters as input; structured output → ClusterDeepSynthesis with unique\_to\_supporting / divergent\_evidence / diff\_from\_initial. |

# **5\. Schema additions**

## **5.1 Index template v14 — diamond and source-snapshot fields**

Bumps .kibana-threat-reports-\* template from v13 → v14. Mapping is dynamic: 'strict' so every field must be declared.

extracted.diamond.adversary.signal        keyword                       // HIGH | PARTIAL | NONE  
extracted.diamond.adversary.summary       semantic\_text                 // inference\_id: .jina-embeddings-v5-text-small  
extracted.diamond.capability.signal       keyword  
extracted.diamond.capability.summary      semantic\_text                 // (same)  
extracted.diamond.infrastructure.signal   keyword  
extracted.diamond.infrastructure.summary  semantic\_text                 // (same)  
extracted.diamond.victim.signal           keyword  
extracted.diamond.victim.summary          semantic\_text                 // (same)  
extracted.diamond.signal\_count            integer                       // 0..4 non-NONE vertices  
extracted.diamond.model\_id                keyword                       // which connector's model extracted these vertices  
extracted.diamond.extracted\_at            date  
extracted.diamond.extraction\_mode         keyword                       // 'single\_call' | 'per\_vertex\_fallback'

source.admiralty\_rating                   keyword                       // A1..D1, snapshot at ingest  
source.tier                               integer                       // 1|2|3, snapshot at ingest

Snapshot semantics: source.admiralty\_rating and source.tier are copied from the source doc in .kibana-threat-intel-sources at ingest and never updated. Source-doc changes affect only future reports. Drift is intentional; if a one-shot recompute is needed, run a Task Manager job — not the default.

Embedding endpoint is explicit (.jina-embeddings-v5-text-small) rather than inherited from cluster default. Justified by empirical performance under the existing standalone Mustard. Configurable via threatIntelligence:diamondInferenceId advanced setting; swap requires reindex via the backfill task with force\_reextract: true. Plugin start performs a startup check that the configured endpoint exists in the cluster; absent endpoint → fail loudly with remediation message.

## **5.2 CorrelationFindings (cluster-first)**

type CorrelationFindings \= {  
  summary: {  
    headline: string;                       // descriptive of evidence strength, not actor identity  
    strongest\_correlation?: { cluster\_id, strength };  
  };  
  clusters: Array\<{  
    cluster\_id: string;  
    cluster\_label: string;                  // derived from lead's content.title  
    correlation\_strength: 'strong' | 'moderate' | 'weak';  
    cluster\_evidence: {                     // factual, why these are grouped  
      shared\_iocs:        Array\<{ type, value, present\_in\_count }\>;  
      shared\_actors:      string\[\];  
      shared\_techniques:  string\[\];  
      ioc\_set\_hash\_match: boolean;  
      related\_reports\_edges: number;  
    };  
    lead: SynthesizedCandidate;             // full supporting/counter evidence  
    supporting: NotSynthesizedCandidate\[\];  // cluster members not synthesized (token budget)  
  }\>;  
  unclustered: NotSynthesizedCandidate\[\];   // candidates that didn't join any cluster  
  analyst\_notes:        string;             // narrative; describes what data shows, not what it means  
  suggested\_next\_steps: string\[\];           // investigative actions, not conclusions  
  trace: { stages: \[{ name, ms, in\_tokens, out\_tokens, est\_usd }\], totals: { ms, in\_tokens, out\_tokens, est\_usd } };  
};

type SynthesizedCandidate \= {  
  doc\_id: string;  
  origin: Array\<'ioc\_hit'|'ttp\_hit'|'actor\_hit'|'set\_hash\_hit'|'knn\_adv'|'knn\_cap'|'knn\_inf'|'knn\_vic'|'keyword\_boost'\>;  
  score\_components: {  
    anchor\_match\_count: number;  
    vertex\_scores: Record\<'adversary'|'capability'|'infrastructure'|'victim', number\>;  
    keyword\_boost\_hit: boolean;  
  };  
  supporting\_evidence: Array\<{ type, details, strength\_note? }\>;  
  counter\_evidence:    Array\<{ type, details, strength\_note? }\>;  
};

type NotSynthesizedCandidate \= {  
  doc\_id;  
  origin;  
  score\_components;  
  correlation\_strength: 'not\_synthesized';  
  reason: 'token\_budget' | 'cluster\_demoted';  
};

*Confidence floor is a context-budget mechanic, not a quality threshold.* max\_candidates \= (synthesis\_model\_context − prompt\_overhead − response\_budget − safety\_margin) / avg\_report\_tokens*. Floor \= score of the candidate at rank* (max\_candidates \+ 1\) *after triage. Operators do not tune the floor; switching synthesis models implicitly sets it.* NotSynthesizedCandidate *carries the explicit* reason *— "not included in synthesis (token budget)", not "rejected".*

## **5.3 ClusterDeepSynthesis**

type ClusterDeepSynthesis \= {  
  cluster\_id: string;  
  cluster\_label: string;  
  included\_reports: Array\<{ doc\_id, title, vendor, admiralty, role: 'lead'|'supporting' }\>;

  consensus\_evidence: Array\<{ type, details, vendors\_agreeing: string\[\] }\>;  
  divergent\_evidence: Array\<{ type, details, positions: Array\<{ vendor, claim }\> }\>;  
  unique\_to\_supporting: Array\<{               // load-bearing field — the value of escalating  
    detail:            string;  
    source\_doc\_id:     string;  
    vendor:            string;  
    significance\_note: string;  
  }\>;

  expanded\_supporting\_evidence: SupportingEvidence\[\];  
  expanded\_counter\_evidence:    CounterEvidence\[\];  
  diff\_from\_initial: string;                  // what should the analyst update vs initial finding  
  analyst\_notes:     string;  
  suggested\_next\_steps: string\[\];  
  trace: { ... };  
};

unique\_to\_supporting is the deep-synthesis value proposition: surface details that exist only in supporting reports, not in the lead. divergent\_evidence captures cross-vendor disagreement — analyst-actionable signal. diff\_from\_initial tells the analyst what changed versus the first pass so they don't have to diff the docs themselves.

Synthesis prompt for deep mode adds explicit do-not-invent guardrails — pressed for "what's unique" or "what's contradicted," models will confabulate without explicit permission to say "none found."

# **6\. Module-by-module mapping**

Maps every Mustard production module to a target in IntelligenceHub. Mode: Port (faithful rewrite), Consolidate (absorbed into an existing IntelHub primitive), Drop (no replacement needed because the duplicate already exists or the function is unnecessary in the new arrangement), Keep (stays in Python out-of-tree).

| Mustard module | Target in IntelligenceHub | Mode | Note |
| :---- | :---- | :---- | :---- |
| mustard.py (8-stage orchestrator) | server/.../services/correlate\_threat.ts \+ routes/correlate\_threat.ts | Port | Thin orchestrator. Fans out to anchor \+ diamond services in parallel; merges and continues. |
| judge.py summarize() (Diamond at query time) | server/.../services/extract\_diamond.ts | Port | Single-call structured LLM with graceful per-vertex fallback. Cheap → probe → heavy cascade. |
| judge.py run\_knn() (per-vertex kNN) | server/.../services/search\_by\_diamond.ts | Port | 4 msearch semantic queries, client-side reducer producing per-vertex score table. |
| judge.py compact\_output() | inline reducer in search\_by\_diamond.ts | Consolidate | Same overlap-count \+ max-score ranking used today. |
| judge.py triage\_candidates() (Sonnet) | server/.../services/triage\_diamond\_candidates.ts | Port | Structured output. Cluster labels are operator-facing debug only; synthesis stage is blind to them. |
| judge.py judge\_candidates() (Opus \+ REPL) | server/.../services/synthesize\_correlations.ts | Port | Structured output → CorrelationFindings. REPL replaced by Agent Builder conversation. |
| Mustard stage 4b (keyword gap-fill) | server/.../services/audit\_keyword\_coverage.ts | Port | Post-kNN candidate augmentation: LLM flags under-represented tokens, match\_phrase fires against content.body\_text\_bm25. |
| (new) cross-vendor clustering | server/.../services/cluster\_candidates.ts | New | Structural clustering over IOCs / ioc\_set\_hash / actors / techniques / related\_reports. Connected components \= clusters. |
| (new) post-hoc cluster deep-dive | server/.../services/deep\_synthesize\_cluster.ts | New | Analyst-triggered escalation pulling supporting reports into a second synthesis. Returns unique\_to\_supporting \+ divergent\_evidence \+ diff\_from\_initial. |
| IOC \+ TTP \+ actor pre-search | server/.../services/extract\_anchors.ts \+ search\_by\_anchors.ts | New | Cheap pre-retrieval against existing extracted.\* fields. Runs in parallel with extract\_diamond. |
| Reactive per-indicator hint warming | server/.../services/preheat\_anchor\_hits.ts \+ case attachment listener | New | On case indicator-add, fires search\_by\_anchors; persists hits as case attachment for warm pool at correlation time. |
| ingest.py extract\_vertices() (per-report at ingest) | server/.../workflows/step\_types/extract\_diamond/extract\_diamond\_step.ts | Port | New workflow step running after fetch\_source \+ nl\_extraction\_behavioral. Writes extracted.diamond.\*. |
| ingest.py ingest\_doc() / sync\_pipeline() | (replaced) | Drop | Existing reports data stream \+ semantic\_text on diamond summary fields handles indexing \+ embedding automatically. |
| mustard-intel-pipeline.json (cloud extraction) | (replaced) | Drop | LLM extraction now happens in the workflow step. |
| mustard-embed-pipeline.json (cloud embedding) | (replaced) | Drop | semantic\_text declares the inference endpoint; ES embeds automatically. |
| discover.py (aggregator discovery) | server/.../workflows/step\_types/discover\_sources/discover\_sources\_step.ts | Port | Sightings counter on companion-index source doc; batch LLM KEEP/IGNORE decision. |
| scout.py (per-feed item classification) | server/.../workflows/step\_types/vet\_source\_item/vet\_source\_item\_step.ts | Port | Heuristic \+ LLM classifier between fetch\_source and downstream ingest. |
| scout.py URL fetcher / trafilatura | (reused) | Consolidate | Existing adapters/http\_client.ts \+ adapters/text.ts. |
| scout.py curl\_cffi Cloudflare bypass | adapters/http\_client.ts extension | Port | Fallback fetcher branch, gated by source flag. |
| batch\_scout.py rollups | (replaced) | Drop | Workflow framework already records per-step run results. |
| config.py / config.yaml / .env | (replaced) | Drop | Kibana advanced settings \+ Kibana keystore. |
| utils.py LLM transport \+ caching | (replaced) | Drop | @kbn/inference-plugin replaces complete\_text, triage\_complete, USE\_LITELLM dispatch. |
| utils.py prompts.yaml | (replaced) | Drop | Prompts live as TypeScript const strings co-located with services. Zod schemas describe structured output. |
| utils.py detect\_elastic\_citation() / find\_elastic\_co\_links() | server/.../lib/elastic\_citation.ts | Port | Small pure helpers, also useful for existing ingest pipeline. |
| bot/mustard\_bot.py (Slack) | (dropped) | Drop | No production Slack usage. Agent Builder replaces. |
| eval.py, eval\_queries.py, generate\_synthetic.py | scripts/threat\_intelligence\_eval/ | Keep | Stays Python. Out-of-tree developer tooling. |
| qrels.json, mustard-urls.csv, corpus.csv, vendors.csv | scripts/.../fixtures/ \+ .kibana-threat-intel-sources seeds | Migrate | Vendor CSV → seeded source docs; qrels stays as eval fixture; qrel\_doc\_map.json (URL-keyed) regenerated per corpus. |
| extracted.ioc\_set\_hash (incidental dedup signal) | (read existing field) | Reuse | IntelHub writes this at ingest for its own duplicate-detection. Mustard queries it opportunistically — exact-match is rare in practice (different vendors almost never have identical IOC sets), but the query is a free keyword term and occasionally catches RSS-syndicated re-ingestion. |

# **7\. Phased implementation plan**

Each phase is independently shippable and reviewable; no phase requires the next to function. Pre-implementation audits cleared during design — Phase 1 starts immediately, with the runtime startup check inside Phase 1's plugin bootstrap covering remaining environmental verification.

## **Phase 1 — Schema \+ ingest \+ backfill**

* Bump index template v13 → v14 with extracted.diamond.\* (12 fields) \+ source.admiralty\_rating \+ source.tier.

* Implement extract\_diamond\_step under server/.../workflows/step\_types/extract\_diamond/, wired into the report-ingest workflow definition after nl\_extraction\_behavioral.

* Implement extract\_diamond.ts service with the cheap→probe→heavy cascade. Service is the shared engine for both ingest-time and query-time extraction.

* Implement backfill\_diamond\_fields.ts Task Manager job. Dialog-driven entry: dry\_run returns cost/time estimate \+ run\_id token, confirm uses the token to actually execute. Paginated, rate-limited, resumable. Gated on .manage\_sources privilege.

* Add three advanced settings: threatIntelligence:correlationCheapConnector, threatIntelligence:correlationHeavyConnector (both default to genAi:defaultAIConnector), threatIntelligence:diamondInferenceId (defaults to .jina-embeddings-v5-text-small).

* Plugin start: verify configured diamondInferenceId exists in the cluster; fail loudly with remediation if absent.

* Tests: extraction step with mocked inference; backfill task with mocked corpus; index template versioning verified by existing setup test.

*Done when: new reports show* extracted.diamond.\* *populated; backfill dialog produces accurate estimates; backfill completes without OOM or rate-limit failures across at least a 1000-doc dry corpus.*

## **Phase 2 — Retrieval surfaces**

* Implement extract\_anchors.ts (regex \+ pattern; pure; no I/O).

* Implement search\_by\_anchors.ts. One ES query with bool.should over extracted.iocs.value (nested \+ inner\_hits), extracted.ttps.techniques, extracted.threat\_actors, extracted.ioc\_set\_hash (exact match against hashed input IOC set).

* Implement search\_by\_diamond.ts. 4 msearch semantic queries, client-side reducer producing per-vertex score table \+ overlap count.

* Implement audit\_keyword\_coverage.ts. LLM identifies under-represented tokens in the candidate set, fires match\_phrase against content.body\_text\_bm25, returns additional candidates tagged origin=keyword\_boost.

* Register routes for search\_by\_anchors and search\_by\_diamond. Both gated by THREAT\_INTELLIGENCE\_API\_PRIVILEGES.correlate.

* Tests: unit tests per service with mocked esClient; integration test against seeded test index covering the four anchor surfaces \+ semantic per-vertex retrieval.

## **Phase 3 — Clustering \+ triage \+ synthesis \+ deep synthesis**

* Implement cluster\_candidates.ts. Graph build over (shared\_iocs ≥ N, ioc\_set\_hash exact, ≥1 shared actor, ≥M shared techniques, related\_reports edges). Connected components \= clusters.

* Implement triage\_diamond\_candidates.ts. Structured output emits clusters\[\].label \+ picks\[\] across clusters. Cluster labels are debug-only — they do not flow into synthesis prompts.

* Define CorrelationFindings \+ ClusterDeepSynthesis zod schemas (Phase 3 design artifact).

* Implement synthesize\_correlations.ts. Single LLM call producing CorrelationFindings. Prompt includes (a) explicit instruction to surface supporting AND counter-evidence per candidate, (b) do-not-invent counter-evidence guardrail with explicit permission to say "none found", (c) cluster\_members\_not\_provided block per lead so the model can reason about cross-vendor consensus without paying for full text.

* Implement deep\_synthesize\_cluster.ts. Analyst-triggered. Cost estimator surfaces pre-call estimate. Output schema adds unique\_to\_supporting, divergent\_evidence, diff\_from\_initial.

* Implement correlate\_threat.ts orchestrator. Wires the full pipeline: anchor \+ diamond extraction in parallel → search\_by\_anchors \+ search\_by\_diamond → merge → keyword gap-fill → cluster → triage → cluster\_collapse → synthesize. Route registered with versioned schema validation, gated by .correlate.

* Implement lib/cost\_tracker.ts. withStageTrace wrapper around every LLM call. Captures input/output tokens from inference responses \+ wall time. Pricing table keyed on connector.config.model returns $/M-token. Trace block returned in API response, logged to logger.debug always.

* Register Agent Builder tool wrappers for correlate\_threat, deep\_synthesize\_cluster, search\_by\_anchors, search\_by\_diamond, extract\_diamond.

*Done when:* POST /internal/threat\_intelligence/correlate\_threat *returns a* CorrelationFindings *from raw text, URL,* report\_id*, or* case\_id *input. Deep synthesize is callable on any* cluster\_id *in a prior finding. Cost tracker emits accurate per-stage usage.*

## **Phase 4 — Discovery \+ scout workflow steps**

* Implement discover\_sources\_step.ts and vet\_source\_item\_step.ts as workflow steps.

* Move TECH\_MARKERS, FLUFF\_MARKERS, URL\_SKIP\_RE into common/threat\_intelligence/hub/constants.ts.

* Bump .kibana-threat-intel-sources template (v15-or-later) with tier (integer), admiralty\_rating (keyword), sightings\_count (integer), last\_assessed\_at (date). Companion-index template, not saved-object migration.

* Migrate vendors.csv content to seed\_default\_sources.ts entries; flag candidate vs vendor via type/enabled fields.

* Extend adapters/http\_client.ts with curl-cffi-equivalent fetch fallback (Cloudflare bypass), gated by per-source config flag.

## **Phase 5 — UI surfaces \+ reactive hint warming**

* Implement preheat\_anchor\_hits.ts service \+ case attachment listener registered in plugin start(). On indicator attachment add: fires search\_by\_anchors with new IOC; persists hits as correlation\_hint attachments on the case.

* Build correlation\_report attachment type under public/agent\_builder/attachment\_types/threat\_intelligence/ matching the existing finding\_card / mitre\_heatmap / report\_table pattern. Renders CorrelationFindings as cluster cards with lead's supporting/counter evidence prominent, supporting reports collapsed.

* Build correlation\_deep\_synthesis attachment type for ClusterDeepSynthesis. References parent correlation\_report attachment via attachment.parent\_id.

* Build CorrelationPanel under public/threat\_intelligence/modules/intelligence\_hub/. Scratch-text input \+ "Find correlations" button. Reuses correlation\_report and correlation\_deep\_synthesis attachment renderers.

* Build case-view button "Find correlations with Mustard" that opens the Mustard Agent Builder agent with the case\_id pre-referenced as conversation seed. (Confirm Agent Builder deep-link support during Phase 5 implementation; if absent, button opens the agent and the agent's startup prompt references the case.)

* Build useCorrelateThreat / useDeepSynthesize hooks under public/threat\_intelligence/hooks/.

*Done when: analyst can paste an observation into the Intelligence Hub panel and see a cluster-grouped* CorrelationFindings*; can click "Deep dive" on any cluster; can launch from a case via the case button; finding renders identically in the agent chat and the Intelligence Hub panel because both consume the same attachment type.*

## **Phase 6 — Evals, baseline, comparison**

* **Phase 6 task 0:** run the existing Python Mustard eval (eval.py, eval\_queries.py) against the current corpus. Capture recall@5, recall@10, MRR, plus per-vertex breakdown. This establishes the baseline.

* Stand up scripts/threat\_intelligence\_eval/ (Python, out-of-tree). Generate qrel\_doc\_map.json keyed on source.url (not content.title — multi-language reports share titles).

* Port eval drivers to query the new Kibana plugin (HTTP against correlate\_threat / search\_by\_diamond / search\_by\_anchors).

* Run the TS port against the same corpus \+ same qrels. Compare:

  *   *recall@5 within 5% of Python baseline*

  *   *MRR within 0.05 of Python baseline*

  *   *same-intrusion clustering ≥80% (multi-language pairs should always cluster)*

  *   *deep-synthesis fidelity ≤10% false positives on unique\_to\_supporting claims*

  *   *extract\_diamond cascade escalation rate (decides whether cascade stays default; \<20% good, \>50% drop to heavy-only)*

* If retrieval regresses beyond margin, evaluate keeping Mustard's overlap-count ranking as an opt-in reducer over the four-vertex msearch. Switch to RRF only if eval indicates four-msearch is the actual bottleneck.

## **Phase 7 — Deferred work**

* Synthesis cascade (cheap synthesis model with escalation to heavy). Higher risk than extract cascade because ambiguity is harder to detect than weak retrieval. Defer until extract cascade telemetry informs the design.

  * Subscription integration for correlation alerts (new template \+ digest renderer that calls correlate\_threat). Defer until cost picture supports it.

* Direct from-case action panel inside the case view (vs. the Phase 5 deep-link button). Treat as UX optimisation; the Phase 5 button \+ Agent Builder is the v1 path.

* MCP transport — out of scope for Mustard. Owned at the IntelHub plugin level. When plugin-wide MCP lands, Mustard tools surface automatically through tool-registry inheritance with no Mustard-specific work.

# **8\. Privilege and connector model**

## **8.1 Privilege tier**

Adds a new privilege tier to THREAT\_INTELLIGENCE\_API\_PRIVILEGES for compute-intensive operations. Read-only operations remain on .read.

THREAT\_INTELLIGENCE\_API\_PRIVILEGES.read           // query, list, dashboard — unchanged  
THREAT\_INTELLIGENCE\_API\_PRIVILEGES.correlate      // NEW — compute-bearing LLM operations  
  ↳ correlate\_threat                              // full orchestrator  
  ↳ deep\_synthesize\_cluster                       // cluster escalation  
  ↳ extract\_diamond                               // standalone extraction  
  ↳ synthesize\_correlations                       // standalone synthesis  
  ↳ search\_by\_anchors / search\_by\_diamond         // standalone retrieval (read-equivalent cost, but bundled)

THREAT\_INTELLIGENCE\_API\_PRIVILEGES.manage\_sources // existing — gates source CRUD  
  ↳ backfill\_diamond\_fields                       // bulk recompute task

.correlate inherits .read implicitly (you cannot correlate without reading reports). Backfill stays on .manage\_sources because it's bulk admin compute, not interactive correlation.

## **8.2 Connector pair**

The extract\_diamond cascade needs two connector references. Shared identically across ingest-time and query-time extraction.

threatIntelligence:correlationCheapConnector   // default: genAi:defaultAIConnector  
threatIntelligence:correlationHeavyConnector   // default: genAi:defaultAIConnector  
threatIntelligence:diamondInferenceId          // default: .jina-embeddings-v5-text-small

Stage routing:

| Stage | Connector | Cost role |
| :---- | :---- | :---- |
| extract\_diamond (cheap path) | correlationCheapConnector | Most ingest \+ most query-time extraction |
| extract\_diamond (fallback) | correlationHeavyConnector | Per-vertex re-extraction when single-call fails |
| audit\_keyword\_coverage | correlationCheapConnector | LLM-flagged keyword gap analysis (small input \+ output) |
| triage\_diamond\_candidates | correlationCheapConnector | Input-heavy, output-small — cheap pricing favours this |
| synthesize\_correlations | correlationHeavyConnector | Highest-stakes call; full reports × cluster leads in input |
| deep\_synthesize\_cluster | correlationHeavyConnector | Cluster expansion; even larger input |
| discover.py LLM batch decisions | correlationCheapConnector | Vendor candidate KEEP / IGNORE |
| scout per-item classification | correlationCheapConnector | Per-feed-item KEEP / SKIP |

*Model drift: when a connector is swapped, existing reports were extracted by the old model.* extracted.diamond.model\_id *tracks per-report which connector produced it. The correlation flow logs a warning if ≥80% of candidates have a different* model\_id *than the case-side extraction just ran; operator response is the backfill task with* force\_reextract: true*. Same operational pattern as the embedding-endpoint swap.*

# **9\. Operational concerns**

## **9.1 Backfill safety**

Diamond extraction on a large existing corpus is N × one LLM call. Dialog-driven entry:

Operator invokes backfill  
  → dialog: count selector ("all N reports" / "specific count" / "by source" / "by date range")  
  → backend computes:  
       est\_cost  \= count × avg\_tokens × $/M × (1 \+ cascade\_escalation\_uncertainty)  
       est\_time  \= count × avg\_seconds / parallelism  
       est\_range \= ± 30% confidence interval (escalation rate unknown until measured)  
  → display: "2,500 reports × \~$0.094 avg \= \~$235 (range $165–$305). Estimated \~30 min @ 5 concurrent."  
  → operator confirms → task starts with returned run\_id  
  → operator cancels → no-op

API equivalent:  
  POST /internal/threat\_intelligence/backfill\_diamond { count, dry\_run: true }  
    → 200 OK { run\_id, estimate }  
  POST /internal/threat\_intelligence/backfill\_diamond { run\_id }  
    → 202 Accepted (task started)

Reference points based on current corpus characteristics:  
  \~2,500 reports  (current Python Mustard corpus)  →  \~$235     \~30 min @ 5 concurrent  
  \~20,000 reports (feasible upper bound)            →  \~$1,880  \~4.5 hr @ 5 concurrent  
Per-report cost assumes 80% cheap-path success ($0.05) \+ 20% heavy-path escalation ($0.27).  
Actual numbers will shift once Phase 6 measures real escalation rate.

## **9.2 Cost tracking**

Every LLM call in the pipeline runs through a withStageTrace(stageName, fn) wrapper that captures wall time and reads usage.input\_tokens / usage.output\_tokens from the inference response (Anthropic, OpenAI, and Bedrock connectors all surface these). A pricing table keyed on connector.config.providerConfig.model returns $/M-token in/out. Unknown models return null rather than guessing.

The trace block ships in the CorrelationFindings response, surfaces in the UI as a collapsible "Run trace" section, and is always logged to logger.debug for prod debugging. Pricing table lives in a single TS object reviewable in PRs and bumpable per release.

## **9.3 Concurrency and rate-limiting**

Inherits IntelHub's existing posture — no plugin-level throttling, connector-level limits as the ceiling. Backfill task self-imposes an in-flight cap (matches ioc\_indicator\_sync.ts pattern). All LLM calls flow through lib/inference\_call.ts as a future seam for a rate-limiter if needed. No behavioural change today; one file to edit if customer feedback demands otherwise.

## **9.4 Error handling**

Synthesis is one LLM call producing structured output for N cluster leads. Partial failures (some leads yield valid evidence, others fail schema validation) return best-effort findings with a synthesis\_warnings\[\] field per cluster ("synthesis failed for this cluster, retry?"). UI surfaces a per-cluster retry button. Avoid all-or-nothing.

Diamond extraction failure (cheap call fails, per-vertex fallback also fails) returns a structured error from correlate\_threat — empty CorrelationFindings with an extraction\_error field. Anchor results may still be present and useful; the UI renders them with a "Diamond extraction failed; pure-anchor results below" banner.

## **9.5 Persistence model for CorrelationFindings**

Findings produced from a case context attach naturally to the case as correlation\_report attachments. Findings produced from the standalone Intelligence Hub panel (scratch-text input) discard after session by default, with a "Save to case" button that prompts for case selection. No new saved-object type at v1; promote later only if usage demands it.

Cluster membership is frozen on the attachment so deep\_synthesize\_cluster can resolve cluster\_id → candidate\_ids hours or days later without re-clustering against a moved corpus. Stale findings (case has gained indicators since): surface a "this finding is N hours old, M new indicators since" indicator with a manual "re-run correlation" button. No auto-rerun — cost is real, analyst should drive.

## **9.6 Sunset of standalone Mustard**

Standalone Python Mustard is currently used by a single analyst with no production Slack integration. Informal sunset: decommissioned by the author when the Kibana version reaches functional parity for their workflow. No formal cutover date, no operational handoff required.

# **10\. Risks and open items**

| Risk | Why it matters | Mitigation |
| :---- | :---- | :---- |
| Workflow 2 sparseness (graceful) | Clustering quality benefits from provenance.related\_reports edges but does not require them. Sparse or absent edges \= lower recall on edge cases, not a blocker. | cluster\_candidates treats related\_reports as one signal among many; runtime overlap on shared IOCs / actors / techniques carries clustering even without Workflow 2 input. |
| IOC normalization compatibility | extract\_anchors must produce values that match the keyword storage of extracted.iocs.value. Drift \= per-IOC overlap signal misses. | Phase 2 implementation concern, not pre-implementation audit. Developer writing extract\_anchors.ts reads extract\_iocs.ts and matches conventions. |
| Embedding endpoint availability | Diamond fields declare .jina-embeddings-v5-text-small explicitly. If a deployment lacks the endpoint, indexing fails. | Plugin start verifies endpoint exists; fails with clear remediation message. Advanced setting allows override (threatIntelligence:diamondInferenceId). |
| Backfill cost surprise | Bulk recompute is expensive in opaque ways; operator may not realize scale. | Dialog-driven entry with cost/time estimator and explicit confirm. Two-call API pattern (dry\_run → confirm with run\_id) for API path. |
| Extract cascade economics | Cheap-then-escalate is only a win if escalation rate is low. If most cases escalate, cascade adds wasted cheap calls on top of unavoidable heavy calls. | Phase 6 measures escalation rate. \<20% \= ship cascade default; \>50% \= ship heavy-only; middle ground \= make cascade an opt-in. |
| Synthesis cascade is harder than extract cascade | Detecting synthesis ambiguity is multi-factor and failure modes are user-visible (worse findings). | Deferred to Phase 7\. Extract cascade telemetry informs whether to attempt synthesis cascade later. |
| Score-scale calibration | semantic\_text dense scores ≈ (cosine+1)/2; ELSER scores are dot-products. Confidence-floor and UI display recalibrate per endpoint. | Advanced setting per-deployment \+ reasonable default per endpoint type. Phase 6 eval establishes correct defaults. |
| Multi-language same-intrusion clustering | Multi-language reports about the same intrusion share IOCs but different titles and URLs. | Eval expects them to cluster naturally via shared IOCs \+ related\_reports. Specific eval check: known multi-language pairs always cluster together. |
| Cluster collapse hides vendor perspective | Picking a single lead per cluster demotes other vendors' framing. | Cluster supporting card surfaces "this report's emphasis: capability+infrastructure" derived from supporter's HIGH-rated vertices. Deep synthesis is the explicit path for "show me all of them." |
| Case attachment event API surface | Reactive hint warming requires Cases plugin to expose attachment-change events. If absent, pre-warming can't fire on indicator drop. | Phase 5 implementation concern. Fallback: run search\_by\_anchors live at correlate\_threat time — slightly slower interactive response, no architectural change. |
| Agent Builder context deep-link | Case-view button assumes Agent Builder supports launching with pre-seeded context. May not be available yet. | Phase 5 implementation concern. Fallback: launch the agent with case\_id in URL params; agent's startup prompt picks it up. |

# **11\. Appendix**

## **11.1 File index — IntelligenceHub (target)**

server/threat\_intelligence/services/                    domain capability modules  
server/threat\_intelligence/routes/                      HTTP route registrations  
server/threat\_intelligence/workflows/step\_types/        @kbn/workflows-extensions step defs  
server/threat\_intelligence/adapters/                    source fetch \+ content normalize  
server/threat\_intelligence/setup/                       index templates \+ bootstrap  
server/threat\_intelligence/saved\_objects/               saved object types  
server/threat\_intelligence/tasks/                       Task Manager jobs  
common/threat\_intelligence/                             shared types, constants, hub  
public/threat\_intelligence/modules/intelligence\_hub/    dashboard UI  
public/agent\_builder/attachment\_types/threat\_intelligence/  agent → case attachment renderers

## **11.2 Suggested new files (this work)**

server/.../services/correlate\_threat.ts                 orchestrator  
server/.../services/extract\_diamond.ts                   cascade (cheap → probe → heavy)  
server/.../services/extract\_anchors.ts                   regex/pattern anchor extraction  
server/.../services/search\_by\_anchors.ts                 cheap exact-match retrieval  
server/.../services/search\_by\_diamond.ts                 4 msearch \+ reducer  
server/.../services/audit\_keyword\_coverage.ts            post-kNN gap fill  
server/.../services/cluster\_candidates.ts                structural clustering  
server/.../services/triage\_diamond\_candidates.ts         LLM picks 6–12  
server/.../services/synthesize\_correlations.ts           cluster-lead synthesis → CorrelationFindings  
server/.../services/deep\_synthesize\_cluster.ts           cluster expansion → ClusterDeepSynthesis  
server/.../services/preheat\_anchor\_hits.ts               reactive per-indicator search

server/.../routes/correlate\_threat.ts                    \+ routes for each standalone service

server/.../workflows/step\_types/extract\_diamond/         ingest-time extraction step  
server/.../workflows/step\_types/discover\_sources/        aggregator discovery  
server/.../workflows/step\_types/vet\_source\_item/         heuristic \+ LLM classifier

server/.../tasks/backfill\_diamond\_fields.ts              bulk recompute task

server/.../lib/inference\_call.ts                         shared LLM call wrapper \+ future rate-limit seam  
server/.../lib/cost\_tracker.ts                           withStageTrace \+ pricing table  
server/.../lib/elastic\_citation.ts                       small helpers from Mustard utils.py

common/.../hub/diamond.ts                                vertex types, constants, signal enum  
common/.../hub/correlation.ts                            CorrelationFindings \+ ClusterDeepSynthesis schemas

public/.../modules/intelligence\_hub/components/  
        correlation\_panel.tsx                            "Find correlations" entry  
        correlation\_findings\_view.tsx                    cluster cards \+ supporting evidence  
        cluster\_deep\_dive\_view.tsx                       deep synthesis renderer  
        diamond\_vertex\_card.tsx                          per-vertex signal \+ summary visual  
        per\_vertex\_score\_table.tsx                       debug view (ADV / CAP / INF / VIC grid)

public/agent\_builder/attachment\_types/threat\_intelligence/  
        correlation\_report.tsx                           CorrelationFindings attachment renderer  
        correlation\_deep\_synthesis.tsx                   ClusterDeepSynthesis attachment renderer  
        correlation\_hint.tsx                             reactive per-indicator hint renderer

public/.../hooks/use\_correlate\_threat.ts                 client hook for orchestrator route  
public/.../hooks/use\_deep\_synthesize.ts                  client hook for deep synthesis route

## **11.3 Mustard (source)**

Orchestrator:                  mustard.py  
Diamond \+ retrieval pipeline:  judge.py, ingest.py, mustard\_ingest.py  
Discovery:                     discover.py  
Scout (vendor blog vetting):   scout.py, batch\_scout.py  
LLM transport \+ caching:       utils.py  
Config:                        config.py, config.yaml, .env  
Ingest pipelines (drop):       mustard-intel-pipeline.json, mustard-embed-pipeline.json  
Prompts:                       prompts.yaml  
Slack bot (drop):              bot/mustard\_bot.py  
Evals (keep as Python):        eval.py, eval\_queries.py, generate\_synthetic.py, qrels.json  
Fixtures:                      mustard-urls.csv, vendors.csv, corpus.csv

## **11.4 Decisions log (resolved during design Q\&A)**

* **Embedding endpoint:** .jina-embeddings-v5-text-small confirmed present in target deployment. Explicit default \+ configurable via threatIntelligence:diamondInferenceId.

* **Workflow 2 dependency:** downgraded from "audit required" to "graceful degradation." Cluster service does not require populated provenance.related\_reports edges.

* **ioc\_set\_hash:** downgraded from primary cluster signal to incidental dedup query. Kept because the term query is free; rarely fires in practice.

* **Corpus size:** \~2,500 reports currently in Python Mustard corpus; \~20,000 feasible upper bound. Backfill is operationally cheap at both ends.

* **Case attachment events:** Phase 5 implementation concern, not Phase 0 blocker. Fallback is cold-cache live search at correlate\_threat time.

* **Agent Builder deep-link:** Phase 5 implementation concern. Fallback is URL params \+ startup-prompt context resolution inside the agent.

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAApMAAARACAIAAAA9Dk8RAACAAElEQVR4Xuy9h58UVbr///s7GhUFwZz2urvuurvmsIbVXR3SkHPOSRBRQQVFEUFAoqAESRKVJIoEQYLk3OQoiOi937u7d/def8/M4xwPp7qbZrprquvM+/36vPp16qnnnKru6an3VM8o/99PAAAAEB/+P7cAAAAABQzmBgAAiBOYGwAAIE5gbgAAgDiBuQEAAOIE5gYAAIgTmBsAACBOYG4AAIA4gbkBAADiBOYGAACIE5gbAAAgTmBuAACAOIG5AQAA4gTmBgAAiBOYGyAnEmW4O8JHj/vpp5+6OwqD3F8W57XNfUEAP8DcADnh2CUDWbalZMqUKcHpWgnV3HqIX/3qV+6OLAie8OWiK5hFcl8QwA8wN0BOOHbJQJZtKYmjuXNHj+48awDA3OAb5nJvX/RnzJhhF++8806nv0uXLjoIrtCuXTsp1qhRwy6++uqr9vTExfeFNinrWky3psMrr7xitwki8p/K1pRZpr5ixQqdopsidR3YRUPwKRgy123cDqvH3tRxzZo1f+kLdGao25v2OOVztycqpg7gB5gbvMJcrBcvXnz+/Plq1arZ9enTpx8+fFjHy5Ytc6acO3du7NixduXhhx/++9//PnDgwJdfflk2r732WnuKM103/+///k8HGzdu1PqZM2eCs4QMawbJcM8tHDx4sHbt2naD2bVo0aLdu3ebyoEDB+wGHctrpYOfrNO22zLcc2vDqFGjTpw4oeM5c+bYu+xx9erVg506Tvk66NjZdHale+76TPv372/vAvADzA1eoZfpJUuW2MUFCxbYl+9Bgwbp5g8//GCm2P1asYumYiNGDzZb+39m5MiR9q5s1gySwdwvvfSSvWmPW7Ro4TQ76OGaNGni7rhMc+t42LBhwbnBsdOpAwd7lrNpj4PP3XytHbQNwA8wN3iFXqYrxtzqRbNpxuK5f/zjH2Zz+PDh9iLZrBkkg7nN77ntBmeXqTjI4Y4cOaLjo0eP2qdtzypYcwefO+aGygDmBq8wV+qlS5deuHDhuuuus+szZswwonI+Lf9liYAwfir70PXWW281lRMnTujAbtaBHELG9913n2465j537pxuZlgzyPLly3X64MGDTVErQXsFd5nKwYMHTUUPN336dHuiOW17lmB+C+Cge997772TJ0/qePbs2fYue3zttdcGO3Vsvw5vvfWWPStxOeY2Y/uZmgUB/ABzg2/ohdugxUv+hZrZNBWn6Px1ldlrb27evNlsmj95c8ytZF4zJWPHjnXadJzBXs6fnWvRJli3/1Lvp4sP+sc//vGXtcowew3OLnuc5V+omV0pN+1xyuduNm3MLgAPwNwAUH6y9GKWbQCQDZgbAMpPlkrOsg0AsgFzA0D5yVLJWbYBQDZgboDCQiVn43YUElmeYZZtAJANmBsAACBOYG4AAIA4gbkBAADiBOYGAACIE5gbAAAgTmBugDixatUq82izYMECeSwqKnLquXPu3Lk33ngjWHQql6Rt27ZFpbg7AOAywdwAl026/4l32Oi/CKKPDrVq1XJLeWLo0KEXLlwIFp3KTxlfls8++0wHH3744cV7AOCywdwAl0bU9fnnn584cWL48OHr16/X4sCBA//nf/7HKFPuJv/rv/6rQYMGZtyxY0e9xWzcuLF0mv+BuUH2Hj169MCBA5MnTz579uypU6cWLlzYuXNn3ZVMJmWwZs2a8+fPa3HEiBHm0TmEPsoZ2qc6bNgwaV65cmXv3r3F93Xq1LEO/jP2+oKcv3Tqaj179pRd9l3yyJEjt23bZormnGXsvCz2mj+V3nDL4/Hjx83Z/v3vf9eXbtSoUSdPnnz99de1bqYAQDowN0BW1K1bd8qUKTIoLi7WSsknv6Xopt5x6j/TaXbp3sGDB3fo0EHbbERaOhAjNm/eXPtV8G+//bY8Hj582C7qaubRIJvjxo3bs2ePrmZOVXeJ4LXevXt3HRic9Xfv3q11WUHOR8dmIDRt2tQumnP+KdXLYv+koj3yA0TDhg1NUW/c+/XrJ4f77//+758y3rUDgAFzA1yad95551//+pfcI/773/9WCf3www+7du2Su9vatWtrj9hXKrpX7iDFl/3795f+2bNnnzt3bvr06TK21/ypVJA//vij3JH/VCpFuU+VQ/zzn/+UTblt/alUeDIQ62uxXr165tE+hGzKo4rZPlU9t0GDBunh7H/4UnHWN2qX5yV3zHJL3atXL3Mzbfq1KK+AOWfd9ZP1spg1FXNLrb+hHz169KFDh/RGXJ/+T2F+4A/gGZgbIJ988cUXbsmiSZMmZrxixQprTwUhN7Xff/+9WwWAWIG5AfLAP/7xj4YNG3700UfujvTUr1/fLQEAZAHmBgAAiBOYGwAAIE5gbgAAgDiBuQEAAOIE5gYAAIgTmBsAACBOYG4AAIA4gbkBAADiBOaG/PAgAFwK99sGoFxgbsgD5sJ0/sf/RwhJGeQN+QJzQx7A2YRkE8wNeQFzQ65wt01IluG2G/IC5oZcwdyEZB/MDbmDuSFXMDch2QdzQ+5gbsgVzF1hWbJ8RSKRGDt+YnAXiUswN+QO5oZcwdwVlrybO1FKsE7CC+aG3MHckCuYu8Jim9tId9pHM6tWrbr0sy+0R+vnvv/xyb/85bd33aXFps1bGENrw+/vvrt9x046VoKHI2EEc0PuYG7IFcxdYQmau0/ffrv2HrjqqquMerX+0oCBp86eN0pOaW4zDh6IhBfMDbmDuSFXMHeFJWhurfd5/gVHzDq+plo1HWPuwgnmhtzB3JArmLvCks7cixYvlfHZ73906h/NmiPjA4eOYu7CCeaG3MHckCuYu8KS3tzLEqnM3bJ1Gx23btvOFLUBc0cVzA25g7khVzB3hSV7c9tIUXY5RTX3c32fN5Xg4UgYwdyQO5gbcgVzF1TQcIEHc0PuYG7IFcxdUMHcBR7MDbmDuSFXMDch2QdzQ+5gbsgVzE1I9sHckDuYG3IFcxOSfTA35A7mhlzB3IRkH8wNuYO5IVcwNyHZB3ND7mBuyBXMTUj2wdyQO5gbcgVze5kx48a//c7wYD2qFBUVBYtxDOaG3MHckCsFbm654p84cy5Yl/R7of/c+QuD9WAya6NTp87BYjbJsGwFWDPz0w+aO93ZVsCpng8cvaiUYNsnS5alrBdOMDfkDuaGXCl8cweLWjfI5s49++vWrTtvwSKzSwdifdM2bsL7wXXOpze3TGnbrp0OTKVHz54TJk4ym8FZmgw6bN269aq16+rXr3/63PfnA2e+YfPWhg0bmuaWLVu9PGCgjmXvwk8WN23aVE6gS9eu+qRSnsNbQ4dJ3ZzDe2PHyXNM2Xk+46lKWrZq9Xy/F2SwL3m4VavWcqrvjhqtu+RM+vR93nTK3uf69A2ucP5iT5uTSXc+6eoFEswNuYO5IVcK2dzvDB+h7kwZ+6ZTL/e1atX69vwPMhj13hhxW9du3ey96XJZ5pbH46fP2pspk0GHYu6OHTvJYO36jSX6ss5cxtt37f1i1Zri4uLzZevP/nhe7+ee0019dnoCWd5zS5uuk+5sM5xqyilmtSPHTznF/YeONrB+7AjOsqenXFx37di9N1gvkGBuyB3MDblSyOYe8tbQ9u07BOsax9zKkuUrTOXchf804+B0k8s1t90QnKXJoEMx95drvtJx6Sn/jJy5cyB9lGdhb5pkaW5dPDjdJMOp2lNk/OXqr/QzDFMRznx3wYyV4Dpmqe9++C8dZO7cumNXsF4gwdyQO5gbcqWQzX0+vW8kL708YOacj4NtJ7/9rk3btmK12rXrBPcGk8Hccgept8Km4jQEZ2ky6FA/LddxUSlmV1HZPXc9+5577i/33PY69tMPJu/33GZsF4ePGDlzdsk5pFs83fSiUoJtdmdhBnND7mBuyJX4mlvSpElTbdi9L1m/fn39jayxgjx+/uVqGSxdvkIsfrm/535nxLstW7aSFcw5OCfz4ksvS6Xv8/2CczPo0Db3+cCZb9i8tVGjRmZvixYtxNA6Dr4U5uk70VdAkc13R40u9++55QT69C357fWmLdvq1KnTrl17XWf3/mSrVq3N7yMkHTt2atOm7YHDR50Vpk6fkfJk0p1PunqBBHND7mBuyJUCN3f3Hj1r1aoVrOcx6cydSzLrMF0ikVb5TjWMHD99tri4eOz4CcFdhRPMDbmDuSFXCtzchBRUMDfkDuaGXMHchGQfzA25g7khVzA3IVlGv1ncbyGAywRzQx7A3IRkE7QNeQFzQ37QmwkAyIz7nQNw+WBuyA/u9QkAArjfNgDlAnMD+EnLUtwqAMQfzA3gJ5gbwFcwN4CfYG4AX8HcAH6CuQF8BXMD+AnmBvAVzA3gJ5gbwFcwN4CfYG4AX8HcAH6CuQF8BXMD+AnmBvAVzA3gJ5gbwFcwN4CfYG4AX8HcAH6CuQF8BXMD+AnmBvAVzA3gJ5gbwFcwN4CfYG4AX8HcAH6CuQF8BXP7SfGQehK9dgNA5eSxTlMk7tUB4g/m9hM1t1sFgMoE5vYVzO0nmBsAMLevYG4/wdwAgLl9BXP7CeYGAMztK5jbTzA3AGBuX8HcfoK5AQBz+wrm9hPMDQCY21cwt59gbgDA3L6Cuf0EcwMA5vYVzO0nmBsAMLevYG4/wdwAgLl9BXP7CeYGAMztK5jbTzA3AGBuX8HcfoK5AQBz+wrm9hPMDQCY21cwt59gbgDA3L6Cuf0EcwMA5vaVuJpbzURILnHfVRA31EyE5BL3XRUH4mfu4PWXkFzivsOg4AlefAnJJe47rOCJmbn1UnvozB5C8hLkHUfkUps8/SMh+Urs/B0nc6NtEkYwd7zQi2zw4ktIuYO5QwRzkzCCueMF2iZ5D+YOEcxNwgjmjheYm+Q9mDtEMDcJI5g7XmBukvdg7hDB3CSMYO54gblJ3oO5QwRzkzCCueMF5iZ5D+YOEcxNwgjmjheYm+Q9mDtEMDcJI5g7XmBukvdg7hDB3CSMYO54gblJ3oO5QwRzkzCCueMF5iZ5D+YOEcxdwUmUEqx7FswdL/wz9/vT5sg3mo5fGDjYjCs4+v0erAfbqlatGqxXQC55hrK3Ro2awfolg7lDxCdz50uK+VonZUJdvHCCueNF2ObWt32wfrnJfp0YmXvXkW8v2RNeLnmGu4+ezdyQLpg7RDB3MPlaJ2VCXbxwgrnjhd/mjjDZnPCf7r3/kj3hJZszlIaefV8M1jMHc4dI4Ztb31hC3/69kqd2S6Va9WqJUvlt3LVWBgMG9W/ZtrlpExo0Ke4/8HkZrN+2Siv2OsK6rV8G13/wkQeC62Q4n4S1jm4+W/tvOkjZL+ubzR0HN5u6tr02ZICp/P7u39lz77nvTzpYtmqR6UkUtv4xd7won7nfHDHGvBv79B8olRVffSPjURNKVtuw86CMXx70Zsu2HU2b0KBxc70JXrd1nzzWqtdg6pyL3thrt+zV9W++5RZTfPDhPwfXCZ6S2Zvunts0CA898mct9u73cqLsfLTT9IyeOFV7qlWvboqLVqw1qz3y2BOm7pyGmWLqKeP0vPf+NK0kSp+1aVDMi7Pky6/tenCuvbhinu+99z+oFecM7S+o/em93ZN9MHeIFLi59R0jg2WrPzFjU0+UvL2uCjZL1NzC3E9njps8KrjmX599ypnSq2+34DoZYrc541tvuyVY1/W10qJNUxl3791Z924/sNF0qtSbtWpimp98+nF9FqZH0qVnRx0UZjB3vCiHubclT+obUsZLV22QwTd7j8n4njIrJKyrv+nUqEqFnYe/7fZcP3tZ03nDDTfKYHvylNb1ns9Zx8k115T8TK/jq6++xoxTflreb8AgU1RzDxw8NGkdonnr9mZco0ZN02yK9rhb75ILjhbt07Cb00UanqldT8f6rO+57wHddO50dbWnn6llxlrv3KNPcK4T83zlyySDTt1722smy76gbTt1M/Vra9TQ8ZVXXmmOlX0wd4jEwtw2zq5gs47V3GZX8tQus4Jy2+236hS9FU63jpPgOsEpzthZ3947Y94UGR84ubN+43oyePjRB50eu1nS98XeWhFGjn/HXrbQgrnjRTnMXb9RM/NuVOROTneZiml2Nh2VmltAQ3BKynUy7B0zeboZp7vnNkU1t7PIsNETzNhu1vGU2Qt1rM96+tzFMt534vuUzTpOF2lo0qJNuv79J7/XouG22++Qep8XXzGVd8dNznKuFJu1bme3mXrwC6p1yQ033mTG2Qdzh0jhm/u+B+5JWVee+tuTTlHHjrnr1q9lNrXNmNtuC67jJLhO9uNgZcb8n809ZtJIGVSpUsX0XFvj2pTTNfc/eF/KeuEEc8eLcph7zKSSD2aNrU3EIvq+TZR8ez6rRd00PY657b1m7EwJdgZj723QpIUZO+YWdclAzs0UU5t71HgzNgMz3nv8vI4feewJGXw0Lydz17zuert/7uIvzN46xY2c1dTcJvc/+LA2pJvrPF/9mcZ86q6zSuqlX1B7ZRPTc1nB3CFS4OZu1a7k289Gio2bNUiUCu+lV/vJYOOutdpsej79fJ5j7r3Htpm9ipq7c/cOpmJujk1F1nHOJ7iOPSU4Dq5v7zXmtg9qN9jjdD2FGcwdL8ph7mTZBd2wZvNuLT7w8KPisBdfeUPGG3YelGKXnn1N26IVax1z/+rOX5u9SnB9/Y2vs45zPvKNZPa27dg1UbZOyntu/TBci5c094FTP5TNK+Gqq64yzUFz26ehaHO6OD32RHnW+qfdNmpupxicmyz7s3DFfr6/NJVxyfptd/zKnGGWwdwhUuDmJjEN5o4X5TM3yUt2Ho7yvwq7ZPivwgoRzE3CCOaOF5g72ogaq159dbBeCElYf6p2WcHcIYK5M+eiT44K+wPqggrmjhcxNbfz7RlsIBEGc4cI5iZhBHPHi5iamxRyMHeIYG4SRjB3vMDcJO/B3CGCuUkYwdzxAnOTvAdzhwjmJmEEc8cLzE3yHswdIpibhBHMHS8wN8l7MHeIYG4SRjB3vMDcJO/B3CGCuUkYwdzxAnOTvAdzh4iX5t5+YGOwGGH2H99hxkVFRXa9du3apv7JZ+7/bFVz8PTuydMm2BMLP5g7XhS4uVdt3BEsxjHyXRws2uk/4NVgMXN0zUuuXPHB3CHipbnr1KkTLAZjXDjwtZeDe/OYDOZ+b8LIQ6X/BNmgIa+mM3fHzh2M4OMSzB0vMHeWCVuQmDtCMHc5s2bT5x06td97dJuMmzZrsv/EDvVccXHx9gObZNyyVQtnlyhNdq3b8qW9zsuvvmjG0rbsy09ee+OVfce2y+bGHWtnzJ266/AW3aU9au71W1fNmj99674NI0YP073LV32qAzmlDLe8ctqdu3bavHvdiwNeWLF2yYQPxny8aMb4ye+ZhgzmlkcRdt26dTOYu33HdmpuPSU9z007v+rRu/uhstM2mwUSzB0vCtDc8p5fs3nXtDkLX3/rHTF3567dN+46pGJr2qz53uPnN+xI9ujdRza/3n7go7mf7Dh0WtratGu/ftt+W2OyzutDh0uzjJev2Tj+g+lzFi0bN3lastR2u4+clUdZNsMhVm/aZVYwK8tg8+7DjRo11vHSVV/bJ2+n5AJy/PzXOw6Y6SUXpdUbBrz2hoyXrFw/ZeY8eZotW7VOlplbjr5l37Hho8fZ69SqVWv30bPyasi4a49esmb9+g3sNe3mQgjmDpFCM7cZF5VhKvWK66m5nV12z6HS+1d70+x9c9jr67Z+qRMnT59g71Jzt2zdwqz8+dolZq849VDpja+9rB1z2nKN0DM8VLq4uFzHmc0tFflZIUtzHwqcp70ZnBtVMHe8KEBzF1kqMvfc8o2guwxfbfn5gjBp2mzTtnD5qpTrqB1NcdCQofLYsXNXWTbDIVq2+vkfz7ZXMwORvX2IYGbOXywNrduU/FOb2mn3m1OyzW0O/dmakjsW7d9z9JyZ1aBhQ1O3HwsqmDtECtbc8gOm3OmOK71zLa5fvCP5yz23vavk/Xpq19xPZ5mJzVs0s9csKr1PHfzma3LP/ergAXJLLfffam5Z5+Dp3TJo1rypPMqN+9DhQ9Zu/mLVhhU6UVe4LHN/tmax3HPP/XSmnp4ms7k12Ztbz3Pnwc39X+4X3CyQYO54UYDm1nvu6WX33KaY1LvPI2e3J0/2f/mVVwYP+Wbv0dfeeEvN3bZ9x/Xb3XvuN+SOufQfG12+uuSe++NPlo+dNDWZ0dz2IeQ0zApSP3Dqh2SpKTfvOdK4SRMdm8MFM3HKDJHu5+u2zFq4NGjZJSvXTZu9YPrHi2xzy1HkRv/LDdvtdaQo6+g9t6yw99h3mDu/YO5QIm/NIW8PDtadOIq1TUkqLJg7XhSgucuRwvl1eDkiPxwEi7EO5g6RWJh7+Ki35bZb748vN5g7kmDueIG5I0z7jp27dO8ZrMc9mDtEYmFuErtg7njhh7lJQQVzhwjmJmEEc8cLzE3yHswdIpibhBHMHS8wN8l7MHeIYG4SRjB3vMDcJO/B3CGCuUkYwdzxAnOTvAdzhwjmJmEEc8cLzE3yHswdIpibhBHMHS8wN8l7MHeIYG4SRjB3vMDcJO/B3CGCuUkYwdzxAnOTvAdzh4iaG3mTPEbfUe5bDQoYvcgGL76ElDuYO1wwN8lvMHccwdwkv8HcoWPuvAnJS9x3GBQ8ep0lJF9x32EFT/zMrQSvv4Rcbtx3FcSN4CWYkMuN+66KA3E1N2QGMwFAfM0EmcHcfoK5AQBz+wrm9hPMDQCY21cwt59gbgDA3L6Cuf0EcwMA5vYVzO0nmBsAMLevYG4/wdwAgLl9BXP7CeYGAMztK5jbTzA3AGBuX8HcfoK5AQBz+wrm9hPMDQCY21cwt59gbgDA3L6Cuf0EcwMA5vYVzO0nmBsAMLevYG4/wdwAgLl9BXP7CeYGAMztK5jbTzA3AGBuX8HcfoK5AQBz+wrm9hPMDQCY21cwt59gbgDA3L6Cuf0EcwMA5vYVzO0nmBsAMLevYG4/wdwAgLl9BXP7hjrbxN0NAJUAdbaJuxtiDub2DcwNAJjbbzC3h6BtAEDbHoO5/QRzAwDm9hXM7SeYGwAwt6/Ez9zO73EJyTHuOwzigPN7XEJyifv2KnhiZm691B46s4eQvAR5xxG92iZP/0hI7omjvzE3qdTB3HEEbZP8BnOHCNomYQRzxwtuuEneg7lDBHOTMIK54wXaJnkP5g4RzE3CCOaOF5ib5D2YO0QwNwkjmDteYG6S92DuEMHcJIxg7niBuUneg7lDBHOTMIK54wXmJnkP5g4RzE3CCOaOF5ib5D2YO0QwNwkjmDteYG6S92DuEMHcJIxg7niBuUneg7lDBHOTMIK54wXmJnkP5g6RSmLuRCnBevnawkj/gc/LoR997OHgrjgGc8eLwjG3fBc88tgTwbqdFwYO1m/V4K7LyvvT5tiLZHPokCKHrla9erDu9FStWjVYr+DIaWzYeShYDwZzhwjmLkdbGMHcECGYO5ndoUNK4lLm3nXkW+dUbapfe23KeuPmrdJNSVd/4KFHtD5r4XK7XvXqq7V+/Q03JLJ75TF3iGDucrSFEcwNEYK5o03iUuZ2nq+9mf14+ZrN9ub9Dz6csk3Hau5ho8brpsn+kxekLo9OPRjMHSKFYO5f/ccd+o5RtNimQ8tgcdrHk+3inqNbD5Xp9r4H7tWBqSgPPvKAUxHmfjozeBqm7eFHHzSdUuzeu7MOJF9vXy3j7Qc2pptrTzT1+x+8z6l37dXpl9bSopo72PlLUylTZ08yzeme8tjJI4OnV8HB3PEiS3Pbb7PExZd7pUHj5lKZOmeRXUxYnfc98JBEBrXq1nfmmh4xilN0YsxtGD1xqllNe6644gozdmJmte3Y1e5JlP3QYBqUX//mLin27veyjO+9/5eLg2HVpp3ScODUD07dLCvP6PG/PK3FKlWqOKdx5ZVXJrIwd42a19mbiVS6zWZsNrViBl+s32a3pTO3TvlbUZ1g3QnmDpFCMLe+XYLFK66oYsZvDh+s4y49OlSrXk2n/O73d5npf3n6CW0Y/+F7sjlv8UVutg+RKP1Wsfc6beu3rZJxkxaN7Cm/v/t3zjrB/PmJR+Tb0ukxm2MmjbQXdNZRGTudOtiwY40zS5vlKR84udPsklfGXjDaYO54kb25O3d/zq6MmTxdipv3HpXxX/76bMLSw58f/4v5djDThSeffsbetFezi++9Py24V+Pcc5vxvCUr7eJvf/f74Fw94bVb9sq4QZMW9iES1u2+ffLao+besu+4dtoHUrVr0RbztTVqmLp40Z5on4bWL2nupi3b2ps2KT8ttxfUitmUEzaVXyaU0m/AIO1xPi1/c8SYdKulC+YOkUIwt0Qkbd4iWjGbityXq5KFpV8u1Ibbbr/VdJql6jeuZ2/aq9lj47x0bROnjpHx5t3rZHz7HbfJ+Js96+SxuGHd4EQzd/eRrUPffcMsonX9DHzG/CnmuImyDwNM7E/LTWf9RnWdpXRTm+3pkz8ar3uFTt3a27siCeaOF1mae9L0j83bLFF67S5u1NSuaNGMdx7+Vq74WtS6fkJrNs0uu6j6/GjeYhnvO/G905BMb24dV61adfmazcGVNc1atzO7VJ9mlzm0Lignby+u5tZOkaJ9xNtuv8N0Pvznx01dexLWDwSmaJ+G1i9p7mdq17M37enB+j33PSCDDl17puzXTa3Yu+xx5ntu8wNKhmDuECkQc2v0s+KR4985VGqp+x64x95bt34tfWPpZiKNucd/MFo25y2ZZc91JiYymvvr7asPXXzPvXXfhkTJT9Z3ymPy1O7gRJ3bvHVTGTz1tyfNRK2nNLfdcyiNufWee+PO1Pfc9nST4MqRBHPHiyzNbaIfaMtgzKQUd8b6JhQ5yfipv/1yI564+HfY2hacm4u5q1Ur+UBO7ymDE5PZ3XMnyk7eXjxLc6e85w6auxz33DWvu97e1HWCbaYeHK9Yt8XevPf+B1O26Tizuf/6bO1g3QnmDpFCMLe+XQwHT5eosVW7km8qw9pvvth7bNt/3Pkr3bz66qsTacztLGj/ntvem8HcDz1y0e+5nTWDs5yGFm1K7kLsetDcnbt3MP3anNLc9rKK/XvulEdPlP7+294VSTB3vMjS3PbbLHHx5d4u/urOX5vN5q3ba1E7nb8+M23BnmzMbdDfc9trPmvdoToxs7L8PXciO3Nn+D130Nz2Ua64Iqvfc5uJwc2Udbn7l/G8pV/auwzOlOAu59NyU+cv1AqCQjB3LDLorVfk/dq7X4/gLhIM5o4XWZo7FrE14012Hr7ovwqLMPxXYQUB5s4m5qfO4C6SMpg7Xnhjbv0+rVGjZnBX3JOw/qPqCJMo+T+xHAzWg8HcIVKZzW18rAQbMiSXuZUhmDteFLi5nW+3YEO6OBMvay7JMZg7RCqzuUl4wdzxosDNTeIYzB0imJuEEcwdLzA3yXswd4hgbhJGMHe8wNwk78HcIYK5SRjB3PECc5O8B3OHCOYmYQRzxwvMTfIezB0imJuEEcwdLzA3yXswd4hgbhJGMHe8wNwk78HcIVLg5m7QsIEZFxUV1alTZ/+JHUOHDwl2psugIa/IRB2/8NLz67Z+2aRp45SbYcecRjZZs+nzYPGyVog2mDteRGLuQUOGBovli3xrBIvBBNuClahizuSyTmnVxh3BombzniP2ZstWrYM9oQZzh0i8zN2rT3n+56NGeGawbNUnwc1Dpb4sKqNl6xbyuPvwllnzp2sluLKJaZAVWrRsLuMVa5c4u3RgdulYn5HZZRa019my92vdZXqc5gIM5o4XUZl777Hv3ho+KrhL0rlr9159ng/W7eg3ghnoWFKrVi0ZN2zYyIxNm3m0VzB1Yd+J70WHTZo2M3XNzPmL7YoZDx893ozlse8LL5mxsPab3WYFufFIlvwz2FvN3tZtfv53TewFdSAsX7PRnMm0OQtNgz1dGpq3bKXN9i55FmruN94eoRXMfUkwd95im1sza/60Iktardu0svfqe1Sxi85g7qcl/3q3s3mozNwy2LTzK6307N39g48mLlo+16ymWbXhM3tTTkMmTpv9gblXlu9SeezUpaPpMYeTXR07//xvaesdv322Gnsd29xafHHAC05/oQVzx4tIzN2tR68lK9cH606Pvbny621m3KlLNzMushQryq9du7YKWza/2rLHbqvfoKHZtCd27NzFVOwb2RFjJuhg8vQ5C5ev0nHKQ+84dLqo5Gfxkp82nHPQ9OnX3/TL4/bkSbPLXscM6tSpa85EirqaEb9ONw3SnLz4Wai5zWqY+5Jg7rwlaO5DpZ9yB4sZUnSxuRcu+zjl5iHL3CJLrXTr0UUH4ye/9/GiGabTTo9e3XQwefoEY1z5vpXHN4e9btrMaciuQUNetYtml4m9TtDcmnTnUwjB3PEiEnPLPbetK8Org980PV0vNredIcPeNWOzTkn97REjx040m2++M9JumzRt9tb9x4MTzUf3rVq3ER1+vf2Abn78yXLTLBk3eVoy1aE/+Wy1jnUdOQd7lsmnn6+dNG2WM9cZm4F879vmttcxRdMgzcmLnwXmvlwwd97y87dyqbHmLJox8LWX5R40eAecIfYKh0rucZuMmzTa7HU2U5p7/dZVDRrUHzNxpLOyHWlYsXZJ0NyHSu+P27Rtfehic8tj917d6tatu//4DnuXSUpzb969Tn7ulkHnLh07dGrvTCmoYO54EZW5k2XKcbLn6LnmLVv1feGl4C47Lw54tU3b9smA2FZv2in3oKMnfCDjFWs3N27SVFWqbXMWLduwI6mdG3cdMnfG3Xs+175jp2TpjayYu1694h69+5g1v9qyV+7X3ytdM2kdWlJcv/7YSSX/zGhRmbklr70xVI7r/OMc5jxHvDehQcOG9m23nondY5tb0qJlqy7dezrTHXMnrWeh5j5w6oc27doPHz0Oc18SzE0qezB3vIjE3AWbDH/2RbIP5g4RzF04WbXhs7IPCNxb8NgFc8cLzG0Hc+clmDtEMDcJI5g7XmBukvdg7hDB3CSMYO54gblJ3oO5QwRzkzCCueMF5iZ5D+YOEcxNwgjmjheYm+Q9mDtEMDcJI5g7XmBukvdg7hDB3CSMYO54gblJ3oO5QwRzkzCCueMF5iZ5D+YOEcxNwgjmjheYm+Q9mDtEMDcJI5g7XmBukvdg7hBRcyNvksfoO8p9q0EBoxfZ4MWXkHIHc4cO8iZ5iflB0H2HQcGj11n8TXKPeS+5b7LCJn7m/sm6+SYkx7jvLYgJ5oJLSI5x31txIJbmhkuClgAgvmaCzGBuP8HcAIC5fQVz+wnmBgDM7SuY208wNwBgbl/B3H6CuQEAc/sK5vYTzA0AmNtXMLefYG4AwNy+grn9BHMDAOb2FcztJ5gbADC3r2BuP8HcAIC5fQVz+wnmBgDM7SuY208wNwBgbl/B3H6CuQEAc/sK5vYTzA0AmNtXMLefYG4AwNy+grn9BHMDAOb2FcztJ5gbADC3r2BuP8HcAIC5fQVz+wnmBgDM7SuY208wNwBgbl/B3H6CuQEAc/sK5vYTzA0AmNtXMLefYG4AwNy+grn9BHMDAOb2FcztJ5gbADC3r2BuP8HcAIC5fQVz+wnmBgDM7SuY208wN0BlRp1tx+2AOIO5/QRzA1Rm0LbfYG4/wdwAlRzM7TGY208wN0AlB217DOb2E8wNAJjbVzC3n2BuAABfwdx+grkBgBtuX8HcfoK5ASotzh+W8wtv/8DcfoK5ASonF6n6H0ckyNs/MLefYG6ASoJ7Y11q65RB4d6Auf0EcwP4TZa2ThfX9xArMLefYG4A/8jR1umCwmMH5vYTzA3gByHZOmXsY2HxQgZz+wnmBogvrkEDiq2YYPGCBXP7CeYGiBcFYuuUcc8NogZz+wnmhkrInsPndPD8qBXy+OrEVcY005fuKEDruEYMKLMA454zRAHm9hPMDZWTr7Ydk8fNe07J4xNdpj7eWTJlyboDz/aasWDVXrc7ImJn63TB4lGBuf0Ec0Pl5P0FW06d+08dG6N8s/fUwePn/9J12sQF31zcXtG4qgu4MHZxnxFUCJjbTzA3VE5EHl3eWqzjAeNW/td///PTtftlvGHXiX/9+3/lFvyi7grBdVtAft4EhVcYmNtPMDdUThq88LFbiohyCDtRSrBe7uSyYOaJ+3d+6TRcfXXV22692Wy6Tx/yCub2E8wNlZDaz810SxWI66qA7S6ZXERrxyySy4KZJ2Yw95KFH27ZsNjei8LzDub2E8wNUDFkFrYIrOiZvzz25wdlcOON12vl2WeeVLHdfvutKtfratbQXQZtvvM/7tDNk4c32MsumDNR648/9tCFMzucIyr/+n8HzVjYtnGp6jZROkvk6iz+S2vpucnjX596TB5FybK5ce0ie68x99TJI7Ro33M/+MA9ujcYLJ4XMLefYG6A8MhsazsisD/98XdmrI/3/On3pmKs+Y8f9hsvzpgyyjTL474dK4MiPH1k0zN/fVzqV1xxhbPLNJsFr722+vXX17RvlM0us7g8NmtS1/yIYHfa/VddeaVI2ixl6vKo5j56YJ2ZmzlYvNxgbj/B3AD5JXtb20mkMneTRnVMJRtzB9OlY8uv1ywI1jVmllnwpptuuO661OY2+eePB3r3aG/qdqfdf0lzlyPuawuXAnP7CeYGyAvlsLWdhPVpudz1asWY+/bbblHzBT8t12bzgXbiYsu2aFps9bp2N0UzCJr7m69/+bTcbhaqV6+mm2a1n9J/Wv7BxGFaNJ+Wf/nZLDO3HMHi2YC5/QRzA+SC64+AYLJMwvI0uay4XwKwwNx+grmhEHAuvoUc52yDIilfMHfuCX6lAHP7CeaGyInjddaVRMAipILjfkWgFMztJ5gbIiful1rXGQGpkJDivvIQAHP7CeaGyPHpsovCKyDYOnswt59gbogcXy/BWDyPwdblA3P7CeaGyKkMl2MsXo7YL5r375CQwNx+grkhcirPddlVUcBV5CeEnVcwt59gboicynaBds0UUFelDcLOO5jbTzA3RE4lv1JXcpG7Tx/yCub2E8wNkcMlW3EdFpCcN0HVFQbm9hPMDZHDFTyIfxZ3nxFUCJjbTzA3RA6X8sy4zgtIsWDjnjlUOJjbTzA3RA6X9exxXRiQZeRxzxAiBXP7CeaGyOESXz4KSuHYujDB3H6CuSFyuNznTiQWtw/KV7Awwdx+grkhcrju5xHXpgHd5hh3fShsMLefYG6IHByQd0KSN86OHZjbTzA3RA4mCJUcLW5P58sUOzC3n2BuiByUUDG4Dg5IOqWt3VUgVmBuP8HcEDkYIhKCFkfY/oG5/QRzQ+SgimjB1h6Duf0Ec0PkoI3I4UvgK5jbTzA3RA7aiBy+BL6Cuf0Ec0PkoI3I4UvgK5jbTzA3RA7aiBy+BL6Cuf0Ec0PkoI3I4UvgK5jbTzA3RA7aiBy+BL6Cuf0Ec0PkoI3I4UvgK5jbTzA3RA7aiBy+BL6Cuf0Ec0PkoI3I4UvgK5jbTzA3RA7aiJyC+hK8MXmNW/rpp883HnJLkAWY208wN0ROQWmjcpLhS7B5zynZ9d6cTT3fWaYVGXR445OLuzLRb/SKv3Sd9r//+38y3pE883T36bsPnZXxqxNXNRswTwbHv/3x/QVbinrP1H49E60s//qgViRL1h2Qce0+s6Yv3VG2NlwCzO0nmBsiJ4M2oGLI8CUY9P5q2ZU8fr7Ri3Nlc8C4lZt2n5y3cs9//fc/3dZUvDvz6637Tv/9n//S9UXG//Ov/x3y4doJ87/5ZM3+w6cuSPH5UStWbj783Q//3fLVBT+VmVsrj3eeKuO1W4/qarJLjtt84PwjpRPhkmBuP8HcEDkZtAEVQ4YvgdQHjv9SBl3eWiyPz/aaofVjZ36we5yk3CWbL41d2XzAfBnUfu7nO2y7R4wumyNnbjh44nt7ltymO53f7D1lpkMGMLefYG6IHOdaDxVPhi/BE12myh3zT2W3wvIoN83pmoNIp0w/dPL7f//v/01fuuPb7//f5EVbZSz1f/7Pv+Vu+8J//mP7gTOyphhdKjLlX/8uWV8rcnRdRFeTO3655+41/OfP7eGSYG4/wdwQORm0AWFj7mL5KngJ5vYTzA2RgzMiBHP7Deb2E8wNkYMzogVtewzm9hPMDZGDNiKHL4GvYG4/wdwQOWgjcvgS+Arm9hPMDZETqjbMR8GE5B737VXwYG4/wdwQOeFdE4NXXkJyifsOK3gwt59gboic8K6Jsmzy9I+E5CvhvVdDAnP7CeaGyAnpaqjLBi++hJQ7Ib1XwwNz+wnmhsgJ6WqItkneE9J7NTwwt59gboickK6GmJvkPSG9V8MDc/sJ5obICelqWBnM/f60OYlEolr16jJ+YeBgGQd7KiB6GsG6kzt+9R+mTQaPPPZEsCeMyLGat24frJcjIb1XwwNz+wnmhsgJ6WoYiblFErMWLg/WLzdZrhMjcw8dOU56Jk6brZsVae5W7TvL4a644srgrstNSO/V8MDcfoK5IXJCuhrm0dzFjZpeddVVN99yy1db98rmzsPfigkaNWsp4w9mzk+Ukiy1kcFsyuDBh/9cu7jh1DmLtHLLrbc9+tiT9vpyRyjr123QePiY94PrBPP2yHE33HBjhy490pnbTJdjzZi/xC6KLwcOHnrzLbdKZe/x89ffcIN9P7p1//H/+PVvbrjxpg9nzteKLqsr33TzLfUaNjHN+09+b5+GqaeMWcRsypmM/eCjqlWrzvnkM1PfcfD0b357l3mp7bnyNOVYwdXGfzhTxnIywUP88Z77gv25JKT3anhgbj/B3BA5IV0N82XuN0eM0eu+IJrRojHBjTfdbMamzd5ct3WfPNaq18CYW3nokT/rUu+9P82uB9cJxuy9pLkVuyi+1EGHrj3lRwq7QSJLacUUjbmfqV3Prm/YefDe+x/USrnNrUXhxVeHaL1Gzeu0Yl5qM1dZu6XE6Pqy696iOsU61oYFy1eZWa8PG5Xy6OVOSO/V8MDcfoK5IXJCuhrmxdzbkiflit+2UzfdlPG1NWrIYPfRszJu1rqdPC78bI3pT1ifcqstBLlH7/ZcP3vZfgMGqUi2J0/J4J77HtD65j1Hgus4ueaaarK3U/feMr766msSqcxtR4pPP1NLB4oZi311rB9c16hR06xgOu17bq3fetvtpsE+Dee4TuxF7M1uvZ8345rXXW96EmUvdbpFZDBqwod2sbhRUzN+4KFHTKfp2XP0nLPg5Sak92p4YG4/wdwQOSFdDfNi7vqNmulF30Z3te3YVca33/Efdn8iYG6zy9yhGsz69grBdYK7zJQxk6cnAuY2nxsbbrv9DjNR7/X13tosaDc4RwmaW8d2UU9Dx+li9+umvCAymD53sbOmTTLV07EX3H/ygjx+vSOpRf0AQ/deddVVztH1J5VcEtJ7NTwwt59gboickK6GeTH3mEk/myAYlYHKwy6mM7e9+dTfntXx2A8+ksHcxV8EF89sbv3QuEGTFomAuesUN7KPlbhYzHp7nS9z26ehDeliL6KbeiYfzXPN7UzUpxNc5OffFFQr+QTC7pfNX//mrkTg6xJcuRwJ6b0aHpjbTzA3RE5IV8O8mDtZdtG3MUUzuPmWW5xmu0fzqzt/rZWrr76meev2ZpeZogTXcbLz0BmzV+/7HXPrJ/mKfo6dpbkPnPrBTBQ+nLXALGs36/h3v/+D6dTTcM7Tib2IbgbNbdoMyYufjinazfUbNbMP9LeiOk6b3pfblXInpPdqeGBuP8HcEDkhXQ3zZW6Sl+gf5Bc3ahrclffIgXr1e8lsXn/DDUHBly8hvVfDA3P7CeaGyAnpaoi5Cy36q4FgPY/Re2vnKIl8/IZbE9J7NTwwt59gboickK6GfpjbqMgQ7CEVlpDeq+GBuf0Ec0PkhHQ19MPcpKAS0ns1PDC3n2BuiJyQroaYm+Q9Ib1XwwNz+wnmhsgJ6WqIuUneE9J7NTwwt59gboickK6GmJvkPSG9V8MDc/sJ5obICelqiLlJ3hPSezU8MLefYG6InJCuhpib5D0hvVfDA3P7CeaGyAnpauixuSdNm1W3Xj2n2H/Aq/q4auOO4JSUGTRkaLBokv06lSchvVfDA3P7CeaGyAnpahg7cxcVFQ147Y1gPZjatWsHi5XE3F9vPxAsVlhCeq+GB+b2E8wNkRPS1bBizC3ya9Socb3iYt38/Ktv6tSps6H0n66SXQMHDfl83Rata0Pb9h110KRpMxWnCHLjrkO1atUqKkOKLw18rVnzFskyHydLva6Dd0aNM23tO3Zq0LCh1m1zywnICj1799Vd0tbzuZ/HkqbNmr8xdHiyzNxmZSeyzpZ9x+Tmvku3HloxZ6VryrOet/hzGb848DUtbj946oWXBurYvCYSeRHq1q2rB52zaLmsuff4+WTpoV99/S1Z/5PPVif1xWzcRMfJ0pdIDqcvpq7w9Y4D9qvUo3ef9h07J63XUF/t8BLSezU8MLefYG6InJCuhhVjbvG0DtQln63ZJI/9Xhwgj/Xq/aIuifpPbDR0+Cgjy637j4t1Nu8+rCvoPbc02GsaUZk499y61zb3+u37ddfHn/zyD44tXL5qyLB37aXElOb8Na3btDNjWUdOTwa7j5xNBs5KM+GDj+RRlCmP8hNMyWPjJgdO/bA9edL0yEHffGek2Rw1bpJZRB9lfX2tGjZslCx73cxR9MU0K5h77kFD3tZBq9ZtzGsYdkJ6r4YH5vYTzA2RE9LVsGLMLbd9OlDTbLL84XwWXb9Bw20HTsigY+eutvzMh9LG3NJgTyyuX79Dpy52Rc0t66/etFM0GTS36RwxZoK2JUt+Oz67U5dujrmlYq9sx/m03D4rXXPXkW+nzpovm3uOndt/8oJpkNOzjyKH+GrLHrOp6pWfYJKWnnWuvmI6dn5YMSsYc3fs/PNrIp0V9sF+SO/V8MDcfoK5IXJCuhpWjLn79HuxqJT5S0r+jW25hdXNZMDcSctGM+YtNm3GOr36PG+KOmjfsdP8pStFinJDKeI366i5V3y1Wdt0im3uxk2amrq2yRQxt2xOmTnP7NIztO+z7QR1qBPlrMyhzXO0793HTZ6+bPUGe6L5XYBZRD/J10oylbnNS6Q9ukKv5543K5jBvhPng6caUkJ6r4YH5vYTzA2RE9LVsGLMHdRzJc+BUz80b9kqWPcjIb1XwwNz+wnmhsgJ6WpYMeYmlSohvVfDA3P7CeaGyAnpaoi5Sd4T0ns1PDC3n2BuiJyQroa6bPDiS0i5E9J7NTwwt59gboic8K6GmJvkN+G9V0MCc/sJ5obICe9qyG03yWP07RTSezUkMLefYG6InFCvhuZqS0jucd9eBQ/m9hPMDZET02uiT/Al8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBG5PAl8BXM7SeYGyIHbUQOXwJfwdx+grkhctBGhOiLb+LuhpiDuf0Ec0Pk4Ixowdweg7n9BHND5OCMaEHbHoO5/QRzQ+SgjcjhS+ArmNtPMDdETvm0YX/GS0hBxX2zRgfm9hPMDZFzuRe74IWSkAKM+8aNAsztJ5gbIudyL3PSnDz9IyGFnMt9V4cE5vYTzA2Rc1nXOG0OXigJKahc1rs6PDC3n2BuiJzLusahbRKXZP+uDg/M7SeYGyIHcxMvk/27Ojwwt59gbogczE28TPbv6vDA3H6CuSFyMDfxMtm/q8MDc/sJ5obIwdzEy2T/rg4PzO0nmBsiB3MTL5P9uzo8MLefYG6IHMxNvEz27+rwwNx+grkhcjA38TLZv6vDA3P7CeaGyMHcxMtk/64OD8ztJ5gbIgdzEy+T/bs6PDC3n2BuiJxKYu5EKcG6kxcGDs6m7ZJ5f9ocs06Whw4j2Rxae1Zu2CHjWQuX66bBWcc07D95wewaNeFDs9qkj+baE+3pw0aNd4pXXHGFXclvsn9Xhwfm9hPMDZGDue2EYe4Ik82ztntUzI5i7R5b7WaXbW6zt1mrtk7RWXbmgqVS7Nn3RbuYx2T/rg4PzO0nmBsipxDMveTLr80VXxgzaZrWTaVP/4F6kzd1ziKr8RcnyfiRx54wxffen2Z6Hnz4z2apZ2rXM/XgaSTLzL1p92HteXvkOCnWvO56GS9Yvso+q+DcDTsP6i45/5T33M7JP/RIyYmZhnvue0AH67bt18HoiVPN4tWqV9diIs2zduqCmWLqwcg52D2XZe6t+4/rLsfcf/jTvabfnp5h2TCS/bs6PDC3n2BuiJxCMLdzBRft2cWlqzakvMRL5elnatkrzPl0xZjJ07cnTyVKRai79K7OXqFb7+eDq2nU3J27Pyfja66pZtrM9AceeqTkQJ98FpxrelZv2nX11dcE59rpN2BQsGHxF+sSpcZ1ZtWoUTPYbI/tZ5TytNNFG+QHGt3M/tPyGjWv00rCMnez1u202K5zdzPXTMfc4AmYGyKnEMzd58VX9CKuHDj1Q7Lssm4jxXvvf9Cu3Hb7HbqCjG+6+RYd12/UTJvtmBUk0+culvG+E987PcmLPy2fMGWWjDfuOpQsu4nXda666qrgRN11z/0P6lh+gDDrmEM7J69Fu0HHcqxgMd343tIj2s8oXXPKaEOTFm10M/t7bi0uX7M5UWbup/72rNmle2+48SZ7eoZlw0j27+rwwNx+grkhcgrB3Ca7j541V/NEmZbs2Nf6xMXmfuSxJ3Q89oOPZHPu4i/STfxo3iXMvW7bfhk3bt7aTNEVfv2buxLWH2c5sQ/RoEkLMzZ1HciNabLMc8GJMhj/4cxgMd1Yn7X9jNI1p4z8FCINNa+7Xjcvy9x3//FPOlZz69jBnp5h2TCS/bs6PDC3n2BuiJxCMHfLth3N2FzNncu6/prZFGcuWJZIY279tNxY/7kXBjirXdLcXXv1TV78sbNZwa44MXvTfVqug4cffUzGVapUCTboOGjuDJ+WB819WZ+W64f/pueyzK2/y09g7vRgbj/B3BA5hWDuX670pegtb7AulWWrN+p48ox5iTTmlrw7brKZZf+Fmu69pLk37jqk/UNL/0JNo59Im0WC+XpHUhtGTZiS8i/U5ORvve123XxzxJhgg46D5k5m/Au1ZOAZaZsq3O5PGbvnssxt6mLuSdM/tuuSr7bulc1ez//yRwY2ybK/Le/Rp79zrHwl+3d1eGBuP8HcEDmFYO64REwj99PBeqyjKl21aWdwV6hJ8N9zQ0zB3BA5mc3t7PLM3L/cA5YR7LE7q1Wrlm5ucAqJNhne1RUG5vYTzA2Rc0lz2w2emZt4nAzv6goDc/sJ5obIMW7OMsFLJCEFmMcwN4QE5oYCxwjbbAYvkYQUYDA3hAXmhgLHufxhbhKXYG4IC8wNBQ7mJjEN5oawwNwQLzA3iUswN4QF5oZ4gblJXIK5ISwwN8SLqMxdVFQ0aMjQYN3knVHj6tUr3nnojG42bdZ87KRf/onMlFn8xbpR4yYF6/lK5hP2Kas27rA3N+85Euyp+GBuCAvMDfGiYM1t2szjgqUrO3buEuwxGTFmgjfm/nr7gWAxjKQ8EOZOB+b2E8wN8SJac/fo3cdsGuyeJSvX6cBUgktpWrZqLY+2uXW13UfPyuOyVRv0WDLee/z8iwNelXGdOnW27Ds2fPTP/ydzcdhHcz+pV1ysbbuPnF29adfrQ4dv2JE0C0oxwzmUnvD61954a8/Rc8nSzwnkWNqvc+1OeXzrnZF2mzlD6TRClZOcOX+xnIPubdO2vfSv/WaPvZQ+I+dsZeL2g6fM0Zeu+vqrLXtlrv2UkxebW1+BHYdOi7nbtGu/ftt+fS5qbuflqvhgbggLzA3xIkJzN2rUeMfB08FddmrVqqXNZlawRyP2SgbMrXfJOkv/KU+xoGyKgbSufLZm01db9phN2SXGSpb8NPDzv3Kt0dU6du5qF+3oXMmQYe/qprOgbsrhZi9cZvpNm91phOrsnTp7wRfrt9oHNc/IOds9x0p+eujctbs5kDSYpeQctM0cyLwCk6bNtu+55bmouYNzKziYG8ICc0O8iNDcIsKps+Z/s/docK9k+ZqNm3cfLipVzgsvDZT7xSZNm02bvSDYaeeS5p44ZYbcRGqldu3acp/65YbtMn5l8BA5E7Gm7tKJazbvekPuYnce1AWzMbfc2g5+c5jec8uPHXL3rL+eD37SLkfcuv+43db/5VdMp6ywfnvJP7AmJ/nW8FHbkyd177tjJnbv9dzHn3xm1jHPyDlbuUWWH4z06eij3KnLscxT1pgDmVdAzd22fUep63NRc9svVyTB3BAWmBviRbTmTpb6ILhX8nz/lxs2bKQKlIi2L/kXaskszD3ivQkNGjYUEWpPi5atunTvqeP6DRrKjwu2uSUvDni1Tdv2Os7G3P0HvGp+BbB60846deqOnvCBvaDd7LSpdE1no0aNZy1Ykiy5Cx/auElT2duwUSNnbvLiZ2Sf7ayFS+vWrbv32HfOseynbA6kDfoKqLnlXrxevWJ9Lub33MG5FRnMDWGBuSFeRGVuL2MLleQ9mBvCAnNDvMDcJC7B3BAWmBviBeYmcQnmhrDA3BAvMDeJSzA3hAXmhniBuUlcgrkhLDA3xAvMTeISzA1hgbkhXmBuEpdgbggLzA3xAnOTuARzQ1hgbogXmJvEJZgbwgJzQ7zA3CQuwdwQFpgb4oVcDZE3iUUwN4QF5obYgblJ4Ud/xHTfuxUO5vYTzA2xQ6+JhBR43DduFGBuP8HcEFOCF0pCCiTumzU6MLefYG4AKDTfQL7A3H6CuQEAc/sK5vYTzA0AmNtXMLefYG4AwNy+grn9BHMDAOb2FcztJ5gbADC3r2BuP8HcAIC5fQVz+wnmBgDM7SuY208wNwBgbl/B3H6CuQEAc/sK5vYTzA0AmNtXMLefYG4AwNy+grn9BHMDAOb2FcztJ5gbADC3r2BuP8HcAIC5fQVz+wnmBgDM7SuY208wNwBgbl/B3H6CuQEAc/sK5vYTzA0AmNtXMLefYG4AwNy+grn9BHMDAOb2FcztJ5gbADC3r2BuP8HcAIC5fQVz+wnmBgDM7SuY20/U3KQy58FS9NpNKnPcqwPEH8wN4CdqbrcKAPEHcwP4CeYG8BXMDeAnmBvAVzA3gJ9gbgBfwdwAfoK5AXwFcwP4CeYG8BXMDeAnmBvAVzA3gJ9gbgBfwdwAfoK5AXwFcwP4CeYG8BXMDeAnmBvAVzA3gJ9gbgBfwdwAfoK5AXwFcwP4CeYG8BXMDeAnmBvAVzA3gJ9gbgBfwdwAvqHONri7ASDmYG4A38DcAH6DuQE8BHMDeAzmBvAQtA3gMZgbwE8wN4CvYG4AAIA4gbkBAADiBOaG/DCm4+8JIZnjftsAlAvMDXnAXJjOn95PCEkZ5A35AnNDHsDZhGQT5A15AXNDrnC3TUj2wdyQO5gbcgVzE5J9MDfkDuaGXMHchGQfzA25g7khVzA3IdkHc0PuYG7IFcxNSPbB3JA7mBtypVKZe8nCmYlSTEU3heSejfamwZ6ldO7Q2l7zz48+ZO+dOW1CcMrVV1cNnkxIkcNVr15NBwnrmdoNKevZN1TmYG7IHcwNuVI5zX3/fX+SzZOHt+tm4mJzp5w1dtTQY8mtToNu/v73dx3Z/83qLxaJodu3bWFPcZaqgCTKzJ0uKZ/jZTVU5mBuyB3MDblSCc09afy7aiZ5vOKKK1RU2ZhbxldeeaVpqFatmoyvvbZ6ugNlb+5bbrlJD62Lz58zxWwKO7esluJrA/vJ+GhyS53az5hOjemcMml0ItU9976d6+0GU9exokexK4lUbedO7pXKV19+ahfNmXgfzA25g7khVyqhuVVjs6ZPlMfvTu1T92T/afnNN9+kq+mm/Bwg4wlj3jENwSmjRwwJnozJjTdcLz1yQy9jPQ07Zk01d7vWzUz99ttulcE111yjDZLtm75MpDK3GWuDqQeP4oztzXWrFlepUkXHdk/vHp2d1TwO5obcwdyQK5XW3E8/9bgtoezNLdN1Nd2cPCFXc5tZdpZ9OlvEbFY4X2buzetXmFlXXnllcHoio7mdcfAoKRe84oordPzMX5/UXU5P5QnmhtzB3JArldPc0z4Ya9yjg2w+LV/w8c8fYmtdb3Zr1qhhOs3ey/q0PHhQrTRr0sDeq+YOzjIDU09p7gfvv9eZqC+Cc5SUCzpo3fyiwVQqQzA35A7mhlypnOY+Xyqkb4/v1kEiO3PL+OGH7pfxqhULdZf2P/jAfScPb180b7qZflnmvqH00/LjB7fJ+OiBLWZZ3WvG6cxd7k/L27ZuFmxwxsHNL5bPk0f9QzxJm1ZNZe/od980DX4Hc0PuYG7IlUprbhM10yU/LTcaNnXNPX+62zRXqVJl4tjhZorNxzMn2Qd1ctNNN5pO2Vy/eomOa9asYYrpzG3GiZKP7kcmUpl77451doOp69g+ir1ayooW7c3H/vywOSvvg7khdzA35EqlMjchOQZzQ+5gbsgVzE1I9sHckDuYG3IFcxOSfTA35A7mhlzB3IRkH8wNuYO5IVcwNyHZB3ND7mBuyBXMTUj2wdyQO5gbcgVzE5J9MDfkDuaGXMHchGQfzA25g7khVzA3IdkHc0PuYG7IlfiaO/jPakkGDugfLBZ+Wrf6+X8mWr4UFRUFixny1pDXzPhy52q2bvwyWMwc+0DytSvfcSMP5obcwdyQK/E192Vlz/Z1wWLhJEJzazKs8O7wn/+f5GeO7TLFHM2duVjIwdyQO5gbciUW5pbre3L3xsaNGur4q1VLzpfdc69dufjjmR/OmzNV5Sf33CIV6Vm3eung1waYFWxzy3jB3OnHD203c+vXL5Z6757dDu7ZtGjeR86hTx7ZoYLRQ+/csuaT+TO+Pb5bi/asZs2aHtq3eezod0yzDsxSOnffjvXP9e4hlXr16s2eMXnOzA8ymNucrTyvbl077d+1QZ/Xtk2rhg19XZbSleX5njqyU49Vp06dYwe32efsrClFadZ1TJvu+nDSmL071tsvgtkl52CKau5atWrpWBc0SzkvvlnH1M09tz6mfOULM5gbcgdzQ67Exdw6EG+ZsZrbOM8xt7OCMbe4s6iUmdPed3z53al9oqIxo4bZRTXNF8sXnC87jdatWuoKumnPMvWv1yzTvZLFC2fpYNumL525JunMbZ+tc5srS5mxWa1L547ny26ORfPy+OYbr9qzNMFPy80KPXt0bdumlf0imF2nju40RftFlrEuqEd3nlpwnfMBc6d85QszmBtyB3NDrsTI3F9+VvJvaxoBqLmNmTKbe/+ur3XQu1d3HYgLzVy58zadUyaPtSfK/as89im9RdZlh7/9ht1gz5ow9l1Tsc9h1eefyOGCc2dMnaiDdOa2z9Yx9/BhQ8zYMffEcSNNMfjBuFN0zK2xXwTddfbEHrtBT6ZTx/Y6ztHcGueVL8xgbsgdzA25EgtzS+rXL/5w0pjzAXNL2rVtPW7MiB7du5xPb25J40YNtd6gQf31a5apSnXukdJ/FVtucGXXpAmj7VnipEaNGq5dufi8dWhRft06dSZNGOXMkrvqVi1b6JnY51BUipnbtEnjfTtLfpKYMe399u3ajB39Tjpzn7fONvir5VcG9JfzPx8w96cLZ9atW/fMsZJ/fTxLc+/ftUE/+u7apZP42HkR5BV47+IbYnMycua5mFuPm/KVL8xgbsgdzA25EhdzZ4jtxcuNzs0wPaX5SKUN5obcwdyQKx6Ym5AKC+aG3MHckCuYm5Dsg7khdzA35ArmJiT7YG7IHcwNuYK5Cck+mBtyB3NDHsDchGQT/THX/f4BuEwwN+QBzE1INkHbkBcwN+QHvZkghGSO+50DcPlgbsgbwYsUIcTE/YYBKC+YGwAAIE5gbgAAgDiBuQEAAOIE5gYAAIgTmBsAACBOYG4AAIA4gbkBAADiBOYGAACIE5gbAAAgTmBuAACAOIG5AQAA4gTmBgAAiBOYGwAAIE5gbgA/aVmKWwWA+IO5AfwEcwP4CuYG8A11to3bAQBxBnMD+AbaBvAbzA3gIZgbwGMwN4CHoG0Aj8HcAH6CuQF8BXPDJSgeUo8QUpFxvwkBLgZzQyaC1xRCSMXE/W4EKANzQ1rMFeTcf35HCKmwYG7IDOaG1OBsQiIM8oYMYG5IDdomJNpgbkgH5obUYG5Cog3mhnRgbkgN5iYk2mBuSAfmhtRgbkKiDeaGdGBuSA3mzpxEIlG9enUdCI8/8XiwJ5jsOysgMz6eKecTrJMCCeaGdGBuSA3mzpyU5tZxsNmehblJlsHckA7MDanB3JmDuUnYwdyQDswNqakk5lbXVqlS5fEnn3CKwfG3F87+5em/3PW7u7TumLt9x/Y6tqcED6fmrle/WMZXXnml1hs3bXzVVVe9/MrLwYOOHDPSjGUw/9P5dkPvvr3t5gaNGsg6HTp3tI8onDh38sYbb9SKPAUZd+vZLbO5T50//ad7/iSd494fb4q6/r333Xv2x3Nm/TvvvNOMzYJHzxyTF+qWW2/ZsW+nVl4d/KpzMropL6OcjH3op55+6rd3/dZZ8FzgVfI+mBvSgbkhNZXE3I/8+dH133x94uzJmtfVNJKwhREc707uvut3v0sEzO00p4x2ijtlcNvtt0tl2LvDdNbJ706Z6dv37pDBoROHgyegsjdFHTxb61kzNuts27vdFBV7U/RpisGMGjtadt39h7vF30b52i/rP/rYo4my9eWHHrOIDOrWL3nbaGeffn0+WfaJDIYMHXLOMrciFXHwvsP7v9m5xVTM3F0Hdv/6N78O1u1XyftgbkgH5obUVBJzP/23v6oJbB+kHPd5oW+iTLdaL5+5lSOnjzrrS3r07iHjRk0a23V5HPL2m3az3PrbewW5A+7eq7tWJIuWlvjSbrBPwDyFYe++Y++y48yS2OvbDae/P5MoFa2+PqbTNJuxMbeziMEUb7vtNmeufXR9lcwiHgdzQzowN6SmkphbHHDvfffK4LXXX7PlERzny9x3/vpOebzjV3fY69vcfkfJIQa/+bqM+w94MWEtOO798bJZq06tvz37t6pVq4rRdcq5i92md7q6aQbmcPk1txmbijG3U3fM3alrJxl/+8PZ4GrOi5NyTXMmHgdzQzowN6Sm8phbOHrmmO0DHTdv1XzqzGnB+p5De3/3+9Sflv/hj3+Q8bY9JR8jp4x2Lv18mVl26PChMrim2jUHTxxauGSRPV17rrjyCmcFQe50jZ4T1ulVqVLl1PnTWrQ/LXemS1vmj531l+t//NMfZTX7DljXf+zxx8z6kpcGvqRL7Tu83z5Kvxf7SfOA1wbqURxzj31/XKL0R5OJH75v13UsL/Jv7/qtU7dfJXOqHgdzQzowN6Smkpj7wLGk+OC5558bOWaU8cHug3vkDrta9Wqy15bHmQvfPvnUk7/57W/OlYokaG7Jw488bE9xYjqnzJhqt7Vo1eLKK6+87/77ps2aZpr/eM+fEqWfjTsrmFk6HjjoFbO3fsP6sk77Th1S9mvkKVx//fWdu3XO/BdqonY5gRtuuGHMxLGmqOvfc+895i/UNMGjHP/2xN1/uLtGjRrP1iraunvbuYC5JaLta6+9Vn4CcOpPPf2UeZHtespXyeNgbkgH5obUVBJzF2xEjfYff1WeiJ7fnzLp2LfHr776asfclS2YG9KBuSE1mDvHqHVsgj0ZolPmf7oguCvvufg0Swj2VFjE3OY0OnbpqH9gXzmDuSEdmBtSg7kJiTaYG9KBuSE1mJuQaIO5IR2YG1KDuQmJNpgb0oG5ITWYm5Bog7khHZgbUoO5CYk2mBvSgbkhNZibkGiDuSEdmBtSg7kJiTaYG9KBuSE1Hpi7qKgo5bhWrVopx+WILDtr7uz+L/XXsXksX1LOffPtt4LFYFLOzW9yPMTu5J5g0cngNwY7lS07twTbnBSV8sZbJf8iWfsO7XUz2Ba7YG5IB+aG1Hhs7latW31T6oNvfzibpRezCebOnPDMrdHTE3MHd8U0mBvSgbkhNX6bWzaPnj5Wt25d24ur16+ZM3/O3IXzpEErIpv5nyw4duaY+EOUsHP/rpT2yvKeW3Zt2LKxS9cunbt0Nkt9uuzT09+fadCggT23du3aW3dvkzPR4olzJ+Vx4KsDndXkhIcMHWKO+9XGr9R8Ml67Ya0MevbqaRbv9VzvA0eTCxcvlPGOfTsXLlm05+De5/o8ZxasU6fOlI+mfLp88YfTPpTn2617t32H99sHNUds0qSJ9u8/cqBx45J/k1R2HTx+qLi4WMZ6CMngIRdp2JjbOXq79u2aNW+2vfTfWUlpbn3l9aDm1Vi74SsdmM42bducs+65nf+zehyDuSEdmBtS47e5V65dKZUx48fY5jbC1sH2vTvUATPmzDB3fitWfa6r2Qtmb2553H/0gL2pSzlz7UX0DMX3ovPgauesUwruatiwoVlcTFarVq33xo2Rces2re3jak59d9pMN8/XPqhp1oHpF8E75zbwtZJ/BEV8bBeNuZ2jf7xg7sZtm3RXSnPrQJv11XDO5NzF56lp0LDk55VYB3NDOjA3pMZvc5vxxffcq+cunDvvk/na8PqbbySPHZRbTDV3h44ddh3Yba9jkou5R40Zder8aR2LWfVOUe+55y0quefOYG65sX5r2NDgcW2xmcWf6/vc8W9PyO2+jOUGd8Sod4+cOjrglQFmlt5zL/5syQel99xadMytR/zlnvvoAXMrfPDEofr162unvIAtW7U0EzUnvzslL6A8Qefo4yaO792n95IVS2XcvHlzZ5Z55fVAKc1tn+SwEcMOHE3KmvIDgbNU7IK5IR2YG1LjgbnLHbn6O5Xsf9taYcnwI0LkWfr5skI+vbgEc0M6MDekpnKau1PnTt179gjWC8TcRRcTbCiEzJo7+5133zn9/RkZb9q+uRxna6bI9ODeyhPMDenA3JCaymluQgonmBvSgbkhNZibkGiDuSEdmBtSg7kJiTaYG9KBuSE1mJuQaIO5IR2YG1IjVw3kTUiEwdyQDswNaUHehEQS/dbD3JAOzA2ZMFcQQkgFx/1uBCgDcwMAAMQJzA0AABAnMDcAAECcwNwAAABxAnMDAADECcwNAAAQJzA3AABAnMDcAAAAcQJzAwAAxAnMDQAAECcwNwAAQJzA3AAAAHECcwMAAMQJzA0AABAnMDcAAECcwNwAAABxAnMDAADECcwN4CctS3GrABB/MDeAn2BuAF/B3AC+oc62cTsAIM5gbgDfQNsAfoO5AXwDcwP4DeYG8BC0DeAxmBvATzA3gK9gbgA/wdwAvoK54RKYz10BoMJwvw8BLDA3pMVcRC4AQAWCvCEzmBtSg7MBIgR5QwYwN6QGcwNEC+aGdGBuSA3aBogWzA3pwNyQGswNEC2YG9KBuSE1mBsgWjA3pANzQ2owN0C0YG5IB+aG1GDu7Bk0aFCiFHdHrJg9e7b9LGTwxBNPXNxSUoz704wRmBvSgbkhNZg7e8ptbpmydOlStxoReTH3JRsgezA3pANzQ2owdwbOnj17zz333HjjjRMnTrxwsbmbNWtmy0+4++67ZXzmzJk//OEPNWvWbNOmzXfffdehQwfdq8gsndKkSZPrrrvu8ccf//lIZQYdPnz4o48+2qBBA1O3mTZt2k033SSnlEwmL5QdV7jtttsWL16sPVqRwc0331y1atXly5drXU5GnkiPHj0ymHvs2LHXXHPNtm3bnAahSpUqpi3lkzp58uRdd911yy237NmzR9sEed3kpfjtb387bNgwUwQHzA3pwNyQGsydjjFjxoiWRMPib3HehezMLQPxsfi7adOmU6dONQ32Pbf27969+ze/+Y2ziFJcXGyaFT0ZQeS9detWsbsU5XHTpk2i5FGjRskusb5Zp2/fvuPHj7/qqqsSF68vJ6YDu65K1uKAAQPkhwC7YeDAgXKU06dPy48a9iwzFuTQidKDLlmyRAZvvfWWFOfNmyfjlStXbt++XX6GMM3ggLkhHZgbUoO50+HI6ULW5u7du7c9S4vG3KJe2Tx8+LDZJd7VgVkwiO4NNjz55JPVq1fXXfJDhunUvVOmTNGxHlR+VpBx8+bN7Z7ExeY2RTP+7LPP5Chyz52uwdnUsTwpueGWwblz50wbpARzQzowN6QGc6fDkdOF7Mw9Z84c3RR69uxpGoy5mzRpYhqUO++8U3sefvhh7QminXqr7RTXrVun4zvuuMMUteHTTz+VsdyUt2vXzhTV4mYzkdHcH330kY7lnvu9994LNtibNvqknnrqKVMxzeCAuSEdmBtSg7nTccMNN4hvTp48KeNjx45duNjcffv2lcH58+cvXGzuvXv36nRbVzKYMWOGjmUp2Vy4cKFuCrt27dKe4F+KGfRkzIIvv/zyhdIpjz32mAz0M+oM5j5y5IgMevXqJcVrrrnG7klkNLcqX4+it93aUK1aNTMW7A/SheLiYnlS+iOFInvHjBljNsEGc0M6MDekBnNnQAVmNGabW3Ro701Yn5YbHnroIWed1atXOz3Czp07tZjB3IJ410zRm2+zqTLOYG67uUuXLnZPouy4f/jDH0yPabB/L27fuPfp08fU0z0pqduV77//XueCA+aGdGBuSA3mBogWzA3pwNyQGswNEC2YG9KBuSE1mLswsT9nTli/Qgb/wNyQDswNqcHcANGCuSEdmBtSg7kBogVzQzowN6QGcwNEC+aGdGBuSA3mBogWzA3pwNyQGswNEC2YG9KBuSE1mBsgWjA3pANzQ2owt3Do0CG3dOFCUVGRDkaMGNGwYcPjx4+bXV27dm3duvWBAwdMpdAwJx9Edr3yyituNa/I65nhBFLSpEkTt1RpwNyQDswNqYmXubP3wb59+9xSejKY+/9v70zYpKiuBvw/GgXBAIrGJcYtcYlx3xKNGXbZZd8VZFVARNxAUFQQBEVAEVRkBARcUKKggAuL7KuyjjiKMZGYb75DH/vkzq1bPcMMTE/1vO9znn5OnXvq1q3q6X67ekYRZ+vm/fff79YriSzvkUce8avlpsyzOyGLrDBBc0crLifK3JW8sDkBc0McmBvCJMLcM2bM2LJlS7Hz7i+J/oMWng8aN2584MCBcePGmduk4cUXXyzOONh2fPvtt3ft2lVYWLh3714z97x5836dKDOzO7/+mxkfffSRVQYMGLBz584FCxaMGjXKii79+/eXlehRiksvTwXz6aefzpo1a/HixTNnzly7dm3v3r11eXbKQezsmjZtunDhQukcOHDgunXrxo8fbxfqk08+kWPZWcimHrEgc8/dvHnz3bt3e6fZtWvXr776Sue0IT1HbYgiDXIg20tWYuaW0y8qKrrzzju1TftlzXLlJ0+erEXJW7Ro4V5nQS+FNnfo0EEmscXs379fc+/S6TLswtpT405bPcHcEAfmhjCJMLf9YxX2/h5NlAkTJmiSxdyZ3l/54IMPstxzu/3iRXlcs2aNVaL/FHdx6BDF6aMUl16eCmbs2LFa6dKli+hn+/btuhn99znEqZa7Z2fJU089ZQ1WFz3bpohNczX3K6+8YkPWL0fRfy9ceOCBB2wGF3clxZkG20um8u65X375Za1bgyb2uWHu3LneRbNLIfVVq1YVZxYjIpdH+XBQHLl0ugzX3L/OVe3B3BAH5oYwiTC3MH36dLltjb77a3Lo0CHd1H8xs7i026ZOnSpJkyZNrF8YM2aM2nHOnDnlMbfcwOnkffv2ddvkFlA+E3Tu3NktGrK7SKU4fZTi0stTwfTp08frNPSU3YoRNXdx6YVZXYtuW0HG3CJOG7IGsbJ3gsWZc/SKhhrU3cvMXZC+RdZvMrynzM3dZ1axSyF1+zRTnHG2TuhdOl2G+2159mVXHzA3xIG5IUwizF2QRt6IhwwZIsmiRYvsjX7y5MmS25t148aNZXPw4MG6l3Rqg+Ddc2tRdO6aO/ptuXW2bt1aN+fPn68VsXXbtm01925DDV2PHsU2bXkFGb0JRUVFrrm1KKdsFY+C9NktWLBAO3v16qXFgtImzmJubW7Tpk1x5jIWZE5Ec93LzYPYva+2yUrM3Hq+2mDPna25OP01hiQjRozQZRh2KaRZ7rOtf9iwYQXp66mjWtdL5y3DnhotVmcwN8SBuSFMIswNJ48T9adhVYPpOZ/A3BAH5oYwmBuqCZ9//rneJSfiRvkEgrkhDswNYTA3QG7B3BAH5oYwmBsgt2BuiANzQxjMDZBbMDfEgbkhDOYGyC2YG+LA3BCmYxr/vQQAqgR9AfovS4A0mBti0fcO/A1QxaBtyA7mhjIwfwNAleG/DgEcMDcAAECSwNwAAABJAnMDAAAkCcwNAACQJDA3AABAksDcAAAASQJzAwAAJAnMDQAAkCQwNwAAQJLA3AAAAEkCcwMAACQJzA0AAJAkMDcAAECSwNwAAABJAnMDAAAkCcwNAACQJDA3AABAksDcAPlJxzR+FQCSD+YGyE8wN0C+grkB8g11tuEPA0DCwdwA+QbmBshvMDdAHoK5AfIYzA2Qh6BtgDwGcwPkJ5gbIF/B3AD5CeYGyFcwN2Tjpl4zCILISfivRoAMmBti0bePouKfCIKoykDekB3MDWHQNkHkNjA3xIG5IQzaJojcBuaGODA3hMHcBJHbwNwQB+aGMJibIHIbmBviwNwQBnMTRG4Dc0McmBvC1Chzp1Kpm2+5NVo/4SEHOv300yUZNfrRKjuoF7PnzkuliQ6d2NADaR48WbeBiAbmhjgwN4TJM3OLIRYufi9at9GoV05GYO64hmDoOrP35HFgbogDc0OYGmXuKotUxtw5jJyYOxhlNmBu/2UJkAZzQ5i8MXf3Hr1MAOoATf7856vdit4RWpuy9qutOsm1112vlRdempVy7Os2Hzz8Y/ToEhu37tKGl2bOtn3de+55hYvcefSg9w8fKfn6Tdu1KJUNm3Zo/uJLL+vMY554yvbSHltS02YtNBn9yBitX33NtVop09w6Klx/w43upqI9tn6vbiebyhzI5rR7bm8lWvQuQlHkiWvX/i4pNmjYUDfr1Kkz/IFRuu8FF/ze2uQiazEPAnNDHJgbwuSNuTVSzj23vsXfdvsdi99Z9tKsV7US/S5X2yTZvnufJD1795V81WfrUhn7WsNHK9fUqlVL82hY2xfrNtu+cd+WW7Oa+7Ex46zoHXTHnv2S3DtwsLejJW6+bddeSfrdO0jyunXruj1euEND7x8RHf174yZFmfVr56DB99ku7u56IKvryUZX4h3CPYrOZj0NG57hTijIbJovePtdrcungeiECQ3MDXFgbgiT9+b2RoP33Kl0W5duPTSxZleiLu6cbv+fr77G29c1t92DuvOouW0vYfqMVyyXpG27Dtbg1i1xc/cU5MOK2+NFKnOr7VZczjv//KLM+mXlks9fsFjyA98e0WY7WT2QTaInG12J5t5F0KPYZnAlqcwC3Mqh7/6pzXkQmBviwNwQpsaa+09X/dlrGzTkfrc/dfzmPve887x9XXO7+1oeNfes2a+5Dff0G2ANbt0SN3dPYdxTz7g9Xkj97LN/61XcCV1z6/oLFy5JOea2k9UD2Y7aHF1JlqNo0etx0TaJtxYtbdaipVRq1aqllTwIzA1xYG4Ik3/mvv1vf7c8VdpbqdIS3b23aOqLM902VcLeg8UXX3xJqrS5l69Y/dWWnWqv6HGtbePWXZf+4Y+2b9Tcm7bttl/iFpXD3LYq6Xx/+YpU5Ov0aK6noEWre6FDM1+Z+/naTe7vuW15ZZo7lT5ZO5BNa78aSJVeiXtc7yiXXXa51g+mJx87boLkQ+8fse/Q9w88OPryy6/4cv1mqZ966qkrV33x1ead7oR5EJgb4sDcECbPzD1i5EOnnHKKvq1H399TGa9s3bm3br16AwcP/XLDFrdNzHHmmY1697lHm/942eVanzJ1+hlnnHnBBb+/6qqr1azBuPUvf73o4ot136i5Ja648k86px20POaWaHln699feFGjRo1em/eW2xzNxayyVDmFMv9CbfqMV+RkL7/iSvFoUfqauMvLbu6izMnagbRozUWRldhxo0cpSv+Rgbp82fKVsvn1/m+lp379+n9v3GTIfcO1Z9r0WeL40047rXfffjZbHgTmhjgwN4TJM3NXMsQc4vIPP/pU9JDFeQRxAgNzQxyYG8JgbjfmvlF4ySWXyp1iqzbtoqNu6O2sEW2oVpGs1da0wNwQB+aGMJibIHIbmBviwNwQBnMTRG4Dc0McmBvCYG6CyG1gbogDc0MYzE0QuQ3MDXFgbgiDuQkit4G5IQ7MDWEwN0HkNjA3xIG5IQzmJojcBuaGODA3hMHc0dh36PtWrVpZbvWCgoLGjRtb/t4HH0X39ULaokU3Hn7ksWhRQ44luz8/bbpXL0jj5mUe5YRE9qN8tXlHtEiUJzA3xIG5IQzmjkYWc3fq3OWZiZMlf7NwkWfuDh3uGjvuSUk+Wf1l06ZNN27ZpbvoaPv2Mn6X5p+uWdusWbNx4yfMmDVbvbts+YrmzVus3bDFZlvzxYZdXx9053cjKtFxT06w/MkJz9j6JR56+NGu3brrXo88+rgcXfKBAwf36t1HG2zl0WXoqO1ujxrSP/S+Yd179NS6sGDR0qL0ydoVeHzsuLbtjv1vbewohBeYG+LA3BAGc0cju7mbN2/+2huFsuma+94BgyxfsepzeRz+wEjdxR4tEbNas95zy5xW0Rj/1NNSlP65b8z3hmweiy5duwZ7ZIVPPvW/Y9leY8aO/3XHLl3dlUeX4R4oam7pt39t0+65rUGvgHwUKCp9fQgvMDfEgbkhDOaORnZzHzz8o8rJu+f+ev9h3Wvz9j3uLvZo4d7U2rflKz79TCa3+jvvL7cZDh4+UpDBitapt7xuPDbmCRGq9Mye83qfvndb3fbq3aevW7GVF0WW4R7IPRf3srwwfeaevUVRc2vIPbcmehTpdEeJIswN8WBuCIO5oyFaMlO6eUHa3NbmmrtN27baIHnTpk0t18fCBYu10rNX76LML7CtwejatZu7DC0WLlziFt1d3Pz+YSOiDWJu29TE69lf9IO7ck3cZbz2RqE7Ko+TJk+VRD9w6JAgVtbNBYuW2slqv5rbjqKdhBuYG+LA3BAGc0ejAuZe99XWO1u1mvbisYv5+dqNzZo107wgI8tOnTq3bddu49Zjv/pdueoLaRj/1NOSPzhqtPQ8N2Wa3I96v9ie+NzzIjy3omGLcXPX3AMGDhp637CCjLlHjhrdzflFtca9Awbpxwh35cFlyLLd3Q8e/lE+mhw8fOzf+pT+vnffY78vb9Omjf6eW07WroCa2z0K4QXmhjgwN4TB3ASR28DcEAfmhjCYmyByG5gb4sDcEAZzE0RuA3NDHJgbwmBugshtYG6IA3NDGMxNELkNzA1xYG4II+8ayJsgchX6AvRflgBpMDfEou8d+JsgqjjQNmQHc0M2TN4EQVRx+K9GgAyYGwAAIElgbgAAgCSBuQEAAJIE5gYAAEgSmBsAACBJYG4AAIAkgbkBAACSBOYGAABIEpgbAAAgSWBuAACAJIG5AQAAkgTmBgAASBKYGwAAIElgbgAAgCSBuQEAAJIE5gYAAEgSmBsAACBJYG4AAIAkgbkB8pOOafwqACQfzA2Qn2BugHwFcwPkG+pswx8GgISDuQHyEMwNkMdgboA8BG0D5DGYGyA/wdwA+QrmBshPMDdAvoK5oQzse1cAqDL81yGAA+aGWOxNpBgAqhDkDdnB3BAGZwPkEOQNWcDcEAZtA+QWzA1xYG4Ig7kBcgvmhjgwN4TB3AC5BXNDHJgbwmBugNyCuSEOzA1hMDdAbsHcEAfmhjCY+0SRSqVuueUWv1qdcFdY/Vdbc8DcEAfmhjCY+0RRARem0vjVkwbmrp5gbogDc0MYzF0xZs2addZZZ1155ZXbtm3TirnQ9bGbT506tUGDBhdffPG4ceNks0ePHjrq9kyaNKlt27a1a9ceOXKkVkaPHq2jBw4caNSokRY9Dh06JCuRUTmEVvbs2XPRRRfJ4a666qrvvvtOi6mQuQsLC3UB5557br9+/XRUDyoNkydPrlu3bt++fbUua7jssstk2i5dunz77bdaFLw1w3GBuSEOzA1hMHcFUNWJvL/44osbbrjBilnMrcmyZcvWrl1bp04db9TdFA4ePGhDKlHDmg2RvdRFqOJvVfvjjz8ulWHDhm3cuPHGG2+UfMOGDcUx5l6wYMHbb78tGn7mmWfsEHbQzZs3y8ySiK11r5tvvln83a5du5kzZ9pUqdJrhuMCc0McmBvCYO4KIH46++yzo8Us5j711FMlOeOMM0Sr7i6u6iS/+uqrNe/fv78OqUQ//vhja/PwJolWbDMVMvf27du1wSjOHPSCCy6IziD06tVL9tIhuU3XoWJnzXBcYG6IA3NDGMxdAVLHb25F7mvPPPNMqXz55ZfRUd10KXa+LY/DOuMqtpkKmdtttjzO3MKiRYtatGghm7Vq1SrOmNtF26D8YG6IA3NDGMxdAVRRr7zyytq1a+O+Ld+2bZvY3WQmjy1bttyzZ8+zzz4r+ZIlS6SoX0SvX7/enbZevXq7d+9euHCh7limuXXCyy+//NChQ+eee25x5tvy4cOHb9q06eabb05l/bZcDyqrbdiwoebFzrflW7Zscb8tP/XUU1etWrV582br1Bm8NcNxgbkhDswNYTB3Bbj33ntVXULU3BdffLEO1a9fXxMdddG/Ghs0aJBVZLNnz57/68gUyzR3cenJZVMmdyta1LaouS+88ELtqVu3rjXrQa+99tpf90+lXnrpJe9AMho9eqqspUIUzA1xYG4Ig7khiv1tuT8AJwHMDXFgbgiDuSEK5q5KMDfEgbkhDOZOFnw1nX9gbogDc0MYzA2QWzA3xIG5IQzmBsgtmBviwNwQBnMD5BbMDXFgbgiDuQFyC+aGODA3hMHcALkFc0McmBvCYG6A3IK5IQ7MDWEwN0BuwdwQB+aGMDXT3Dt27PBLDps3b37kkUf8agwFBQV+KYa2bdtaXp69Dh065JcyuFOVHz1oeU6tc+fOfqlqKf8CynMlqzmYG+LA3BAm6eZeu3Ztu3bt5O37vffek8358+cXpClOv6cLa9assebGjRtLZfDgwWpuyV988UVJWrVqZf1du3bVpMCZZP369XKg9u3bF6Qn1CHFcp28devWtterr75qPUKbNm3cvWzZ/fv31+L48eOtoV+/ftYZN9Xw4cN1Uzwnj/v27ZPigw8+6C3Vdpdk1qxZWlm0aFGTJk2kuGLFCp3ZnV/FaRdTTn/hwoWaS33evHmWe7h1u9pW//bbbyUfNmyY9mjR/sEVRYu6AM212V2Azqz5qlWr3N2TCOaGODA3hMkDc2ui7+PyqG/rn332mVZc9J/MKs7ccxdEzP31118XO/fc99xzj+hNJ7QDedhRrLM47WBTS58+fbxON9dk+fLl5mavwaYSX8rm7t27bfSBBx6Qxy1btmjnoEGDijPm1oq7u+1l99yTJ0+2omJLNXGaI+fOnbts2TIddXfxkKNbblfbuwJDhgwpLn1tM3uUWoDbIM+muwCbWcny5UQiwNwQB+aGMHlgbhFtsWNuG4oKZsKECZqYuUeOHKmJ9Ui+bdu2UaNGSf7UU09ZvUxzT5061YrffPONDY0dO1aL3lG8ZesdsGGbNtWcOXMksbvn4szM9s2/3rt75nZXoo96asrMmTN37txpm7ZUM7cNKdIfrHssXry42LnaNm2XLl1s0722hruAYIMuwGYWDh48+L/hZIK5IQ7MDWHyw9zNmze3SqdOnfSr5qhgVq1a1axZM7lJVdsdPnx4+vTpIgm9554yZYoketstetPdx4wZ065du61bt7o69BysiTTI5HoTP3DgwPvuu8+GunfvLje43u+53WXv2rXLhhT1erEzlZlbnjKdqjzmdldi5m7Tps2iRYus4qJLtV8z68WU0//qq6/k4ujZCXJNzKzz58/XRLj77rt79+6tuV1tyQcMGNCrVy+tm57t2uqm4i5AG/TZdBegM+sC+vbt6+6eRDA3xIG5IUwemNsvJY3XXnstalChffv2fumEIgfVL8wrw9KlS/1S1eL9liGJYG6IA3NDmKSbGyDpYG6IA3NDGMwNkFswN8SBuSEM5gbILZgb4sDcEAZzA+QWzA1xYG4I0zGN/14CAFUF5oY4MDfEgrwBcoK+9DA3xIG5IRv2DgIAVYz/agTIgLkBAACSBOYGAABIEpgbAAAgSWBuAACAJIG5AQAAkgTmBgAASBKYGwAAIElgbgAAgCSBuQEAAJIE5gYAAEgSmBsAACBJYG4AAIAkgbkBAACSBOYGAABIEpgbAAAgSWBuAACAJIG5AQAAkgTmBgAASBKYGyA/6ZjGrwJA8sHcAPkJ5gbIVzA3QL6hzjb8YQBIOJgbIN/A3AD5DeYGyEPQNkAeg7kB8hPMDZCvYG6A/ARzA+QrmBvK4KZeMwiCqMrwX4QApcHckI3oewpBEFUT/qsRIAPmhlj07aOo+CeCIKoykDdkB3NDGLRNELkNzA1xYG4Ig7YJIreBuSEOzA1hMDdB5DYwN8SBuSEM5iaI3AbmhjgwN4TB3ASR28DcEAfmhjCYuzKRSqVuvuXWaL2cMWr0ozJDtF59QldY/nOs/mdUDQNzQxyYG8Jg7uOKVBp3s/xWi0b191x5zO1ek+p/RtUwMDfEgbkhDOY+rjix5q7+cbzmJioQmBviwNwQpqaZWzXjyiaYa9K0WYvoqKEVsZpVRj8yRjsbNGyolTp16hw8/KMWL7jg99b50szZRc4d6rzCRTakeEcc/sAomyca1nb9DTfK5qHv/mkVYdnylXas9Zu2a9H2+vOfr9bNotLL1oprbh1SbrjxJql079HLLbZrf5d3z3366afbqLta96Jp8R8rV1vFijUkMDfEgbkhTI0y9/gJz5oVtmz/WpM2bdtbUZK3ly7TxC2ee955lrte8do0b9jwjGhRD73g7Xe1PnvuvKLQd8vaf8opp7j7frRyjeVe7PrmkDs09P4R7o4SsnLN9VjC1/u//WrLTmu77fY73E3dS5L69evbXt4994MPPWKd3o7uGTVo0MCdMJoPGnyfJnpxrOHegYNt8poQmBviwNwQpkaZuyijDeHa6653i+3v6nTFlX8yebgiict18+prrvWGNHFxGxS5LS6KmNtGo/1u3Y227TqkMrfa7jw33nSz5itXfSGbb8xfGPcpwdt0KYq/59bR6DzuUdy6l+tFm79gseQHvj0i+YiRD2mPMPWFmvUzibkhDswNYWqauTW+OfCda4h69X79Uvf3F16kFd3Mnuum3Y/akNcTDWuIem5/0Q9um30siIsZL8+JHk42a9WqpbkeQqYtp7ndBtvdzN2lWw9J7vh747gdo2cUzHXCwoVLUhlzW8gnKnfymhCYG+LA3BCmRpl72fKVqhBFb3w1tBLcdPMBg4boplZSIXNbbkQPfc211xU5nmvX/i53VIvde/aOFqPR795B1qA333d17PK/fVKp2rVru8ey0FHbDB4ueM/dtVtPHXXnSaV/oe4exft1++tvLrB+z9zexUnFnGm+BuaGODA3hKlR5s4SNVAYRDUJzA1xYG4Ig7mLMtpet3FbdIggTnZgbogDc0MYzF2UNndS/p7Zvk9Wog1E4gJzQxyYG8JgboLIbWBuiANzQxjMTRC5DcwNcWBuCIO5CSK3gbkhDswNYTA3QeQ2MDfEgbkhDOYmiNwG5oY4MDeEwdwEkdvA3BAH5oYwmJsgchuYG+LA3BAmv83dqlUrywsKCixv3LhxMM8SIx98KFq0+GrzjmgxGtknsWjTtm20mD3csytnPPzIY9FiMCoweTmjPDOX89omNzA3xIG5IUzNNHenzl2emThZkneX/ePxseOiO1p06HDXuPETitLSfe+DjzzTyOjYcU/OmDW7IM2CRUul2L59B51TKo88+rj7yUDN/cnqL5s2bao9a77c0KJFiyXvflCU/h99N2vWrFOnzmruZctXNG/eYu2GLe4RBw4c3Kt3H0k+X7tx2669zZs3f//Dj/VYa77YoD3dunV3d3Fj6H3Duvfo6a5Z5tm8bbcs0k6ta9du8vjpmrV67tYpxWkvHvtp0auqZ9e2Xbsi55QlevToOfn5F9x/OqXIWXZ0Ep1ZlrFxyy65FJLLddZOWYl3bfMyMDfEgbkhTI01tzjvtTcKpeiZe/Xn64O7RM1974BBltt9oTVs373PbbZJ5HHFqs+tR5OZL7/q7quJrNDbfczY8Zp06dJVVLdjz/502zHb6S5i/aK0Jt293DNy/5EVveeWefSfKrejq7mfnPCMddqQJ11vVE7HLubsuW/Y7u6y4yaRZWxIX0OpuOYu4p4bajCYG8LUWHMfPPyjVL5YvznLPbdnbrkJ1sq+Q99r8ev9h/UQUXN7uU0ij5u373F7ZJLX5hW6/Zas+PQzWao19+7T1xpEdZr36Xu37TJs+IiPP/nM+oPxwvSZumYzt9btoOpL917fhqZMfUEemzRp4hbd07QV7tlbFC1qZ3ASdxlynTXH3FDDwdwQJr/NXRBCvOvqMIu59aa8IG0Xle6kyVNlU53Xpm1bG9VjLVi0tHDBYivakIVO0rRpU+vRr6l1DePGT9B6mzZtdHdB7WWhxf1FPwTN7SbB0N21RxObR0+tIHNEXZh2Dh4y1N3Fu112T9l6ho8YGT2ufoWuuU5iM8sy2rZrJ/nS9z60Hjv3Ar4thxoJ5oYw+W3umhZfrt/s3uwmKOwDRA0MzA1xYG4Ig7kJIreBuSEOzA1hMDdB5DYwN8SBuSEM5iaI3AbmhjgwN4TB3ASR28DcEAfmhjCYmyByG5gb4sDcEEbeNZA3QeQq9AXovywB0mBuiEXfO/A3QVRxoG3IDuaGMjB/EwRRZeG/DgEcMDcAAECSwNwAAABJAnMDAAAkCcwNAACQJDA3AABAksDcAAAASQJzAwAAJAnMDQAAkCQwNwAAQJLA3AAAAEkCcwMAACQJzA0AAJAkMDcAAECSwNwAAABJAnMDAAAkCcwNAACQJDA3AABAksDcAAAASQJzAwAAJAnMDQAAkCQwN0B+0jGNXwWA5IO5AfITzA2Qr2BugHxDnW34wwCQcDA3QB6CuQHyGMwNkIegbYA8BnMD5CeYGyBfwdwA+QnmBshXMDdk45VHGhEEkZPwX40AGTA3xBJ9KyEIosrCf0ECZMDcEMux944jqwmCqPpA3pAFzA1hfn3jiLyhEARRNYG5IQ7MDWHQNkHkNjA3xIG5IQzmJojcBuaGODA3hMHcBJHbwNwQB+aGMJibIHIbmBviwNwQBnMH4+qr/pDK0LFd42hDJUNnjtaDDU883L/M/rjQHY2S45/NbZbkr7dcHe0hKhOYG+LA3BAGc0fDPGdEeyoZZU7rNhyva93QHY2S45/NbU5h7pMQmBviwNwQBnN70abl7XFie/6Z4e1b31G7du1+vdta0WR2841XtWv1N93330Ufn9WooTb8eOAff7j0gnPPafTog33dvfQQ7y6YpPl555794eLn3VGlc4cmUdfGLePN2ePq1Kn98bsvRA9k4c6muSRNC2763fm/dXe847br6tY9bce6QncGPYq7o8Q5vz3zrrYFzo7XX3rJBQPu7rDw9QnW8/K0hxs2+I3Ue3Zt+Uvxp9ZMlGBuiAdzQxjM7YWKauL4ocG68PO3KzTx6kLrlre5mzY6Ymi35UumWtHqkixbNEWG/lP8ybSJD0jluQn3ew0lkbtkzW0ZezYttOI3m98Wo1untzytR80t/OvQx1a0vR4Z2Vc+THh119zC8CHdZk4dncr8TkGL+7Yuls8utuPS+c9KsvrDmTs3vNWpfeM3Xh5ryyNKMDfEg7khDOb2Qn0zZ8Zj0XqtWrX2b1si+diH+8nmf75baf2N77jR3V1M7G5q3uTvN1nu1u8f2OU3p9fTyhWXXRRtcF37+qyxkrjLaFD/dLdfG3RHqxvebJpvW/umd8QsuWtu3VHrtU891WuWG3HNX3nhkVTmchHRwNwQB+aGMJjbi3r1ThPN1P9NPa8uxb/c/OuveDeueV02310wSes3Xnel22bqsk0Xr02TdZ+8qvnvzv9tdB7XtXJra3Vdhm6mMk794O0pqZiPDtHZ3C+9tag7SnL9tZdHZ0iFvi13e9wd35w9znruuO067RGGDuhkOxIlmBviwdwQBnNHQwVz681/Pnp45asvPWZOSqW/HJb8gt+do0Wtu3+0pW1xm2uWz/Tqlvxj6bGv08s09/fffJAqvYxe3e7U/hNrbq9ueZnmtnqdOr9+b6+fS6KzERqYG+LA3BAGcwfjz1deqo4R9M+v/u+HVVYRPvvoZe1MZTW3xBln1Hd39Nq+Wj1X88Xznkk55r74wvO0/vnHL3u/53523BDdTIWWcULMfWD7Et3UbyDcnuzmPrjjHc2F+a/+es8tp2DFVPq34O56CMwNcWBuCIO5iRMY7t/Pn3JKLTU3kT0wN8SBuSEM5iZOYHTv1Ny9vb7sDxdGewgvMDfEgbkhDOYmiNwG5oY4MDeEwdwEkdvA3BAH5oYwmJsgchuYG+LA3BAGcxNEbgNzQxyYG8JgboLIbWBuiANzQxjMTRC5DcwNcWBuCIO5CSK3gbkhDswNYfLV3AUFv/67k2MfvS866saO9QuixXLGvm1Lo0U3evfsbCs5enhlQZpF856TvHWrltH+6h92OsHQqy09ZV72p54YES2WM7KvIXGBuSEOzA1hMPdJNbcso3mzppqLreVx98a372zZAnNjbgvMDXFgbgiTT+bWO1p9W9fk9VcmaPLB4hfd0cXzJ2t+/5C7xdydO7WXfMPqN2TowRH36lDXLh3k8Z8HP7LZdm9cVJI2vfVrXSaPLkbjkYcG/6vo439/u6IkY26dzTP3yOH9C5xlu3n3bndpQ4f2rWXzk2WzbOiX4k+z7NK4cWPd1GUHw3a0vG2bY/9+ydLCKbavnO+o9DWRCb1dvEnsahtevy1JcndOueZ3dWgjm4d2vlcQWUOb1sc2o2vIctmTFZgb4sDcECafzL1/2zvNmzdTMehjiXPPHRwtce65m6Vvjh96YMCx5u3vaPG+wX3v7dejSZNfpbPly0K3P3rPrdbUeOu1iZqob/Tb8nZtW2numnvY0LvlMXOgY0eSA8njD/uWa8PQQX00keI9fY/9Q2Ga26NVbBeZypZtDVvXvmV5SXq1MiqfY+7u09Wb89g60vseM3f6mvTu2dkagpOUhO653dE9m962vdw59ZpLDLq3l+6uj6VMn3UNiQ7MDXFgbgiTT+bWN3TVgL25y11vltESx9ziuZLMt7hFu9/Xorhk0oQHrdnrP7jjXXfIC7WOucfuuTV3za0H9Q5kk8hj06ZN9FOCbNr3zN26HPuU4J6Lu8vMaWO8uhdDMp8GCl979smxw919veujR9RPDN7h3ElKMldbejTxRp97epTt6M5pZ+Q+O96Bsqwh6YG5IQ7MDWHyydxfrJgrOtQvUQ/ufFdu2CR59KHBbUFWNxkAAB4OSURBVNvcKUV3VKJ9u9ZiSrm3LtPcx4pjh0v/gR3HbsS9fp1cK168+erTln/83owyzX0sGTu8S+f2A/r3lPyl5x+XHr2HlgYxd4sWzbRtyMDefXt30dzVmLvLzg0L3WUHo1WrlhtWv6Fa7dm9o/4WQIdkGbqvZ267sMFJ5GrLDNKjiTe6cc08vewl5TB3SXoNcilemf6E169riLvsiQvMDXFgbgiTT+bO46jM33OVMwrSVMGBCC8wN8SBuSEM5iaI3AbmhjgwN4TB3ASR28DcEAfmhjCYmyByG5gb4sDcEAZzE0RuA3NDHJgbwsi7BvImiBwG5oY4MDfEgrkJIlfx60dngBCYG2LR9w6CIHIS/gsSIAPmhjKIvqEQBHFSw38RApQGcwMAACQJzA0AAJAkMDcAAECSwNwAAABJAnMDAAAkCcwNAACQJDA3AABAksDcAAAASQJzAwAAJAnMDQAAkCQwNwAAQJLA3AAAAEkCcwMAACQJzA0AAJAkMDcAAECSwNwAAABJAnMDAAAkCcwNAACQJDA3AABAksDcAAAASQJzAwAAJAnMDQAAkCQwNwAAQJLA3AAAAEkCcwMAACQJzA0AAJAkMDcAAECSyL25lzgEi1Yvf9GrB4tWj1bK02lFrx6tWDGuXsmiV69k0eqVLHr1ShatXv6iVw8WrR6tlKezAkWvHixaPVqJ6yxPc7Rixbh6JYtevZJFq1ey6NXLX7R6JYtevZLFuHq0kr0YV69k0atHK1YMdsY1V7Lo1ctfdOu5JffmBgAAgPKDuQEAAJIE5gYAAEgSmBsAACBJYG4AAIAkgbkBAACSBOYGAABIEpgbAAAgSWBuAACAJIG5ASpCQUGBX3KIjn744YfuZrShMlRmtvHjx/slZ8KDBw+WHgnz/vvv+6XSzJ8/3/JyzlmSXpus5OjRo/4AQM0GcwOUon///gMGDFAViTamTZt233332VCbNm00nzp16ptvvql5s2bNhg0bJkn37t2feOKJl19+uSCNjpak5xHeffddeRwzZsyuXbumT58udXFS8+bN5Vj33HOPbPbp00fyVq1a6V7t2rV77bXXdHfZSzYlX7FiRdOmTf/73/9KXlhY2KNHj2XLlnXq1MmO5TZs2LBB5t+0aZPka9eulXWqNffu3SsnYudoFT07W/+6detk8//+7//kCsi5S/7FF1/8+OOPnTt33rlzpx1RmDVrlna2bdv2gw8+0KLMMGnSJLmYmuuBdE4hbk5vbXKdJZkyZYruBQAlmBsgSM+ePUsyVpsxY4Y71L59e3lUNX733Xc///yz3hRqs2J+UtTTJU6PSE4e+/btK4+//PLLli1bdEhyTZ5//nl5FNm7e23evFkTqUj+73//uyS9klWrVkUb5FE+dujm9u3b9+/fr7mh59iiRQu3qGen6+/du7c89uvXT4e+/PJL3aWk9MkOHDhQE+0cPXq02yOfGCwvycxpm3Fz2tr0OtucAFCCuQFcGjduLPd/S5cuVYvoXbXcttqQJAsWLFi0aJH2Dx8+3O7ChY0bN8pNsGhYNwvSiLrMSQsXLrRH+xJ469atJRntSf7ss8963w9rf0lpt1m+evXqaNGQTwD2aUCRExGjixG1qB8OtFKSPjt3/T/99JPm+inB5tE7aWuTR+uU225N5s6dK48TJkyQx+eee64kfSLarN8xBOeMrk0+5cgnJO0BgBLMDeCirhXuvvtu06daROuFhYWSN23a1B2yXPj000/tBtobsgnd3YUhQ4a4uYjWNsVwrsU/++wzrZekf7UsyWOPPaa7Rxsefvhhy2VVlmsi/pZz/M9//qM7akXPztbvftHdrVu3koxxhd27d2uiDZYI+/btK0l/eTBy5EjZnDNnjg6NHz9eTlznbNKkSdycwbVpAgAK5gaoIIcPHy7zL7OyILvLTfyoUaPEUrL51VdfbdiwQfNkEbwIJ+o30998841fAqjxYG4AAIAkgbkBAACSBOYGAABIEpgbAAAgSWBuAACAJIG5AQAAkgTmBgAASBKYGwAAIElgbgAAgCSBuQEAAJIE5gYAAEgSmBsAACBJYG4AAIAkgbkhzMQIRzP4A5khv1pVu0yMHypztuhQXD3LUFxdiRuKq0+MH9J6liG/WqFdJsYPVWC2qtllYvxQmbNFh+LqWYbi6uUZ8qsTJ7ovQ+dFCfArmBvCTHTecQCg6tGXof/KBMDcEAfmBsg5mBuCYG4Ig7kBcg7mhiCYG8JgboCcg7khCOaGMJgbIOdgbgiCuSGM/xYCAFWO/7IESIO5IYz/FgIAVY7/sgRIg7khjP8WAgBVjv+yBEiDuSEMv+cGyDn8nhuCYG4IU/XmTqXxq2Uhu3zwwQd+9XiowHErsIvL448/Lrv/5S9/8QfKopLHPZqZIXporf/mN7/x6rVq1dKhVOWOW0kqs4BvvvnGTmHAgAHln6ewsNCOq0+Z11AFYG4IgrkhDObOQgV2ccmhuePQmaPmPnlHrDJuvfXWip2Ca+5cgbkhCOaGMMdrbn2PM9xiy5Ytg/Vg0ZJPPvnE6s8991xwL2/T5fe//310tGHDhrpZp04d6ww2CKNHj9binDlzrHjTTTf16dPHNlORZWjFw53haGlzd+zYUfKePXtKPnXqVMkvu+yyo6XXP3fuXO+gstfRmNXq5jXXXCOPrVu3zizhV3TUPjTopgjbkmizcs455+iyd+3apRVpePrpp61h1apVtpfM77Zp4l5zQ4ekX5MXXnjhaOb6RGfQXWy1whVXXOHOEz1r63SxITuu8MQTT2j9uuuu00rcPbcW7adai1YXZs+encpczODPYfnB3BAEc0OYSpr7hx9+iBZTpd/7DLfZEpXZ7t27JS8qKvrxxx9/7c7gzaMzG+6QjbqVn3/+2S1GG4LFqLmDC/PwRstjbneXOHO7lVRotdnNXVxc7Danymfu66+/XityAd2G2rVr217SY/579tlnrcedXLEh42jm+tiBrE0S76Ba9OYpv7lvuOEGK9aqVcvbpV+/fpocDZnbWL58uRS///57q5x66qmpzMW0oqIzlB/MDUEwN4Q5XnPL+9f5559v71CXX375UecN92jmvtP6b7vtNvsdqtf88ccfW27JzJkzJfnpp59sBiUV82251IcMGeJVdCrLp0yZ4tbdBt2Uhtdff12Sf/zjH1bXIevUhbk7ekRniJq7b9++RyPm9tavRTuQd9BU6dOJXihFR/XQmrv17N+W67ILCgrcoT179kj+2GOPpTIHTaXVdejQIXd39bfu6GINQrdu3TT3DuS2uf26Wb9+fasHz1o/AWju/p7bncry1157TZKdO3dK3qlTJ6tHzW25fmTRols3c8vzGFxYecDcEARzQxj/LSQrKid5p9NNyX/3u99pYu9l7777bsp5cxfkNkVdFW3WfP/+/fLYoUMHLd5+++1a9zqD5n7rrbe8ZndTufDCC60e16BmdWd2d1FkYaeccortZXUlOkPU3Pfcc8/RzJfPam53/YMHD9Yd3flt1PBOJ4iOVsbcwaF169ZJvmTJEq1738ZL8uKLL7r7Gu4k8+bNk3zfvn3RPwezNrc/S90li7mj6+zZs6c1qMV1M4u5Ndfkuuuus7pezOjP4XHhvywB0mBuCOO/hWTFfb9btmxZKiRjz9y33HLL0cyfLkeb7YtKq3z++eeaCD169LC6JPKOb0PG7t27NbFJ9LfC1tCqVasdO3ZkaRCk4bvvvks578gPPfSQPNarV8864xZmeDMcLW3uYcOGSX7BBRcczaxEzR1dv5cHV3s0q8OOZkb10O5ZaP24zN2gQQPZvP/++yWX9btTRY1YHnPberKYWw+qRb2wcs3dhijHZe6DBw+mMt921K1b1+plmtt++y75pk2bUpmLac+jNk+bNs02y4P/sgRIg7khzPF+W65vW6KTBQsWpEIyds1t36vH3XML77zzjltZtWqVbiq33nqr1q2S2e9XrJ5yms844wy3vn37duvM0jBr1iyr3HTTTVKR+0KrxC3MxZ3haGlzC2effbYOxf2e2979L7roIq3on4MFV6u59kfRUc9YqszUcZpbmDBhgjYIn376qRZTkfmPlmVu+RiniYoteiCb52jWv1DLtJfiuMwtXHvttbqZ/S/U4nLh1VdflcezzjrLLSraWX74thyCYG4Ic7zmPhnIO922bdv8KuQRFfNZNee9995LpcXvDxw/mBuCYG4Ik1tz6xv66aef7g/A8aCX0fCHqwHVdmEVwL3U+ocL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>