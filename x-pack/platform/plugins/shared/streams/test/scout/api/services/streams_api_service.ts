/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { Condition, StreamlangDSL } from '@kbn/streamlang';
import type { RoutingStatus, Streams } from '@kbn/streams-schema';
import type { IngestStream, IngestUpsertRequest } from '@kbn/streams-schema';
import {
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS,
  OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS,
  OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS,
} from '@kbn/management-settings-ids';
import type { KbnClient, ScoutLogger } from '@kbn/scout/src/common';
import { measurePerformanceAsync } from '@kbn/scout/src/common';
import { STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG } from '../../../../common/feature_flags';
import { COMMON_API_HEADERS } from '../fixtures/constants';

export interface StreamsTestApiService {
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  isEnabled: () => Promise<boolean>;
  runSignificantEventsDiscovery: () => Promise<{ executionId: string }>;
  cancelSignificantEventsDiscovery: () => Promise<{ executionId: string | null }>;
  getSignificantEventsDiscoveryStatus: () => Promise<{
    status: string;
    executionId: string | null;
  }>;
  listStreams: () => Promise<{ streams: Streams.all.Definition[] }>;
  getStream: (streamName: string) => Promise<IngestStream.all.GetResponse>;
  createStream: (streamName: string, body: Streams.all.UpsertRequest) => Promise<void>;
  createQueryStream: (streamName: string, esql: string) => Promise<void>;
  updateStream: (streamName: string, body: { ingest: IngestUpsertRequest }) => Promise<void>;
  deleteStream: (streamName: string) => Promise<void>;
  restoreDataStream: (streamName: string) => Promise<void>;
  forkStream: (
    parentStream: string,
    childStream: string,
    condition: Condition,
    status?: RoutingStatus
  ) => Promise<void>;
  simulateProcessing: (
    streamName: string,
    processing: StreamlangDSL,
    documents: Array<Record<string, unknown>>
  ) => Promise<{ documents: Array<Record<string, unknown>> }>;
  getUnmappedFields: (streamName: string) => Promise<{ unmappedFields: string[] }>;
  simulateFieldMapping: (
    streamName: string,
    fieldDefinitions: Array<{ name: string; type: string }>
  ) => Promise<{
    status: 'unknown' | 'success' | 'failure';
    simulationError: string | null;
    documentsWithRuntimeFieldsApplied: Array<Record<string, unknown>> | null;
  }>;
  getLifecycleStats: (streamName: string) => Promise<{ phases: unknown }>;
  enableQueryStreams: () => Promise<void>;
  disableQueryStreams: () => Promise<void>;
  enableSignificantEvents: () => Promise<void>;
  disableSignificantEvents: () => Promise<void>;
  enableMemory: () => Promise<void>;
  disableMemory: () => Promise<void>;
  enableWiredStreamViews: () => Promise<void>;
  disableWiredStreamViews: () => Promise<void>;
  enableDraftStreams: () => Promise<void>;
  disableDraftStreams: () => Promise<void>;
  forkDraftStream: (
    parentStream: string,
    childStream: string,
    condition: Condition
  ) => Promise<void>;
  createEsqlView: (viewName: string, query: string) => Promise<void>;
  deleteEsqlView: (viewName: string) => Promise<void>;
  runEsql: (query: string) => Promise<{ columns: Array<{ name: string }>; values: unknown[][] }>;
  cleanupTestStreams: (prefix?: string) => Promise<void>;
}

export function getStreamsTestApiService({
  kbnClient,
  esClient,
  log,
}: {
  kbnClient: KbnClient;
  esClient: Client;
  log: ScoutLogger;
}): StreamsTestApiService {
  return {
    async enable() {
      await measurePerformanceAsync(log, 'streamsTestApi.enable', async () => {
        await kbnClient.request({
          method: 'POST',
          path: '/api/streams/_enable',
        });
      });
    },

    async disable() {
      await measurePerformanceAsync(log, 'streamsTestApi.disable', async () => {
        await kbnClient.request({
          method: 'POST',
          path: '/api/streams/_disable',
        });
      });
    },

    async isEnabled() {
      return measurePerformanceAsync(log, 'streamsTestApi.isEnabled', async () => {
        const response = await kbnClient.request({
          method: 'GET',
          path: '/api/streams/_status',
        });
        return (response.data as { enabled: boolean }).enabled;
      });
    },

    async listStreams() {
      return measurePerformanceAsync(log, 'streamsTestApi.listStreams', async () => {
        const response = await kbnClient.request({
          method: 'GET',
          path: '/api/streams',
        });
        return response.data as { streams: Streams.all.Definition[] };
      });
    },

    async getStream(streamName: string) {
      return measurePerformanceAsync(log, 'streamsTestApi.getStream', async () => {
        const response = await kbnClient.request({
          method: 'GET',
          path: `/api/streams/${streamName}`,
        });
        return response.data as IngestStream.all.GetResponse;
      });
    },

    async createStream(streamName: string, body: Streams.all.UpsertRequest) {
      await measurePerformanceAsync(log, 'streamsTestApi.createStream', async () => {
        await kbnClient.request({
          method: 'PUT',
          path: `/api/streams/${streamName}`,
          body,
        });
      });
    },

    async createQueryStream(streamName: string, esql: string) {
      await measurePerformanceAsync(log, 'streamsTestApi.createQueryStream', async () => {
        await kbnClient.request({
          method: 'PUT',
          path: `/api/streams/${streamName}/_query`,
          body: { query: { esql } },
        });
      });
    },

    async updateStream(streamName: string, body: { ingest: IngestUpsertRequest }) {
      await measurePerformanceAsync(log, 'streamsTestApi.updateStream', async () => {
        await kbnClient.request({
          method: 'PUT',
          path: `/api/streams/${streamName}/_ingest`,
          body,
        });
      });
    },

    async deleteStream(streamName: string) {
      await measurePerformanceAsync(log, 'streamsTestApi.deleteStream', async () => {
        await kbnClient.request({
          method: 'DELETE',
          path: `/api/streams/${streamName}`,
        });
      });
    },

    async restoreDataStream(streamName: string) {
      await measurePerformanceAsync(log, 'streamsTestApi.restoreDataStream', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `/internal/streams/${streamName}/_restore_data_stream`,
        });
      });
    },

    async forkStream(
      parentStream: string,
      childStream: string,
      condition: Condition,
      status: RoutingStatus = 'enabled'
    ) {
      await measurePerformanceAsync(log, 'streamsTestApi.forkStream', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `/api/streams/${parentStream}/_fork`,
          body: {
            where: condition,
            status,
            stream: {
              name: childStream,
            },
          },
        });
      });
    },

    async simulateProcessing(
      streamName: string,
      processing: StreamlangDSL,
      documents: Array<Record<string, unknown>>
    ) {
      return measurePerformanceAsync(log, 'streamsTestApi.simulateProcessing', async () => {
        const response = await kbnClient.request({
          method: 'POST',
          path: `/internal/streams/${streamName}/processing/_simulate`,
          body: {
            processing,
            documents,
          },
        });
        return response.data as { documents: Array<Record<string, unknown>> };
      });
    },

    async getUnmappedFields(streamName: string) {
      return measurePerformanceAsync(log, 'streamsTestApi.getUnmappedFields', async () => {
        const response = await kbnClient.request({
          method: 'GET',
          path: `/internal/streams/${streamName}/schema/unmapped_fields`,
        });
        return response.data as { unmappedFields: string[] };
      });
    },

    async simulateFieldMapping(
      streamName: string,
      fieldDefinitions: Array<{ name: string; type: string }>
    ) {
      return measurePerformanceAsync(log, 'streamsTestApi.simulateFieldMapping', async () => {
        const response = await kbnClient.request({
          method: 'POST',
          path: `/internal/streams/${streamName}/schema/fields_simulation`,
          body: {
            field_definitions: fieldDefinitions,
          },
        });
        return response.data as {
          status: 'unknown' | 'success' | 'failure';
          simulationError: string | null;
          documentsWithRuntimeFieldsApplied: Array<Record<string, unknown>> | null;
        };
      });
    },

    async getLifecycleStats(streamName: string) {
      return measurePerformanceAsync(log, 'streamsTestApi.getLifecycleStats', async () => {
        const response = await kbnClient.request({
          method: 'GET',
          path: `/internal/streams/${streamName}/lifecycle/_stats`,
        });
        return response.data as { phases: unknown };
      });
    },

    async createEsqlView(viewName: string, query: string) {
      await measurePerformanceAsync(log, 'streamsTestApi.createEsqlView', async () => {
        await esClient.transport.request({
          method: 'PUT',
          path: `/_query/view/${viewName}`,
          body: { query },
        });
      });
    },

    async deleteEsqlView(viewName: string) {
      await measurePerformanceAsync(log, 'streamsTestApi.deleteEsqlView', async () => {
        try {
          await esClient.transport.request({
            method: 'DELETE',
            path: `/_query/view/${viewName}`,
          });
        } catch {
          // Ignore if view doesn't exist
        }
      });
    },

    async enableQueryStreams() {
      await measurePerformanceAsync(log, 'streamsTestApi.enableQueryStreams', async () => {
        await kbnClient.uiSettings.update({
          'observability:streamsEnableQueryStreams': true,
        });
      });
    },

    async disableQueryStreams() {
      await measurePerformanceAsync(log, 'streamsTestApi.disableQueryStreams', async () => {
        await kbnClient.uiSettings.update({
          'observability:streamsEnableQueryStreams': false,
        });
      });
    },

    async enableSignificantEvents() {
      await measurePerformanceAsync(log, 'streamsTestApi.enableSignificantEvents', async () => {
        await kbnClient.uiSettings.update({
          [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: true,
        });
      });
    },

    async disableSignificantEvents() {
      await measurePerformanceAsync(log, 'streamsTestApi.disableSignificantEvents', async () => {
        await kbnClient.uiSettings.update({
          [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: false,
        });
      });
    },

    async enableMemory() {
      await measurePerformanceAsync(log, 'streamsTestApi.enableMemory', async () => {
        await kbnClient.request({
          path: '/internal/core/_settings',
          method: 'PUT',
          headers: COMMON_API_HEADERS,
          body: {
            'feature_flags.overrides': {
              [STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG]: true,
            },
          },
        });
      });
    },

    async disableMemory() {
      await measurePerformanceAsync(log, 'streamsTestApi.disableMemory', async () => {
        await kbnClient.request({
          path: '/internal/core/_settings',
          method: 'PUT',
          headers: COMMON_API_HEADERS,
          body: {
            'feature_flags.overrides': {
              [STREAMS_SIGNIFICANT_EVENTS_MEMORY_ENABLED_FLAG]: false,
            },
          },
        });
      });
    },

    async enableWiredStreamViews() {
      await measurePerformanceAsync(log, 'streamsTestApi.enableWiredStreamViews', async () => {
        await kbnClient.uiSettings.update({
          'observability:streamsEnableWiredStreamViews': true,
        });
      });
    },

    async disableWiredStreamViews() {
      await measurePerformanceAsync(log, 'streamsTestApi.disableWiredStreamViews', async () => {
        await kbnClient.uiSettings.update({
          'observability:streamsEnableWiredStreamViews': false,
        });
      });
    },

    async enableDraftStreams() {
      await measurePerformanceAsync(log, 'streamsTestApi.enableDraftStreams', async () => {
        await kbnClient.uiSettings.update({
          [OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS]: true,
          [OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS]: true,
        });
      });
    },

    async disableDraftStreams() {
      await measurePerformanceAsync(log, 'streamsTestApi.disableDraftStreams', async () => {
        await kbnClient.uiSettings.update({
          [OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS]: false,
          [OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS]: false,
        });
      });
    },

    async forkDraftStream(parentStream: string, childStream: string, condition: Condition) {
      await measurePerformanceAsync(log, 'streamsTestApi.forkDraftStream', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `/api/streams/${parentStream}/_fork`,
          body: {
            where: condition,
            stream: { name: childStream },
            draft: true,
          },
        });
      });
    },

    async runEsql(query: string) {
      return measurePerformanceAsync(log, 'streamsTestApi.runEsql', async () => {
        const response = await esClient.esql.query({ query, format: 'json' }, { meta: true });
        const body = response.body as unknown as {
          columns: Array<{ name: string }>;
          values: unknown[][];
        };
        return { columns: body.columns, values: body.values };
      });
    },

    async cleanupTestStreams(prefix = 'logs.test') {
      await measurePerformanceAsync(log, 'streamsTestApi.cleanupTestStreams', async () => {
        const { streams } = await this.listStreams();
        const testStreams = streams.filter((stream) => stream.name.startsWith(prefix));

        // Delete in reverse order (children first)
        const sortedStreams = testStreams.sort(
          (a, b) => b.name.split('.').length - a.name.split('.').length
        );

        for (const stream of sortedStreams) {
          try {
            await this.deleteStream(stream.name);
          } catch (error) {
            log.debug(`Failed to delete stream ${stream.name}: ${error}`);
          }
        }
      });
    },

    async runSignificantEventsDiscovery() {
      return measurePerformanceAsync(
        log,
        'streamsTestApi.runSignificantEventsDiscovery',
        async () => {
          const response = await kbnClient.request({
            method: 'POST',
            path: '/internal/streams/significant_events/discovery/_execute',
            body: { action: 'trigger' },
          });
          return response.data as { executionId: string };
        }
      );
    },

    async cancelSignificantEventsDiscovery() {
      return measurePerformanceAsync(
        log,
        'streamsTestApi.cancelSignificantEventsDiscovery',
        async () => {
          const response = await kbnClient.request({
            method: 'POST',
            path: '/internal/streams/significant_events/discovery/_execute',
            body: { action: 'cancel' },
          });
          return response.data as { executionId: string | null };
        }
      );
    },

    async getSignificantEventsDiscoveryStatus() {
      return measurePerformanceAsync(
        log,
        'streamsTestApi.getSignificantEventsDiscoveryStatus',
        async () => {
          const response = await kbnClient.request({
            method: 'GET',
            path: '/internal/streams/significant_events/discovery/_status',
          });
          return response.data as { status: string; executionId: string | null };
        }
      );
    },
  };
}
