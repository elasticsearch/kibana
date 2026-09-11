/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertEventSeverity } from '@kbn/alerting-v2-schemas';
import type {
  AlertEpisodeStatus,
  AlertEventStatus,
} from '../../resources/datastreams/alert_events';

/**
 * The shape every alert-event ES|QL loader in this client produces and every
 * handler reads. It mirrors the `KEEP …` projection used by the bulk- and
 * single-event queries (see `context_loaders/`) — keep it stable so the two
 * shapes can't drift apart and so handler code can rely on these fields
 * without re-checking which loader produced the row.
 */
export interface AlertEventRecord {
  '@timestamp': string;
  group_hash: string;
  episode_id: string;
  rule_id: string | null;
  space_id: string;
  source: string;
  rule_version?: number;
  data_json: Record<string, unknown>;
  severity?: AlertEventSeverity | null;
  episode_status?: AlertEpisodeStatus | null;
  status?: AlertEventStatus;
  episode_status_count?: number | null;
}

/**
 * Wire-level shape of a single row coming out of any alert-event ES|QL
 * projection in this client: `data_json` is still the JSON string
 * extracted from `_source.data` at this layer. {@link toAlertEventRecords}
 * parses it on the way out so callers see the canonical
 * {@link AlertEventRecord} shape.
 */
export type RawAlertEventRow = Omit<AlertEventRecord, 'data_json'> & {
  data_json?: string | null;
};
