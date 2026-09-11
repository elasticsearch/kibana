/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BooleanRelation,
  FilterStateStore,
  isCombinedFilter,
  buildCombinedFilter,
  buildPhrasesFilter,
  isPhrasesFilter,
  isFilter,
} from '@kbn/es-query';
import type { Filter, PhraseFilter, PhrasesFilter } from '@kbn/es-query';
import type {
  CombinedFilter,
  PhraseFilterMetaParams,
  PhraseFilterValue,
} from '@kbn/es-query/src/filters/build_filters';

export const CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER = 'graph-investigation';
export const CONTROLLED_BY_GRAPH_INVESTIGATION_DEFAULT_FILTER = 'graph-investigation-default';

const buildSinglePhraseFilter = (
  field: string,
  value: string,
  dataViewId?: string
): PhraseFilter => ({
  meta: {
    key: field,
    index: dataViewId,
    negate: false,
    disabled: false,
    type: 'phrase',
    field,
    controlledBy: CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER,
    params: {
      query: value,
    },
  },
  query: {
    match_phrase: {
      [field]: value,
    },
  },
});

/**
 * Minimal shape of the ES DSL the Entity Store EUID builder produces. Only the clause types it
 * actually emits are modelled: `term`, `prefix`, `exists` and nested `bool` combinations.
 */
interface EuidDslClause {
  bool?: {
    filter?: EuidDslClause | EuidDslClause[];
    must?: EuidDslClause | EuidDslClause[];
    must_not?: EuidDslClause | EuidDslClause[];
    should?: EuidDslClause | EuidDslClause[];
  };
  term?: Record<string, string>;
  prefix?: Record<string, string>;
  exists?: { field: string };
}

/**
 * Elasticsearch accepts both a single clause and an array for every `bool` occurrence type, and the
 * EUID builder emits both: `sourceMatchesAny` namespaces produce arrays, while condition-based ones
 * go through streamlang's `conditionToQueryDsl`, which emits a bare object (`must_not: { match }`
 * for `neq` and `exists: false`). A destructuring default only covers `undefined`, so normalise.
 */
const asClauseArray = (occurrence: EuidDslClause | EuidDslClause[] | undefined): EuidDslClause[] =>
  ([] as EuidDslClause[]).concat(occurrence ?? []);

/**
 * Clause keys this translator knows how to turn into filter-bar operators. Anything else means the
 * DSL has grown a shape we would silently drop, so `buildEntityDslFilter` fails closed instead —
 * see `isFullyTranslatable`.
 */
const TRANSLATABLE_CLAUSE_KEYS = new Set(['bool', 'term', 'prefix', 'exists']);

/**
 * True when every clause in the tree is one this module models.
 *
 * Condition-based namespaces (the `local` gate, asset-discovery) reach us as `match`, `terms` and
 * `range` clauses, none of which have a filter-bar equivalent here. Translating them partially
 * would drop constraints and produce a filter that is *wider* than the entity it claims to
 * describe — worse than no filter, because it looks authoritative. The caller falls back to the
 * identity `sourceFields` instead.
 */
export const isEuidDslTranslatable = (dsl: object): boolean =>
  isFullyTranslatable(dsl as EuidDslClause);

const isFullyTranslatable = (clause: EuidDslClause): boolean => {
  const keys = Object.keys(clause);
  if (keys.length === 0) return true;
  if (keys.some((key) => !TRANSLATABLE_CLAUSE_KEYS.has(key))) return false;
  if (!clause.bool) return true;
  const { filter, must, must_not: mustNot, should } = clause.bool;
  return [filter, must, mustNot, should]
    .flatMap(asClauseArray)
    .every((sub) => isFullyTranslatable(sub));
};

/**
 * Reduces an observed namespace source value to the prefix the entity definition derives from it,
 * or `undefined` when the field is not a prefix-matched source. Supplied by the caller so this
 * module never reimplements the Entity Store's chunking rules — see `euid.getNamespaceSourcePrefix`.
 */
export type NamespaceSourcePrefixResolver = (
  field: string,
  observedValue: string
) => string | undefined;

const buildExistsFilterClause = (field: string, negate: boolean, dataViewId?: string): Filter => ({
  meta: {
    key: field,
    index: dataViewId,
    negate,
    disabled: false,
    type: 'exists',
    value: 'exists',
    controlledBy: CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER,
  },
  query: { exists: { field } },
});

/**
 * Builds exact phrase filters for a prefix-matched namespace source field using the raw values
 * observed in the document's sourceFields rather than reversing the derived namespace string.
 *
 * The Entity Store derives `entity.namespace` from `data_stream.dataset` by splitting on `.` and
 * taking the first chunk (e.g. `gcp.audit` → `gcp`). The DSL builder reverses this as a `prefix`
 * query (`data_stream.dataset: gcp*`) which has no equivalent UI operator. Instead, we emit an
 * exact phrase (or phrases) filter using whatever raw dataset values the document actually carried
 * (e.g. `data_stream.dataset: "gcp.audit"`). This is strictly more precise than the prefix and
 * supports all standard Kibana filter operators.
 */
export const buildNamespaceSourceFilters = (
  field: string,
  observedValues: string | string[],
  dataViewId?: string
): Filter[] => {
  const values = ([] as string[]).concat(observedValues).filter((v) => v !== '');
  if (values.length === 0) return [];
  if (values.length === 1) return [buildSinglePhraseFilter(field, values[0], dataViewId)];
  return [buildMultiPhrasesFilter(field, values, dataViewId)];
};

/**
 * Translates one Entity Store EUID DSL clause into Kibana filters.
 *
 * Returns an array because a `bool.filter` / `bool.must` clause contributes several sibling
 * filters that the caller combines with AND.
 *
 * `prefix` clauses (produced for `data_stream.dataset` from the Entity Store's `firstChunkOfField`
 * source) cannot be expressed as is/is-one-of/exists. When `namespaceSourceValues` contains a raw
 * observed value that belongs to the arm, an exact phrase filter is emitted instead.
 *
 * When no observed value is available the arm is dropped. For GCP the sibling `event.module: gcp`
 * arm still carries the namespace, but that is not universal: Okta documents have no `event.module`
 * at all, so dropping their `data_stream.dataset` arms leaves a namespace clause that matches
 * nothing. Passing `namespaceSourceValues` is therefore required, not merely an improvement.
 */
const euidDslClauseToFilters = (
  clause: EuidDslClause,
  dataViewId?: string,
  namespaceSourceValues?: Record<string, string | string[]>,
  getNamespaceSourcePrefix?: NamespaceSourcePrefixResolver
): Filter[] => {
  const recurse = (sub: EuidDslClause) =>
    euidDslClauseToFilters(sub, dataViewId, namespaceSourceValues, getNamespaceSourcePrefix);

  if (clause.term) {
    const [field, value] = Object.entries(clause.term)[0];
    // The EUID guards use `term: { field: '' }` to mean "present but empty". An empty phrase
    // filter renders confusingly, so treat it as part of the surrounding "missing or empty"
    // disjunction and drop it — `NOT exists` already covers the meaningful case.
    return value === '' ? [] : [buildSinglePhraseFilter(field, value, dataViewId)];
  }

  if (clause.prefix) {
    const [field, prefix] = Object.entries(clause.prefix)[0];
    // An entity type can emit several prefix arms for one field (the `user` definition accepts
    // both `okta` and `entityanalytics_okta`), so only values belonging to *this* arm may be
    // substituted. Which arm a value belongs to is the Entity Store's judgement: it reduces the
    // value using the source's own `splitBy`, so `okta_legacy.system` yields `okta_legacy` and is
    // correctly refused by the `okta` arm — a `startsWith` test would have accepted it.
    const matching = ([] as string[])
      .concat(namespaceSourceValues?.[field] ?? [])
      .filter((value) => getNamespaceSourcePrefix?.(field, value) === prefix);

    // No observed value for this arm — drop it (see comment above). Sibling arms in the same
    // `should` still carry the namespace match.
    return matching.length > 0 ? buildNamespaceSourceFilters(field, matching, dataViewId) : [];
  }

  if (clause.exists) {
    return [buildExistsFilterClause(clause.exists.field, false, dataViewId)];
  }

  if (clause.bool) {
    const filter = asClauseArray(clause.bool.filter);
    const must = asClauseArray(clause.bool.must);
    const mustNot = asClauseArray(clause.bool.must_not);
    const should = asClauseArray(clause.bool.should);

    // `must_not: [{ exists }]` is a negated exists filter (an EUID higher-ranked-field guard).
    const negatedExists = mustNot
      .map((sub) => sub.exists?.field)
      .filter((field): field is string => field != null)
      .map((field) => buildExistsFilterClause(field, true, dataViewId));

    const andParts = [...filter, ...must].flatMap(recurse);

    if (should.length > 0) {
      // Several prefix arms can collapse onto the same observed value, which would render as a
      // duplicated chip in the same OR — key on the resulting query to keep one of each.
      const seen = new Set<string>();
      const orParts = should.flatMap(recurse).filter((part) => {
        const key = JSON.stringify(part.query ?? part.meta);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const orFilter =
        orParts.length === 1
          ? orParts[0]
          : buildCombinedFilter(BooleanRelation.OR, orParts, { id: dataViewId });
      return [...andParts, ...negatedExists, ...(orParts.length > 0 ? [orFilter] : [])];
    }

    return [...andParts, ...negatedExists];
  }

  return [];
};

/**
 * Builds a Kibana filter from the Entity Store's EUID DSL for an entity.
 *
 * The EUID logic yields a boolean expression (identity field at its ranking position, guards
 * excluding the higher-ranked fields it fell through, and a namespace disjunction), so the result
 * is a combined AND filter of ordinary phrase / exists / OR sub-filters rather than one opaque
 * query. `meta.alias` carries the entity id so the filter can be found and removed again, and
 * doubles as the chip label in the filter bar.
 *
 * `namespaceSourceValues` supplies the raw observed values for prefix-matched namespace fields
 * (e.g. `{ 'data_stream.dataset': 'gcp.audit' }`). When provided, prefix clauses are replaced
 * with exact phrase filters using those values rather than being dropped.
 */
export const buildEntityDslFilter = (
  entityId: string,
  dsl: object,
  dataViewId?: string,
  namespaceSourceValues?: Record<string, string | string[]>,
  getNamespaceSourcePrefix?: NamespaceSourcePrefixResolver
): Filter | undefined => {
  // Fail closed on any clause shape this module does not model, rather than emitting the subset it
  // recognises — a partially translated filter under-constrains and would match other entities.
  if (!isFullyTranslatable(dsl as EuidDslClause)) return undefined;

  const parts = euidDslClauseToFilters(
    dsl as EuidDslClause,
    dataViewId,
    namespaceSourceValues,
    getNamespaceSourcePrefix
  );
  if (parts.length === 0) return undefined;

  const base =
    parts.length === 1
      ? parts[0]
      : buildCombinedFilter(BooleanRelation.AND, parts, { id: dataViewId });

  // The entity id is an internal handle (`<euid>|<role>`), so it must not land in any field the
  // filter bar renders: `key` is the field name a leaf chip is drawn from, and `alias` replaces
  // the chip label outright. It goes in `controlledBy` instead, which exists for ownership and is
  // never displayed — so single-field identities (service, generic) keep the real field name in
  // `key` and still render, while multi-clause filters keep their normal clause labels.
  return {
    ...base,
    meta: {
      ...base.meta,
      controlledBy: entityFilterControlledBy(entityId),
    },
  };
};

/**
 * Ownership marker for a graph entity filter. Namespaced under the graph's `controlledBy` value so
 * the filter is still recognised as graph-owned by anything matching on that prefix.
 */
const entityFilterControlledBy = (entityId: string): string =>
  `${CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER}:${entityId}`;

const isGraphEntityFilter = (filter: Filter, entityId: string): boolean =>
  filter.meta?.controlledBy === entityFilterControlledBy(entityId);

/**
 * True when the entity filter for this entity id is present and enabled, whether it sits at the
 * top level or nested inside the graph's OR combined filter.
 */
export const containsEntityFilter = (filters: Filter[], entityId: string): boolean =>
  filters.some((filter) => {
    if (filter.meta.disabled) return false;
    if (isGraphEntityFilter(filter, entityId)) return true;
    return isCombinedFilter(filter)
      ? filter.meta.params.some((param) => isGraphEntityFilter(param, entityId))
      : false;
  });

/**
 * Removes the graph-owned entity filter for the given entity id, from the top level or from
 * inside a combined filter. A combined filter left with a single entry is unwrapped, and one left
 * empty is dropped, so repeated toggling cannot leave hollow combined filters behind.
 */
export const removeEntityFilter = (filters: Filter[], entityId: string): Filter[] =>
  filters.reduce<Filter[]>((acc, filter) => {
    if (isGraphEntityFilter(filter, entityId)) return acc;

    if (isCombinedFilter(filter)) {
      const params = filter.meta.params.filter((param) => !isGraphEntityFilter(param, entityId));
      if (params.length === filter.meta.params.length) return [...acc, filter];
      if (params.length === 0) return acc;
      if (params.length === 1) return [...acc, params[0]];
      return [...acc, { ...filter, meta: { ...filter.meta, params } }];
    }

    return [...acc, filter];
  }, []);

/**
 * Adds an entity filter, replacing any existing graph-owned filter for the same entity id so
 * toggling actor/target roles does not accumulate stale expressions.
 *
 * Entity filters are OR'd with whatever the graph has already added, matching `addFilter`: the
 * popover actions are additive ("show me this actor's events *and* events on that target"), so
 * ANDing them together would return the intersection and usually nothing at all.
 */
export const addEntityFilter = (
  dataViewId: string,
  prev: Filter[],
  entityId: string,
  dsl: object,
  namespaceSourceValues?: Record<string, string | string[]>,
  getNamespaceSourcePrefix?: NamespaceSourcePrefixResolver
): Filter[] => {
  const built = buildEntityDslFilter(
    entityId,
    dsl,
    dataViewId,
    namespaceSourceValues,
    getNamespaceSourcePrefix
  );
  if (!built) return prev;

  const [firstFilter, ...otherFilters] = removeEntityFilter(prev, entityId);

  if (
    isCombinedFilter(firstFilter) &&
    !firstFilter.meta.disabled &&
    firstFilter.meta.relation === BooleanRelation.OR
  ) {
    return [
      {
        ...firstFilter,
        meta: {
          ...firstFilter.meta,
          params: [...firstFilter.meta.params, built],
        },
      },
      ...otherFilters,
    ];
  }

  if (isFilter(firstFilter) && !firstFilter.meta.disabled && firstFilter.meta.type !== 'custom') {
    const combined = buildCombinedFilter(BooleanRelation.OR, [firstFilter, built], {
      id: dataViewId,
    });
    return [
      {
        ...combined,
        meta: { ...combined.meta, controlledBy: CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER },
      },
      ...otherFilters,
    ];
  }

  // No filter to combine with (empty list, or a disabled/custom leading filter).
  return [
    { $state: { store: FilterStateStore.APP_STATE }, ...built },
    ...(firstFilter ? [firstFilter, ...otherFilters] : otherFilters),
  ];
};

const buildMultiPhrasesFilter = (
  field: string,
  values: string[],
  dataViewId?: string
): PhrasesFilter => {
  const base = buildPhrasesFilter({ name: field, type: 'string' }, values, {
    id: dataViewId,
    title: field,
  });
  return {
    ...base,
    meta: {
      ...base.meta,
      key: field,
      field,
      index: dataViewId,
      negate: false,
      disabled: false,
      controlledBy: CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER,
    },
  };
};

/**
 * Builds a phrase filter for a single value or a phrases filter for multiple values.
 * When given an array with a single item, falls back to a single phrase filter.
 */
const buildPhraseFilter = (
  field: string,
  value: string | string[],
  dataViewId?: string
): PhraseFilter | PhrasesFilter => {
  if (Array.isArray(value)) {
    if (value.length === 1) {
      return buildSinglePhraseFilter(field, value[0], dataViewId);
    }
    return buildMultiPhrasesFilter(field, value, dataViewId);
  }
  return buildSinglePhraseFilter(field, value, dataViewId);
};

const filterHasKeyAndValue = (filter: Filter, key: string, value: string): boolean => {
  if (isCombinedFilter(filter)) {
    return filter.meta.params.some((param) => filterHasKeyAndValue(param, key, value));
  }

  if (filter.meta.key !== key) {
    return false;
  }

  if (isPhrasesFilter(filter)) {
    return (filter.meta.params as PhraseFilterValue[]).includes(value);
  }

  return (filter.meta.params as PhraseFilterMetaParams)?.query === value;
};

/**
 * Returns true when a single filter matches the given key and contains ALL of the requested values.
 * For a PhrasesFilter the params array must be a superset of `values`.
 * For a CombinedFilter each value must be satisfied by at least one nested filter.
 */
const filterHasKeyAndValues = (filter: Filter, key: string, values: string[]): boolean => {
  if (isCombinedFilter(filter)) {
    return values.every((v) =>
      filter.meta.params.some((param) => filterHasKeyAndValue(param, key, v))
    );
  }

  if (filter.meta.key !== key) {
    return false;
  }

  if (isPhrasesFilter(filter)) {
    const params = filter.meta.params as PhraseFilterValue[];
    return values.every((v) => params.includes(v));
  }

  return false;
};

/**
 * Determines whether the provided filters contain a filter with the provided key and value(s).
 * When `value` is an array of more than one item, it looks for a PhrasesFilter (or CombinedFilter)
 * that covers **all** of the supplied values.
 *
 * @param filters - The list of filters to check.
 * @param key - The key to check for.
 * @param value - The value or values to check for.
 * @returns true if the filters do contain the filter, false if they don't.
 */
export const containsFilter = (
  filters: Filter[],
  key: string,
  value: string | string[]
): boolean => {
  const activeFilters = filters.filter((filter) => !filter.meta.disabled);

  if (Array.isArray(value) && value.length > 1) {
    return activeFilters.some((filter) => filterHasKeyAndValues(filter, key, value));
  }

  const singleValue = Array.isArray(value) ? value[0] : value;
  return activeFilters.some((filter) => filterHasKeyAndValue(filter, key, singleValue));
};

/**
 * Builds a `bool.filter` (AND) DSL clause from a flat map of identity field → value(s).
 * Used by the fields fallback path so multiple identity fields are combined with AND rather
 * than being emitted as independent OR'd phrase filters.
 */
export const buildFieldsDsl = (fields: Record<string, string | string[]>): object => ({
  bool: {
    filter: Object.entries(fields).flatMap(([field, value]) =>
      ([] as string[]).concat(value).map((v) => ({ term: { [field]: v } }))
    ),
  },
});

/**
 * Adds a filter to the existing list of filters based on the provided key and value.
 * It will always use the first filter in the list to build a combined filter with the new filter.
 *
 * @param dataViewId - The ID of the data view to which the filter belongs.
 * @param prev - The previous list of filters.
 * @param key - The key for the filter.
 * @param value - The value for the filter.
 * @returns A new list of filters with the added filter.
 */
export const addFilter = (
  dataViewId: string,
  prev: Filter[],
  key: string,
  value: string | string[]
) => {
  const [firstFilter, ...otherFilters] = prev;

  if (
    isCombinedFilter(firstFilter) &&
    !firstFilter?.meta?.disabled &&
    firstFilter?.meta?.relation === BooleanRelation.OR
  ) {
    return [
      {
        ...firstFilter,
        meta: {
          ...firstFilter.meta,
          controlledBy: CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER,
          params: [
            ...(Array.isArray(firstFilter.meta.params) ? firstFilter.meta.params : []),
            buildPhraseFilter(key, value, dataViewId),
          ],
        },
      },
      ...otherFilters,
    ];
  } else if (
    isFilter(firstFilter) &&
    !firstFilter?.meta?.disabled &&
    firstFilter.meta?.type !== 'custom'
  ) {
    const combinedFilter = buildCombinedFilter(
      BooleanRelation.OR,
      [firstFilter, buildPhraseFilter(key, value, dataViewId)],
      {
        id: dataViewId,
      }
    );
    return [
      {
        ...combinedFilter,
        meta: {
          ...combinedFilter.meta,
          controlledBy: CONTROLLED_BY_GRAPH_INVESTIGATION_FILTER,
        },
      },
      ...otherFilters,
    ];
  } else {
    // When the first filter is disabled or a custom filter, we just add the new filter to the list.
    return [
      {
        $state: {
          store: FilterStateStore.APP_STATE,
        },
        ...buildPhraseFilter(key, value, dataViewId),
      },
      ...prev,
    ];
  }
};

const removeFilterFromCombinedFilter = (filter: CombinedFilter, key: string, value: string) => {
  const newCombinedFilter = {
    ...filter,
    meta: {
      ...filter.meta,
      params: filter.meta.params.filter(
        (param: Filter) => !filterHasKeyAndValue(param, key, value)
      ),
    },
  };

  if (newCombinedFilter.meta.params.length === 1) {
    return newCombinedFilter.meta.params[0];
  } else if (newCombinedFilter.meta.params.length === 0) {
    return null;
  } else {
    return newCombinedFilter;
  }
};

export const removeFilter = (filters: Filter[], key: string, value: string | string[]) => {
  if (Array.isArray(value) && value.length > 1) {
    // For multi-value removal we look for a top-level filter that satisfies all values.
    // If that filter is a CombinedFilter, we try to strip matching nested entries from it
    // (e.g. a PhrasesFilter nested inside). If the top-level filter itself is not a
    // CombinedFilter (e.g. a standalone PhrasesFilter), we remove it outright.
    const topFilter = filters.find((f) => filterHasKeyAndValues(f, key, value));

    if (!topFilter) {
      return filters;
    }

    if (isCombinedFilter(topFilter)) {
      // Check whether any individual nested entry covers all values on its own (e.g. PhrasesFilter).
      // If so, strip those entries from the combined filter.
      const hasNestedMatch = topFilter.meta.params.some((param) =>
        filterHasKeyAndValues(param, key, value)
      );

      if (hasNestedMatch) {
        const newParams = topFilter.meta.params.filter(
          (param: Filter) => !filterHasKeyAndValues(param, key, value)
        );

        if (newParams.length === 0) {
          return filters.filter((f) => f !== topFilter);
        } else if (newParams.length === 1) {
          return filters.map((f) => (f === topFilter ? newParams[0] : f));
        } else {
          return filters.map((f) =>
            f === topFilter ? { ...topFilter, meta: { ...topFilter.meta, params: newParams } } : f
          );
        }
      }

      // The CombinedFilter satisfies the values only collectively (no single nested entry
      // covers all of them on its own). Remove the entire CombinedFilter.
      return filters.filter((f) => f !== topFilter);
    }

    // Standalone filter (e.g. PhrasesFilter) — remove it outright.
    return filters.filter((f) => f !== topFilter);
  }

  const singleValue = Array.isArray(value) ? value[0] : value;
  const matchedFilter = filters.filter((filter) => filterHasKeyAndValue(filter, key, singleValue));

  if (matchedFilter.length > 0 && isCombinedFilter(matchedFilter[0])) {
    const newCombinedFilter = removeFilterFromCombinedFilter(matchedFilter[0], key, singleValue);

    if (!newCombinedFilter) {
      return filters.filter((filter) => filter !== matchedFilter[0]);
    }

    return filters.map((filter) => (filter === matchedFilter[0] ? newCombinedFilter : filter));
  } else if (matchedFilter.length > 0) {
    return filters.filter((filter) => filter !== matchedFilter[0]);
  }

  return filters;
};

/**
 * Helper function to extract filter value(s) from a single filter.
 * Handles both simple phrase filters and combined filters recursively.
 */
const getFilterValue = (
  filter: Filter,
  keys: string[]
): PhraseFilterValue[] | PhraseFilterValue | null => {
  if (isCombinedFilter(filter)) {
    return filter.meta.params
      .map((param) => getFilterValue(param, keys))
      .filter((value): value is PhraseFilterValue | PhraseFilterValue[] => value !== null)
      .flat();
  }

  if (!filter.meta.key || !keys.includes(filter.meta.key)) {
    return null;
  }

  if (isPhrasesFilter(filter)) {
    return filter.meta.params as PhraseFilterValue[];
  }

  return (filter.meta.params as PhraseFilterMetaParams)?.query ?? null;
};
