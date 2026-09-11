/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import type { Query } from '@kbn/alerting-v2-schemas';

export type OpaqueBuilderFields = Record<string, unknown>;

export interface GeneratedQuery {
  query: Query;
  grouping?: { fields: string[] };
  time_field?: string;
}

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

/**
 * Narrow union of Elasticsearch field types allowed as typed sub-fields of the
 * `metadata.builder_fields` flattened container.
 *
 * The allowlist matches the ES 9.4 set of types known to work reliably as
 * flattened-field sub-fields: keyword, text, the standard numeric types, date,
 * ip, and boolean. `scaled_float` requires a `scaling_factor`.
 *
 * Per the registration design's open question: whether to widen this to accept
 * anything Elasticsearch supports. The narrow allowlist is the safe start.
 */
export type MappingProperty =
  | { type: 'keyword' }
  | { type: 'text' }
  | { type: 'integer' }
  | { type: 'long' }
  | { type: 'short' }
  | { type: 'byte' }
  | { type: 'double' }
  | { type: 'float' }
  | { type: 'half_float' }
  | { type: 'scaled_float'; scaling_factor: number }
  | { type: 'unsigned_long' }
  | { type: 'date' }
  | { type: 'ip' }
  | { type: 'boolean' };

export interface BuilderTypeVersion {
  /**
   * Typed sub-field mappings added under metadata.builder_fields in this version,
   * keyed by leaf path (dot notation), e.g. { 'risk_score': { type: 'integer' } }.
   */
  addedSubFieldMappings?: Record<string, MappingProperty>;

  /**
   * Pure backfill over a stored rule's builder_fields, run once per rule during
   * the saved-object migration this version folds into.
   */
  backfillFn?: (fields: OpaqueBuilderFields) => OpaqueBuilderFields;
}

export interface BuilderTypeManifest {
  /** Must equal the BuilderTypeDefinition's type. */
  type: string;

  /** The type's current version; must equal the highest key of `versions`. */
  currentVersion: number;

  /** Dense from 1. Append-only: published versions are never edited or removed. */
  versions: Record<number, BuilderTypeVersion>;
}

// ---------------------------------------------------------------------------
// Compilation contract types
// ---------------------------------------------------------------------------

export interface QueryGenerationInput<TFields> {
  /** The parsed builder fields - the source of truth. */
  fields: TFields;

  /** Read-only framework fields of the rule being compiled. */
  rule: {
    /** Absent on the create path of write-time types; always present at execution time. */
    id?: string;
    kind: 'alert' | 'signal';
    schedule: { every: string; lookback?: string };
    time_field: string;
  };

  /** Present only for execution-time compilation. */
  run?: {
    /** The run's reference time; equals window.end under scheduled execution. */
    now: string;
    /** The time window the framework attaches as the request-level range filter. */
    window: { start: string; end: string };
  };
}

export type GenerateQuery<TFields> = (
  input: QueryGenerationInput<TFields>
) => GeneratedQuery | Promise<GeneratedQuery>;

// ---------------------------------------------------------------------------
// Derived rule fields (execution-time types only)
// ---------------------------------------------------------------------------

export interface DerivedRuleFields {
  time_field?: string;
  grouping?: { fields: string[] };
}

// ---------------------------------------------------------------------------
// Enrichment hook types
// ---------------------------------------------------------------------------

export interface RuleEventEnrichmentInput<TFields> {
  /** The parsed builder fields of the rule that produced the event. */
  fields: TFields;

  /** Read-only identity of the rule, as the run fetched it. */
  rule: {
    id: string;
    /** The rule's metadata.signature_id. */
    signature_id: string;
    kind: 'alert' | 'signal';
  };

  /** The ES|QL result row this event was built from - the event's `data`, pre-merge. */
  row: Readonly<Record<string, unknown>>;
}

export interface RuleEventEnrichment {
  /** Sets the event's mapped severity. Wins over a `severity` output column. */
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';

  /** Merged over the row into the event's `data`; enrichment wins on key collisions. */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Builder type registration interface
// ---------------------------------------------------------------------------

export interface BuilderTypeDefinition<TFields extends object = OpaqueBuilderFields> {
  /** Unique id; also the stored value of metadata.builder_type. E.g. 'security.detection.query'. */
  type: string;

  /** Display name and description, for the Alerting UI's read-only listings and for docs. */
  name: string;
  description?: string;

  /** If set, rules of this type must use this kind; writes with another kind are rejected. */
  kind?: 'alert' | 'signal';

  /**
   * If set, the type is managed: every rule of this type is stamped with this ownership
   * and the generic Alerting v2 API refuses all writes to it. Absent = unmanaged platform type.
   */
  ownership?: { solution: string; domain: string };

  /**
   * When generateQuery runs. 'write_time' compiles on create/update and persists the query
   * (today's behavior, the default). 'execution_time' compiles on every run and persists nothing.
   */
  compilation?: 'write_time' | 'execution_time';

  /** Bounded, strict, default-free Zod schema for metadata.builder_fields. */
  builderFieldsSchema: z.ZodType<TFields>;

  /** Optional cross-field validation beyond the schema; pure; runs on writes after the parse. */
  validateFields?: (fields: TFields) => string[];

  /** The static manifest carrying this type's sub-field mappings and version history. */
  manifest?: BuilderTypeManifest;

  /**
   * For execution-time types only: pure; derives the persisted framework fields
   * (grouping, time_field) from the builder fields on every write.
   */
  deriveRuleFields?: (fields: TFields) => DerivedRuleFields;

  /** Compiles the fields into the rule's ES|QL query. Input and call site per compilation mode. */
  generateQuery: (input: QueryGenerationInput<TFields>) => GeneratedQuery | Promise<GeneratedQuery>;

  /** Optional per-event enrichment of the rule events a run produces. */
  enrichRuleEvent?: (input: RuleEventEnrichmentInput<TFields>) => RuleEventEnrichment;
}

export type RegisteredBuilderType = BuilderTypeDefinition<OpaqueBuilderFields>;

export const defineBuilderType = <TFields extends object>(
  definition: BuilderTypeDefinition<TFields>
): RegisteredBuilderType => definition as unknown as RegisteredBuilderType;
