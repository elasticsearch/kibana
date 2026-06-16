/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import type { TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';

/**
 * Converts a `DataTableRecord` into the `TimelineEventsDetailsItem[]` format expected by legacy
 * action hooks (e.g. responder, add-to-case). Each flattened field is mapped to its category,
 * stringified values, and original value.
 *
 * @deprecated This adapter exists only to bridge the gap while legacy hooks still require
 * `TimelineEventsDetailsItem[]`. It should be removed once all actions and downstream logic
 * have been updated to accept `DataTableRecord` directly.
 */
export const getTimelineEventsDetailsFromRecord = (
  hit: DataTableRecord
): TimelineEventsDetailsItem[] => {
  return Object.entries(hit.flattened).map(([field, value]) => ({
    field,
    values: Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : undefined,
    originalValue: value,
    isObjectArray: Array.isArray(value) && value.length > 0 && typeof value[0] === 'object',
    category: field.split('.')[0],
  }));
};
