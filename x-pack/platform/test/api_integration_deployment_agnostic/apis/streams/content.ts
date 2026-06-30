/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  generateArchive,
  isContentPackStreamRequest,
  parseArchive,
} from '@kbn/streams-plugin/server/lib/content';
import { Readable } from 'stream';
import type { ContentPack, ContentPackStream } from '@kbn/content-packs-schema';
import { ROOT_STREAM_ID } from '@kbn/content-packs-schema';
import type { FieldDefinition, RoutingDefinition, Streams } from '@kbn/streams-schema';
import { emptyAssets } from '@kbn/streams-schema';
import {
  OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS,
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS,
} from '@kbn/management-settings-ids';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { StreamsSupertestRepositoryClient } from './helpers/repository_client';
import { createStreamsRepositoryAdminClient } from './helpers/repository_client';
import {
  bulkQueries,
  disableStreams,
  enableStreams,
  exportContent,
  getQueries,
  getStream,
  importContent,
  previewContent,
  putStream,
} from './helpers/requests';

const upsertRequest = ({
  fields = {},
  routing = [],
}: {
  fields?: FieldDefinition;
  routing?: RoutingDefinition[];
}): Streams.WiredStream.UpsertRequest => ({
  ...emptyAssets,
  stream: {
    type: 'wired',
    description: 'Test stream',
    ingest: {
      processing: { steps: [] },
      settings: {},
      wired: { fields, routing },
      lifecycle: { inherit: {} },
      failure_store: { inherit: {} },
    },
  },
});

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const kibanaServer = getService('kibanaServer');
  let apiClient: StreamsSupertestRepositoryClient;

  describe('Content packs', () => {
    before(async () => {
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS]: true,
        // Significant events are seeded via the queries API in some tests below to prove export
        // never carries them; that API is gated behind this feature flag.
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: true,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();

      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
      await enableStreams(apiClient);

      await putStream(apiClient, 'logs.otel.branch_a.child1.nested', upsertRequest({}));
      await putStream(
        apiClient,
        'logs.otel.branch_a.child1',
        upsertRequest({
          routing: [
            {
              destination: 'logs.otel.branch_a.child1.nested',
              where: { field: 'resource.attributes.hello', eq: 'yes' },
              status: 'enabled',
            },
          ],
        })
      );
      await putStream(apiClient, 'logs.otel.branch_a.child2', upsertRequest({}));
      await putStream(apiClient, 'logs.otel.branch_b.child1', upsertRequest({}));
      await putStream(apiClient, 'logs.otel.branch_b.child2', upsertRequest({}));
      await putStream(
        apiClient,
        'logs.otel.branch_a',
        upsertRequest({
          fields: {
            'resource.attributes.foo.bar': { type: 'keyword' },
          },
          routing: [
            {
              destination: 'logs.otel.branch_a.child1',
              where: { field: 'resource.attributes.foo', eq: 'bar' },
              status: 'enabled',
            },
            {
              destination: 'logs.otel.branch_a.child2',
              where: { field: 'resource.attributes.bar', eq: 'foo' },
              status: 'enabled',
            },
          ],
        })
      );
      await putStream(
        apiClient,
        'logs.otel.branch_b',
        upsertRequest({
          routing: [
            {
              destination: 'logs.otel.branch_b.child1',
              where: { field: 'resource.attributes.foo', eq: 'bar' },
              status: 'enabled',
            },
            {
              destination: 'logs.otel.branch_b.child2',
              where: { field: 'resource.attributes.bar', eq: 'foo' },
              status: 'enabled',
            },
          ],
        })
      );
    });

    after(async () => {
      await disableStreams(apiClient);
      await kibanaServer.uiSettings.update({
        [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: false,
      });
      await kibanaServer.uiSettings.waitForEventualCacheRefresh();
    });

    describe('Export', () => {
      it('exports all streams from logs.otel', async () => {
        const exportBody = {
          name: 'logs_content_pack',
          description: 'Content pack with all logs.otel streams',
          version: '1.0.0',
          include: { objects: { all: {} } },
        };

        const archiveBuffer = await exportContent(apiClient, 'logs.otel', exportBody);
        const contentPack = await parseArchive(Readable.from(archiveBuffer));

        expect(contentPack.name).to.eql('logs_content_pack');
        expect(contentPack.description).to.eql('Content pack with all logs.otel streams');
        expect(contentPack.version).to.eql('1.0.0');
        expect(contentPack.entries.length).to.be.greaterThan(0);

        const streamEntries = contentPack.entries.filter(
          (entry): entry is ContentPackStream => entry.type === 'stream'
        );

        expect(streamEntries.every((entry) => isContentPackStreamRequest(entry.request))).to.eql(
          true
        );
        expect(streamEntries.map((entry) => entry.name).sort()).to.eql([
          ROOT_STREAM_ID,
          'branch_a',
          'branch_a.child1',
          'branch_a.child1.nested',
          'branch_a.child2',
          'branch_b',
          'branch_b.child1',
          'branch_b.child2',
        ]);
      });

      it('exports selected streams from logs.otel', async () => {
        const exportBody = {
          name: 'selective_logs_content_pack',
          description: 'Content pack with selected logs.otel streams',
          version: '1.0.0',
          include: {
            objects: {
              mappings: true,
              routing: [
                {
                  destination: 'branch_a',
                  objects: {
                    mappings: true,
                    routing: [
                      {
                        destination: 'branch_a.child1',
                        objects: {
                          mappings: true,
                          routing: [
                            {
                              destination: 'branch_a.child1.nested',
                              objects: {
                                mappings: true,
                                routing: [],
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
        };

        const archiveBuffer = await exportContent(apiClient, 'logs.otel', exportBody);
        const contentPack = await parseArchive(Readable.from(archiveBuffer));

        expect(contentPack.name).to.eql('selective_logs_content_pack');

        const includedStreams = contentPack.entries
          .filter((entry): entry is ContentPackStream => entry.type === 'stream')
          .map((entry) => entry.name)
          .sort();

        expect(includedStreams).to.eql([
          ROOT_STREAM_ID,
          'branch_a',
          'branch_a.child1',
          'branch_a.child1.nested',
        ]);
        const rootEntry = contentPack.entries.find(
          (entry): entry is ContentPackStream =>
            entry.type === 'stream' && entry.name === ROOT_STREAM_ID
        )!;
        expect(rootEntry.request.stream.ingest.wired.routing).to.eql([
          {
            destination: 'branch_a',
            where: { never: {} },
            status: 'disabled',
          },
        ]);
      });

      const expectMappings = (contentPack: ContentPack, fields: FieldDefinition) => {
        expect(contentPack.entries).to.have.length(1);

        const rootEntry = contentPack.entries.find(
          (entry): entry is ContentPackStream =>
            entry.type === 'stream' && entry.name === ROOT_STREAM_ID
        )!;
        expect(rootEntry.request.stream.ingest.wired.fields).to.eql(fields);
      };

      it('respects mappings inclusion', async () => {
        const contentPackWithoutMappings = await parseArchive(
          Readable.from(
            await exportContent(apiClient, 'logs.otel.branch_a', {
              name: 'check-mappings',
              description: '',
              version: '1.0.0',
              include: {
                objects: {
                  mappings: false,
                  routing: [],
                },
              },
            })
          )
        );
        expectMappings(contentPackWithoutMappings, {});

        const contentPackWithMappings = await parseArchive(
          Readable.from(
            await exportContent(apiClient, 'logs.otel.branch_a', {
              name: 'check-mappings',
              description: '',
              version: '1.0.0',
              include: {
                objects: {
                  mappings: true,
                  routing: [],
                },
              },
            })
          )
        );

        expectMappings(contentPackWithMappings, {
          'resource.attributes.foo.bar': { type: 'keyword' },
        });
      });

      it('pulls inherited mappings in the exported root', async () => {
        // mapping is set on logs.otel.branch_a parent
        const contentPack = await parseArchive(
          Readable.from(
            await exportContent(apiClient, 'logs.otel.branch_a.child1', {
              name: 'check-mappings',
              description: '',
              version: '1.0.0',
              include: {
                objects: { mappings: true, routing: [] },
              },
            })
          )
        );

        expectMappings(contentPack, { 'resource.attributes.foo.bar': { type: 'keyword' } });
      });

      it('does not export base fields', async () => {
        const contentPack = await parseArchive(
          Readable.from(
            await exportContent(apiClient, 'logs.otel', {
              name: 'check-mappings',
              description: '',
              version: '1.0.0',
              include: {
                objects: { mappings: true, routing: [] },
              },
            })
          )
        );

        expectMappings(contentPack, {});
      });

      it('fails when trying to export a stream thats not a descendant', async () => {
        const exportBody = {
          name: 'nonexistent_stream_pack',
          description: 'Content pack for non-existent stream',
          version: '1.0.0',
          include: {
            objects: {
              mappings: true,
              routing: [
                {
                  destination: 'branch_b',
                  objects: {
                    mappings: true,
                    routing: [
                      {
                        destination: 'branch_b.child1',
                        objects: { mappings: true, routing: [] },
                      },
                    ],
                  },
                },
              ],
            },
          },
        };

        await exportContent(apiClient, 'logs.otel.branch_a', exportBody, 400);
      });

      it('omits significant-event queries from the exported pack', async () => {
        // Significant-event queries live outside the stream definition (in the knowledge-indicator
        // data stream), so export must never carry them even when the stream has detections.
        await bulkQueries(apiClient, 'logs.otel.branch_a', [
          {
            index: {
              id: 'export-omits-me',
              title: 'detector',
              description: '',
              esql: {
                query: `FROM logs.otel.branch_a,logs.otel.branch_a.* METADATA _id, _source | WHERE KQL("message:'ERROR'")`,
              },
            },
          },
        ]);

        const archiveBuffer = await exportContent(apiClient, 'logs.otel.branch_a', {
          name: 'branch_a_pack',
          description: 'export should not carry queries',
          version: '1.0.0',
          include: { objects: { all: {} } },
        });
        const contentPack = await parseArchive(Readable.from(archiveBuffer));

        const streamEntries = contentPack.entries.filter(
          (entry): entry is ContentPackStream => entry.type === 'stream'
        );
        expect(streamEntries.length).to.be.greaterThan(0);
        streamEntries.forEach((entry) => {
          expect(entry.request).to.not.have.property('queries');
        });

        // the detection still exists on the stream, it is just not part of the pack
        const { queries } = await getQueries(apiClient, 'logs.otel.branch_a');
        expect(queries.map((query) => query.id)).to.contain('export-omits-me');

        await bulkQueries(apiClient, 'logs.otel.branch_a', [{ delete: { id: 'export-omits-me' } }]);
      });
    });

    describe('Import', () => {
      it('fails if an object is too large', async () => {
        const twoMB = 2 * 1024 * 1024;
        const archive = await generateArchive(
          {
            name: 'content_pack',
            description: 'with objects too big',
            version: '1.0.0',
          },
          [
            {
              type: 'stream',
              name: 'a.regular.stream',
              request: {
                stream: {
                  type: 'wired',
                  description: 'ok',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: { fields: {}, routing: [] },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
              },
            },
            {
              type: 'stream',
              name: 'a.big.stream',
              request: {
                stream: {
                  type: 'wired',
                  description: 'a'.repeat(twoMB),
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: { fields: {}, routing: [] },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
              },
            },
          ]
        );

        const response = await importContent(
          apiClient,
          'logs.otel',
          {
            include: { objects: { all: {} } },
            content: Readable.from(archive),
            filename: 'content_pack-1.0.0.zip',
          },
          400
        );

        expect((response as unknown as { message: string }).message).to.match(
          /^Object \[content_pack-1.0.0\/stream\/a.big.stream.json\] exceeds the limit of \d+ bytes/
        );
      });

      it('imports into a stream', async () => {
        const exportBody = {
          name: 'branch_a_child1_content_pack',
          description: 'Content pack from branch_a with nested child',
          version: '1.0.0',
          include: {
            objects: {
              mappings: true,
              routing: [
                {
                  destination: 'nested',
                  objects: { mappings: true, routing: [] },
                },
              ],
            },
          },
        };
        const archiveBuffer = await exportContent(
          apiClient,
          'logs.otel.branch_a.child1',
          exportBody
        );

        await putStream(apiClient, 'logs.otel.branch_c', upsertRequest({}));

        const importResponse = await importContent(apiClient, 'logs.otel.branch_c', {
          include: { objects: { all: {} } },
          content: Readable.from(archiveBuffer),
          filename: 'branch_a_content_pack-1.0.0.zip',
        });
        expect(importResponse.result.created).to.eql(['logs.otel.branch_c.nested']);

        const updatedStream = (await getStream(
          apiClient,
          'logs.otel.branch_c'
        )) as Streams.WiredStream.GetResponse;

        expect(updatedStream.stream.ingest.wired.routing).to.eql([
          {
            destination: 'logs.otel.branch_c.nested',
            status: 'enabled',
            where: {
              field: 'resource.attributes.hello',
              eq: 'yes',
            },
          },
        ]);
        // check if the mapping set on unexported logs.otel.branch_a are correctly exported
        expect(updatedStream.stream.ingest.wired.fields['resource.attributes.foo.bar']).to.eql({
          type: 'keyword',
        });
      });

      it('imports selected streams', async () => {
        const exportBody = {
          name: 'complete_tree',
          description: 'Content pack from logs.otel',
          version: '1.0.0',
          include: { objects: { all: {} } },
        };
        const archiveBuffer = await exportContent(apiClient, 'logs.otel', exportBody);

        await putStream(apiClient, 'logs.otel.branch_d', upsertRequest({}));

        const importResponse = await importContent(apiClient, 'logs.otel.branch_d', {
          include: {
            objects: {
              mappings: true,
              routing: [
                {
                  destination: 'branch_b',
                  objects: {
                    mappings: true,
                    routing: [
                      {
                        destination: 'branch_b.child1',
                        objects: { mappings: true, routing: [] },
                      },
                    ],
                  },
                },
              ],
            },
          },
          content: Readable.from(archiveBuffer),
          filename: 'complete_tree-1.0.0.zip',
        });

        expect(importResponse.result.created).to.eql([
          'logs.otel.branch_d.branch_b',
          'logs.otel.branch_d.branch_b.child1',
        ]);

        const updatedStream = (await getStream(
          apiClient,
          'logs.otel.branch_d'
        )) as Streams.WiredStream.GetResponse;

        expect(updatedStream.stream.ingest.wired.routing).to.eql([
          {
            destination: 'logs.otel.branch_d.branch_b',
            where: { never: {} },
            status: 'disabled',
          },
        ]);
      });

      it('rejects significant-event queries carried by older packs', async () => {
        const archive = await generateArchive(
          {
            name: 'legacy_pack',
            description: 'pack that still carries queries',
            version: '1.0.0',
          },
          [
            // Content packs are structural-only. Older or hand-authored archives may still
            // carry significant-event queries; import must reject them (no partial structural
            // import, no knowledge-indicator writes) so detections are never silently dropped.
            // Cast past the type that no longer allows `queries`.
            {
              type: 'stream',
              name: ROOT_STREAM_ID,
              request: {
                stream: {
                  type: 'wired',
                  description: '',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: {
                      fields: {},
                      routing: [
                        { destination: 'detector', where: { never: {} }, status: 'disabled' },
                      ],
                    },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
                queries: [
                  {
                    id: 'legacy-query',
                    type: 'match',
                    title: 'legacy query',
                    description: '',
                    esql: {
                      query:
                        'FROM logs.otel.branch_e METADATA _id, _source | WHERE KQL("message: ERROR")',
                    },
                  },
                ],
              },
            } as ContentPackStream,
            {
              type: 'stream',
              name: 'detector',
              request: {
                stream: {
                  type: 'wired',
                  description: '',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: { fields: {}, routing: [] },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
              },
            },
          ]
        );

        await putStream(apiClient, 'logs.otel.branch_e', upsertRequest({}));

        const response = await importContent(
          apiClient,
          'logs.otel.branch_e',
          {
            include: { objects: { all: {} } },
            content: Readable.from(archive),
            filename: 'legacy_pack-1.0.0.zip',
          },
          400
        );

        expect((response as unknown as { message: string }).message).to.contain(
          'contains significant-event queries'
        );

        // the rejected import must not partially create any streams
        await getStream(apiClient, 'logs.otel.branch_e.detector', 404);
      });

      it('rejects an empty `queries: []` carried by a pack', async () => {
        const archive = await generateArchive(
          {
            name: 'empty_queries_pack',
            description: 'pack carrying an empty queries array',
            version: '1.0.0',
          },
          [
            // Content packs are structural-only and tech preview, so import hard-fails on any
            // `queries` field rather than half-supporting a legacy shape; even an empty
            // `queries: []` is rejected. Cast past the type that no longer allows `queries`.
            {
              type: 'stream',
              name: ROOT_STREAM_ID,
              request: {
                stream: {
                  type: 'wired',
                  description: '',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: {
                      fields: {},
                      routing: [{ destination: 'child', where: { never: {} }, status: 'disabled' }],
                    },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
                queries: [],
              },
            } as ContentPackStream,
            {
              type: 'stream',
              name: 'child',
              request: {
                stream: {
                  type: 'wired',
                  description: '',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: { fields: {}, routing: [] },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
              },
            },
          ]
        );

        await putStream(apiClient, 'logs.otel.branch_f', upsertRequest({}));

        const response = await importContent(
          apiClient,
          'logs.otel.branch_f',
          {
            include: { objects: { all: {} } },
            content: Readable.from(archive),
            filename: 'empty_queries_pack-1.0.0.zip',
          },
          400
        );

        expect((response as unknown as { message: string }).message).to.contain(
          'contains significant-event queries'
        );

        // the rejected import must not partially create any streams
        await getStream(apiClient, 'logs.otel.branch_f.child', 404);
      });

      it('rejects significant-event queries at preview time', async () => {
        const archive = await generateArchive(
          {
            name: 'legacy_preview_pack',
            description: 'pack that still carries queries',
            version: '1.0.0',
          },
          [
            // Preview shares the parse path with import, so a pack carrying queries must be
            // rejected before the UI can render it. Cast past the type that no longer allows
            // `queries`.
            {
              type: 'stream',
              name: ROOT_STREAM_ID,
              request: {
                stream: {
                  type: 'wired',
                  description: '',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: { fields: {}, routing: [] },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
                queries: [
                  {
                    id: 'legacy-query',
                    type: 'match',
                    title: 'legacy query',
                    description: '',
                    esql: {
                      query: 'FROM logs.otel METADATA _id, _source | WHERE KQL("message: ERROR")',
                    },
                  },
                ],
              },
            } as ContentPackStream,
          ]
        );

        const response = await previewContent(
          apiClient,
          'logs.otel',
          {
            content: Readable.from(archive),
            filename: 'legacy_preview_pack-1.0.0.zip',
          },
          400
        );

        expect((response as unknown as { message: string }).message).to.contain(
          'contains significant-event queries'
        );
      });

      it('fails when importing conflicting mappings', async () => {
        const generateWithMappings = (fields: FieldDefinition) =>
          generateArchive(
            {
              name: 'conflict_pack',
              description: 'Content pack with conflicting mappings',
              version: '1.0.0',
            },
            [
              {
                type: 'stream',
                name: ROOT_STREAM_ID,
                request: {
                  stream: {
                    type: 'wired',
                    description: '',
                    ingest: {
                      processing: { steps: [] },
                      settings: {},
                      wired: {
                        fields,
                        routing: [],
                      },
                      lifecycle: { inherit: {} },
                      failure_store: { inherit: {} },
                    },
                  },
                  ...emptyAssets,
                },
              },
            ]
          );

        const targetStreamName = 'logs.otel.branch_a';

        // fails when the field type changes
        let response = await importContent(
          apiClient,
          targetStreamName,
          {
            include: { objects: { all: {} } },
            content: Readable.from(
              await generateWithMappings({
                'resource.attributes.foo.bar': { type: 'long' },
              })
            ),
            filename: 'conflict_pack-1.0.0.zip',
          },
          409
        );

        expect((response as unknown as { message: string }).message).to.eql(
          'Cannot change mapping of [resource.attributes.foo.bar] for [logs.otel.branch_a]'
        );

        // fails when field configuration changes
        response = await importContent(
          apiClient,
          targetStreamName,
          {
            include: { objects: { all: {} } },
            content: Readable.from(
              await generateWithMappings({
                'resource.attributes.foo.bar': { type: 'keyword', boost: 2.0 },
              })
            ),
            filename: 'conflict_pack-1.0.0.zip',
          },
          409
        );

        expect((response as unknown as { message: string }).message).to.eql(
          'Cannot change mapping of [resource.attributes.foo.bar] for [logs.otel.branch_a]'
        );

        // succeeds when the field configuration is unchanged
        await importContent(
          apiClient,
          targetStreamName,
          {
            include: { objects: { all: {} } },
            content: Readable.from(
              await generateWithMappings({
                'resource.attributes.foo.bar': { type: 'keyword' },
              })
            ),
            filename: 'conflict_pack-1.0.0.zip',
          },
          200
        );
      });

      it('fails when importing overlapping child', async () => {
        const targetStreamName = 'logs.otel.overlapping.child';
        await putStream(apiClient, targetStreamName, upsertRequest({}));

        const archive = await generateArchive(
          {
            name: 'content_pack',
            description: 'with overlapping child',
            version: '1.0.0',
          },
          [
            {
              type: 'stream',
              name: ROOT_STREAM_ID,
              request: {
                stream: {
                  type: 'wired',
                  description: '',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: {
                      fields: {},
                      routing: [
                        {
                          destination: 'child',
                          where: { never: {} },
                          status: 'disabled',
                        },
                      ],
                    },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
              },
            },
            {
              type: 'stream',
              name: 'child',
              request: {
                stream: {
                  type: 'wired',
                  description: '',
                  ingest: {
                    processing: { steps: [] },
                    settings: {},
                    wired: { fields: {}, routing: [] },
                    lifecycle: { inherit: {} },
                    failure_store: { inherit: {} },
                  },
                },
                ...emptyAssets,
              },
            },
          ]
        );

        const response = await importContent(
          apiClient,
          'logs.otel.overlapping',
          {
            include: { objects: { all: {} } },
            content: Readable.from(archive),
            filename: 'overlap-1.0.0.zip',
          },
          409
        );

        expect((response as unknown as { message: string }).message).to.eql(
          '[logs.otel.overlapping.child] already exists'
        );
      });
    });
  });
}
