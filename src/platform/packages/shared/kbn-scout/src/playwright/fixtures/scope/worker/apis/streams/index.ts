/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import type { KbnClient, ScoutLogger } from '../../../../../../common';
import { measurePerformanceAsync } from '../../../../../../common';
import type { ScoutSpaceParallelFixture } from '../../scout_space';
import {
  type Condition,
  type IngestUpsertRequest,
  type RoutingStatus,
  type StreamlangDSL,
  type StreamsIngestGetResponse,
  isClassicStreamDefinition,
  isWiredStreamDefinition,
} from './types';

export interface StreamsApiService {
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  forkStream: (
    streamName: string,
    destination: string,
    condition: Condition,
    status?: RoutingStatus
  ) => Promise<void>;
  /** See `./types` JSDoc for casting to `@kbn/streams-schema` definition types in tests. */
  getStreamDefinition: (streamName: string) => Promise<StreamsIngestGetResponse>;
  /** Materialize backing data stream for deferred wired roots (e.g. `logs.otel`). */
  restoreDataStream: (streamName: string) => Promise<void>;
  deleteStream: (streamName: string) => Promise<void>;
  /** Update a stream's ingest settings and/or description. */
  updateStream: (
    streamName: string,
    updateBody:
      | { ingest: IngestUpsertRequest; description?: string }
      | { ingest?: IngestUpsertRequest; description: string }
  ) => Promise<void>;
  clearStreamChildren: (streamName: string) => Promise<void>;
  clearStreamMappings: (streamName: string) => Promise<void>;
  clearStreamProcessors: (streamName: string) => Promise<void>;
  updateStreamProcessors: (
    streamName: string,
    getProcessors: StreamlangDSL | ((prevProcessors: StreamlangDSL) => StreamlangDSL)
  ) => Promise<void>;
}

export const getStreamsApiService = ({
  kbnClient,
  log,
  scoutSpace,
}: {
  kbnClient: KbnClient;
  log: ScoutLogger;
  scoutSpace?: ScoutSpaceParallelFixture;
}): StreamsApiService => {
  const basePath = scoutSpace?.id ? `/s/${scoutSpace?.id}` : '';

  const service = {
    enable: async () => {
      await measurePerformanceAsync(log, 'streamsApi.enable', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `${basePath}/api/streams/_enable`,
        });
      });
    },
    disable: async () => {
      await measurePerformanceAsync(log, 'streamsApi.disable', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `${basePath}/api/streams/_disable`,
        });
      });
    },
    forkStream: async (
      streamName: string,
      newStreamName: string,
      condition: Condition,
      status: RoutingStatus = 'enabled'
    ) => {
      await measurePerformanceAsync(log, 'streamsApi.createRoutingRule', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `${basePath}/api/streams/${streamName}/_fork`,
          body: {
            where: condition,
            status,
            stream: {
              name: newStreamName,
            },
          },
        });
      });
    },
    getStreamDefinition: (streamName: string) => {
      return measurePerformanceAsync(log, 'streamsApi.getStreamDefinition', async () => {
        const response = await kbnClient.request({
          method: 'GET',
          path: `${basePath}/api/streams/${streamName}`,
        });
        return response.data as StreamsIngestGetResponse;
      });
    },
    restoreDataStream: async (streamName: string) => {
      await measurePerformanceAsync(log, 'streamsApi.restoreDataStream', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `${basePath}/internal/streams/${streamName}/_restore_data_stream`,
        });
      });
    },
    deleteStream: async (streamName: string) => {
      await measurePerformanceAsync(log, 'streamsApi.deleteStream', async () => {
        await kbnClient.request({
          method: 'DELETE',
          path: `${basePath}/api/streams/${streamName}`,
        });
      });
    },
    updateStream: async (
      streamName: string,
      updateBody:
        | { ingest: IngestUpsertRequest; description?: string }
        | { ingest?: IngestUpsertRequest; description: string }
    ) => {
      await measurePerformanceAsync(log, 'streamsApi.updateStream', async () => {
        if (updateBody.description !== undefined) {
          // description can only be set via the full upsert endpoint
          const current = await service.getStreamDefinition(streamName);
          // The PUT endpoint rejects `processing.updated_at` (read-only field returned by GET).
          // Strip it before sending, whether using the current ingest or the caller's override.
          const rawIngest = updateBody.ingest ?? current.stream.ingest;
          const rawProcessing = rawIngest?.processing;
          const ingestForPut = rawProcessing
            ? {
                ...rawIngest,
                processing: omit(rawProcessing, 'updated_at'),
              }
            : rawIngest;
          await kbnClient.request({
            method: 'PUT',
            path: `${basePath}/api/streams/${streamName}`,
            body: {
              stream: {
                type: current.stream.type,
                description: updateBody.description,
                ingest: ingestForPut,
              },
              dashboards: current.stream.dashboards ?? [],
              rules: current.stream.rules ?? [],
            },
          });
        } else {
          await kbnClient.request({
            method: 'PUT',
            path: `${basePath}/api/streams/${streamName}/_ingest`,
            body: { ingest: updateBody.ingest! },
          });
        }
      });
    },
    clearStreamChildren: async (streamName: string) => {
      await measurePerformanceAsync(log, 'streamsApi.clearStreamChildren', async () => {
        const definition = await service.getStreamDefinition(streamName);
        if (isWiredStreamDefinition(definition.stream)) {
          for (const child of definition.stream.ingest.wired.routing) {
            await service.deleteStream(child.destination);
          }
        }
      });
    },
    clearStreamMappings: async (streamName: string) => {
      await measurePerformanceAsync(log, 'streamsApi.clearStreamMappings', async () => {
        const definition = await service.getStreamDefinition(streamName);
        if (isWiredStreamDefinition(definition.stream)) {
          await service.updateStream(streamName, {
            ingest: {
              ...definition.stream.ingest,
              processing: omit(definition.stream.ingest.processing, 'updated_at'),
              wired: {
                ...definition.stream.ingest.wired,
                fields: {},
              },
            },
          });
        } else if (isClassicStreamDefinition(definition.stream)) {
          await service.updateStream(streamName, {
            ingest: {
              ...definition.stream.ingest,
              processing: omit(definition.stream.ingest.processing, 'updated_at'),
              classic: {
                ...definition.stream.ingest.classic,
                field_overrides: {},
              },
            },
          });
        } else {
          throw new Error(
            `Stream ${streamName} is not a wired or classic stream, cannot clear mappings.`
          );
        }
      });
    },
    clearStreamProcessors: async (streamName: string) => {
      await measurePerformanceAsync(log, 'streamsApi.clearStreamProcessors', async () => {
        const definition = await service.getStreamDefinition(streamName);
        await service.updateStream(streamName, {
          ingest: {
            ...definition.stream.ingest,
            processing: {
              steps: [],
            },
          },
        });
      });
    },
    updateStreamProcessors: async (
      streamName: string,
      getProcessors: StreamlangDSL | ((prevProcessors: StreamlangDSL) => StreamlangDSL)
    ) => {
      await measurePerformanceAsync(log, 'streamsApi.updateStreamProcessors', async () => {
        const definition = await service.getStreamDefinition(streamName);
        const processing = !(typeof getProcessors === 'function')
          ? getProcessors
          : getProcessors(definition.stream.ingest.processing);
        await service.updateStream(streamName, {
          ingest: {
            ...definition.stream.ingest,
            processing: {
              ...processing,
            },
          },
        });
      });
    },
  };

  return service;
};
