/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MakeSchemaFrom } from '@kbn/usage-collection-plugin/server';
import type { AlertingV2Usage } from './types';

export const AlertingV2UsageCollectorSchema: MakeSchemaFrom<AlertingV2Usage> = {
  has_errors: {
    type: 'boolean',
    _meta: { description: 'Whether the telemetry task encountered errors during collection.' },
  },
  error_messages: { type: 'array', items: { type: 'keyword' } },
  count_total: {
    type: 'long',
    _meta: { description: 'Total number of alerting v2 rules.' },
  },
  count_enabled: {
    type: 'long',
    _meta: { description: 'Number of enabled alerting v2 rules.' },
  },
  count_agent_builder_assisted: {
    type: 'long',
    _meta: {
      description:
        'Number of alerting v2 rules currently tagged as created/edited via Agent Builder.',
    },
  },
  count_by_kind: {
    alert: {
      type: 'long',
      _meta: { description: 'Number of rules of kind alert.' },
    },
    signal: {
      type: 'long',
      _meta: { description: 'Number of rules of kind signal.' },
    },
  },
  count_by_schedule: {
    type: 'array',
    items: {
      name: { type: 'keyword', _meta: { description: 'Schedule interval string.' } },
      value: { type: 'long', _meta: { description: 'Number of rules with this schedule.' } },
    },
  },
  count_by_lookback: {
    type: 'array',
    items: {
      name: { type: 'keyword', _meta: { description: 'Lookback duration string.' } },
      value: { type: 'long', _meta: { description: 'Number of rules with this lookback.' } },
    },
  },
  avg_pending_count: {
    type: 'float',
    _meta: { description: 'Average configured pending count across rules with state transitions.' },
  },
  avg_recovering_count: {
    type: 'float',
    _meta: {
      description: 'Average configured recovering count across rules with state transitions.',
    },
  },
  count_by_pending_timeframe: {
    type: 'array',
    items: {
      name: { type: 'keyword', _meta: { description: 'Pending timeframe duration string.' } },
      value: {
        type: 'long',
        _meta: { description: 'Number of rules with this pending timeframe.' },
      },
    },
  },
  count_by_recovering_timeframe: {
    type: 'array',
    items: {
      name: { type: 'keyword', _meta: { description: 'Recovering timeframe duration string.' } },
      value: {
        type: 'long',
        _meta: { description: 'Number of rules with this recovering timeframe.' },
      },
    },
  },
  count_with_grouping: {
    type: 'long',
    _meta: { description: 'Number of rules with grouping enabled.' },
  },
  avg_grouping_fields_count: {
    type: 'float',
    _meta: { description: 'Average number of grouping fields per rule.' },
  },
  min_created_at: {
    type: 'date',
    _meta: { description: 'Earliest rule creation date.' },
  },

  executions_count_24hr: {
    type: 'long',
    _meta: { description: 'Total rule executor executions in the last 24 hours.' },
  },
  executions_count_by_status_24hr: {
    success: {
      type: 'long',
      _meta: { description: 'Successful rule executor executions in the last 24 hours.' },
    },
    failure: {
      type: 'long',
      _meta: { description: 'Failed rule executor executions in the last 24 hours.' },
    },
    unknown: {
      type: 'long',
      _meta: {
        description: 'Rule executor executions with unknown outcome in the last 24 hours.',
      },
    },
  },
  executions_delay_p50_ms: {
    type: 'float',
    _meta: { description: 'P50 schedule delay in milliseconds over the last 24 hours.' },
  },
  executions_delay_p75_ms: {
    type: 'float',
    _meta: { description: 'P75 schedule delay in milliseconds over the last 24 hours.' },
  },
  executions_delay_p95_ms: {
    type: 'float',
    _meta: { description: 'P95 schedule delay in milliseconds over the last 24 hours.' },
  },
  executions_delay_p99_ms: {
    type: 'float',
    _meta: { description: 'P99 schedule delay in milliseconds over the last 24 hours.' },
  },
  dispatcher_executions_count_24hr: {
    type: 'long',
    _meta: { description: 'Total dispatcher executions in the last 24 hours.' },
  },

  action_policies_count: {
    type: 'long',
    _meta: { description: 'Total number of action policies.' },
  },
  action_policies_unique_workflow_count: {
    type: 'long',
    _meta: { description: 'Number of unique workflows referenced by action policies.' },
  },
  action_policies_count_with_matcher: {
    type: 'long',
    _meta: { description: 'Number of action policies with a matcher.' },
  },
  action_policies_count_agent_builder_assisted: {
    type: 'long',
    _meta: {
      description:
        'Number of action policies currently tagged as created/edited via Agent Builder.',
    },
  },
  action_policies_count_with_group_by: {
    type: 'long',
    _meta: { description: 'Number of action policies with group by.' },
  },
  action_policies_avg_group_by_fields_count: {
    type: 'float',
    _meta: { description: 'Average number of group by fields per action policy.' },
  },
  action_policies_count_by_throttle_interval: {
    type: 'array',
    items: {
      name: { type: 'keyword', _meta: { description: 'Throttle interval duration string.' } },
      value: {
        type: 'long',
        _meta: { description: 'Number of action policies with this throttle interval.' },
      },
    },
  },

  alerts_count: {
    type: 'long',
    _meta: { description: 'Total number of alert events.' },
  },
  alerts_count_by_kind: {
    breached: {
      type: 'long',
      _meta: { description: 'Number of alert events with status breached.' },
    },
    recovered: {
      type: 'long',
      _meta: { description: 'Number of alert events with status recovered.' },
    },
    no_data: {
      type: 'long',
      _meta: { description: 'Number of alert events with status no_data.' },
    },
  },
  alerts_count_by_source: {
    type: 'array',
    items: {
      name: { type: 'keyword', _meta: { description: 'Alert source.' } },
      value: { type: 'long', _meta: { description: 'Number of alert events from this source.' } },
    },
  },
  alerts_count_by_type: {
    signal: {
      type: 'long',
      _meta: { description: 'Number of alert events of type signal.' },
    },
    alert: {
      type: 'long',
      _meta: { description: 'Number of alert events of type alert.' },
    },
  },
  alerts_episode_count: {
    type: 'long',
    _meta: { description: 'Number of unique alert episodes.' },
  },
  alerts_min_timestamp: {
    type: 'date',
    _meta: { description: 'Earliest alert event timestamp.' },
  },
  alerts_index_size_bytes: {
    type: 'long',
    _meta: { description: 'Size of the alert events data stream in bytes.' },
  },
};
