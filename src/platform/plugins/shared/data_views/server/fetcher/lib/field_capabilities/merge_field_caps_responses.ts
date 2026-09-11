/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';

interface CapabilityAccumulator {
  readonly type: string;
  readonly indices: string[];
  readonly indexSet: Set<string>;
  readonly searchableByIndex: Map<string, boolean>;
  readonly aggregatableByIndex: Map<string, boolean>;
  readonly meta: Record<string, string[]>;
  metadataField?: boolean;
  metadataFieldSeen: boolean;
  readonly dimensionByIndex: Map<string, boolean>;
  dimensionSeen: boolean;
  readonly metricByIndex: Map<string, estypes.MappingTimeSeriesMetricType | undefined>;
  readonly metricConflictIndices: string[];
  readonly metricConflictIndexSet: Set<string>;
}

type FieldAccumulator = Map<string, CapabilityAccumulator>;

const normalizeIndices = (indices: estypes.Indices): string[] =>
  typeof indices === 'string' ? [indices] : indices;

const addUnique = (values: string[], valueSet: Set<string>, value: string): void => {
  if (!valueSet.has(value)) {
    valueSet.add(value);
    values.push(value);
  }
};

const createCapabilityAccumulator = (type: string): CapabilityAccumulator => ({
  type,
  indices: [],
  indexSet: new Set<string>(),
  searchableByIndex: new Map<string, boolean>(),
  aggregatableByIndex: new Map<string, boolean>(),
  meta: {},
  metadataFieldSeen: false,
  dimensionByIndex: new Map<string, boolean>(),
  dimensionSeen: false,
  metricByIndex: new Map<string, estypes.MappingTimeSeriesMetricType | undefined>(),
  metricConflictIndices: [],
  metricConflictIndexSet: new Set<string>(),
});

const getCapabilityAccumulator = (
  fields: Map<string, FieldAccumulator>,
  fieldName: string,
  type: string
): CapabilityAccumulator => {
  let field = fields.get(fieldName);
  if (!field) {
    field = new Map<string, CapabilityAccumulator>();
    fields.set(fieldName, field);
  }

  let capability = field.get(type);
  if (!capability) {
    capability = createCapabilityAccumulator(type);
    field.set(type, capability);
  }
  return capability;
};

const mergeBooleanState = (
  valuesByIndex: Map<string, boolean>,
  index: string,
  value: boolean
): void => {
  const currentValue = valuesByIndex.get(index);
  valuesByIndex.set(index, currentValue === false ? false : value);
};

const mergeMeta = (
  target: Record<string, string[]>,
  source: Record<string, string[]> | undefined
): void => {
  if (!source) {
    return;
  }

  for (const [key, values] of Object.entries(source)) {
    const targetValues = target[key] ?? [];
    for (const value of values) {
      if (!targetValues.includes(value)) {
        targetValues.push(value);
      }
    }
    target[key] = targetValues;
  }
};

const mergeCapability = (
  accumulator: CapabilityAccumulator,
  capability: estypes.FieldCapsFieldCapability,
  responseIndices: string[]
): void => {
  const indices = capability.indices ?? responseIndices;
  const nonSearchableIndices = new Set(capability.non_searchable_indices ?? []);
  const nonAggregatableIndices = new Set(capability.non_aggregatable_indices ?? []);
  const nonDimensionIndices = new Set(capability.non_dimension_indices ?? []);
  const hasSearchabilityExceptions = capability.non_searchable_indices !== undefined;
  const hasAggregatabilityExceptions = capability.non_aggregatable_indices !== undefined;
  const hasDimensionExceptions = capability.non_dimension_indices !== undefined;

  for (const index of indices) {
    addUnique(accumulator.indices, accumulator.indexSet, index);
    mergeBooleanState(
      accumulator.searchableByIndex,
      index,
      hasSearchabilityExceptions ? !nonSearchableIndices.has(index) : capability.searchable
    );
    mergeBooleanState(
      accumulator.aggregatableByIndex,
      index,
      hasAggregatabilityExceptions ? !nonAggregatableIndices.has(index) : capability.aggregatable
    );

    accumulator.dimensionSeen =
      accumulator.dimensionSeen ||
      capability.time_series_dimension !== undefined ||
      hasDimensionExceptions;
    mergeBooleanState(
      accumulator.dimensionByIndex,
      index,
      hasDimensionExceptions
        ? !nonDimensionIndices.has(index)
        : capability.time_series_dimension === true
    );

    const currentMetric = accumulator.metricByIndex.get(index);
    if (accumulator.metricByIndex.has(index) && currentMetric !== capability.time_series_metric) {
      addUnique(accumulator.metricConflictIndices, accumulator.metricConflictIndexSet, index);
    }
    accumulator.metricByIndex.set(index, capability.time_series_metric);
  }

  for (const index of capability.metric_conflicts_indices ?? []) {
    addUnique(accumulator.metricConflictIndices, accumulator.metricConflictIndexSet, index);
  }

  mergeMeta(accumulator.meta, capability.meta);
  if (capability.metadata_field !== undefined) {
    accumulator.metadataFieldSeen = true;
    accumulator.metadataField =
      accumulator.metadataField === true || capability.metadata_field === true;
  }
};

const addUnmappedCoverage = (
  fields: Map<string, FieldAccumulator>,
  fieldName: string,
  indices: string[]
): void => {
  const accumulator = getCapabilityAccumulator(fields, fieldName, 'unmapped');
  mergeCapability(
    accumulator,
    {
      type: 'unmapped',
      searchable: false,
      aggregatable: false,
      indices,
    },
    indices
  );
};

const buildBooleanProperties = (
  valuesByIndex: Map<string, boolean>
): { value: boolean; exceptions?: string[] } => {
  // Field-caps booleans apply to every covered index. A mixed result is false
  // plus the exact indices that provide the false capability.
  const falseIndices = [...valuesByIndex].filter(([, value]) => !value).map(([index]) => index);
  const hasTrue = [...valuesByIndex.values()].some(Boolean);
  if (hasTrue && falseIndices.length > 0) {
    return { value: false, exceptions: falseIndices };
  }
  return { value: falseIndices.length === 0 };
};

const buildCapability = (accumulator: CapabilityAccumulator): estypes.FieldCapsFieldCapability => {
  const searchableProperties = buildBooleanProperties(accumulator.searchableByIndex);
  const aggregatableProperties = buildBooleanProperties(accumulator.aggregatableByIndex);
  const capability: estypes.FieldCapsFieldCapability = {
    type: accumulator.type,
    searchable: searchableProperties.value,
    aggregatable: aggregatableProperties.value,
    ...(searchableProperties.exceptions
      ? { non_searchable_indices: searchableProperties.exceptions }
      : {}),
    ...(aggregatableProperties.exceptions
      ? { non_aggregatable_indices: aggregatableProperties.exceptions }
      : {}),
  };

  if (Object.keys(accumulator.meta).length > 0) {
    capability.meta = accumulator.meta;
  }
  if (accumulator.metadataFieldSeen) {
    capability.metadata_field = accumulator.metadataField;
  }

  // Dimension and metric values disappear when mappings conflict, while their
  // companion index lists preserve the affected coverage.
  if (accumulator.dimensionSeen) {
    const nonDimensionIndices = [...accumulator.dimensionByIndex]
      .filter(([, value]) => !value)
      .map(([index]) => index);
    const hasDimension = [...accumulator.dimensionByIndex.values()].some(Boolean);
    capability.time_series_dimension = hasDimension;
    if (hasDimension && nonDimensionIndices.length > 0) {
      capability.non_dimension_indices = nonDimensionIndices;
    }
  }

  const metricValues = new Set(accumulator.metricByIndex.values());
  if (metricValues.size === 1 && accumulator.metricConflictIndices.length === 0) {
    const metric = metricValues.values().next().value;
    if (metric !== undefined) {
      capability.time_series_metric = metric;
    }
  } else if (metricValues.size > 1) {
    for (const index of accumulator.indices) {
      addUnique(accumulator.metricConflictIndices, accumulator.metricConflictIndexSet, index);
    }
  }
  if (accumulator.metricConflictIndices.length > 0) {
    capability.metric_conflicts_indices = [...accumulator.metricConflictIndices];
  }

  return capability;
};

/**
 * Merges field-capability bodies returned for disjoint index-expression batches.
 */
export const mergeFieldCapsResponses = (
  responses: estypes.FieldCapsResponse[],
  includeUnmapped: boolean
): estypes.FieldCapsResponse => {
  const indices: string[] = [];
  const indexSet = new Set<string>();
  const fields = new Map<string, FieldAccumulator>();

  // The first pass retains explicit unmapped coverage emitted by the forced
  // multi-batch request and reconstructs every capability per concrete index.
  for (const response of responses) {
    const responseIndices = normalizeIndices(response.indices);
    for (const index of responseIndices) {
      addUnique(indices, indexSet, index);
    }
    for (const [fieldName, capabilities] of Object.entries(response.fields)) {
      for (const [type, capability] of Object.entries(capabilities)) {
        mergeCapability(
          getCapabilityAccumulator(fields, fieldName, type),
          capability,
          responseIndices
        );
      }
    }
  }

  // The second pass covers whole-batch absence, which has no explicit field entry.
  // Empty responses contributed no concrete indices and therefore no coverage.
  for (const [fieldName] of fields) {
    for (const response of responses) {
      const responseIndices = normalizeIndices(response.indices);
      if (responseIndices.length > 0 && !response.fields[fieldName]) {
        addUnmappedCoverage(fields, fieldName, responseIndices);
      }
    }
  }

  const mergedFields: estypes.FieldCapsResponse['fields'] = {};
  for (const [fieldName, accumulators] of fields) {
    // After reconstruction, remove only the unmapped capability introduced by
    // the internal batched request when the caller did not request it.
    const retainedAccumulators = [...accumulators].filter(
      ([type]) => includeUnmapped || type !== 'unmapped'
    );
    if (retainedAccumulators.length === 0) {
      continue;
    }

    const capabilities: Record<string, estypes.FieldCapsFieldCapability> = {};
    for (const [type, accumulator] of retainedAccumulators) {
      const capability = buildCapability(accumulator);
      if (retainedAccumulators.length > 1) {
        capability.indices = [...accumulator.indices];
      }
      capabilities[type] = capability;
    }
    mergedFields[fieldName] = capabilities;
  }

  return { indices, fields: mergedFields };
};
