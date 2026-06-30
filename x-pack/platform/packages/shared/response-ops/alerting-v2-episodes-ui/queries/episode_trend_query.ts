/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Builder, LeafPrinter, esql } from '@elastic/esql';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import { ALERT_EVENTS_DATA_STREAM, TIME_FIELD } from '../constants';

export interface EpisodeTrendRow {
  '@timestamp': string;
  'episode.status': AlertEpisodeStatus;
  /**
   * Evaluated numeric value per requested metric label, or `null` when the event
   * recorded no value for it (e.g. a status-only lifecycle event).
   */
  metrics: Record<string, number | null>;
}

/**
 * Escaped ES|QL identifier for the column holding a metric label's values. The column
 * is named after the label itself, so the query reads as `EVAL count = ...` rather than
 * an opaque positional name; `LeafPrinter` backtick-escapes labels with special characters.
 */
const metricColumn = (label: string): string =>
  LeafPrinter.column(Builder.expression.column(label));

/**
 * `JSON_EXTRACT` string-literal selector reading `<label>` out of the event's flattened
 * `data` object. Bracket notation (`data['count']`) reads the label as a single key, so
 * labels containing dots or other special characters work; `'` and `\` are escaped.
 */
const dataSelector = (label: string): string =>
  LeafPrinter.string({ valueUnquoted: `data['${label.replace(/['\\]/g, '\\$&')}']` });

const toNumberOrNull = (value: unknown): number | null => {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(num) ? num : null;
};

/**
 * ES|QL query returning every `.rule-events` event for an episode (oldest first),
 * carrying the lifecycle status and, for each requested metric label, the value the
 * rule evaluated for that execution. Unlike a re-aggregation of the source index,
 * these are the exact values the rule evaluated, at the timestamps it evaluated them
 * — and they are already scoped to the episode's group via `episode.id`.
 *
 * `METADATA _source` lets `JSON_EXTRACT` read the flattened `data` field. Rather than
 * shipping the whole `data` row, we project only the charted metrics — one column per
 * requested label, named after it — so the response carries just the values the trend
 * chart plots.
 */
export const buildEpisodeTrendQuery = (
  spaceId: string,
  episodeId: string,
  metricLabels: string[]
) => {
  // prettier-ignore
  let query = esql.from([ALERT_EVENTS_DATA_STREAM], ['_source'])
    .where`space_id == ${spaceId}`
    .where`type == "alert"`
    .where`episode.id == ${episodeId}`;

  metricLabels.forEach((label) => {
    query = query.pipe(
      `EVAL ${metricColumn(label)} = JSON_EXTRACT(_source, ${dataSelector(label)})`
    );
  });

  return query.sort([TIME_FIELD, 'ASC']).keep('@timestamp', 'episode.status', ...metricLabels);
};

/**
 * Maps the raw ES|QL rows back into {@link EpisodeTrendRow}s, keying each event's values
 * by the metric label that produced them and coercing the extracted values to numbers
 * (`JSON_EXTRACT` returns keywords).
 */
export const parseEpisodeTrendRows = (
  rawRows: Array<Record<string, unknown>>,
  metricLabels: string[]
): EpisodeTrendRow[] =>
  rawRows.map((row) => ({
    '@timestamp': row['@timestamp'] as string,
    'episode.status': row['episode.status'] as AlertEpisodeStatus,
    metrics: Object.fromEntries(metricLabels.map((label) => [label, toNumberOrNull(row[label])])),
  }));
