/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingDynamicTemplate } from '@elastic/elasticsearch/lib/api/types';

/**
 * Dynamic templates applied to the `.cases` analytics index mapping.
 *
 * `cases.observables.*` — denormalized observables, one keyword array per
 * `typeKey`. The case SO stores observables as a nested array of
 * `{ typeKey, value, description }` triples; the doc-builder regroups them
 * so each observable type lives at its own path
 * (e.g. `cases.observables.url: ["http://..."]`). This preserves the
 * type↔value relationship via the field path while enabling simple term
 * queries like `cases.observables.url: "http://..."`.
 *
 * Children are indexed as keyword with `ignore_above: 32766` — the standard
 * cap. Values above that length stay in `_source` but drop out of the index.
 *
 * **Why keyword?**
 * - Exact match + term aggregations work out of the box.
 * - Keyword semantics match the SO's `value` field type.
 *
 * `extended_fields` deliberately does **not** have a dynamic template —
 * it's mapped as `flattened` directly (see `case.ts`), collapsing the
 * mapping cost to a single field regardless of cluster-wide snake-key
 * cardinality. Typed querying via runtime fields at `cases.<snake>`
 * reading `doc['cases.extended_fields.<snake>']`; see
 * `data_view/runtime_fields.ts`.
 */
export const CASE_DYNAMIC_TEMPLATES: Array<Record<string, MappingDynamicTemplate>> = [
  {
    observables_keyword: {
      path_match: 'cases.observables.*',
      mapping: {
        type: 'keyword',
        ignore_above: 32766,
      },
    },
  },
];
