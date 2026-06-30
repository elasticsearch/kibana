/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty } from 'lodash';
import type {
  ContentPackEntry,
  ContentPackIncludedObjects,
  ContentPackStream,
} from '@kbn/content-packs-schema';
import { isIncludeAll } from '@kbn/content-packs-schema';

export function hasSelectedObjects(includedObjects: ContentPackIncludedObjects): boolean {
  return (
    isIncludeAll(includedObjects) ||
    includedObjects.objects.routing.length > 0 ||
    includedObjects.objects.mappings
  );
}

export function containsMappings(streams: ContentPackStream[]): boolean {
  return streams.some((stream) => !isEmpty(stream.request.stream.ingest.wired.fields));
}

export function isEmptyContentPack(entries: ContentPackEntry[]): boolean {
  if (entries.length === 0) {
    return true;
  }

  const streams = entries.filter((entry): entry is ContentPackStream => entry.type === 'stream');
  if (entries.length === streams.length && streams.length === 1) {
    // the pack contains only the root stream (no child streams), so it is empty unless the
    // root carries field mappings
    return isEmpty(streams[0].request.stream.ingest.wired.fields);
  }

  return false;
}
