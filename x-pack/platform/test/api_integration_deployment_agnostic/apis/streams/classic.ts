/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { Streams, emptyAssets } from '@kbn/streams-schema';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { StreamsSupertestRepositoryClient } from './helpers/repository_client';
import { createStreamsRepositoryAdminClient } from './helpers/repository_client';
import {
  deleteStream,
  fetchDocument,
  indexDocument,
  putStream,
  restoreDataStream,
} from './helpers/requests';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const esClient = getService('es');
  const config = getService('config');
  const isServerless = !!config.get('serverless');

  const TEST_STREAM_NAME = 'logs-test-default';

  let apiClient: StreamsSupertestRepositoryClient;

  describe('Classic streams', () => {
    before(async () => {
      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
    });

    after(async () => {
      await esClient.indices.deleteDataStream({ name: 'logs-invalid_pipeline-default' });
      await esClient.indices
        .deleteDataStream({ name: 'logs-test_no_pipeline-default' })
        .catch(() => {});
      await esClient.indices
        .deleteDataStream({ name: 'logs-test_delete_no_pipeline-default' })
        .catch(() => {});
    });

    describe('Classic streams processing', () => {
      it('non-wired data streams', async () => {
        const doc = {
          message: '2023-01-01T00:00:10.000Z error test',
        };
        const response = await indexDocument(esClient, TEST_STREAM_NAME, doc);
        expect(response.result).to.eql('created');

        const {
          body: { streams },
          status,
        } = await apiClient.fetch('GET /api/streams 2023-10-31');

        expect(status).to.eql(200);

        const classicStream = streams.find((stream) => stream.name === TEST_STREAM_NAME);

        expect(classicStream).not.to.be(undefined);
        expect(classicStream).to.eql({
          type: 'classic',
          name: TEST_STREAM_NAME,
          description: '',
          updated_at: classicStream!.updated_at,
          ingest: {
            lifecycle: { inherit: {} },
            settings: {},
            processing: {
              steps: [],
              updated_at: (classicStream as Streams.ClassicStream.Definition).ingest.processing
                .updated_at,
            },
            classic: {},
            failure_store: { inherit: {} },
          },
        } satisfies Streams.ClassicStream.Definition);
      });

      it('Allows setting processing on classic streams', async () => {
        const putResponse = await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: TEST_STREAM_NAME,
            },
            body: {
              ...emptyAssets,
              stream: {
                type: 'classic',
                description: '',
                query_streams: [],
                ingest: {
                  lifecycle: { inherit: {} },
                  settings: {},
                  processing: {
                    steps: [
                      {
                        action: 'grok',
                        where: { always: {} },
                        from: 'nested.message',
                        patterns: [
                          '%{TIMESTAMP_ISO8601:inner_timestamp} %{LOGLEVEL:log.level} %{GREEDYDATA:message2}',
                        ],
                      },
                    ],
                  },
                  classic: {},
                  failure_store: { inherit: {} },
                },
              },
            },
          },
        });

        expect(putResponse.status).to.eql(200);

        expect(putResponse.body).to.have.property('acknowledged', true);

        const getResponse = await apiClient.fetch('GET /api/streams/{name} 2023-10-31', {
          params: { path: { name: TEST_STREAM_NAME } },
        });

        expect(getResponse.status).to.eql(200);

        const body = getResponse.body;
        Streams.ClassicStream.GetResponse.asserts(body);

        const {
          dashboards,
          stream,
          effective_lifecycle: effectiveLifecycle,
          elasticsearch_assets: elasticsearchAssets,
        } = body;

        expect(dashboards).to.eql([]);

        expect(stream).to.eql({
          type: 'classic',
          name: TEST_STREAM_NAME,
          description: '',
          updated_at: stream.updated_at,
          query_streams: [],
          ingest: {
            lifecycle: { inherit: {} },
            settings: {},
            processing: {
              steps: [
                {
                  action: 'grok',
                  from: 'nested.message',
                  patterns: [
                    '%{TIMESTAMP_ISO8601:inner_timestamp} %{LOGLEVEL:log.level} %{GREEDYDATA:message2}',
                  ],
                  where: { always: {} },
                },
              ],
              updated_at: stream.ingest.processing.updated_at,
            },
            classic: {},
            failure_store: { inherit: {} },
          },
        } satisfies Streams.ClassicStream.Definition);

        expect(effectiveLifecycle).to.eql(isServerless ? { dsl: {} } : { ilm: { policy: 'logs' } });

        expect(elasticsearchAssets).to.eql({
          ingestPipeline: 'logs@default-pipeline',
          componentTemplates: ['logs@mappings', 'logs@settings', 'logs@custom', 'ecs@mappings'],
          indexTemplate: 'logs',
          dataStream: 'logs-test-default',
        });
      });

      it('Executes processing on classic streams with dotted field names', async () => {
        const doc = {
          '@timestamp': '2024-01-01T00:00:10.000Z',
          'nested.message': '2023-01-01T00:00:10.000Z error test',
        };
        const response = await indexDocument(esClient, TEST_STREAM_NAME, doc);
        expect(response.result).to.eql('created');

        const result = await fetchDocument(esClient, TEST_STREAM_NAME, response._id);
        expect(result._source).to.eql({
          '@timestamp': '2024-01-01T00:00:10.000Z',
          nested: { message: '2023-01-01T00:00:10.000Z error test' },
          inner_timestamp: '2023-01-01T00:00:10.000Z',
          message2: 'test',
          log: {
            level: 'error',
          },
        });
      });

      it('Executes processing on classic streams with subobjects', async () => {
        const doc = {
          '@timestamp': '2024-01-01T00:00:10.000Z',
          nested: { message: '2023-01-01T00:00:10.000Z error test' },
        };
        const response = await indexDocument(esClient, TEST_STREAM_NAME, doc);
        expect(response.result).to.eql('created');

        const result = await fetchDocument(esClient, TEST_STREAM_NAME, response._id);
        expect(result._source).to.eql({
          '@timestamp': '2024-01-01T00:00:10.000Z',
          nested: { message: '2023-01-01T00:00:10.000Z error test' },
          inner_timestamp: '2023-01-01T00:00:10.000Z',
          message2: 'test',
          log: {
            level: 'error',
          },
        });
      });

      it('Allows removing processing on classic streams', async () => {
        const response = await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: { name: TEST_STREAM_NAME },
            body: {
              ...emptyAssets,
              stream: {
                type: 'classic',
                description: '',
                query_streams: [],
                ingest: {
                  lifecycle: { inherit: {} },
                  processing: { steps: [] },
                  settings: {},
                  classic: {},
                  failure_store: { inherit: {} },
                },
              },
            },
          },
        });

        expect(response.status).to.eql(200);

        expect(response.body).to.have.property('acknowledged', true);
      });

      it('Allows removing processing even when write index has no default_pipeline configured', async () => {
        const testStreamName = 'logs-test_no_pipeline-default';

        // Ingest a document first to create the write index
        await indexDocument(esClient, testStreamName, {
          '@timestamp': new Date().toISOString(),
          message: '2024-01-01T00:00:00.000Z INFO test message',
        });

        // Create a stream with processing steps
        await putStream(apiClient, testStreamName, {
          ...emptyAssets,
          stream: {
            type: 'classic',
            description: '',
            query_streams: [],
            ingest: {
              lifecycle: { inherit: {} },
              processing: {
                steps: [
                  {
                    action: 'grok',
                    where: { always: {} },
                    from: 'message',
                    patterns: ['%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:log.level}'],
                  },
                ],
              },
              settings: {},
              classic: {},
              failure_store: { inherit: {} },
            },
          },
        });

        // Manually remove the default_pipeline setting from the write index
        // This simulates a scenario where the index setting was removed but
        // the stream definition still has processing steps
        const dataStreamInfo = await esClient.indices.getDataStream({
          name: testStreamName,
        });
        const writeIndex = dataStreamInfo.data_streams[0].indices.at(-1)!.index_name;
        await esClient.indices.putSettings({
          index: writeIndex,
          body: {
            'index.default_pipeline': null,
          },
        });

        // Now remove processing - this should not fail even though there's no pipeline to delete from
        const response = await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: { name: testStreamName },
            body: {
              ...emptyAssets,
              stream: {
                type: 'classic',
                description: '',
                query_streams: [],
                ingest: {
                  lifecycle: { inherit: {} },
                  processing: { steps: [] },
                  settings: {},
                  classic: {},
                  failure_store: { inherit: {} },
                },
              },
            },
          },
        });

        expect(response.status).to.eql(200);
        expect(response.body).to.have.property('acknowledged', true);
      });

      it('Executes processing on classic streams after removing processing', async () => {
        const doc = {
          // default logs pipeline fills in timestamp with current date if not set
          message: '2023-01-01T00:00:10.000Z info mylogger this is the message',
        };
        const response = await indexDocument(esClient, TEST_STREAM_NAME, doc);
        expect(response.result).to.eql('created');

        const result = await fetchDocument(esClient, TEST_STREAM_NAME, response._id);
        expect(result._source).to.eql({
          // accept any date
          '@timestamp': (result._source as { [key: string]: unknown })['@timestamp'],
          message: '2023-01-01T00:00:10.000Z info mylogger this is the message',
        });
      });

      it('reports when it fails to update a stream', async () => {
        const doc = {
          // default logs pipeline fills in timestamp with current date if not set
          message: '2023-01-01T00:00:10.000Z info mylogger this is the message',
        };
        const response = await indexDocument(esClient, 'logs-invalid_pipeline-default', doc);
        expect(response.result).to.eql('created');
        const body: Streams.ClassicStream.UpsertRequest = {
          ...emptyAssets,
          stream: {
            type: 'classic',
            description: 'Should cause a failure due to invalid ingest pipeline',
            query_streams: [],
            ingest: {
              lifecycle: { inherit: {} },
              settings: {},
              processing: {
                steps: [
                  {
                    action: 'manual_ingest_pipeline',
                    processors: [
                      {
                        set: {
                          field: 'fails',
                          value: 'whatever',
                          fail: 'because this property is not valid',
                        },
                      },
                    ],
                  },
                ],
              },
              classic: {
                field_overrides: {},
              },
              failure_store: { inherit: {} },
            },
          },
        };

        const streamsResponse = await putStream(
          apiClient,
          'logs-invalid_pipeline-default',
          body,
          400
        );
        expect((streamsResponse as any).message).to.contain(
          'Desired stream state is invalid: parse_exception'
        );
        expect((streamsResponse as any).message).to.contain(
          "processor [set] doesn't support one or more provided configuration parameters [fail]"
        );
      });

      it('fails to store invalid ingest pipeline script', async () => {
        const body: Streams.ClassicStream.UpsertRequest = {
          ...emptyAssets,
          stream: {
            type: 'classic',
            description: '',
            query_streams: [],
            ingest: {
              lifecycle: { inherit: {} },
              settings: {},
              processing: {
                steps: [
                  {
                    action: 'manual_ingest_pipeline',
                    processors: [
                      {
                        script: {
                          source: 'ctx.age = ', // invalid painless script
                        },
                      },
                    ],
                  },
                ],
              },
              classic: {
                field_overrides: {},
              },
              failure_store: { inherit: {} },
            },
          },
        };
        const streamsResponse = await putStream(apiClient, TEST_STREAM_NAME, body, 400);
        expect((streamsResponse as any).message).to.contain(
          'Desired stream state is invalid: script_exception'
        );
        expect((streamsResponse as any).message).to.contain(
          'illegal_argument_exception: unexpected end of script'
        );
      });
    });

    describe('Classic streams with field overrides', () => {
      it('Allows setting field overrides on classic streams', async () => {
        const putResponse = await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: { name: TEST_STREAM_NAME },
            body: {
              ...emptyAssets,
              stream: {
                type: 'classic',
                description: '',
                ingest: {
                  lifecycle: { inherit: {} },
                  processing: { steps: [] },
                  settings: {},
                  classic: {
                    field_overrides: {
                      'foo.bar': {
                        type: 'keyword',
                      },
                    },
                  },
                  failure_store: { inherit: {} },
                },
              },
            },
          },
        });

        expect(putResponse.status).to.eql(200);
      });

      it('Does a lazy rollover on field change', async () => {
        const putResponse = await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: { name: TEST_STREAM_NAME },
            body: {
              ...emptyAssets,
              stream: {
                type: 'classic',
                description: '',
                ingest: {
                  lifecycle: { inherit: {} },
                  processing: { steps: [] },
                  settings: {},
                  classic: {
                    field_overrides: {
                      'foo.bar': {
                        type: 'keyword',
                      },
                      'foo.baz': {
                        type: 'keyword',
                      },
                    },
                  },
                  failure_store: { inherit: {} },
                },
              },
            },
          },
        });

        expect(putResponse.status).to.eql(200);

        // Verify the stream did not roll over
        const getResponse = await esClient.indices.getDataStream({
          name: TEST_STREAM_NAME,
        });
        expect(getResponse.data_streams[0].indices).to.have.length(1);

        // Send a document to trigger the rollover
        const doc = {
          '@timestamp': '2024-01-01T00:00:10.000Z',
          message: '2023-01-01T00:00:10.000Z error test',
          'foo.bar': 'bar_value',
          'foo.baz': 'baz_value',
        };
        const response = await indexDocument(esClient, TEST_STREAM_NAME, doc);
        expect(response.result).to.eql('created');

        // Verify the rollover happened
        const getResponseAfterIndexing = await esClient.indices.getDataStream({
          name: TEST_STREAM_NAME,
        });
        expect(getResponseAfterIndexing.data_streams[0].indices).to.have.length(2);

        // Verify the field override is set via field caps
        const fieldCapsResponse = await esClient.fieldCaps({
          index: TEST_STREAM_NAME,
          fields: ['foo.baz', 'foo.bar'],
        });
        expect(fieldCapsResponse.fields).to.have.property('foo.bar');
        expect(fieldCapsResponse.fields['foo.bar']).to.have.property('keyword');
        expect(fieldCapsResponse.fields).to.have.property('foo.baz');
        expect(fieldCapsResponse.fields['foo.baz']).to.have.property('keyword');
      });
    });

    describe('Deleting classic streams', () => {
      it('Allows deleting classic streams', async () => {
        const deleteStreamResponse = await apiClient.fetch(
          'DELETE /api/streams/{name} 2023-10-31',
          {
            params: {
              path: {
                name: TEST_STREAM_NAME,
              },
            },
          }
        );

        expect(deleteStreamResponse.status).to.eql(200);

        const getStreamsResponse = await apiClient.fetch('GET /api/streams 2023-10-31');

        expect(getStreamsResponse.status).to.eql(200);

        const classicStream = getStreamsResponse.body.streams.find(
          (stream) => stream.name === TEST_STREAM_NAME
        );
        expect(classicStream).to.eql(undefined);
      });
    });

    describe('Classic stream name validation', () => {
      const validClassicStreamBody: Streams.ClassicStream.UpsertRequest = {
        ...emptyAssets,
        stream: {
          type: 'classic',
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            classic: {},
            failure_store: { inherit: {} },
          },
        },
      };

      it('fails to create a classic stream with uppercase characters in the name', async () => {
        const response = await putStream(
          apiClient,
          'logs-UpperCase-default',
          validClassicStreamBody,
          400
        );
        expect((response as any).message).to.eql(
          'Desired stream state is invalid: Stream name cannot contain uppercase characters.'
        );
      });

      it('fails to create a classic stream with spaces in the name', async () => {
        const response = await putStream(
          apiClient,
          'logs-with space-default',
          validClassicStreamBody,
          400
        );
        expect((response as any).message).to.eql(
          'Desired stream state is invalid: Stream name cannot contain spaces.'
        );
      });

      it('fails to create a classic stream with asterisk in the name', async () => {
        const response = await putStream(
          apiClient,
          'logs-with*asterisk-default',
          validClassicStreamBody,
          400
        );
        expect((response as any).message).to.eql(
          'Desired stream state is invalid: Stream name cannot contain "*".'
        );
      });

      it('fails to create a classic stream with angle brackets in the name', async () => {
        const response = await putStream(
          apiClient,
          'logs-with<brackets>-default',
          validClassicStreamBody,
          400
        );
        expect((response as any).message).to.eql(
          'Desired stream state is invalid: Stream name cannot contain "<", ">".'
        );
      });

      it('fails to create a classic stream with question mark in the name', async () => {
        const response = await putStream(
          apiClient,
          'logs-with?question-default',
          validClassicStreamBody,
          400
        );
        expect((response as any).message).to.eql(
          'Desired stream state is invalid: Stream name cannot contain "?".'
        );
      });

      it('fails to create a classic stream with pipe in the name', async () => {
        const response = await putStream(
          apiClient,
          'logs-with|pipe-default',
          validClassicStreamBody,
          400
        );
        expect((response as any).message).to.eql(
          'Desired stream state is invalid: Stream name cannot contain "|".'
        );
      });
    });

    describe('Classic streams sharing template/pipeline', () => {
      const TEMPLATE_NAME = 'my-shared-template';
      const FIRST_STREAM_NAME = 'mytest-first';
      const SECOND_STREAM_NAME = 'mytest-second';

      before(async () => {
        await esClient.indices.putIndexTemplate({
          name: TEMPLATE_NAME,
          index_patterns: ['mytest*'],
          priority: 1000,
          template: {},
          data_stream: {
            allow_custom_routing: false,
            hidden: false,
          },
        });
      });

      after(async () => {
        await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: FIRST_STREAM_NAME,
            },
          },
        });

        await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: SECOND_STREAM_NAME,
            },
          },
        });

        await esClient.ingest.deletePipeline({
          id: `${TEMPLATE_NAME}-pipeline`,
        });

        await esClient.indices.deleteIndexTemplate({
          name: TEMPLATE_NAME,
        });
      });

      it('creates an ingest pipeline and updates the template when the first stream is created', async () => {
        await esClient.indices.createDataStream({
          name: FIRST_STREAM_NAME,
        });

        await putStream(apiClient, FIRST_STREAM_NAME, {
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
                    patterns: [
                      '%{TIMESTAMP_ISO8601:inner_timestamp} %{LOGLEVEL:log.level} %{GREEDYDATA:message2}',
                    ],
                  },
                ],
              },
              classic: {},
              failure_store: { inherit: {} },
            },
          },
        });

        const templateResponse = await esClient.indices.getIndexTemplate({
          name: TEMPLATE_NAME,
        });
        const template = templateResponse.index_templates[0];
        expect(template.index_template.template?.settings?.index?.default_pipeline).to.equal(
          `${TEMPLATE_NAME}-pipeline`
        );

        const pipelineResponse = await esClient.ingest.getPipeline({
          id: `${TEMPLATE_NAME}-pipeline`,
        });
        const pipeline = pipelineResponse[`${TEMPLATE_NAME}-pipeline`];
        expect(pipeline._meta?.managed_by).to.eql('streams');
        expect(pipeline?.processors?.[0]?.pipeline?.name).to.eql('mytest-first@stream.processing');
      });

      it('Executes processing using the newly created ingest pipeline', async () => {
        const doc = {
          '@timestamp': '2024-01-01T00:00:10.000Z',
          message: '2023-01-01T00:00:10.000Z error test',
        };
        const response = await indexDocument(esClient, FIRST_STREAM_NAME, doc);
        expect(response.result).to.eql('created');

        const result = await fetchDocument(esClient, FIRST_STREAM_NAME, response._id);
        expect(result._source).to.eql({
          '@timestamp': '2024-01-01T00:00:10.000Z',
          message: '2023-01-01T00:00:10.000Z error test',
          inner_timestamp: '2023-01-01T00:00:10.000Z',
          message2: 'test',
          'log.level': 'error',
        });
      });

      it('updates the ingest pipeline when the second stream is created', async () => {
        await esClient.indices.createDataStream({
          name: SECOND_STREAM_NAME,
        });

        await putStream(apiClient, SECOND_STREAM_NAME, {
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
                    patterns: [
                      '%{TIMESTAMP_ISO8601:inner_timestamp} %{LOGLEVEL:log.level} %{GREEDYDATA:message2}',
                    ],
                  },
                ],
              },
              classic: {},
              failure_store: { inherit: {} },
            },
          },
        });

        const pipelineResponse = await esClient.ingest.getPipeline({
          id: `${TEMPLATE_NAME}-pipeline`,
        });
        const pipeline = pipelineResponse[`${TEMPLATE_NAME}-pipeline`];
        expect(pipeline.processors?.map((proc) => proc?.pipeline?.name)).to.eql([
          'mytest-first@stream.processing',
          'mytest-second@stream.processing',
        ]);
      });

      it('updates the ingest pipeline when the processing is removed from the first stream', async () => {
        await putStream(apiClient, FIRST_STREAM_NAME, {
          ...emptyAssets,
          stream: {
            type: 'classic',
            description: '',
            ingest: {
              lifecycle: { inherit: {} },
              processing: { steps: [] },
              settings: {},
              classic: {},
              failure_store: { inherit: {} },
            },
          },
        });

        const pipelineResponse = await esClient.ingest.getPipeline({
          id: `${TEMPLATE_NAME}-pipeline`,
        });
        const pipeline = pipelineResponse[`${TEMPLATE_NAME}-pipeline`];

        expect(pipeline?.processors?.[0]?.pipeline?.name).to.eql('mytest-second@stream.processing');
      });

      it('clears the pipeline when processing is removed from the second stream', async () => {
        await putStream(apiClient, SECOND_STREAM_NAME, {
          ...emptyAssets,
          stream: {
            type: 'classic',
            description: '',
            ingest: {
              lifecycle: { inherit: {} },
              processing: { steps: [] },
              settings: {},
              classic: {},
              failure_store: { inherit: {} },
            },
          },
        });

        const templateResponse = await esClient.indices.getIndexTemplate({
          name: TEMPLATE_NAME,
        });
        const template = templateResponse.index_templates[0];
        expect(template.index_template.template?.settings?.index?.default_pipeline).to.equal(
          `${TEMPLATE_NAME}-pipeline`
        );

        const pipelineResponse = await esClient.ingest.getPipeline({
          id: `${TEMPLATE_NAME}-pipeline`,
        });
        const pipeline = pipelineResponse[`${TEMPLATE_NAME}-pipeline`];
        expect(pipeline.processors).to.eql([]);
      });
    });

    describe('Elasticsearch ingest pipeline enrichment', () => {
      before(async () => {
        await esClient.indices.createDataStream({
          name: TEST_STREAM_NAME,
        });
        const body: Streams.ClassicStream.UpsertRequest = {
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
                    action: 'manual_ingest_pipeline',
                    processors: [
                      {
                        // apply custom processor
                        uppercase: {
                          field: 'abc',
                        },
                      },
                      {
                        // apply condition
                        lowercase: {
                          field: 'def',
                          if: "ctx.def == 'yes'",
                        },
                      },
                      {
                        fail: {
                          message: 'Failing',
                          on_failure: [
                            // execute on failure pipeline
                            {
                              set: {
                                field: 'fail_failed',
                                value: 'yes',
                              },
                            },
                          ],
                        },
                      },
                    ],
                    where: { always: {} },
                  },
                ],
              },
              classic: {
                field_overrides: {},
              },
              failure_store: { inherit: {} },
            },
          },
        };
        const response = await putStream(apiClient, TEST_STREAM_NAME, body);
        expect(response).to.have.property('acknowledged', true);
      });

      after(async () => {
        await deleteStream(apiClient, TEST_STREAM_NAME);
      });

      it('Transforms doc on index', async () => {
        const doc = {
          '@timestamp': '2024-01-01T00:00:11.000Z',
          abc: 'should become uppercase',
          def: 'SHOULD NOT BECOME LOWERCASE',
        };
        const response = await indexDocument(esClient, TEST_STREAM_NAME, doc);
        expect(response.result).to.eql('created');

        const result = await fetchDocument(esClient, TEST_STREAM_NAME, response._id);
        expect(result._source).to.eql({
          '@timestamp': '2024-01-01T00:00:11.000Z',
          abc: 'SHOULD BECOME UPPERCASE',
          def: 'SHOULD NOT BECOME LOWERCASE',
          fail_failed: 'yes',
        });
      });

      it('fails to store non-existing processor', async () => {
        const body: Streams.ClassicStream.UpsertRequest = {
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
                    action: 'manual_ingest_pipeline',
                    processors: [
                      {
                        // apply custom processor
                        non_existing_processor: {
                          field: 'abc',
                        },
                      } as any,
                    ],
                    where: { always: {} },
                  },
                ],
              },
              classic: {
                field_overrides: {},
              },
              failure_store: { inherit: {} },
            },
          },
        };
        await putStream(apiClient, TEST_STREAM_NAME, body, 400);
      });
    });

    describe('Orphaned classic stream', () => {
      const ORPHANED_STREAM_NAME = 'logs-orphaned-default';

      before(async () => {
        const doc = {
          message: '2023-01-01T00:00:10.000Z error test',
        };
        const response = await indexDocument(esClient, ORPHANED_STREAM_NAME, doc);
        expect(response.result).to.eql('created');
        // PUT the stream to make sure it's a classic stream
        await apiClient.fetch('PUT /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: ORPHANED_STREAM_NAME,
            },
            body: {
              ...emptyAssets,
              stream: {
                type: 'classic',
                description: '',
                ingest: {
                  lifecycle: { inherit: {} },
                  processing: { steps: [] },
                  settings: {},
                  classic: {},
                  failure_store: { inherit: {} },
                },
              },
            },
          },
        });
        // delete the underlying data stream
        await esClient.indices.deleteDataStream({
          name: ORPHANED_STREAM_NAME,
        });
      });

      it('should still be able to fetch the stream', async () => {
        const getResponse = await apiClient.fetch('GET /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: ORPHANED_STREAM_NAME,
            },
          },
        });
        expect(getResponse.status).to.eql(200);
      });

      it('should still be able to fetch the dashboards for the stream', async () => {
        const getResponse = await apiClient.fetch(
          'GET /api/streams/{streamName}/attachments 2023-10-31',
          {
            params: {
              path: {
                streamName: ORPHANED_STREAM_NAME,
              },
              query: {
                attachmentTypes: ['dashboard'],
              },
            },
          }
        );
        expect(getResponse.status).to.eql(200);
      });

      it('should still be possible to call _details', async () => {
        const getResponse = await apiClient.fetch('GET /internal/streams/{name}/_details', {
          params: {
            path: {
              name: ORPHANED_STREAM_NAME,
            },
            query: {
              start: '2023-01-01T00:00:00.000Z',
              end: '2023-01-01T00:00:20.000Z',
            },
          },
        });
        expect(getResponse.status).to.eql(200);
      });

      it('same APIs should return 404 for actually non-existing streams', async () => {
        const getStreamResponse = await apiClient.fetch('GET /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: 'non-existing-stream',
            },
          },
        });
        expect(getStreamResponse.status).to.eql(404);
        const getDashboardsResponse = await apiClient.fetch(
          'GET /api/streams/{streamName}/attachments 2023-10-31',
          {
            params: {
              path: {
                streamName: 'non-existing-stream',
              },
              query: {
                attachmentTypes: ['dashboard'],
              },
            },
          }
        );
        expect(getDashboardsResponse.status).to.eql(404);
        const getDetailsResponse = await apiClient.fetch('GET /internal/streams/{name}/_details', {
          params: {
            path: {
              name: 'non-existing-stream',
            },
            query: {
              start: '2023-01-01T00:00:00.000Z',
              end: '2023-01-01T00:00:20.000Z',
            },
          },
        });
        expect(getDetailsResponse.status).to.eql(404);
      });

      it('should still return the stream on public listing API', async () => {
        const getResponse = await apiClient.fetch('GET /api/streams 2023-10-31');
        expect(getResponse.status).to.eql(200);
        const classicStream = getResponse.body.streams.find(
          (stream) => stream.name === ORPHANED_STREAM_NAME
        );
        expect(Streams.ClassicStream.Definition.is(classicStream!)).to.be(true);
      });

      it('should still return the stream on internal listing API', async () => {
        const getResponse = await apiClient.fetch('GET /internal/streams');
        expect(getResponse.status).to.eql(200);
        const classicStream = getResponse.body.streams.find(
          (stream) => stream.stream.name === ORPHANED_STREAM_NAME
        );
        expect(Streams.ClassicStream.Definition.is(classicStream!.stream)).to.be(true);
      });

      it('should allow restoring the backing data stream', async () => {
        // Restore the backing data stream
        const response = await restoreDataStream(apiClient, ORPHANED_STREAM_NAME);
        expect(response).to.have.property('acknowledged', true);

        // Verify the data stream was recreated
        const dsResponse = await esClient.indices.getDataStream({ name: ORPHANED_STREAM_NAME });
        expect(dsResponse.data_streams).to.have.length(1);
        expect(dsResponse.data_streams[0].name).to.be(ORPHANED_STREAM_NAME);

        // Verify data_stream_exists is now true
        const getResponse = await apiClient.fetch('GET /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: ORPHANED_STREAM_NAME,
            },
          },
        });
        expect(getResponse.status).to.eql(200);
        expect(getResponse.body).to.have.property('data_stream_exists', true);
      });

      it('should allow deleting', async () => {
        // First delete the data stream again to test orphaned delete
        await esClient.indices.deleteDataStream({
          name: ORPHANED_STREAM_NAME,
        });

        const response = await apiClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
          params: {
            path: {
              name: ORPHANED_STREAM_NAME,
            },
          },
        });
        expect(response.status).to.eql(200);
      });

      it('should allow deleting a stream with processing when write index has no default_pipeline', async () => {
        const testStreamName = 'logs-test_delete_no_pipeline-default';

        // Ingest a document first to create the write index
        await indexDocument(esClient, testStreamName, {
          '@timestamp': new Date().toISOString(),
          message: '2024-01-01T00:00:00.000Z',
        });

        // Create a stream with processing
        await putStream(apiClient, testStreamName, {
          ...emptyAssets,
          stream: {
            type: 'classic',
            description: '',
            ingest: {
              lifecycle: { inherit: {} },
              processing: {
                steps: [
                  {
                    action: 'grok',
                    where: { always: {} },
                    from: 'message',
                    patterns: ['%{TIMESTAMP_ISO8601:timestamp}'],
                  },
                ],
              },
              settings: {},
              classic: {},
              failure_store: { inherit: {} },
            },
          },
        });

        // Remove the default_pipeline setting from the write index
        const dataStreamInfo = await esClient.indices.getDataStream({
          name: testStreamName,
        });
        const writeIndex = dataStreamInfo.data_streams[0].indices.at(-1)!.index_name;
        await esClient.indices.putSettings({
          index: writeIndex,
          body: {
            'index.default_pipeline': null,
          },
        });

        // Delete the stream - this should not fail even though there's no pipeline to delete from
        const response = await deleteStream(apiClient, testStreamName);
        expect(response).to.have.property('acknowledged', true);
      });
    });
  });
}
