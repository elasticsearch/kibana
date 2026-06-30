/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import type { Agent } from '../../types';
import { appContextService } from '../app_context';
import { DATA_TIERS } from '../../../common/constants';

const AGGREGATION_MAX_SIZE = 1000;

// Agents in these states are not actively reporting OTel telemetry.
// Excluding them from the hostname-keyed metrics query prevents a newly enrolled collector
// on the same host from leaking its live metrics to a stale/offline agent entry.
// See https://github.com/elastic/kibana/issues/274843
const NON_REPORTING_OPAMP_STATUSES: Array<NonNullable<Agent['status']>> = [
  'offline',
  'inactive',
  'unenrolled',
  'uninstalled',
];

export async function fetchAndAssignAgentMetrics(esClient: ElasticsearchClient, agents: Agent[]) {
  const logger = appContextService.getLogger();
  const fleetAgents = agents.filter((agent) => agent.type !== 'OPAMP');
  const opampAgents = agents.filter((agent) => agent.type === 'OPAMP');

  // Fetch fleet and OTel metrics independently so a failure in one doesn't suppress the other.
  const [fleetAgentsMetrics, opampAgentsMetrics] = await Promise.all([
    _fetchAndAssignAgentMetrics(esClient, fleetAgents).catch((err) => {
      logger.warn(err);
      return fleetAgents.map(({ id }) => ({ id, metrics: undefined }));
    }),
    _fetchAndAssignOtelMetrics(esClient, opampAgents).catch((err) => {
      logger.warn(err);
      return opampAgents.map(({ id }) => ({ id, metrics: undefined }));
    }),
  ]);

  const metricsMap = [...fleetAgentsMetrics, ...opampAgentsMetrics].reduce((acc, agent) => {
    acc[agent.id] = agent.metrics;
    return acc;
  }, {} as Record<string, Agent['metrics']>);

  return agents.map((agent) => ({
    ...agent,
    metrics: metricsMap[agent.id],
  }));
}

async function _fetchAndAssignOtelMetrics(esClient: ElasticsearchClient, agents: Agent[]) {
  // Map service.instance.id (hostname from elastic.display.name) → agentIds.
  // Multiple agents can share the same display name, and all should receive the same metrics bucket.
  // Collectors report service.instance.id as their hostname, not their Fleet agent ID.
  //
  // Only include agents that are actively reporting. Offline/inactive/unenrolled agents must not
  // be included in the query: they share the same hostname as any newly enrolled collector on the
  // same host, so they would otherwise receive that collector's live metrics.
  const instanceIdToAgentIds = new Map<string, string[]>();
  for (const agent of agents) {
    if (agent.status && NON_REPORTING_OPAMP_STATUSES.includes(agent.status)) {
      continue;
    }
    const instanceId =
      (agent.non_identifying_attributes?.['elastic.display.name'] as string | undefined) ??
      agent.id;
    const ids = instanceIdToAgentIds.get(instanceId);
    if (ids) {
      ids.push(agent.id);
    } else {
      instanceIdToAgentIds.set(instanceId, [agent.id]);
    }
  }
  const instanceIds = Array.from(instanceIdToAgentIds.keys());

  // If no agents are actively reporting, skip the ES query entirely.
  if (instanceIds.length === 0) {
    return agents.map(({ id }) => ({ id, metrics: undefined }));
  }

  const res = await esClient.search<
    unknown,
    Record<
      'agents',
      {
        buckets: Array<{
          key: string;
          max_memory_size: { value: number };
          avg_cpu: { value: number };
        }>;
      }
    >
  >({
    ...(aggregationQueryBuilderOtel(instanceIds) as any),
    index: 'metrics-collectortelemetry.otel-*',
  });

  const formattedResults =
    res.aggregations?.agents.buckets.reduce((acc, bucket) => {
      const agentIds = instanceIdToAgentIds.get(bucket.key);
      if (agentIds) {
        for (const agentId of agentIds) {
          acc[agentId] = {
            avg_memory_size: bucket.max_memory_size.value,
            avg_cpu: bucket.avg_cpu.value,
          };
        }
      }
      return acc;
    }, {} as Record<string, { avg_memory_size: number; avg_cpu: number }>) ?? {};

  return agents.map((agent) => {
    const results = formattedResults[agent.id];

    return {
      id: agent.id,
      metrics: {
        cpu_avg: results?.avg_cpu ? Math.trunc(results.avg_cpu * 100000) / 100000 : undefined,
        memory_size_byte_avg: results?.avg_memory_size
          ? Math.trunc(results?.avg_memory_size)
          : undefined,
      },
    };
  });
}

const aggregationQueryBuilderOtel = (agentIds: string[]) => ({
  size: 0,
  query: {
    bool: {
      must: [
        {
          terms: {
            _tier: DATA_TIERS,
          },
        },
        {
          range: {
            '@timestamp': {
              gte: 'now-5m',
            },
          },
        },
        {
          terms: {
            'service.instance.id': agentIds,
          },
        },
        {
          bool: {
            filter: [
              {
                bool: {
                  should: [
                    {
                      term: {
                        'data_stream.dataset': 'collectortelemetry.otel',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
  aggs: {
    agents: {
      terms: {
        field: 'service.instance.id',
        size: AGGREGATION_MAX_SIZE,
      },
      aggs: {
        // Use max (most recent for monotonically non-decreasing RSS) to match
        // the dashboard's LAST_OVER_TIME(otelcol_process_memory_rss).
        max_memory_size: {
          max: {
            field: 'otelcol_process_memory_rss',
          },
        },

        cpu_seconds_max: { max: { field: 'otelcol_process_cpu_seconds' } },
        cpu_seconds_min: { min: { field: 'otelcol_process_cpu_seconds' } },
        // Use @timestamp delta (ms → s) as the time denominator to match
        // the dashboard's RATE(), which divides by wall-clock elapsed time.
        timestamp_max: { max: { field: '@timestamp' } },
        timestamp_min: { min: { field: '@timestamp' } },

        avg_cpu: {
          bucket_script: {
            buckets_path: {
              cpuMax: 'cpu_seconds_max',
              cpuMin: 'cpu_seconds_min',
              tsMax: 'timestamp_max',
              tsMin: 'timestamp_min',
            },
            script:
              'double cpuDelta = params.cpuMax - params.cpuMin; double timeDelta = (params.tsMax - params.tsMin) / 1000.0; return timeDelta > 0 ? (cpuDelta / timeDelta) : null;',
          },
        },
      },
    },
  },
});

async function _fetchAndAssignAgentMetrics(esClient: ElasticsearchClient, agents: Agent[]) {
  const res = await esClient.search<
    unknown,
    Record<
      'agents',
      {
        buckets: Array<{
          key: string;
          sum_memory_size: { value: number };
          sum_cpu: { value: number };
        }>;
      }
    >
  >({
    ...(aggregationQueryBuilder(agents.map(({ id }) => id)) as any),
    index: 'metrics-elastic_agent.*',
  });

  const formattedResults =
    res.aggregations?.agents.buckets.reduce((acc, bucket) => {
      acc[bucket.key] = {
        sum_memory_size: bucket.sum_memory_size.value,
        sum_cpu: bucket.sum_cpu.value,
      };
      return acc;
    }, {} as Record<string, { sum_memory_size: number; sum_cpu: number }>) ?? {};

  return agents.map((agent) => {
    const results = formattedResults[agent.id];

    return {
      id: agent.id,
      metrics: {
        cpu_avg: results?.sum_cpu ? Math.trunc(results.sum_cpu * 100000) / 100000 : undefined,
        memory_size_byte_avg: results?.sum_memory_size
          ? Math.trunc(results?.sum_memory_size)
          : undefined,
      },
    };
  });
}

const aggregationQueryBuilder = (agentIds: string[]) => ({
  size: 0,
  query: {
    bool: {
      must: [
        {
          terms: {
            _tier: DATA_TIERS,
          },
        },
        {
          range: {
            '@timestamp': {
              gte: 'now-5m',
            },
          },
        },
        {
          terms: {
            'elastic_agent.id': agentIds,
          },
        },
        {
          bool: {
            filter: [
              {
                bool: {
                  should: [
                    {
                      term: {
                        'data_stream.dataset': 'elastic_agent.elastic_agent',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
  aggs: {
    agents: {
      terms: {
        field: 'elastic_agent.id',
        size: AGGREGATION_MAX_SIZE,
      },
      aggs: {
        sum_memory_size: {
          sum_bucket: {
            buckets_path: 'processes>avg_memory_size',
          },
        },
        sum_cpu: {
          sum_bucket: {
            buckets_path: 'processes>avg_cpu',
          },
        },
        processes: {
          terms: {
            field: 'component.id',
            size: AGGREGATION_MAX_SIZE,
            order: {
              _count: 'desc',
            },
          },
          aggs: {
            avg_cpu: {
              avg_bucket: {
                buckets_path: 'cpu_time_series>cpu',
              },
            },
            avg_memory_size: {
              avg: {
                field: 'system.process.memory.size',
              },
            },
            cpu_time_series: {
              date_histogram: {
                field: '@timestamp',
                calendar_interval: 'minute',
              },
              aggs: {
                max_cpu: {
                  max: {
                    field: 'system.process.cpu.total.value',
                  },
                },
                cpu_derivative: {
                  derivative: {
                    buckets_path: 'max_cpu',
                    gap_policy: 'skip',
                    unit: '10s',
                  },
                },
                cpu: {
                  bucket_script: {
                    buckets_path: {
                      cpu_total: 'cpu_derivative[normalized_value]',
                    },
                    script: {
                      source: `if (params.cpu_total > 0) {
                      return params.cpu_total / params._interval;
                    } else {
                      return 0;
                    }`,
                      lang: 'painless',
                      params: {
                        _interval: 10000,
                      },
                    },
                    gap_policy: 'skip',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
