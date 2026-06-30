/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Readable } from 'stream';
import { z } from '@kbn/zod/v4';
import type { ContentPack, ContentPackStream } from '@kbn/content-packs-schema';
import { contentPackIncludedObjectsSchema } from '@kbn/content-packs-schema';
import { Streams, emptyAssets, getInheritedFieldsFromAncestors } from '@kbn/streams-schema';
import { omit } from 'lodash';
import { OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS } from '@kbn/management-settings-ids';
import type { RequestHandlerContext } from '@kbn/core/server';
import { STREAMS_API_PRIVILEGES } from '../../../common/constants';
import { createServerRoute } from '../create_server_route';
import { StatusError } from '../../lib/streams/errors/status_error';
import { generateArchive, parseArchive } from '../../lib/content';
import { exportContentRequest } from '../../oas_examples';
import {
  prepareStreamsForExport,
  prepareStreamsForImport,
  scopeContentPackStreams,
  scopeIncludedObjects,
  withoutBaseFields,
  withoutInheritedFieldMetadata,
} from '../../lib/content/stream';
import { asTree } from '../../lib/content/stream/tree';

const MAX_CONTENT_PACK_SIZE_BYTES = 1024 * 1024 * 5; // 5MB

const exportContentRoute = createServerRoute({
  endpoint: 'POST /api/streams/{name}/content/export 2023-10-31',
  options: {
    access: 'public',
    summary: 'Export stream content',
    description:
      'Exports a content pack with the stream structure (routing, mappings, and processing). Significant-event queries are not included; manage them via the /api/streams/{name}/queries endpoints.',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'application/json': {
            examples: {
              exportContent: { value: exportContentRequest },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Content pack archive for the stream.',
        },
      },
    }),
  },
  params: z.object({
    path: z.object({
      name: z.string().describe('The name of the stream to export content from.'),
    }),
    body: z.object({
      name: z.string(),
      description: z.string(),
      version: z.string(),
      include: contentPackIncludedObjectsSchema,
    }),
  }),
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  async handler({ params, request, response, context, getScopedClients }) {
    await checkEnabled(context);

    const { streamsClient } = await getScopedClients({ request });

    const root = await streamsClient.getStream(params.path.name);
    if (!Streams.WiredStream.Definition.is(root)) {
      throw new StatusError('Only wired streams can be exported', 400);
    }

    const [ancestors, descendants] = await Promise.all([
      streamsClient.getAncestors(params.path.name),
      streamsClient.getDescendants(params.path.name),
    ]);

    const inheritedFields = getInheritedFieldsFromAncestors(ancestors);

    const exportedTree = asTree({
      root: params.path.name,
      include: scopeIncludedObjects({
        root: params.path.name,
        include: params.body.include,
      }),
      streams: [root, ...descendants].map((stream) => {
        if (stream.name === params.path.name) {
          // merge non-base inherited mappings into the exported root
          // strip inherited field metadata (from, alias_for) so exports contain clean FieldDefinition
          stream.ingest.wired.fields = withoutInheritedFieldMetadata(
            withoutBaseFields({
              ...inheritedFields,
              ...stream.ingest.wired.fields,
            })
          );
        }

        return asContentPackEntry({ stream });
      }),
    });

    const archive = await generateArchive(
      params.body,
      prepareStreamsForExport({ tree: exportedTree })
    );

    return response.ok({
      body: archive,
      headers: {
        'Content-Disposition': `attachment; filename="${params.body.name}-${params.body.version}.zip"`,
        'Content-Type': 'application/zip',
      },
    });
  },
});

function asContentPackEntry({
  stream,
}: {
  stream: Streams.WiredStream.Definition;
}): ContentPackStream {
  return {
    type: 'stream' as const,
    name: stream.name,
    request: {
      stream: {
        ...omit(stream, ['name', 'updated_at']),
        ingest: {
          ...stream.ingest,
          processing: omit(stream.ingest.processing, 'updated_at'),
        },
      },
      ...emptyAssets,
    },
  };
}

const importContentRoute = createServerRoute({
  endpoint: 'POST /api/streams/{name}/content/import 2023-10-31',
  options: {
    access: 'public',
    summary: 'Import content into a stream',
    description:
      'Imports stream structure (routing, mappings, and processing) from a content pack into a stream.',
    availability: {
      since: '9.1.0',
      stability: 'experimental',
    },
    body: {
      accepts: 'multipart/form-data',
      maxBytes: MAX_CONTENT_PACK_SIZE_BYTES,
      output: 'stream',
    },
    oasOperationObject: () => ({
      requestBody: {
        content: {
          'multipart/form-data': {
            examples: {
              importContent: {
                value: {
                  include: JSON.stringify({ objects: { all: {} } }),
                  content: '<binary zip archive>',
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Content was imported into the stream successfully.',
        },
      },
    }),
  },
  params: z.object({
    path: z.object({
      name: z.string().describe('The name of the stream to import content into.'),
    }),
    body: z.object({
      include: z
        .string()
        .transform((value) => contentPackIncludedObjectsSchema.parse(JSON.parse(value))),
      content: z.instanceof(Readable),
    }),
  }),
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  async handler({ params, request, context, getScopedClients }) {
    await checkEnabled(context);

    const { streamsClient } = await getScopedClients({ request });

    const root = await streamsClient.getStream(params.path.name);
    if (!Streams.WiredStream.Definition.is(root)) {
      throw new StatusError('Can only import content into wired streams', 400);
    }

    const contentPack = await parseArchive(params.body.content);

    const descendants = await streamsClient.getDescendants(params.path.name);

    const existingTree = asTree({
      root: params.path.name,
      include: { objects: { all: {} } },
      streams: [root, ...descendants].map((stream) => asContentPackEntry({ stream })),
    });

    const incomingTree = asTree({
      root: params.path.name,
      include: scopeIncludedObjects({
        root: params.path.name,
        include: params.body.include,
      }),
      streams: scopeContentPackStreams({
        root: params.path.name,
        streams: contentPack.entries.filter(
          (entry): entry is ContentPackStream => entry.type === 'stream'
        ),
      }),
    });

    const streams = prepareStreamsForImport({ existing: existingTree, incoming: incomingTree });

    return await streamsClient.bulkUpsert(streams);
  },
});

const previewContentRoute = createServerRoute({
  endpoint: 'POST /internal/streams/{name}/content/preview',
  options: {
    access: 'internal',
    summary: 'Preview a content pack',
    description: 'Returns a json representation of a content pack.',
    body: {
      accepts: 'multipart/form-data',
      maxBytes: MAX_CONTENT_PACK_SIZE_BYTES,
      output: 'stream',
    },
  },
  params: z.object({
    path: z.object({
      name: z.string(),
    }),
    body: z.object({
      content: z.instanceof(Readable),
    }),
  }),
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.manage],
    },
  },
  async handler({ request, params, context, getScopedClients }): Promise<ContentPack> {
    await checkEnabled(context);

    const { streamsClient } = await getScopedClients({ request });
    await streamsClient.ensureStream(params.path.name);

    return await parseArchive(params.body.content);
  },
});

async function checkEnabled(context: RequestHandlerContext) {
  const core = await context.core;
  const enabled = await core.uiSettings.client.get(OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS);
  if (!enabled) {
    throw new StatusError('Content packs are not enabled', 400);
  }
}

export const contentRoutes = {
  ...exportContentRoute,
  ...importContentRoute,
  ...previewContentRoute,
};
