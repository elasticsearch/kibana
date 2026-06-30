/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { emptyAssets, type Streams } from '@kbn/streams-schema';
import { OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS } from '@kbn/management-settings-ids';
import type { StreamlangProcessorDefinition } from '@kbn/streamlang';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { StreamsSupertestRepositoryClient } from './helpers/repository_client';
import { createStreamsRepositoryAdminClient } from './helpers/repository_client';
import {
  bulkQueries,
  disableStreams,
  enableStreams,
  forkStream,
  getQueries,
  getStream,
  indexAndAssertTargetStream,
} from './helpers/requests';
import { STREAMS_SNAPSHOT_REPO_PATH } from '../../default_configs/common_paths';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const esClient = getService('es');
  const alertingApi = getService('alertingApiCommon');
  const samlAuth = getService('samlAuth');
  const kibanaServer = getService('kibanaServer');
  let apiClient: StreamsSupertestRepositoryClient;
  let roleAuthc: Awaited<ReturnType<typeof samlAuth.createM2mApiKeyWithRoleScope>>;

  const REPO_NAME = 'streams_test_repo';
  const SNAPSHOT_NAME = 'streams_test_snapshot';
  // Use the dedicated streams snapshot repository path
  const REPO_PATH = STREAMS_SNAPSHOT_REPO_PATH;

  describe('Snapshot and Restore', function () {
    this.tags(['skipCloud', 'skipMKI', 'skipServerless']);

    before(async () => {
      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
      roleAuthc = await samlAuth.createM2mApiKeyWithRoleScope('admin');
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: true,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    after(async () => {
      await samlAuth.invalidateM2mApiKeyWithRoleScope(roleAuthc);
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: false,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    describe('Full workflow with snapshot and restore', () => {
      before(async () => {
        // Create snapshot repository
        await esClient.snapshot.createRepository({
          name: REPO_NAME,
          repository: {
            type: 'fs',
            settings: {
              location: REPO_PATH,
              compress: true,
            },
          },
          verify: true,
        });
      });

      after(async () => {
        // Cleanup: Delete snapshot and repository
        try {
          await esClient.snapshot.delete({
            repository: REPO_NAME,
            snapshot: SNAPSHOT_NAME,
          });
        } catch (e) {
          // Ignore errors if snapshot doesn't exist
        }

        try {
          await esClient.snapshot.deleteRepository({
            name: REPO_NAME,
          });
        } catch (e) {
          // Ignore errors if repository doesn't exist
        }

        // Disable streams to clean up
        try {
          await disableStreams(apiClient);
        } catch (e) {
          // Ignore errors
        }
      });

      it('should create a stream setup, snapshot, restore, and continue working', async () => {
        // Step 1: Enable streams
        await enableStreams(apiClient);

        // Step 2: Fork a child stream with routing condition
        const forkBody = {
          stream: {
            name: 'logs.otel.web-app',
          },
          where: {
            field: 'resource.attributes.service.name',
            eq: 'web-app',
          },
          status: 'enabled' as const,
        };

        const forkResponse = await forkStream(apiClient, 'logs.otel', forkBody);
        expect(forkResponse).to.have.property('acknowledged', true);

        // Step 3: Configure processing steps and custom field mappings on the child stream
        // This tests that all aspects of stream configuration survive snapshot/restore
        const streamConfigBody: Streams.WiredStream.UpsertRequest = {
          ...emptyAssets,
          stream: {
            type: 'wired',
            description: 'Web app stream with processing and custom fields',
            ingest: {
              lifecycle: { inherit: {} },
              settings: {},
              processing: {
                steps: [
                  {
                    action: 'grok',
                    from: 'body.text',
                    patterns: [
                      '%{WORD:attributes.request_method} %{URIPATH:attributes.request_path}',
                    ],
                    where: { always: {} },
                  },
                  {
                    action: 'dissect',
                    from: 'attributes.request_path',
                    pattern: '/api/%{attributes.api_version}/%{attributes.endpoint}',
                    where: {
                      field: 'attributes.request_path',
                      startsWith: '/api/',
                    },
                  },
                ],
              },
              wired: {
                fields: {
                  'attributes.request_method': {
                    type: 'keyword',
                  },
                  'attributes.request_path': {
                    type: 'keyword',
                  },
                  'attributes.api_version': {
                    type: 'keyword',
                  },
                  'attributes.endpoint': {
                    type: 'keyword',
                  },
                  'attributes.response_time_ms': {
                    type: 'long',
                  },
                },
                routing: [],
              },
              failure_store: { inherit: {} },
            },
          },
        };

        const configResponse = await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: { name: 'logs.otel.web-app' },
            body: streamConfigBody,
          },
        });
        expect(configResponse.status).to.eql(200);

        // Add a significant event query that should survive snapshot/restore
        await bulkQueries(apiClient, 'logs.otel.web-app', [
          {
            index: {
              id: 'slow-requests',
              title: 'Slow Requests',
              description: '',
              esql: {
                query:
                  'FROM logs.otel.web-app,logs.otel.web-app.* METADATA _id, _source | WHERE KQL("attributes.response_time_ms > 100")',
              },
            },
          },
        ]);

        // Verify query was created
        const streamWithQuery = await getQueries(apiClient, 'logs.otel.web-app');
        expect(streamWithQuery.queries).to.have.length(1);
        expect(streamWithQuery.queries[0].title).to.eql('Slow Requests');

        // Verify the underlying alerting rule was created
        const rulesBeforeSnapshot = await alertingApi.searchRules(
          roleAuthc,
          'alert.attributes.name:"Slow Requests"'
        );
        expect(rulesBeforeSnapshot.body.data).to.have.length(1);
        expect(rulesBeforeSnapshot.body.data[0].name).to.eql('Slow Requests');
        expect(rulesBeforeSnapshot.body.data[0].enabled).to.be(true);

        // Step 4: Index documents to test processing and routing
        const parentDoc = {
          '@timestamp': '2024-01-01T00:00:00.000Z',
          message: JSON.stringify({
            '@timestamp': '2024-01-01T00:00:00.000Z',
            'log.level': 'info',
            'service.name': 'api-server',
            message: 'GET /health',
          }),
        };

        const childDoc = {
          '@timestamp': '2024-01-01T00:00:10.000Z',
          message: JSON.stringify({
            '@timestamp': '2024-01-01T00:00:10.000Z',
            'log.level': 'info',
            'service.name': 'web-app',
            response_time_ms: 45,
            message: 'GET /api/v1/users',
          }),
        };

        // Index documents and verify they go to correct streams with processing applied
        await indexAndAssertTargetStream(esClient, 'logs.otel', parentDoc);
        const childResult = await indexAndAssertTargetStream(
          esClient,
          'logs.otel.web-app',
          childDoc
        );

        // Verify processing was applied (grok extracted request_method and request_path)
        expect(childResult._source).to.eql({
          '@timestamp': '2024-01-01T00:00:10.000Z',
          body: { text: 'GET /api/v1/users' },
          severity_text: 'info',
          resource: {
            attributes: {
              'service.name': 'web-app',
            },
          },
          attributes: {
            request_method: 'GET',
            request_path: '/api/v1/users',
            api_version: 'v1',
            endpoint: 'users',
            response_time_ms: 45,
          },
          stream: { name: 'logs.otel.web-app' },
        });

        // Step 5: Verify stream definitions exist and have correct configuration
        const logsDefinition = await getStream(apiClient, 'logs.otel');
        expect(logsDefinition).to.have.property('stream');

        const logsWebAppDefinition = await getStream(apiClient, 'logs.otel.web-app');
        expect(logsWebAppDefinition).to.have.property('stream');

        // Verify routing configuration on parent stream
        const logsStream = logsDefinition.stream as Streams.WiredStream.Definition;
        expect(logsStream.ingest.wired.routing).to.have.length(1);
        expect(logsStream.ingest.wired.routing[0].destination).to.eql('logs.otel.web-app');

        // Verify processing configuration on child stream
        const webAppStream = logsWebAppDefinition.stream as Streams.WiredStream.Definition;
        expect(webAppStream.ingest.processing.steps).to.have.length(2);
        expect(
          (webAppStream.ingest.processing.steps[0] as StreamlangProcessorDefinition).action
        ).to.eql('grok');
        expect(
          (webAppStream.ingest.processing.steps[1] as StreamlangProcessorDefinition).action
        ).to.eql('dissect');

        // Verify field mappings
        expect(webAppStream.ingest.wired.fields['attributes.request_method']).to.eql({
          type: 'keyword',
        });
        expect(webAppStream.ingest.wired.fields['attributes.response_time_ms']).to.eql({
          type: 'long',
        });

        // Step 6: Create snapshot
        const snapshotResponse = await esClient.snapshot.create({
          repository: REPO_NAME,
          snapshot: SNAPSHOT_NAME,
          wait_for_completion: true,
          indices: 'logs.otel*,.streams*,.significant_events*',
          include_global_state: true,
        });

        expect(snapshotResponse.snapshot?.state).to.eql('SUCCESS');
        expect(snapshotResponse.snapshot?.snapshot).to.eql(SNAPSHOT_NAME);

        // Disable streams to delete everything
        await disableStreams(apiClient);

        // disableStreams does not remove the global significant-events data stream; delete it so
        // the restore below can recreate it without an "index already exists" conflict.
        await esClient.indices.deleteDataStream(
          { name: '.significant_events*' },
          { ignore: [404] }
        );

        // Step 8: Restore from snapshot
        const restoreResponse = await esClient.snapshot.restore({
          repository: REPO_NAME,
          snapshot: SNAPSHOT_NAME,
          wait_for_completion: true,
          indices: 'logs.otel*,.streams*,.significant_events*',
          include_global_state: true,
        });

        expect(restoreResponse.snapshot?.shards?.total).to.be.greaterThan(0);
        expect(restoreResponse.snapshot?.shards?.failed).to.eql(0);

        // Step 9: Verify the API and configuration still work after restore
        const restoredLogsDefinition = await getStream(apiClient, 'logs.otel');
        expect(restoredLogsDefinition).to.have.property('stream');

        const restoredWebAppDefinition = await getStream(apiClient, 'logs.otel.web-app');
        expect(restoredWebAppDefinition).to.have.property('stream');

        // Verify routing is still configured on parent
        const restoredLogsStream = restoredLogsDefinition.stream as Streams.WiredStream.Definition;
        expect(restoredLogsStream.ingest.wired.routing).to.have.length(1);
        expect(restoredLogsStream.ingest.wired.routing[0].destination).to.eql('logs.otel.web-app');

        // Verify processing steps are still configured on child
        const restoredWebAppStream =
          restoredWebAppDefinition.stream as Streams.WiredStream.Definition;
        expect(restoredWebAppStream.ingest.processing.steps).to.have.length(2);
        expect(
          (restoredWebAppStream.ingest.processing.steps[0] as StreamlangProcessorDefinition).action
        ).to.eql('grok');
        expect(
          (restoredWebAppStream.ingest.processing.steps[1] as StreamlangProcessorDefinition).action
        ).to.eql('dissect');

        // Verify field mappings are still configured
        expect(restoredWebAppStream.ingest.wired.fields['attributes.request_method']).to.eql({
          type: 'keyword',
        });
        expect(restoredWebAppStream.ingest.wired.fields['attributes.response_time_ms']).to.eql({
          type: 'long',
        });

        // Verify significant event query survived the restore
        const restoredQueries = await getQueries(apiClient, 'logs.otel.web-app');
        expect(restoredQueries.queries).to.have.length(1);
        expect(restoredQueries.queries[0].title).to.eql('Slow Requests');
        expect(restoredQueries.queries[0].esql.query).to.eql(
          'FROM logs.otel.web-app,logs.otel.web-app.* METADATA _id, _source | WHERE KQL("attributes.response_time_ms > 100")'
        );

        // Verify the underlying alerting rule also survived and is still enabled
        const rulesAfterRestore = await alertingApi.searchRules(
          roleAuthc,
          'alert.attributes.name:"Slow Requests"'
        );
        expect(rulesAfterRestore.body.data).to.have.length(1);
        expect(rulesAfterRestore.body.data[0].name).to.eql('Slow Requests');
        expect(rulesAfterRestore.body.data[0].enabled).to.be(true);

        // Step 10: Verify processing still works after restore by indexing new documents
        const newParentDoc = {
          '@timestamp': '2024-01-01T00:00:20.000Z',
          message: JSON.stringify({
            '@timestamp': '2024-01-01T00:00:20.000Z',
            'log.level': 'info',
            'service.name': 'api-server',
            message: 'POST /metrics',
          }),
        };

        const newChildDoc = {
          '@timestamp': '2024-01-01T00:00:30.000Z',
          message: JSON.stringify({
            '@timestamp': '2024-01-01T00:00:30.000Z',
            'log.level': 'warn',
            'service.name': 'web-app',
            response_time_ms: 350,
            message: 'POST /api/v2/orders',
          }),
        };

        // Index new documents after restore and verify processing is applied
        await indexAndAssertTargetStream(esClient, 'logs.otel', newParentDoc);
        const newChildResult = await indexAndAssertTargetStream(
          esClient,
          'logs.otel.web-app',
          newChildDoc
        );

        // Verify processing steps (grok and dissect) were applied to post-restore document
        expect(newChildResult._source).to.eql({
          '@timestamp': '2024-01-01T00:00:30.000Z',
          body: { text: 'POST /api/v2/orders' },
          severity_text: 'warn',
          resource: {
            attributes: {
              'service.name': 'web-app',
            },
          },
          attributes: {
            request_method: 'POST',
            request_path: '/api/v2/orders',
            api_version: 'v2',
            endpoint: 'orders',
            response_time_ms: 350,
          },
          stream: { name: 'logs.otel.web-app' },
        });

        // Step 11: Verify we can query the data and processing was applied to both pre and post-snapshot docs
        const searchResponse = await esClient.search({
          index: 'logs.otel.web-app',
          query: {
            match_all: {},
          },
          sort: [{ '@timestamp': { order: 'asc' } }],
        });

        expect(searchResponse.hits.total).to.have.property('value', 2);

        const firstHit = searchResponse.hits.hits[0] as any;
        const secondHit = searchResponse.hits.hits[1] as any;

        // First document (pre-snapshot) should have processing applied
        expect(firstHit._source?.body?.text).to.eql('GET /api/v1/users');
        expect(firstHit._source?.attributes?.request_method).to.eql('GET');
        expect(firstHit._source?.attributes?.api_version).to.eql('v1');
        expect(firstHit._source?.attributes?.endpoint).to.eql('users');

        // Second document (post-restore) should also have processing applied
        expect(secondHit._source?.body?.text).to.eql('POST /api/v2/orders');
        expect(secondHit._source?.attributes?.request_method).to.eql('POST');
        expect(secondHit._source?.attributes?.api_version).to.eql('v2');
        expect(secondHit._source?.attributes?.endpoint).to.eql('orders');

        // Step 12: Verify we can update the stream definition after restore
        const updatedStreamBody: Streams.WiredStream.UpsertRequest = {
          ...emptyAssets,
          stream: {
            type: 'wired',
            description: 'Updated description after restore',
            ingest: {
              lifecycle: { inherit: {} },
              settings: {},
              processing: {
                steps: [
                  {
                    action: 'grok',
                    from: 'body.text',
                    patterns: [
                      '%{WORD:attributes.request_method} %{URIPATH:attributes.request_path}',
                    ],
                    where: { always: {} },
                  },
                  {
                    action: 'dissect',
                    from: 'attributes.request_path',
                    pattern: '/api/%{attributes.api_version}/%{attributes.endpoint}',
                    where: {
                      field: 'attributes.request_path',
                      startsWith: '/api/',
                    },
                  },
                ],
              },
              wired: {
                fields: {
                  'attributes.request_method': {
                    type: 'keyword',
                  },
                  'attributes.request_path': {
                    type: 'keyword',
                  },
                  'attributes.api_version': {
                    type: 'keyword',
                  },
                  'attributes.endpoint': {
                    type: 'keyword',
                  },
                  'attributes.response_time_ms': {
                    type: 'long',
                  },
                  // Add a new field mapping after restore
                  'attributes.status_code': {
                    type: 'long',
                  },
                },
                routing: [],
              },
              failure_store: { inherit: {} },
            },
          },
        };

        const updateResponse = await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: { name: 'logs.otel.web-app' },
            body: updatedStreamBody,
          },
        });

        expect(updateResponse.status).to.eql(200);
        expect(updateResponse.body.acknowledged).to.eql(true);

        // Verify the update was applied
        const updatedDefinition = await getStream(apiClient, 'logs.otel.web-app');
        expect(updatedDefinition.stream.description).to.eql('Updated description after restore');
        const updatedStream = updatedDefinition.stream as Streams.WiredStream.Definition;
        expect(updatedStream.ingest.processing.steps).to.have.length(2);
        expect(updatedStream.ingest.wired.fields['attributes.status_code']).to.eql({
          type: 'long',
        });

        // Step 13: Test that we can index with the new field definition
        const docWithNewField = {
          '@timestamp': '2024-01-01T00:00:40.000Z',
          message: JSON.stringify({
            '@timestamp': '2024-01-01T00:00:40.000Z',
            'service.name': 'web-app',
            response_time_ms: 125,
            status_code: 200,
            message: 'DELETE /api/v1/sessions',
          }),
        };

        const processedResult = await indexAndAssertTargetStream(
          esClient,
          'logs.otel.web-app',
          docWithNewField
        );

        const processedSource = processedResult._source as any;

        // Verify processing still works and new field is present
        expect(processedSource?.attributes?.request_method).to.eql('DELETE');
        expect(processedSource?.attributes?.api_version).to.eql('v1');
        expect(processedSource?.attributes?.endpoint).to.eql('sessions');
        expect(processedSource?.attributes?.status_code).to.eql(200);
      });
    });
  });
}
