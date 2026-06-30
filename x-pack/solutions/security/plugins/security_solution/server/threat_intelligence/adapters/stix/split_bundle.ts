/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * STIX 2.x SDO subset that the threat-reports data stream can express
 * as a "report".
 *
 * Excludes:
 *  - `relationship` / `sighting` / `language-content` — modeling glue
 *    between SDOs, no narrative content of their own.
 *  - `marking-definition` / `identity` — TLP / actor identity,
 *    structural metadata.
 *  - `artifact` / `directory` / `file` / etc. — observables; they
 *    belong under `extracted.iocs` after the
 *    `nl_extraction_behavioral` workflow runs, not as standalone
 *    reports.
 *
 * The closed list keeps the bundle splitter deterministic: an unknown
 * `type` is treated as "skip" rather than "best-effort include", which
 * means a future SDO type added by the STIX spec won't silently start
 * polluting the data stream the moment a feed publishes one.
 */
export const STIX_REPORTABLE_TYPES = [
  'indicator',
  'malware',
  'malware-analysis',
  'threat-actor',
  'intrusion-set',
  'campaign',
  'attack-pattern',
  'course-of-action',
  'tool',
  'vulnerability',
  'report',
  'note',
  'opinion',
] as const;

export type StixReportableType = (typeof STIX_REPORTABLE_TYPES)[number];

const REPORTABLE_SET: ReadonlySet<string> = new Set(STIX_REPORTABLE_TYPES);

export interface StixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  pattern?: string;
  pattern_type?: string;
  labels?: string[];
  created?: string;
  modified?: string;
  /** STIX 2.x `report` SDO. Carries the human-readable narrative. */
  abstract?: string;
  /** Some vendor STIX dialects ship `summary`. */
  summary?: string;
  // Allow arbitrary extra fields without forcing every consumer to cast.
  [key: string]: unknown;
}

export interface ExtractedStixObject {
  /**
   * The full SDO object as it appeared in the bundle. Adapters use
   * `id`, `type`, `name`, `description`, `pattern`, and the timestamps;
   * keeping the raw object around (instead of pre-shaping) lets future
   * extractors (e.g. an indicator-pattern parser) consume the same
   * splitter without changing the contract.
   */
  object: StixObject;
}

/**
 * Walk a STIX bundle and emit the SDOs that map to threat-report
 * documents.
 *
 * Tolerant of non-canonical inputs:
 *  - Bundles with no top-level `type` (some TAXII envelopes ship the
 *    objects array directly).
 *  - Objects missing `id` (skipped — no stable fingerprint seed).
 *  - Vendor-specific subtypes that don't match the closed reportable
 *    set (skipped silently; the caller logs a count).
 */
const isReportableSdo = (obj: unknown): obj is StixObject => {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Partial<StixObject>;
  if (typeof candidate.type !== 'string' || typeof candidate.id !== 'string') return false;
  return REPORTABLE_SET.has(candidate.type);
};

export const splitStixBundle = (raw: unknown): ExtractedStixObject[] =>
  extractObjects(raw)
    .filter(isReportableSdo)
    .map((object) => ({ object }));

const extractObjects = (raw: unknown): unknown[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'object') return [];
  const bundle = raw as Record<string, unknown>;
  if (Array.isArray(bundle.objects)) return bundle.objects;
  // TAXII 2.1 collection objects endpoint returns `{ objects: [...] }`.
  // Some legacy TAXII servers return the bare bundle without the
  // `objects` envelope — fall through.
  if (bundle.type === 'bundle' && Array.isArray(bundle.objects)) return bundle.objects;
  return [];
};

/**
 * Best-effort body composition for a reportable SDO.
 *
 * STIX SDOs have wildly different shapes; the only fields that always
 * mean "describe this thing in prose" are `description` and `abstract`.
 * We append `pattern` for `indicator` SDOs because the pattern itself is
 * the most useful chunk of detection-relevant text the SDO carries.
 *
 * Falls back to the SDO's `id` so the consumer always has a non-empty
 * `body_text` (the data-stream mapping uses `semantic_text` which would
 * otherwise embed the empty string at inference time).
 */
export const composeStixBody = (object: StixObject): string => {
  const parts: string[] = [];
  if (typeof object.description === 'string' && object.description.length > 0) {
    parts.push(object.description);
  }
  if (typeof object.abstract === 'string' && object.abstract.length > 0) {
    parts.push(object.abstract);
  }
  if (typeof object.summary === 'string' && object.summary.length > 0) {
    parts.push(object.summary);
  }
  if (object.type === 'indicator' && typeof object.pattern === 'string') {
    const patternType = typeof object.pattern_type === 'string' ? object.pattern_type : 'stix';
    parts.push(`Pattern (${patternType}): ${object.pattern}`);
  }
  if (Array.isArray(object.labels) && object.labels.length > 0) {
    parts.push(`Labels: ${object.labels.join(', ')}`);
  }
  if (parts.length === 0) {
    return `STIX ${object.type} ${object.id}`;
  }
  return parts.join('\n\n');
};

/** Display title — `name` when present, otherwise `<type> <id>`. */
export const composeStixTitle = (object: StixObject): string => {
  if (typeof object.name === 'string' && object.name.trim().length > 0) {
    return object.name;
  }
  return `${object.type} ${object.id}`;
};
