/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { conditionSchema as streamlangConditionSchema } from '@kbn/streamlang';
import { z } from '@kbn/zod/v4';

export type EntityType = z.infer<typeof EntityType>;
export const EntityType = z.enum(['user', 'host', 'service', 'generic']);

export const ALL_ENTITY_TYPES = Object.values(EntityType.enum);

const mappingSchema = z.any();

const retentionOperationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('collect_values') }),
  z.object({ operation: z.literal('prefer_newest_value') }),
  z.object({ operation: z.literal('prefer_oldest_value') }),
  z.object({ operation: z.literal('managed') }),
]);

const fieldSchema = z.object({
  allowAPIUpdate: z.optional(z.boolean()),
  destination: z.string(),
  mapping: z.optional(mappingSchema),
  retention: retentionOperationSchema,
  source: z.string(),
});

const euidFieldSchema = z.object({
  field: z.string(),
});

const euidSeparatorSchema = z.object({
  sep: z.string(),
});

// Field evaluation: pre-evaluate a field before euid generation (first match wins; fallback to source value or fallbackValue).
const fieldEvaluationWhenClauseSourceMatchSchema = z.object({
  sourceMatchesAny: z.array(z.string()),
  then: z.string(),
});
const fieldEvaluationWhenClauseConditionSchema = z.object({
  condition: streamlangConditionSchema,
  then: z.string(),
});
const fieldEvaluationWhenClauseSchema = z.union([
  fieldEvaluationWhenClauseSourceMatchSchema,
  fieldEvaluationWhenClauseConditionSchema,
]);

const fieldEvaluationSourceSchema = z.union([
  z.object({ field: z.string() }),
  z.object({ firstChunkOfField: z.string(), splitBy: z.string() }),
]);

const fieldEvaluationSchema = z.object({
  destination: z.string(),
  sources: z.array(fieldEvaluationSourceSchema),
  fallbackValue: z.string().nullable(),
  whenClauses: z.array(fieldEvaluationWhenClauseSchema),
});

const euidCompositionSchema = z
  .array(z.union([euidFieldSchema, euidSeparatorSchema]))
  .min(1)
  .refine((parts) => parts.some((part) => 'field' in part), {
    message: 'Each EUID composition must contain at least one field part',
  });

const euidRankingBranchSchema = z.object({
  when: streamlangConditionSchema.optional(),
  ranking: z.array(euidCompositionSchema).min(1),
});

export const euidRankingSchema = z.object({
  branches: z.array(euidRankingBranchSchema).min(1),
});

// Any field used in the euid calculation must be mapped in the fields array,
// otherwise we won't have guarantees of field being available
const calculatedIdentityFieldLogicSchema = z.object({
  // Ranking mechanism for EUID: branches evaluated in order; first matching branch wins.
  // Branch with no `when` always matches (fallback). Used by ESQL, Painless, Memory, DSL.
  euidRanking: euidRankingSchema,

  // Optional pre-evaluated fields (e.g. entity.namespace from event.module). Applied before
  // euid generation and translated to ESQL, Painless, and in-memory.
  fieldEvaluations: z.optional(z.array(fieldEvaluationSchema)),

  // Document-level filter (Condition from @kbn/streamlang). Only documents matching this
  // filter are considered for this entity type. Must express "at least one identity field
  // present" (and any entity-specific rules, e.g. user IDP pre-conditions). Translated to
  // DSL and ESQL via conditionToQueryDsl and conditionToESQL.
  documentsFilter: streamlangConditionSchema,

  // When true, the entity id is not prefixed with the entity type (e.g. output "a" instead of "generic:a").
  skipTypePrepend: z.optional(z.boolean()),
});

/**
 * Single-field identity: entity is identified by one field only (e.g. service.name, entity.id).
 * No composition, no field evaluations. ESQL/DSL use a simplified path for this shape.
 */
export const singleFieldIdentitySchema = z.object({
  singleField: z.string(),
  // When true, the entity id is not prefixed with the entity type (e.g. output "a" instead of "generic:a").
  skipTypePrepend: z.optional(z.boolean()),
});

const identityFieldSchema = z.union([
  calculatedIdentityFieldLogicSchema,
  singleFieldIdentitySchema,
]);

// Field value: literal string, single source reference, or composition (CONCAT of fields).
const fieldValueSchema = z.union([
  z.string(),
  z.object({ source: z.string() }),
  z.object({
    composition: z.object({
      fields: z.array(z.string()).min(1),
      sep: z.string(),
    }),
  }),
]);
export type FieldValueSchema = z.infer<typeof fieldValueSchema>;

// Schema for "when condition true set fields" (condition + field overrides). Used e.g. for pre-agg overrides.
export const setFieldsByConditionSchema = z.object({
  condition: streamlangConditionSchema,
  fields: z.record(z.string(), fieldValueSchema).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field override is required',
  }),
});
export type SetFieldsByCondition = z.infer<typeof setFieldsByConditionSchema>;

export const entitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: EntityType,
  filter: z.string().optional(),
  entityTypeFallback: z.string().optional(),
  fields: z.array(fieldSchema),
  // Optional evaluated fields applied before pre-agg overrides and STATS for all entity types.
  fieldEvaluations: z.optional(z.array(fieldEvaluationSchema)),
  identityField: identityFieldSchema,
  indexPatterns: z.array(z.string()),
  // Optional filter (Condition from @kbn/streamlang) applied in ESQL only, right after the
  // LOOKUP JOIN, to filter rows (e.g. keep already-stored entities or IDP-like events). No DSL equivalent.
  postAggFilter: z.optional(streamlangConditionSchema),
  // Optional: when conditions are true on source docs, set the given fields (EVAL after field evals, before STATS).
  whenConditionTrueSetFieldsPreAgg: z.optional(z.array(setFieldsByConditionSchema)),
  // Post-STATS EVAL in logs ESQL (recent.* vs plain). Single-doc paths re-apply entries after pre-agg for parity.
  whenConditionTrueSetFieldsAfterStats: z.optional(z.array(setFieldsByConditionSchema)),
});

export type EntityField = z.infer<typeof fieldSchema>; // entities fields
export type CalculatedEntityIdentity = z.infer<typeof calculatedIdentityFieldLogicSchema>; // full identity (euidRanking + documentsFilter + optional fieldEvaluations)
export type SingleFieldIdentity = z.infer<typeof singleFieldIdentitySchema>;
export type EntityIdentity = z.infer<typeof identityFieldSchema>; // definition-time identity (full or singleField)
export type EntityDefinition = z.infer<typeof entitySchema>; // entity with id generated in runtime
export type EntityDefinitionWithoutId = Omit<EntityDefinition, 'id'>;
export type ManagedEntityDefinition = EntityDefinition & { type: EntityType }; // entity with a known 'type'
export type EuidField = z.infer<typeof euidFieldSchema>;
export type EuidSeparator = z.infer<typeof euidSeparatorSchema>;
export type EuidAttribute = EuidField | EuidSeparator;
export type EuidRankingBranch = z.infer<typeof euidRankingBranchSchema>;
export type EuidRanking = z.infer<typeof euidRankingSchema>;
export type FieldEvaluationWhenClause = z.infer<typeof fieldEvaluationWhenClauseSchema>;
export type FieldEvaluationSource = z.infer<typeof fieldEvaluationSourceSchema>;
export type FieldEvaluation = z.infer<typeof fieldEvaluationSchema>;

export function isSingleFieldIdentity(identity: EntityIdentity): identity is SingleFieldIdentity {
  return 'singleField' in identity;
}
