/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityField } from './entity_schema';

// Mostly copied from x-pack/solutions/security/plugins/security_solution/server/lib/entity_analytics/entity_store/entity_definitions/entity_descriptions/field_utils.ts

type Operation = Omit<EntityField, 'retention' | 'destination'> & {
  destination?: string;
};

type ManagedOperation = Omit<EntityField, 'retention' | 'source'>;

export const collectValues = ({
  destination,
  source,
  mapping = { type: 'keyword' },
  allowAPIUpdate = false,
}: Operation): EntityField => ({
  destination: destination ?? source,
  source,
  retention: { operation: 'collect_values' },
  mapping,
  allowAPIUpdate,
});

export const newestValue = ({
  destination,
  mapping = { type: 'keyword' },
  source,
  allowAPIUpdate = false,
}: Operation): EntityField => ({
  destination: destination ?? source,
  source,
  retention: { operation: 'prefer_newest_value' },
  mapping,
  allowAPIUpdate,
});

export const oldestValue = ({
  source,
  destination,
  mapping = { type: 'keyword' },
}: Operation): EntityField => ({
  destination: destination ?? source,
  source,
  retention: { operation: 'prefer_oldest_value' },
  mapping,
  allowAPIUpdate: false, // oldest value should never be updated
});

/**
 * Declares an API-/maintainer-managed field: its value is written only via the
 * CRUD API or a maintainer dual-write, never derived from log extraction. The
 * field is excluded from extraction everywhere, so it has no meaningful source;
 * `source` is set equal to `destination` purely to satisfy the shared EntityField
 * shape (it is never read for managed fields).
 */
export const managedValue = ({
  destination,
  mapping = { type: 'keyword' },
  allowAPIUpdate = false,
}: ManagedOperation): EntityField => ({
  destination,
  source: destination,
  retention: { operation: 'managed' },
  mapping,
  allowAPIUpdate,
});
