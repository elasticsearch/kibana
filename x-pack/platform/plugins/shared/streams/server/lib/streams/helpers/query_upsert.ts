/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { badData } from '@hapi/boom';
import { Streams, getEsqlViewName, getParentId } from '@kbn/streams-schema';
import type { StreamsClient, UpsertStreamResponse } from '../client';
import type { AttachmentClient } from '../attachments/attachment_client';
import { DefinitionNotFoundError } from '../errors/definition_not_found_error';
import { getStreamAttachmentIds } from './ingest_upsert';

/**
 * Creates a query stream when it does not exist yet, or updates the query of an existing one.
 *
 * The stored definition only keeps a reference to the ES|QL view, so the actual ES|QL is passed
 * here and the state management layer takes care of creating/updating the backing view and
 * validating the query. Shared between the public `_query` route and the Agent Builder write
 * tool so both honor the exact same create/update semantics.
 *
 * Note: the caller is responsible for gating on the query streams feature flag.
 */
export async function upsertQueryStream({
  streamsClient,
  attachmentClient,
  name,
  esql,
  fieldDescriptions,
  description,
}: {
  streamsClient: StreamsClient;
  attachmentClient: AttachmentClient;
  name: string;
  esql: string;
  fieldDescriptions?: Record<string, string>;
  description?: string;
}): Promise<UpsertStreamResponse> {
  // Generate the view name from the stream name. The query reference carries the esql so the
  // state management layer can create/update and validate the view.
  const queryReference: Streams.QueryStream.Definition['query'] = {
    view: getEsqlViewName(name),
    esql,
  };

  let definition: Streams.all.Definition;
  try {
    definition = await streamsClient.getStream(name);
  } catch (error) {
    if (error instanceof DefinitionNotFoundError) {
      // Ensure the parent stream is registered in the .streams index. Classic streams (plain
      // data streams) may not have a stored definition yet.
      const parentId = getParentId(name);
      if (parentId) {
        await streamsClient.ensureStream(parentId);
      }

      return await streamsClient.createQueryStream({
        name,
        query: queryReference,
        field_descriptions: fieldDescriptions,
        ...(description !== undefined && { description }),
      });
    }
    throw error;
  }

  if (!Streams.QueryStream.Definition.is(definition)) {
    throw badData(`The stream "${name}" already exists and is not a query stream.`);
  }

  const { dashboards, rules } = await getStreamAttachmentIds({ name, attachmentClient });

  // Remove name and updated_at from the definition — these are not allowed in UpsertRequest.
  const { name: _name, updated_at: _updatedAt, ...stream } = definition;

  // When field descriptions are not provided, preserve the existing ones. When explicitly
  // provided (even as {}), use them as-is.
  const mergedFieldDescriptions =
    fieldDescriptions !== undefined ? fieldDescriptions : definition.field_descriptions;

  const upsertRequest: Streams.QueryStream.UpsertRequest = {
    dashboards,
    stream: {
      ...stream,
      query: queryReference,
      ...(mergedFieldDescriptions && { field_descriptions: mergedFieldDescriptions }),
      ...(description !== undefined && { description }),
    },
    rules,
  };

  return await streamsClient.upsertStream({ request: upsertRequest, name });
}
