/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Streams } from '../models/streams';

export function getIndexPatternsForStream<T extends Streams.all.Definition | undefined>(
  stream: T
): T extends Streams.all.Definition ? string[] : undefined;

export function getIndexPatternsForStream(stream: Streams.all.Definition | undefined) {
  if (!stream) {
    return undefined;
  }
  if (Streams.ClassicStream.Definition.is(stream)) {
    return [stream.name];
  }
  // Returns [name, name.*] for ingest streams. The wildcard matches child ingest
  // data streams but NOT query stream ES|QL views, which live in the $.namespace
  // (e.g. $.name.child). This separation is intentional — see ESQL_VIEW_PREFIX.
  const dataStreamOfDefinition = stream.name;
  return [dataStreamOfDefinition, `${dataStreamOfDefinition}.*`];
}

export function getSourcesForStream(stream: Streams.all.Definition): string[] {
  if (Streams.QueryStream.Definition.is(stream)) {
    return [stream.query.view];
  }

  return getIndexPatternsForStream(stream);
}

export function getStreamSamplingSource(stream: Streams.all.Definition): string {
  return Streams.QueryStream.Definition.is(stream) ? stream.query.view : stream.name;
}
