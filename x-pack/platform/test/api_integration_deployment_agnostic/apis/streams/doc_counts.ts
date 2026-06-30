/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { emptyAssets } from '@kbn/streams-schema';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { StreamsSupertestRepositoryClient } from './helpers/repository_client';
import {
  createStreamsRepositoryAdminClient,
  createStreamsRepositoryViewerClient,
} from './helpers/repository_client';
import { enableStreams, putStream, indexDocument } from './helpers/requests';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const MORE_THAN_1024_CHARS =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  let apiClient: StreamsSupertestRepositoryClient;
  let viewerApiClient: StreamsSupertestRepositoryClient;
  const esClient = getService('es');
  const TEST_CLASSIC_STREAM_NAME = 'logs-classic-stream';

  describe('Doc counts routes', () => {
    before(async () => {
      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
      viewerApiClient = await createStreamsRepositoryViewerClient(roleScopedSupertest);
      await enableStreams(apiClient);

      // Create a classic stream
      const doc = {
        message: '2023-01-01T00:00:10.000Z error test',
      };
      const response = await indexDocument(esClient, TEST_CLASSIC_STREAM_NAME, doc);
      expect(response.result).to.eql('created');

      // Create a wired stream
      // Get the root logs stream and update it with routing rules
      const rootStream = await apiClient.fetch('GET /api/streams/{name} 2023-10-31', {
        params: { path: { name: 'logs.otel' } },
      });

      const { updated_at: _processingUpdatedAt, ...processingWithoutMeta } =
        (rootStream.body as any)?.stream?.ingest?.processing ?? {};

      await putStream(apiClient, 'logs.otel', {
        ...emptyAssets,
        stream: {
          type: 'wired',
          description: '',
          ingest: {
            ...(rootStream.body as any).stream.ingest,
            processing: processingWithoutMeta,
            wired: {
              ...(rootStream.body as any).stream.ingest.wired,
              routing: [
                {
                  destination: 'logs.otel.test-stream-1',
                  where: { field: 'attributes.log.logger', eq: 'test-stream-1' },
                  status: 'enabled',
                },
                {
                  destination: 'logs.otel.test-stream-2',
                  where: { field: 'attributes.log.logger', eq: 'test-stream-2' },
                  status: 'enabled',
                },
              ],
            },
          },
        },
      });

      await putStream(apiClient, 'logs.otel.test-stream-1', {
        ...emptyAssets,
        stream: {
          type: 'wired',
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            wired: {
              fields: {
                severity_text: {
                  type: 'keyword',
                  ignore_above: 1024,
                },
              },
              routing: [],
            },
            failure_store: { disabled: {} },
          },
        },
      });

      await putStream(apiClient, 'logs.otel.test-stream-2', {
        ...emptyAssets,
        stream: {
          type: 'wired',
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            wired: {
              fields: {},
              routing: [],
            },
            failure_store: { disabled: {} },
          },
        },
      });

      // Index documents to parent 'logs.otel' stream and let routing handle it
      const now = Date.now();
      const timestamp = new Date(now).toISOString();

      await esClient.index({
        index: 'logs.otel',
        document: {
          '@timestamp': timestamp,
          message: JSON.stringify({
            '@timestamp': timestamp,
            'log.level': 'info',
            'log.logger': 'test-stream-1',
            message: 'test message 1',
          }),
        },
        refresh: 'wait_for',
      });

      await esClient.index({
        index: 'logs.otel',
        document: {
          '@timestamp': timestamp,
          message: JSON.stringify({
            '@timestamp': timestamp,
            'log.level': 'info',
            'log.logger': 'test-stream-1',
            message: 'test message 2',
          }),
        },
        refresh: 'wait_for',
      });

      await esClient.index({
        index: 'logs.otel',
        document: {
          '@timestamp': timestamp,
          message: JSON.stringify({
            '@timestamp': timestamp,
            'log.level': 'info',
            'log.logger': 'test-stream-2',
            message: 'test message 3',
          }),
        },
        refresh: 'wait_for',
      });

      // In serverless, indexing documents takes a while to be visible in the metering stats API
      // so we wait for 35 seconds to ensure the documents are indexed and visible in the metering stats API
      await sleep(35000);
    });

    after(async () => {
      // Clean up test streams
      try {
        await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
          params: { path: { name: TEST_CLASSIC_STREAM_NAME } },
        });
      } catch (e) {
        // Ignore errors if stream doesn't exist
      }
      try {
        await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
          params: { path: { name: 'logs.otel.test-stream-1' } },
        });
      } catch (e) {
        // Ignore errors if stream doesn't exist
      }
      try {
        await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
          params: { path: { name: 'logs.otel.test-stream-2' } },
        });
      } catch (e) {
        // Ignore errors if stream doesn't exist
      }
    });

    describe('GET /internal/streams/doc_counts/total', () => {
      it('returns document counts for all streams', async () => {
        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/total');

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');

        const classicStreamCount = response.body.find(
          (stat: any) => stat.stream === TEST_CLASSIC_STREAM_NAME
        );
        const stream1Count = response.body.find(
          (stat: any) => stat.stream === 'logs.otel.test-stream-1'
        );
        const stream2Count = response.body.find(
          (stat: any) => stat.stream === 'logs.otel.test-stream-2'
        );

        expect(classicStreamCount).to.not.be(undefined);
        expect(classicStreamCount?.count).to.eql(1);
        expect(stream1Count).to.not.be(undefined);
        expect(stream1Count?.count).to.eql(2);
        expect(stream2Count).to.not.be(undefined);
        expect(stream2Count?.count).to.eql(1);
      });

      it('returns document counts for a single stream when stream query is provided', async () => {
        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/total', {
          params: {
            query: {
              stream: 'logs.otel.test-stream-1',
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');
        expect(response.body.length).to.be.greaterThan(0);

        const entry = response.body.find((stat: any) => stat.stream === 'logs.otel.test-stream-1');

        expect(entry).to.not.be(undefined);
        expect(entry?.count).to.be.greaterThan(0);
      });
    });

    describe('GET /internal/streams/doc_counts/ingestion', () => {
      it('returns range-scoped document counts for all streams', async () => {
        const now = Date.now();
        const start = now - 3600000;
        const end = now + 60000;

        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/ingestion', {
          params: {
            query: {
              start,
              end,
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');

        const stream1Count = response.body.find(
          (stat) => stat.stream === 'logs.otel.test-stream-1'
        );
        const stream2Count = response.body.find(
          (stat) => stat.stream === 'logs.otel.test-stream-2'
        );

        expect(stream1Count).to.not.be(undefined);
        expect(stream1Count?.count).to.eql(2);
        expect(stream2Count).to.not.be(undefined);
        expect(stream2Count?.count).to.eql(1);
      });

      it('excludes documents outside the requested time range', async () => {
        // A range far in the past should match none of the just-indexed documents.
        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/ingestion', {
          params: {
            query: {
              start: 0,
              end: 1,
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');
        expect(response.body).to.have.length(0);
      });

      it('supports querying ingestion counts for a single stream', async () => {
        const now = Date.now();
        const start = now - 3600000;
        const end = now + 60000;

        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/ingestion', {
          params: {
            query: {
              start,
              end,
              stream: 'logs.otel.test-stream-1',
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');
        expect(response.body.length).to.be.greaterThan(0);

        const entry = response.body.find((stat) => stat.stream === 'logs.otel.test-stream-1');

        expect(entry).to.not.be(undefined);
        expect(entry?.count).to.eql(2);
      });

      describe('failure-store documents', () => {
        after(async () => {
          try {
            await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
              params: { path: { name: 'logs-ingestion-failing-stream' } },
            });
          } catch (e) {
            // Ignore errors if stream doesn't exist
          }
        });

        it('folds failure-store documents into the ingestion rate for privileged users', async function () {
          this.timeout(120000);

          await esClient.indices.createDataStream({
            name: 'logs-ingestion-failing-stream',
          });

          const putResponse = await putStream(apiClient, 'logs-ingestion-failing-stream', {
            ...emptyAssets,
            stream: {
              type: 'classic',
              description: '',
              ingest: {
                lifecycle: { inherit: {} },
                settings: {},
                processing: {
                  steps: [
                    {
                      action: 'grok',
                      where: { always: {} },
                      from: 'message',
                      ignore_failure: false,
                      patterns: ['non-matching-pattern'],
                    },
                  ],
                },
                classic: {},
                failure_store: { lifecycle: { enabled: {} } },
              },
            },
          });
          expect(putResponse).to.have.property('acknowledged', true);

          const now = Date.now();
          const start = now - 3600000;
          const end = now + 60000;
          const timestamp = new Date(now).toISOString();

          const doc = {
            '@timestamp': timestamp,
            message: 'failing document',
          };
          const indexResponse = await indexDocument(
            esClient,
            'logs-ingestion-failing-stream',
            doc,
            false
          );
          expect(indexResponse.result).to.eql('created');

          await sleep(35000);

          const privilegedResponse = await apiClient.fetch(
            'GET /internal/streams/doc_counts/ingestion',
            {
              params: {
                query: {
                  start,
                  end,
                  stream: 'logs-ingestion-failing-stream',
                },
              },
            }
          );
          expect(privilegedResponse.status).to.eql(200);
          const privilegedEntry = privilegedResponse.body.find(
            (stat) => stat.stream === 'logs-ingestion-failing-stream'
          );
          expect(privilegedEntry).to.not.be(undefined);
          expect(privilegedEntry?.count).to.eql(1);

          const viewerResponse = await viewerApiClient.fetch(
            'GET /internal/streams/doc_counts/ingestion',
            {
              params: {
                query: {
                  start,
                  end,
                  stream: 'logs-ingestion-failing-stream',
                },
              },
            }
          );
          expect(viewerResponse.status).to.eql(200);
          const viewerEntry = viewerResponse.body.find(
            (stat) => stat.stream === 'logs-ingestion-failing-stream'
          );
          expect(viewerEntry?.count ?? 0).to.eql(0);
        });
      });
    });

    describe('GET /internal/streams/doc_counts/degraded', () => {
      it('returns empty array when no degraded documents exist', async () => {
        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/degraded');

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');
        expect(response.body).to.have.length(0);
      });

      it('returns degraded document counts (documents with _ignored field)', async () => {
        const now = Date.now();
        const timestamp = new Date(now).toISOString();

        // Index a document that will have _ignored field (value exceeds ignore_above limit)
        await esClient.index({
          index: 'logs.otel',
          document: {
            '@timestamp': timestamp,
            message: JSON.stringify({
              '@timestamp': timestamp,
              // Use a too-long value for an ECS keyword field so it is added to _ignored
              'log.level': MORE_THAN_1024_CHARS,
              'log.logger': 'test-stream-1',
              message: 'degraded message',
            }),
          },
          refresh: 'wait_for',
        });

        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/degraded');

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');
        expect(response.body).to.have.length(1);
        expect(response.body[0].stream).to.eql('logs.otel.test-stream-1');
        expect(response.body[0].count).to.eql(1);
      });

      it('supports querying degraded counts for a single stream', async () => {
        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/degraded', {
          params: {
            query: {
              stream: 'logs.otel.test-stream-1',
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');
        expect(response.body.length).to.be.greaterThan(0);
        expect(response.body[0].stream).to.eql('logs.otel.test-stream-1');
        expect(response.body[0].count).to.eql(1);
      });
    });

    describe('GET /internal/streams/doc_counts/failed', () => {
      after(async () => {
        try {
          await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
            params: { path: { name: 'logs-failing-stream' } },
          });
        } catch (e) {
          // Ignore errors if stream doesn't exist
        }
      });

      it('returns empty array when no failed documents exist', async () => {
        const now = Date.now();
        const start = now - 3600000;
        const end = now + 60000;
        const response = await viewerApiClient.fetch('GET /internal/streams/doc_counts/failed', {
          params: {
            query: {
              start,
              end,
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body).to.be.an('array');
        expect(response.body).to.have.length(0);
      });

      it('returns failed document counts from failure store', async function () {
        // Increase timeout to account for 35s sleep waiting for metering cache
        this.timeout(120000);

        // Create a stream with a processor that always fails
        await esClient.indices.createDataStream({
          name: 'logs-failing-stream',
        });

        const putResponse = await putStream(apiClient, 'logs-failing-stream', {
          ...emptyAssets,
          stream: {
            type: 'classic',
            description: '',
            ingest: {
              lifecycle: { inherit: {} },
              settings: {},
              processing: {
                steps: [
                  {
                    action: 'grok',
                    where: { always: {} },
                    from: 'message',
                    ignore_failure: false,
                    patterns: ['non-matching-pattern'],
                  },
                ],
              },
              classic: {},
              failure_store: { lifecycle: { enabled: {} } },
            },
          },
        });
        expect(putResponse).to.have.property('acknowledged', true);

        const now = Date.now();
        const start = now - 3600000;
        const end = now + 60000;
        const timestamp = new Date(now).toISOString();

        // Index a document that will trigger the failing processor and be sent to the failure store
        const doc = {
          '@timestamp': timestamp,
          message: 'failing document',
        };
        // Use refresh: false to avoid timeout - doc goes to failure store which may take time in serverless
        const indexResponse = await indexDocument(esClient, 'logs-failing-stream', doc, false);
        expect(indexResponse.result).to.eql('created');

        // In serverless, wait for metering stats cache to refresh (30s cycle)
        await sleep(35000);

        const response = await apiClient.fetch('GET /internal/streams/doc_counts/failed', {
          params: {
            query: {
              start,
              end,
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body[0].stream).to.eql('logs-failing-stream');
        expect(response.body[0].count).to.eql(1);
      });

      it('supports querying failed counts for a single stream', async () => {
        const now = Date.now();
        const start = now - 3600000;
        const end = now + 60000;

        const response = await apiClient.fetch('GET /internal/streams/doc_counts/failed', {
          params: {
            query: {
              start,
              end,
              stream: 'logs-failing-stream',
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body[0].stream).to.eql('logs-failing-stream');
        expect(response.body[0].count).to.eql(1);
      });
    });
  });
}
