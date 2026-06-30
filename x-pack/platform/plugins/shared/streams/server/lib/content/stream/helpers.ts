/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { intersectionBy } from 'lodash';
import type { ContentPackIncludedObjects, ContentPackStream } from '@kbn/content-packs-schema';
import { ROOT_STREAM_ID, isIncludeAll } from '@kbn/content-packs-schema';
import { type FieldDefinition } from '@kbn/streams-schema';
import { ContentPackIncludeError } from '../error';
import { baseFields } from '../../streams/component_templates/logs_layer';

export function withoutRootPrefix(root: string, name: string) {
  const prefix = `${root}.`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export function withRootPrefix(root: string, name: string) {
  return `${root}.${name}`;
}

export function includedObjectsFor(
  stream: string,
  include: ContentPackIncludedObjects
): ContentPackIncludedObjects {
  if (isIncludeAll(include)) {
    return include;
  }

  for (const routing of include.objects.routing) {
    if (stream === routing.destination) {
      return routing;
    }
  }

  throw new ContentPackIncludeError(`Could not find included objects for stream [${stream}]`);
}

export function filterRouting(entry: ContentPackStream, include: ContentPackIncludedObjects) {
  const routing = entry.request.stream.ingest.wired.routing;
  if (isIncludeAll(include)) {
    return routing;
  }

  const existingDestinations = new Set(routing.map(({ destination }) => destination));
  include.objects.routing.forEach(({ destination }) => {
    if (!existingDestinations.has(destination)) {
      throw new ContentPackIncludeError(
        `Stream [${entry.name}] does not route to [${destination}]`
      );
    }
  });

  return intersectionBy(routing, include.objects.routing, ({ destination }) => destination);
}

export function getFields(
  entry: ContentPackStream,
  include: ContentPackIncludedObjects
): FieldDefinition {
  if (isIncludeAll(include) || include.objects.mappings) {
    return entry.request.stream.ingest.wired.fields;
  }
  return {};
}

export function withoutBaseFields(fields: FieldDefinition): FieldDefinition {
  return Object.keys(fields)
    .filter((key) => !baseFields[key])
    .reduce((filtered, key) => {
      filtered[key] = fields[key];
      return filtered;
    }, {} as FieldDefinition);
}

/**
 * Strips inherited field metadata (`from`, `alias_for`) from field definitions.
 * Used when exporting content packs to produce clean FieldDefinition objects.
 */
export function withoutInheritedFieldMetadata(fields: FieldDefinition): FieldDefinition {
  return Object.entries(fields).reduce((result, [key, fieldDef]) => {
    const {
      from: _from,
      alias_for: _aliasFor,
      ...cleanFieldDef
    } = fieldDef as FieldDefinition[string] & {
      from?: string;
      alias_for?: string;
    };
    result[key] = cleanFieldDef;
    return result;
  }, {} as FieldDefinition);
}

export function scopeContentPackStreams({
  root,
  streams,
}: {
  root: string;
  streams: ContentPackStream[];
}): ContentPackStream[] {
  return streams.map((stream) => ({
    ...stream,
    name: stream.name === ROOT_STREAM_ID ? root : withRootPrefix(root, stream.name),
    request: {
      ...stream.request,
      stream: {
        ...stream.request.stream,
        ingest: {
          ...stream.request.stream.ingest,
          wired: {
            ...stream.request.stream.ingest.wired,
            routing: stream.request.stream.ingest.wired.routing.map((definition) => ({
              ...definition,
              destination: withRootPrefix(root, definition.destination),
            })),
          },
        },
      },
    },
  }));
}

export function scopeIncludedObjects({
  root,
  include,
}: {
  root: string;
  include: ContentPackIncludedObjects;
}): ContentPackIncludedObjects {
  if (isIncludeAll(include)) {
    return include;
  }

  return {
    objects: {
      ...include.objects,
      routing: include.objects.routing.map((routing) => ({
        ...scopeIncludedObjects({ root, include: routing }),
        destination: withRootPrefix(root, routing.destination),
      })),
    },
  };
}
