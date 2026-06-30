/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { badData } from '@hapi/boom';
import type { WiredIngestUpsertRequest } from '@kbn/streams-schema';
import { Streams } from '@kbn/streams-schema';
import type { ClassicIngestUpsertRequest } from '@kbn/streams-schema';
import type { UpsertStreamResponse } from '../client';
import type { StreamsClient } from '../client';
import type { AttachmentClient } from '../attachments/attachment_client';

/**
 * Returns the dashboard and rule attachment ids linked to a stream, partitioned by type.
 * Significant-event queries are not attachments and are not returned here; they are managed
 * through the `/api/streams/{name}/queries` endpoints.
 */
export async function getStreamAttachmentIds({
  name,
  attachmentClient,
}: {
  name: string;
  attachmentClient: AttachmentClient;
}): Promise<{ dashboards: string[]; rules: string[] }> {
  const attachments = await attachmentClient.getAttachments(name);

  const dashboards = attachments
    .filter((attachment) => attachment.type === 'dashboard')
    .map((attachment) => attachment.id);

  const rules = attachments
    .filter((attachment) => attachment.type === 'rule')
    .map((attachment) => attachment.id);

  return { dashboards, rules };
}

export async function updateWiredIngest({
  streamsClient,
  attachmentClient,
  name,
  ingest,
  description,
}: {
  streamsClient: StreamsClient;
  attachmentClient: AttachmentClient;
  name: string;
  ingest: WiredIngestUpsertRequest;
  description?: string;
}): Promise<UpsertStreamResponse> {
  const { dashboards, rules } = await getStreamAttachmentIds({
    name,
    attachmentClient,
  });

  const definition = await streamsClient.getStream(name);

  if (!Streams.WiredStream.Definition.is(definition)) {
    throw badData(`Can't update wired capabilities of a non-wired stream`);
  }

  const {
    name: _name,
    updated_at: _updatedAt,
    query_streams: queryStreams,
    ...stream
  } = definition;

  const upsertRequest: Streams.WiredStream.UpsertRequest = {
    dashboards,
    stream: {
      ...stream,
      ...(queryStreams !== undefined && { query_streams: queryStreams }),
      ...(description !== undefined && { description }),
      ingest,
    },
    rules,
  };

  return await streamsClient.upsertStream({
    request: upsertRequest,
    name,
  });
}

export async function updateClassicIngest({
  streamsClient,
  attachmentClient,
  name,
  ingest,
  description,
}: {
  streamsClient: StreamsClient;
  attachmentClient: AttachmentClient;
  name: string;
  ingest: ClassicIngestUpsertRequest;
  description?: string;
}): Promise<UpsertStreamResponse> {
  const { dashboards, rules } = await getStreamAttachmentIds({
    name,
    attachmentClient,
  });

  const definition = await streamsClient.getStream(name);

  if (!Streams.ClassicStream.Definition.is(definition)) {
    throw badData(`Can't update classic capabilities of a non-classic stream`);
  }

  const {
    name: _name,
    updated_at: _updatedAt,
    query_streams: queryStreams,
    ...stream
  } = definition;

  const upsertRequest: Streams.ClassicStream.UpsertRequest = {
    dashboards,
    stream: {
      ...stream,
      ...(queryStreams !== undefined && { query_streams: queryStreams }),
      ...(description !== undefined && { description }),
      ingest,
    },
    rules,
  };

  return await streamsClient.upsertStream({
    request: upsertRequest,
    name,
  });
}

/**
 * Strips `updated_at` from `processing` to convert from a Definition ingest
 * to an UpsertRequest ingest shape.
 */
const stripProcessingTimestamp = (
  ingest: Streams.ingest.all.Definition['ingest']
): WiredIngestUpsertRequest | ClassicIngestUpsertRequest => {
  const { processing, ...rest } = ingest;
  const { updated_at: _updatedAt, ...processingWithoutTimestamp } = processing;
  return { ...rest, processing: processingWithoutTimestamp } as
    | WiredIngestUpsertRequest
    | ClassicIngestUpsertRequest;
};

export interface StreamPatch {
  ingest: Streams.ingest.all.Definition['ingest'];
  description?: string;
}

export async function patchIngestAndUpsert({
  streamsClient,
  attachmentClient,
  name,
  patchFn,
}: {
  streamsClient: StreamsClient;
  attachmentClient: AttachmentClient;
  name: string;
  patchFn: (definition: Streams.ingest.all.Definition) => StreamPatch;
}): Promise<UpsertStreamResponse> {
  const definition = await streamsClient.getStream(name);

  const isWired = Streams.WiredStream.Definition.is(definition);
  const isClassic = Streams.ClassicStream.Definition.is(definition);

  if (!isWired && !isClassic) {
    throw badData(`Stream "${name}" is not a wired or classic stream`);
  }

  const patch = patchFn(definition as Streams.ingest.all.Definition);
  const upsertIngest = stripProcessingTimestamp(patch.ingest);

  if (isWired) {
    return await updateWiredIngest({
      streamsClient,
      attachmentClient,
      name,
      ingest: upsertIngest as WiredIngestUpsertRequest,
      description: patch.description,
    });
  }

  return await updateClassicIngest({
    streamsClient,
    attachmentClient,
    name,
    ingest: upsertIngest as ClassicIngestUpsertRequest,
    description: patch.description,
  });
}
