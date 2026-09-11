/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DeepPartial } from 'utility-types';
import type { AgentName } from '@kbn/elastic-agent-utils';
import type { RollupInterval } from '@kbn/apm-types';

export interface TimeframeMap {
  '1d': number;
  all: number;
}

export type TimeframeMap1d = Pick<TimeframeMap, '1d'>;
export type TimeframeMapAll = Pick<TimeframeMap, 'all'>;

export interface AggregatedTransactionsCounts {
  expected_metric_document_count: number;
  transaction_count: number;
}

export interface APMPerAgentConfigSettings {
  agent_name: string;
  has_error: boolean;
  settings: string[];
  advanced_settings: string[];
}

export interface APMPerService {
  service_id: string;
  timed_out: boolean;
  num_service_nodes: number;
  num_transaction_types: number;
  cloud: {
    availability_zones: string[];
    regions: string[];
    providers: string[];
  };
  faas: {
    trigger: {
      type: string[];
    };
  };
  agent: {
    name: string;
    version: string;
    activation_method: string;
  };
  service: {
    language: {
      name: string;
      version: string;
    };
    framework: {
      name: string;
      version: string;
    };
    runtime: {
      name: string;
      version: string;
    };
  };
  kubernetes: {
    pod: {
      name: string;
    };
  };
  container: {
    id: string;
  };
}

export interface APMUsage {
  has_any_services_per_official_agent: boolean;
  has_any_services: boolean;
  services_per_agent: Record<AgentName, number>;
  version: {
    apm_server: {
      minor: number;
      major: number;
      patch: number;
    };
  };
  environments: {
    services_without_environment: number;
    services_with_multiple_environments: number;
    top_environments: string[];
  };
  aggregated_transactions: {
    current_implementation: AggregatedTransactionsCounts;
    no_observer_name: AggregatedTransactionsCounts;
    no_rum: AggregatedTransactionsCounts;
    no_rum_no_observer_name: AggregatedTransactionsCounts;
    only_rum: AggregatedTransactionsCounts;
    only_rum_no_observer_name: AggregatedTransactionsCounts;
  };
  cloud: {
    availability_zone: string[];
    provider: string[];
    region: string[];
  };
  host: { os: { platform: string[] } };
  counts: {
    transaction: TimeframeMap;
    span: TimeframeMap;
    error: TimeframeMap;
    metric: TimeframeMap;
    onboarding: TimeframeMap;
    agent_configuration: TimeframeMapAll;
    max_transaction_groups_per_service: TimeframeMap1d;
    max_error_groups_per_service: TimeframeMap1d;
    traces: TimeframeMap;
    services: TimeframeMap1d;
    environments: TimeframeMap1d;
    span_destination_service_resource: TimeframeMap1d;
    global_labels: TimeframeMap1d;
  };
  cardinality: {
    client: { geo: { country_iso_code: { rum: TimeframeMap1d } } };
    user_agent: {
      original: {
        all_agents: TimeframeMap1d;
        rum: TimeframeMap1d;
      };
    };
    transaction: {
      name: {
        all_agents: TimeframeMap1d;
        rum: TimeframeMap1d;
      };
    };
  };
  retainment: Record<'span' | 'transaction' | 'error' | 'metric' | 'onboarding', { ms: number }>;
  integrations: {
    ml: {
      all_jobs_count: number;
    };
  };
  agents: Record<
    AgentName,
    {
      agent: {
        version: string[];
        activation_method: string[];
      };
      service: {
        framework: {
          name: string[];
          version: string[];
          composite: string[];
        };
        language: {
          name: string[];
          version: string[];
          composite: string[];
        };
        runtime: {
          name: string[];
          version: string[];
          composite: string[];
        };
      };
    }
  >;
  indices: {
    traces: {
      shards: {
        total: number;
      };
      all: {
        total: {
          docs: {
            count: number;
          };
          store: {
            size_in_bytes: number;
          };
        };
      };
    };
    metric: {
      shards: {
        total: number;
      };
      all: {
        total: {
          docs: {
            count: number;
          };
          store: {
            size_in_bytes: number;
          };
        };
      };
      metricset: DataStreamStats;
    };
    shards: {
      total: number;
    };
    all: {
      total: {
        docs: {
          count: number;
        };
        store: {
          size_in_bytes: number;
        };
      };
    };
  };
  service_groups: {
    kuery_fields: string[];
    total: number;
  };
  custom_dashboards: {
    kuery_fields: string[];
    total: number;
  };
  per_service: APMPerService[];
  per_agent_config_settings: APMPerAgentConfigSettings[];
  top_traces: {
    max: number;
    median: number;
  };
  tasks: Record<
    | 'aggregated_transactions'
    | 'cloud'
    | 'host'
    | 'processor_events'
    | 'agent_configuration'
    | 'global_labels'
    | 'services'
    | 'versions'
    | 'groupings'
    | 'integrations'
    | 'agents'
    | 'indices_stats'
    | 'cardinality'
    | 'environments'
    | 'service_groups'
    | 'custom_dashboards'
    | 'per_service'
    | 'top_traces'
    | 'per_agent_config_settings',
    { took: { ms: number } }
  >;
}

export type MetricRollupIntervals =
  | RollupInterval.OneMinute
  | RollupInterval.TenMinutes
  | RollupInterval.SixtyMinutes;

export type MetricSupportingRollUp =
  | 'service_destination'
  | 'transaction'
  | 'service_summary'
  | 'service_transaction'
  | 'span_breakdown';

export type MetricNotSupportingRollup = 'app';

export type MetricTypes = MetricSupportingRollUp | MetricNotSupportingRollup;

export interface CapturedMetricStats {
  total: {
    shards: number;
    docs: {
      count: number;
    };
    store: {
      size_in_bytes: number;
    };
  };
}

export interface LastDayCount {
  doc_count: number;
}

export interface DataStreamCombined {
  all: CapturedMetricStats;
  '1d': LastDayCount;
}

export type DataStreamStats = Record<string, DataStreamCombined>;

export type APMDataTelemetry = DeepPartial<APMUsage>;

export type APMTelemetry = APMDataTelemetry;
