/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';
import { ALERT_EVENTS_DATA_STREAM } from '@kbn/alerting-v2-episodes-ui/constants';
import {
  parseEpisodeDataJson,
  getValueByFieldPath,
  formatGroupingValueForDisplay,
} from '@kbn/alerting-v2-episodes-ui/utils/episode_grouping_data';

export interface BuildSeriesGroupingValuesQueryOptions {
  ruleId: string;
  /** Group hashes returned by the summary query. */
  groupHashes: readonly string[];
}

/** Raw ES|QL row: the latest non-empty `data` JSON per `group_hash`. */
export interface SeriesGroupingValuesRow {
  group_hash: string;
  episode_data?: string | null;
}

/**
 * Result map: `{ [group_hash]: { [field]: value | null } }`. Fields with no
 * value are mapped to `null` so the consumer can distinguish "no value" from
 * "field not requested".
 */
export type SeriesGroupingValuesByHash = Record<string, Record<string, string | null>>;

/**
 * Builds an ES|QL query that returns the latest non-empty `data` JSON per
 * `group_hash` for a rule, used to render labels like `host=web-01` next to
 * each gantt series.
 *
 * Deliberately **untimed**: grouping values are invariant per `group_hash`
 * (identical field values always produce the same hash), so any non-empty
 * `data` document for a hash carries the right values. Avoiding a time filter
 * keeps the label populated even for series whose only in-window events are
 * recoveries (which write `data: {}`).
 *
 * Mirrors the episodes-list mechanism (`addEpisodeAggregation` in
 * `episodes_query.ts`): read the flattened `data` via `_source` + `JSON_EXTRACT`
 * and parse it client-side, rather than a `terms` agg on `data.<field>` which is
 * brittle against flattened sub-fields whose leaf key contains a dot.
 */
export const buildSeriesGroupingValuesEsqlQuery = ({
  ruleId,
  groupHashes,
}: BuildSeriesGroupingValuesQueryOptions) => {
  const hashLiterals = groupHashes.map((h) => esql.str(h));

  return esql.from([ALERT_EVENTS_DATA_STREAM], ['_source']).where`type == "alert"`
    .where`rule.id == ${ruleId}`.where`group_hash IN (${hashLiterals})`
    .pipe`EVAL extracted_data = JSON_EXTRACT(_source, "data")`
    .pipe`STATS episode_data = LAST(extracted_data, @timestamp) WHERE extracted_data != "{}" BY group_hash`.keep(
    'group_hash',
    'episode_data'
  );
};

/**
 * Parses ES|QL rows into a per-hash map of grouping field values. Each row's
 * `episode_data` JSON is parsed once, then projected onto `groupingFields`.
 * Missing/empty values map to `null`.
 *
 * TODO(https://github.com/elastic/kibana/issues/272899): `groupingFields` is the
 * rule's current grouping config, so labels for historical series can drift if the
 * config changed. Resolve per-event field names via rule versioning when available.
 */
export const parseSeriesGroupingValuesRows = (
  rows: readonly SeriesGroupingValuesRow[],
  groupingFields: readonly string[]
): SeriesGroupingValuesByHash => {
  const out: SeriesGroupingValuesByHash = {};

  for (const row of rows) {
    const data = parseEpisodeDataJson(row.episode_data);
    const fields: Record<string, string | null> = {};

    for (const field of groupingFields) {
      const formatted = formatGroupingValueForDisplay(getValueByFieldPath(data, field));
      fields[field] = formatted === '' ? null : formatted;
    }

    out[row.group_hash] = fields;
  }

  return out;
};
