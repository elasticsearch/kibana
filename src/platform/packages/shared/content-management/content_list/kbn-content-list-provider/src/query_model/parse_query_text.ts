/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Query } from '@elastic/eui';
import type {
  ContentListQueryModel,
  QueryFilterValue,
  FieldDefinition,
  FlagDefinition,
} from './types';
import { EMPTY_MODEL } from './types';

/** Coerce a value (possibly an array) into a string array. */
const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return value != null ? [String(value)] : [];
};

/** Build an EUI schema from field definitions. */
export const buildSchema = (
  fields: ReadonlyArray<FieldDefinition>
): { strict: false; fields: Record<string, { type: 'string' }> } | undefined => {
  if (fields.length === 0) {
    return undefined;
  }
  const schemaFields: Record<string, { type: 'string' }> = {};
  for (const f of fields) {
    schemaFields[f.fieldName] = { type: 'string' };
  }
  return { strict: false, fields: schemaFields };
};

/**
 * Check whether the parsed query AST contains at least one clause for
 * `fieldName` with a non-empty value. This is a structural check — it does
 * not attempt to resolve values, so it works even before the profile store
 * is populated.
 */
const hasFieldClause = (query: InstanceType<typeof Query>, fieldName: string): boolean => {
  const simpleClauses = query.ast.getFieldClauses(fieldName);
  if (simpleClauses?.some((c) => toStringArray(c.value).some((v) => v.length > 0))) {
    return true;
  }
  const includeOr = query.ast.getOrFieldClause(fieldName, undefined, true, 'eq');
  if (includeOr && toStringArray(includeOr.value).some((v) => v.length > 0)) {
    return true;
  }
  const excludeOr = query.ast.getOrFieldClause(fieldName, undefined, false, 'eq');
  return !!excludeOr && toStringArray(excludeOr.value).some((v) => v.length > 0);
};

/**
 * Resolve a display value to IDs: exact match first, then fuzzy fallback.
 *
 * Returns `{ ids, resolved }` — `resolved` is `false` when the value fell
 * through to the raw fallback (no exact or fuzzy match).
 */
const resolveDisplayValue = (
  displayValue: string,
  field: FieldDefinition
): { ids: string[]; resolved: boolean } => {
  const exactId = field.resolveDisplayToId(displayValue);
  if (exactId !== undefined) {
    return { ids: [exactId], resolved: true };
  }
  if (field.resolveFuzzyDisplayToIds) {
    const fuzzyIds = field.resolveFuzzyDisplayToIds(displayValue);
    if (fuzzyIds.length > 0) {
      return { ids: fuzzyIds, resolved: true };
    }
  }
  return { ids: [displayValue], resolved: false };
};

/**
 * Extract include/exclude IDs for a field from the parsed query.
 *
 * Maps EUI clause structure to filter buckets, faithful to EUI search
 * semantics (clauses are AND-combined; values inside an OR-group are
 * OR-combined):
 *
 * - An OR-group clause (`field:(a or b)`, or the single-value `field:(a)`) is
 *   match-any → {@link QueryFilterValue.include}. Keeping each group in this
 *   bucket preserves the existing OR behavior of `field:(a) field:(b)`.
 * - A bare scalar clause (`field:a`) is a standalone match-all constraint →
 *   {@link QueryFilterValue.includeAll}, so `field:a field:b` is AND. A scalar
 *   that fuzzy-expands to several IDs (`createdBy:jo` → two users) stays
 *   match-any, since those IDs are one term.
 *
 * For a single value match-any and match-all are equivalent, so a lone
 * `field:a` filters identically whether bucketed as include or includeAll.
 */
const extractFieldFilter = (
  query: InstanceType<typeof Query>,
  field: FieldDefinition
): { filter: QueryFilterValue | undefined; hasUnresolved: boolean } => {
  const anyIds: string[] = [];
  const allIds: string[] = [];
  const excludeIds: string[] = [];
  let hasUnresolved = false;

  const resolve = (displayValues: string[]): string[] => {
    const ids: string[] = [];
    for (const dv of displayValues) {
      const result = resolveDisplayValue(dv, field);
      ids.push(...result.ids);
      if (!result.resolved) {
        hasUnresolved = true;
      }
    }
    return ids;
  };

  // `getFieldClauses` returns every field clause — scalar (`field:value`) and
  // array-valued OR-groups (`field:(a or b)`) alike.
  const clauses = query.ast.getFieldClauses(field.fieldName) ?? [];
  for (const clause of clauses) {
    const isGroup = Array.isArray(clause.value);
    const ids = resolve(toStringArray(clause.value));
    if (clause.match === 'must') {
      // A bare scalar that resolves to exactly one ID is a match-all term;
      // groups and fuzzy-expanded scalars are match-any.
      const target = isGroup || ids.length > 1 ? anyIds : allIds;
      target.push(...ids);
    } else if (clause.match === 'must_not') {
      excludeIds.push(...ids);
    }
  }

  const include = [...new Set(anyIds)];
  const includeAll = [...new Set(allIds)];
  const exclude = [...new Set(excludeIds)];

  if (include.length === 0 && includeAll.length === 0 && exclude.length === 0) {
    return { filter: undefined, hasUnresolved };
  }

  const filter: QueryFilterValue = { include, exclude };
  if (includeAll.length > 0) {
    filter.includeAll = includeAll;
  }
  return { filter, hasUnresolved };
};

/**
 * Extract free-text search by stripping recognised fields and flags from
 * the parsed query and returning the residual text.
 *
 * Uses EUI `Query`'s own clause-removal API so that unrecognised field
 * syntax (e.g. `owner:(alice or bob)`) is preserved verbatim rather than
 * being reconstructed from the AST, which could lose grouping or formatting.
 */
const extractSearchText = (
  query: InstanceType<typeof Query>,
  knownFieldNames: ReadonlySet<string>,
  knownFlagNames: ReadonlySet<string>
): string => {
  let residual = query;

  for (const fieldName of knownFieldNames) {
    residual = residual.removeSimpleFieldClauses(fieldName);
    residual = residual.removeOrFieldClauses(fieldName);
  }

  for (const flagName of knownFlagNames) {
    if (residual.hasIsClause(flagName)) {
      residual = residual.removeIsClause(flagName);
    }
  }

  return residual.text;
};

/** Parse `queryText` into a {@link ContentListQueryModel}. */
export const parseQueryText = (
  queryText: string,
  fields: ReadonlyArray<FieldDefinition>,
  flags: ReadonlyArray<FlagDefinition>,
  schema: ReturnType<typeof buildSchema>
): ContentListQueryModel => {
  if (!queryText.trim()) {
    return { ...EMPTY_MODEL };
  }

  let query: InstanceType<typeof Query>;
  try {
    query = Query.parse(queryText, schema ? { schema } : undefined);
  } catch {
    return { ...EMPTY_MODEL, search: queryText.trim() };
  }

  // Field filters and referenced-field tracking.
  const filters: Record<string, QueryFilterValue> = {};
  const referencedFields = new Set<string>();
  const unresolvedFields = new Set<string>();
  for (const field of fields) {
    if (hasFieldClause(query, field.fieldName)) {
      referencedFields.add(field.fieldName);
    }
    const { filter, hasUnresolved } = extractFieldFilter(query, field);
    if (filter) {
      filters[field.fieldName] = filter;
    }
    if (hasUnresolved) {
      unresolvedFields.add(field.fieldName);
    }
  }

  // Flags (e.g., `is:starred`).
  const parsedFlags: Record<string, boolean> = {};
  for (const flag of flags) {
    if (query.hasIsClause(flag.flagName)) {
      parsedFlags[flag.modelKey] = true;
    }
  }

  // Free-text search.
  const knownFieldNames = new Set(fields.map((f) => f.fieldName));
  const knownFlagNames = new Set(flags.map((f) => f.flagName));
  const search = extractSearchText(query, knownFieldNames, knownFlagNames);

  return { search, filters, flags: parsedFlags, referencedFields, unresolvedFields };
};
