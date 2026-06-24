/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty, isPlainObject, isString, sortBy } from 'lodash';
import type { EpisodeEventRow } from '../queries/episode_events_query';
import { formatGroupingValueForDisplay } from './episode_grouping_data';

/**
 * Normalizes an episode event `data` payload from ES|QL.
 *
 * `JSON_EXTRACT` may return either a JSON string or a parsed object depending on
 * the transport layer; both shapes are accepted here.
 */
export const normalizeEpisodeEventDataPayload = (raw: unknown): Record<string, unknown> | null => {
  if (raw == null) {
    return null;
  }

  if (isPlainObject(raw)) {
    return isEmpty(raw) ? null : (raw as Record<string, unknown>);
  }

  if (!isString(raw) || raw.length === 0 || raw === '{}') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || isEmpty(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Resolves evaluation `data` for a single episode event row.
 */
export const resolveEpisodeEventData = (
  row: Pick<EpisodeEventRow, 'data'>
): Record<string, unknown> | null => {
  return normalizeEpisodeEventDataPayload(row.data);
};

/** Serializes a single event-data value for display in the severity heatmap tooltip. */
export const formatEpisodeEventFieldValue = (value: unknown): string =>
  formatGroupingValueForDisplay(value);

export interface EpisodeEventFieldValueRow {
  field: string;
  value: string;
}

/** Flattens resolved event data into field/value rows for tooltip display. */
export const eventDataToFieldValueRows = (
  eventData: Record<string, unknown> | null
): EpisodeEventFieldValueRow[] => {
  if (!eventData) {
    return [];
  }

  return sortBy(
    Object.entries(eventData).map(([field, rawValue]) => ({
      field,
      value: formatEpisodeEventFieldValue(rawValue),
    })),
    'field'
  );
};
