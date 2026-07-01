/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// ─────────────────────────────────────────────────────────────────────────────
// ContentListQueryModel — derived view of query state.
// Plain, serializable object. No EUI dependency. No React dependency.
// Derived on-demand from queryText via `useQueryModel`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Include/exclude filter for a single field dimension.
 *
 * Mirrors EUI's search AST: values within a single OR-group clause
 * (`field:(a or b)`) are match-any; separate `must` clauses
 * (`field:a field:b`) are match-all (AND-combined).
 */
export interface QueryFilterValue {
  /** Match-any (OR) IDs: an item matches if it has at least one. */
  include: string[];
  /**
   * Match-all (AND) IDs: an item matches only if it has every one.
   *
   * Populated when the query expresses the field as separate `must` clauses
   * (e.g. `tag:a tag:b`). Absent for the common match-any case.
   */
  includeAll?: string[];
  /** IDs that items must not match. */
  exclude: string[];
}

/**
 * The query model — single source of truth for search, filters, and flags.
 *
 * - `search`: free text (no field syntax).
 * - `filters`: field-based include/exclude filters, keyed by field name.
 *   Values are internal IDs (e.g., tag IDs, user UIDs). Display values
 *   (tag names, emails) are resolved via {@link FieldDefinition}.
 * - `flags`: boolean toggles (e.g., `starred`). Rendered as `is:flagName`
 *   in query text.
 *
 * This object is JSON-serializable and UI-independent.
 */
export interface ContentListQueryModel {
  /** Free text search portion (field syntax already extracted). */
  search: string;
  /** Field-based filters. Key = field name, value = include/exclude IDs. */
  filters: Record<string, QueryFilterValue>;
  /** Boolean flags (e.g., `{ starred: true }`). */
  flags: Record<string, boolean>;
  /**
   * Field names that had at least one clause with a non-empty value in the
   * parsed query AST, regardless of whether the value resolved to an ID.
   *
   * Unlike `filters` (which only contains fields whose values resolved),
   * this set captures field-clause *presence*. Used to gate lazy operations
   * (e.g. profile priming) that must fire before resolution can succeed.
   */
  referencedFields: ReadonlySet<string>;
  /**
   * Field names whose clause values fell through to the raw display-value
   * fallback in `resolveDisplayValue` — meaning `resolveDisplayToId` returned
   * `undefined` and no fuzzy match was found.
   *
   * Only fields with lazy/async resolution (e.g. user-profile fields whose
   * backing store is populated asynchronously) should be treated as a
   * transient "resolving" state. Fields with synchronous resolution (e.g.
   * tags) appear here when the display value simply doesn't exist — that is
   * a valid empty result, not a loading condition.
   */
  unresolvedFields: ReadonlySet<string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/** Empty query model. */
export const EMPTY_MODEL: ContentListQueryModel = {
  search: '',
  filters: {},
  flags: {},
  referencedFields: EMPTY_SET,
  unresolvedFields: EMPTY_SET,
};

// ─────────────────────────────────────────────────────────────────────────────
// Field and flag definitions — declarative configuration for query fields.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Defines how a field-based filter maps between internal IDs and display values.
 *
 * Used by the parser (display→ID) and serializer (ID→display) to convert
 * between query text and the query model. Adding a new filter dimension
 * (e.g., `updatedBy`, `owner`) only requires providing a new `FieldDefinition`.
 *
 * @example
 * ```ts
 * const createdByField: FieldDefinition = {
 *   fieldName: 'createdBy',
 *   resolveIdToDisplay: (uid) => users.find(u => u.uid === uid)?.email ?? uid,
 *   resolveDisplayToId: (email) => users.find(u => u.email === email)?.uid,
 * };
 * ```
 */
export interface FieldDefinition {
  /** Field name used in query syntax (e.g., `'tag'`, `'createdBy'`). */
  fieldName: string;
  /** Resolve an internal ID to the display value shown in query text. */
  resolveIdToDisplay: (id: string) => string;
  /** Resolve a display value (from query text) to an internal ID. Returns `undefined` if unresolvable. */
  resolveDisplayToId: (displayValue: string) => string | undefined;
  /**
   * Fuzzy/prefix match: resolve a partial display value to all matching IDs.
   *
   * Called when `resolveDisplayToId` returns `undefined` (no exact match).
   * Returns all IDs whose display value contains the input (case-insensitive).
   * Used for incremental search: typing `createdBy:j` matches "jane" and "john".
   *
   * Optional — when absent, unresolvable values are silently dropped.
   */
  resolveFuzzyDisplayToIds?: (displayValue: string) => string[];
}

/**
 * Defines a boolean flag that appears as `is:flagName` in query text.
 *
 * @example
 * ```ts
 * const starredFlag: FlagDefinition = { flagName: 'starred', modelKey: 'starred' };
 * // Renders as `is:starred` in query text when active.
 * ```
 */
export interface FlagDefinition {
  /** Flag name in query syntax (e.g., `'starred'` for `is:starred`). */
  flagName: string;
  /** Key in `ContentListQueryModel.flags`. */
  modelKey: string;
}
