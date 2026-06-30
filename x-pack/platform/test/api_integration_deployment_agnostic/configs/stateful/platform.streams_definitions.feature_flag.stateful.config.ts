/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import { createStatefulFeatureFlagTestConfig } from '../../default_configs/feature_flag.stateful.config.base';

export default createStatefulFeatureFlagTestConfig({
  testFiles: [require.resolve('./platform.streams_definitions.index.ts')],
  kbnServerArgs: [
    `--xpack.streams.preconfigured.stream_definitions=${JSON.stringify([
      {
        name: 'logs.ecs',
        dashboards: [],
        rules: [],
        stream: {
          type: 'wired',
          description: '',
          query_streams: [],
          ingest: {
            lifecycle: {
              dsl: {},
            },
            processing: {
              steps: [],
            },
            settings: {},
            failure_store: {
              lifecycle: {
                enabled: {
                  data_retention: '30d',
                },
              },
            },
            wired: {
              routing: [
                {
                  destination: 'logs.ecs.child',
                  where: {
                    field: 'host.name',
                    startsWith: 'filebeat',
                  },
                  status: 'enabled',
                },
              ],
              fields: {},
            },
          },
        },
      },
      {
        name: 'logs.otel',
        dashboards: [],
        rules: [],
        stream: {
          type: 'wired',
          description: '',
          query_streams: [],
          ingest: {
            lifecycle: {
              dsl: {},
            },
            processing: {
              steps: [],
            },
            settings: {},
            failure_store: {
              lifecycle: {
                enabled: {
                  data_retention: '30d',
                },
              },
            },
            wired: {
              routing: [
                {
                  destination: 'logs.otel.child',
                  where: {
                    field: 'resource.attributes.host.name',
                    startsWith: 'filebeat',
                  },
                  status: 'enabled',
                },
              ],
              fields: {},
            },
          },
        },
      },
    ] as Array<Streams.all.UpsertRequest & { name: string }>)}`,
  ],
  junit: {
    reportName: 'Platform Stateful - Streams Preconfigured Definitions API Integration Tests',
  },
});
