/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';
import { Streams } from '../models/streams';
import { QueryStream } from '../models/query';

/**
 * Parses a stream upsert request and converts it into the corresponding stream definition.
 * Given that upsert requests don't include name field, the stream name is provided separately.
 * For updated_at fields, given that an upsert request implies an update operation, the current timestamp is used.
 * @param name Stream name
 * @param request Stream upsert request
 * @throws Error if the upsert request doesn't match any known stream upsert request schema
 * @returns The corresponding stream definition for the provided upsert request
 */
export const convertUpsertRequestIntoDefinition = (
  name: string,
  request: Streams.all.UpsertRequest
): Streams.all.Definition => {
  const now = new Date().toISOString();

  if (Streams.WiredStream.UpsertRequest.is(request)) {
    return {
      ...request.stream,
      name,
      updated_at: now,
      ingest: {
        ...request.stream.ingest,
        processing: {
          ...request.stream.ingest.processing,
          updated_at: now,
        },
      },
    };
  }

  if (Streams.ClassicStream.UpsertRequest.is(request)) {
    return {
      ...request.stream,
      name,
      updated_at: now,
      ingest: {
        ...request.stream.ingest,
        processing: {
          ...request.stream.ingest.processing,
          updated_at: now,
        },
      },
    };
  }

  if (QueryStream.UpsertRequest.is(request)) {
    return {
      ...request.stream,
      name,
      updated_at: now,
    };
  }

  const _exhaustiveCheck: never = request;
  throw new Error(
    `Couldn't parse stream upsert request. Please ensure you're passing a valid request. Received: ${JSON.stringify(
      _exhaustiveCheck
    )}`
  );
};

/**
 * Parses a stream get response and converts it into the corresponding stream upsert request.
 * It will omit fields that are not part of the upsert request, such as name and updated_at timestamps.
 * Significant-event queries are intentionally excluded: they are not part of the stream upsert
 * contract and are managed via the dedicated `/api/streams/{name}/queries` endpoints and content import.
 * @param getResponse The stream get response to be converted
 * @throws Error if the get response doesn't match any known stream get response schema
 * @returns The corresponding stream upsert request for the provided get response
 */
export const convertGetResponseIntoUpsertRequest = (
  getResponse: Streams.all.GetResponse
): Streams.all.UpsertRequest => {
  if (Streams.WiredStream.GetResponse.is(getResponse)) {
    return {
      dashboards: getResponse.dashboards,
      rules: getResponse.rules,
      stream: {
        ...omit(getResponse.stream, ['name', 'updated_at']),
        ingest: {
          ...getResponse.stream.ingest,
          processing: omit(getResponse.stream.ingest.processing, ['updated_at']),
        },
      },
    };
  }

  if (Streams.ClassicStream.GetResponse.is(getResponse)) {
    return {
      dashboards: getResponse.dashboards,
      rules: getResponse.rules,
      stream: {
        ...omit(getResponse.stream, ['name', 'updated_at']),
        ingest: {
          ...getResponse.stream.ingest,
          processing: omit(getResponse.stream.ingest.processing, ['updated_at']),
        },
      },
    };
  }

  if (QueryStream.GetResponse.is(getResponse)) {
    return {
      dashboards: getResponse.dashboards,
      rules: getResponse.rules,
      stream: omit(getResponse.stream, ['name', 'updated_at']),
    };
  }

  // Exhaustiveness check: if we reach here, TypeScript will error if there are unhandled cases
  const _exhaustiveCheck: never = getResponse;
  throw new Error(
    `Couldn't parse stream get response. Please ensure you're passing a valid response. Received: ${JSON.stringify(
      _exhaustiveCheck
    )}`
  );
};
