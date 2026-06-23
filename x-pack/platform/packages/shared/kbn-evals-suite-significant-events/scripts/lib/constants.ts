/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { IndicesUpdateAliasesAddAction } from '@elastic/elasticsearch/lib/api/types';
import type { Scenario } from './types';

export {
  DEFAULT_LOGS_INDEX,
  DEFAULT_DEMO_APP,
  GCS_BUCKET,
  OTEL_DEMO_NAMESPACE,
  OTEL_DEMO_GCS_BASE_PATH_PREFIX,
} from '../../src/constants';

export const DEFAULT_ENV_SNAPSHOT_LOGS_INDEX = 'logs.otel';

// Wait times
export const BASELINE_WAIT_MS = 3 * 60 * 1000;
export const FAILURE_WAIT_MS = 5 * 60 * 1000;
export const KI_FEATURE_EXTRACTION_POLL_INTERVAL_MS = 10_000;
export const KI_FEATURE_EXTRACTION_TIMEOUT_MS = 15 * 60 * 1000;

export const HEALTHY_BASELINE_SCENARIO: Scenario = { id: 'healthy-baseline' };

export const KNOWLEDGE_INDICATORS_DATA_STREAM = '.significant_events-knowledge_indicators';

export const VALID_SYSTEM_INDICES = ['.kibana_streams_tasks-*'] as const;

export const VALID_ALERT_INDICES = ['.internal.alerts-streams.alerts-default-*'] as const;

type ValidStreamsSystemIndices = (typeof VALID_SYSTEM_INDICES)[number];
type ValidStreamsAlertIndices = (typeof VALID_ALERT_INDICES)[number];
type ValidStreamsIndices = ValidStreamsSystemIndices | ValidStreamsAlertIndices;

export type StreamsIndexAliasConfig = Pick<IndicesUpdateAliasesAddAction, 'alias' | 'is_hidden'>;

export const INDEX_ALIAS_CONFIG: Record<ValidStreamsIndices, StreamsIndexAliasConfig> = {
  '.kibana_streams_tasks-*': {
    alias: '.kibana_streams_tasks',
    is_hidden: true,
  },
  '.internal.alerts-streams.alerts-default-*': {
    alias: '.alerts-streams.alerts-default',
  },
};
