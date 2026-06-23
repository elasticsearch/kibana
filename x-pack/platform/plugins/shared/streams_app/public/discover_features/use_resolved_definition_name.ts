/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { useAbortableAsync } from '@kbn/react-hooks';
import type { StreamsRepositoryClient } from '@kbn/streams-plugin/public/api';

export interface ResolvedDefinitionName {
  name?: string;
  existsLocally: boolean;
  remoteProject?: string;
}

export function useResolvedDefinitionName({
  streamsRepositoryClient,
  index,
  fallbackStreamName,
  cpsHasLinkedProjects,
  ccsHasRemoteClusters,
}: {
  streamsRepositoryClient: StreamsRepositoryClient;
  index?: string;
  fallbackStreamName?: string;
  cpsHasLinkedProjects?: boolean;
  ccsHasRemoteClusters?: boolean;
}) {
  return useAbortableAsync(
    async ({ signal }): Promise<ResolvedDefinitionName | undefined> => {
      if (!index) {
        if (!fallbackStreamName) {
          return undefined;
        }
        if (!cpsHasLinkedProjects && !ccsHasRemoteClusters) {
          return { name: fallbackStreamName, existsLocally: true };
        }
        try {
          await streamsRepositoryClient.fetch('GET /api/streams/{name} 2023-10-31', {
            signal,
            params: { path: { name: fallbackStreamName } },
          });
          return { name: fallbackStreamName, existsLocally: true };
        } catch {
          return { name: fallbackStreamName, existsLocally: false, remoteProject: 'unknown' };
        }
      } else {
        try {
          const definition = await streamsRepositoryClient.fetch(
            'GET /internal/streams/_resolve_index',
            {
              signal,
              params: {
                query: {
                  index,
                },
              },
            }
          );
          return { name: definition?.stream?.name, existsLocally: true };
        } catch {
          const remoteInfo = parseRemoteIndex(index);
          if (remoteInfo) {
            return {
              name: remoteInfo.streamName ?? fallbackStreamName,
              existsLocally: false,
              remoteProject: remoteInfo.projectName,
            };
          }
          return { name: fallbackStreamName, existsLocally: false };
        }
      }
    },
    [streamsRepositoryClient, index, fallbackStreamName, cpsHasLinkedProjects, ccsHasRemoteClusters]
  );
}

function parseRemoteIndex(
  index: string
): { projectName: string; streamName: string | undefined } | undefined {
  const colonIdx = index.indexOf(':');
  if (colonIdx <= 0) return undefined;

  const projectName = index.substring(0, colonIdx);
  const backingIndex = index.substring(colonIdx + 1);

  // Try to recover the logical stream name from a data-stream backing index
  // (.ds-<name>-YYYY.MM.DD-<gen>). For any other index form (e.g. legacy
  // filebeat indices) we still know the remote cluster, so we keep projectName
  // and leave streamName undefined so the caller can fall back gracefully.
  const match = backingIndex.match(/^\.ds-(.+)-\d{4}\.\d{2}\.\d{2}-\d+$/);
  return { projectName, streamName: match ? match[1] : undefined };
}

export function adaptDocToResolverInputs(doc: DataTableRecord) {
  return {
    index: doc.raw._index,
    fallbackStreamName: getFallbackStreamName(doc.flattened),
  };
}

function getFallbackStreamName(flattenedDoc: Record<string, unknown>) {
  const wiredStreamName = flattenedDoc['stream.name'];
  if (wiredStreamName) {
    return String(wiredStreamName);
  }
  const dsnsType = flattenedDoc['data_stream.type'];
  const dsnsDataset = flattenedDoc['data_stream.dataset'];
  const dsnsNamespace = flattenedDoc['data_stream.namespace'];
  if (dsnsType && dsnsDataset && dsnsNamespace) {
    return `${dsnsType}-${dsnsDataset}-${dsnsNamespace}`;
  }
  return undefined;
}
