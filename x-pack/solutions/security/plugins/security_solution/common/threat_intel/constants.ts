/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const THREAT_REPORTS_INDEX = '.kibana-threat-reports' as const;
/** Wildcard omits dash so `.kibana-threat-reports` matches (not only suffixed indices). */
export const THREAT_REPORTS_INDEX_PATTERN = '.kibana-threat-reports*' as const;
export const THREAT_INTEL_SOURCES_INDEX = '.kibana-threat-intel-sources' as const;
/**
 * Outside `.kibana-`, unlike the two above, because a Detection Engine Indicator Match
 * rule has to read it as the rule's own API key. The built-in `viewer` role grants read
 * on everything that does not start with a dot, plus a hand-maintained list of dotted
 * exceptions (`.lists-*`, `.alerts*`, `.siem-signals*`, `.entities.*`). Nothing under
 * `.kibana-` is on that list, and adding one would widen the grant well past this
 * feature, so `.kibana-threat-intel-indicators` returned a security_exception to the one
 * consumer it exists for.
 *
 * `ReservedRolesStore` grants `.threat-intel-indicators-*`. That pattern requires the
 * hyphen, so it covers the per-space filtered aliases and never this bare index, which
 * carries every space's candidates at every confidence level.
 *
 * Reports and sources stay under `.kibana-`: only the internal user touches them. Feed
 * URLs are resolved from the code catalog and are not stored in the sources index.
 */
export const THREAT_INTEL_INDICATORS_INDEX = '.threat-intel-indicators' as const;
export const INDICATOR_REFERENCE_PREFIX = 'threat-report:' as const;

export const THREAT_INTEL_API_BASE = '/internal/threat_intel' as const;

export const CREATE_THREAT_REPORT_API_PATH =
  `${THREAT_INTEL_API_BASE}/create_threat_report` as const;
export const EXTRACT_IOCS_API_PATH = `${THREAT_INTEL_API_BASE}/extract_iocs` as const;
export const EXTRACT_DIAMOND_API_PATH = `${THREAT_INTEL_API_BASE}/extract_diamond` as const;
export const ASSESS_RELEVANCE_API_PATH = `${THREAT_INTEL_API_BASE}/assess_relevance` as const;
export const ENRICH_TAXONOMY_API_PATH = `${THREAT_INTEL_API_BASE}/enrich_taxonomy` as const;
export const CLASSIFY_SEVERITY_API_PATH = `${THREAT_INTEL_API_BASE}/classify_severity` as const;
export const LIST_SOURCES_API_PATH = `${THREAT_INTEL_API_BASE}/sources/list` as const;
// The approved catalog is fixed: the only mutation is toggling `enabled` on an
// existing source via PATCH, so there is no create-source path.
export const SOURCE_BY_ID_API_PATH = `${THREAT_INTEL_API_BASE}/sources/{sourceId}` as const;

export const FIND_THREAT_REPORTS_API_PATH = `${THREAT_INTEL_API_BASE}/reports` as const;
export const GET_THREAT_REPORT_API_PATH = `${THREAT_INTEL_API_BASE}/reports/{reportId}` as const;
export const READINESS_API_PATH = `${THREAT_INTEL_API_BASE}/readiness` as const;

/**
 * Text-embedding endpoint backing the `semantic_text` Diamond summary fields in
 * the reports mapping. This is not the model that performs Diamond extraction —
 * that one is resolved per request through
 * `THREAT_INTEL_DIAMOND_INFERENCE_FEATURE_ID`.
 */
export const DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID = '.jina-embeddings-v5-text-small' as const;

/**
 * Inference feature registry ids. Operators pick the model for each of these in
 * Stack Management > Model Settings; the enrich routes resolve through them
 * instead of naming an endpoint themselves.
 */
export const THREAT_INTEL_ENRICH_INFERENCE_FEATURE_ID = 'threat_intel_enrich' as const;
export const THREAT_INTEL_DIAMOND_INFERENCE_FEATURE_ID = 'threat_intel_diamond' as const;

/** Visible from every space (seed catalog). */
export const GLOBAL_SPACE_ID = '*' as const;

/**
 * Upper bound for user-supplied URLs on HTTP routes. `schema.uri()` validates
 * format but carries no length bound, so without this a URL could grow to the
 * body cap. Enforced via `validate` since `URIOptions` has no `maxLength`.
 */
export const MAX_URL_LENGTH = 2048;

export const FETCH_ADAPTER_TYPES = ['rss', 'text_indicator_list', 'kev'] as const;
export type FetchAdapterType = (typeof FETCH_ADAPTER_TYPES)[number];

/**
 * Stable document ids for the fixed, code-authoritative source catalog. Keep in
 * sync with `DEFAULT_SOURCES` in server setup seeding.
 */
export const APPROVED_CATALOG_SOURCE_IDS = [
  'kev:cisa-known-exploited-vulnerabilities',
  'vendor_api:elastic-security-labs',
  'rss:mandiant-research',
  'rss:unit42',
  'rss:talos',
  'rss:crowdstrike',
  'rss:cisa-alerts',
  'text_indicator_list:maltrail-cobaltstrike',
  'rss:aws-security',
  'rss:aws-security-bulletins',
  'rss:fortiguard-advisories',
  'rss:fortiguard-threat-signal',
] as const;

export const APPROVED_SOURCE_IDS: ReadonlySet<string> = new Set(APPROVED_CATALOG_SOURCE_IDS);

export const REPORT_SOURCE_TYPES = [
  'rss',
  'text_indicator_list',
  'kev',
  'email',
  'manual',
  'telemetry',
] as const;
export type SourceType = (typeof REPORT_SOURCE_TYPES)[number];

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/**
 * The `ioc_tier` values a consumer that wants precision should see.
 *
 * `.threat-intel-indicators` deliberately stores the full candidate set,
 * including `uncertain`, because precision is a property of the consumer rather than
 * of the intel: a hunt query wants recall and a blocking rule wants precision, and
 * one write-time threshold cannot serve both. This is the read-side half of that
 * split, and the filtered per-space alias is built from it.
 */
export const PRECISION_IOC_TIERS = ['discriminating', 'contextual'] as const;

export const IOC_TYPES = ['hash', 'ip', 'domain', 'url', 'email', 'cidr', 'wallet'] as const;
export type IocType = (typeof IOC_TYPES)[number];

export const THREAT_CATEGORIES = [
  'ransomware',
  'phishing',
  'malware',
  'data-breach',
  'vulnerability',
  'nation-state',
  'supply-chain',
  'insider-threat',
  'financial',
  'regulatory',
  'cloud-security',
  'iot-ot',
  'zero-day',
  'apt',
  'general',
  'cloud',
  'cybercrime',
  'iot',
  'ot-ics',
  'government-policy',
  'privacy-compliance',
  'research-tools',
] as const;
export type ThreatCategory = (typeof THREAT_CATEGORIES)[number];

export const THREAT_REGIONS = [
  'north-america',
  'south-america',
  'europe',
  'middle-east',
  'africa',
  'south-asia',
  'east-asia',
  'southeast-asia',
  'oceania',
  'global',
] as const;
export type ThreatRegion = (typeof THREAT_REGIONS)[number];
