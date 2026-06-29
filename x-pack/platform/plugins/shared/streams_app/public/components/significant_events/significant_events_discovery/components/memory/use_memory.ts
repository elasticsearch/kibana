/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@kbn/react-query';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../../../../hooks/use_kibana';
import { getFormattedError } from '../../../../../util/errors';
import type {
  MemoryEntry,
  MemoryCategoryNode,
  MemorySearchResult,
  MemoryVersionRecord,
} from './types';

const MEMORY_BASE = '/internal/streams/memory';

const memoryKeys = {
  all: ['memory'] as const,
  categories: ['memory', 'categories'] as const,
  search: (query: string) => ['memory', 'search', query] as const,
  byId: (id: string) => ['memory', 'entry', id] as const,
  history: (entryId: string) => ['memory', 'history', entryId] as const,
  version: (entryId: string, version: number) => ['memory', 'version', entryId, version] as const,
  recentChanges: ['memory', 'recent-changes'] as const,
};

export const useMemoryTree = () => {
  const { core } = useKibana();
  return useQuery({
    queryKey: memoryKeys.categories,
    queryFn: () =>
      core.http.get<{
        tree: MemoryCategoryNode[];
        uncategorized: Array<{ id: string; name: string; title: string }>;
      }>(`${MEMORY_BASE}/categories`),
  });
};

export const useMemoryEntry = (entryId?: string) => {
  const { core } = useKibana();
  return useQuery({
    queryKey: memoryKeys.byId(entryId!),
    queryFn: () => core.http.get<MemoryEntry>(`${MEMORY_BASE}/entries/${entryId}`),
    enabled: !!entryId,
  });
};

export const useMemorySearch = (query: string) => {
  const { core } = useKibana();
  return useQuery({
    queryKey: memoryKeys.search(query),
    queryFn: () =>
      core.http.post<{ results: MemorySearchResult[] }>(`${MEMORY_BASE}/search`, {
        body: JSON.stringify({ query }),
      }),
    enabled: query.length >= 2,
  });
};

export const useMemoryHistory = (entryId?: string) => {
  const { core } = useKibana();
  return useQuery({
    queryKey: memoryKeys.history(entryId!),
    queryFn: () =>
      core.http.get<{ history: MemoryVersionRecord[] }>(
        `${MEMORY_BASE}/entries/${entryId}/history`
      ),
    enabled: !!entryId,
  });
};

export const useMemoryVersion = (entryId?: string, version?: number) => {
  const { core } = useKibana();
  return useQuery({
    queryKey: memoryKeys.version(entryId!, version!),
    queryFn: () =>
      core.http.get<MemoryVersionRecord>(`${MEMORY_BASE}/entries/${entryId}/history/${version}`),
    enabled: !!entryId && version !== undefined,
  });
};

export const useRecentChanges = () => {
  const { core } = useKibana();
  return useQuery({
    queryKey: memoryKeys.recentChanges,
    queryFn: () =>
      core.http.get<{ changes: MemoryVersionRecord[] }>(`${MEMORY_BASE}/recent-changes`),
  });
};

export const useMemoryMutations = () => {
  const { core } = useKibana();
  const queryClient = useQueryClient();

  const invalidateMemory = () => {
    queryClient.invalidateQueries({ queryKey: memoryKeys.all });
  };

  const onMutationError = (error: unknown) => {
    core.notifications.toasts.addError(getFormattedError(error), {
      title: i18n.translate('xpack.streams.memory.mutationError', {
        defaultMessage: 'Failed to save memory entry.',
      }),
    });
  };

  const createEntry = useMutation({
    mutationFn: (params: {
      name: string;
      title: string;
      content: string;
      tags?: string[];
      categories?: string[];
    }) =>
      core.http.post<MemoryEntry>(`${MEMORY_BASE}/entries`, {
        body: JSON.stringify(params),
      }),
    onSuccess: invalidateMemory,
    onError: onMutationError,
  });

  const updateEntry = useMutation({
    mutationFn: ({
      id,
      ...params
    }: {
      id: string;
      title?: string;
      content?: string;
      tags?: string[];
      categories?: string[];
      change_summary?: string;
    }) =>
      core.http.put<MemoryEntry>(`${MEMORY_BASE}/entries/${id}`, {
        body: JSON.stringify(params),
      }),
    onSuccess: invalidateMemory,
    onError: onMutationError,
  });

  const deleteEntry = useMutation({
    mutationFn: (id: string) =>
      core.http.delete<{ deleted: boolean }>(`${MEMORY_BASE}/entries/${id}`),
    onSuccess: invalidateMemory,
    onError: onMutationError,
  });

  return { createEntry, updateEntry, deleteEntry };
};

const useMemoryTaskAction = (
  endpoint: string,
  actionName: string
): UseMutationResult<unknown, unknown, void> => {
  const { core } = useKibana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      core.http.post(endpoint, {
        body: JSON.stringify({ action: 'schedule' }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.all });
      core.notifications.toasts.addSuccess(
        i18n.translate('xpack.streams.memory.taskSuccess', {
          defaultMessage: '{actionName} queued. Results will appear once the workflow completes.',
          values: { actionName },
        })
      );
    },
    onError: (error) => {
      core.notifications.toasts.addError(
        error instanceof Error ? error : new Error(String(error)),
        {
          title: i18n.translate('xpack.streams.memory.taskError', {
            defaultMessage: '{actionName} failed.',
            values: { actionName },
          }),
        }
      );
    },
  });
};

export const useScrapeConversations = () => {
  return useMemoryTaskAction(
    `${MEMORY_BASE}/_scrape_conversations`,
    i18n.translate('xpack.streams.memory.scrapeActionName', {
      defaultMessage: 'Scrape conversations',
    })
  );
};

export const useConsolidateMemory = () => {
  return useMemoryTaskAction(
    `${MEMORY_BASE}/_consolidate`,
    i18n.translate('xpack.streams.memory.consolidateActionName', {
      defaultMessage: 'Consolidate memory',
    })
  );
};

export const useSynthesizeMemory = () => {
  return useMemoryTaskAction(
    `${MEMORY_BASE}/_synthesize`,
    i18n.translate('xpack.streams.memory.synthesizeActionName', {
      defaultMessage: 'Synthesize memory',
    })
  );
};

export const useDetectGaps = () => {
  return useMemoryTaskAction(
    `${MEMORY_BASE}/_detect_gaps`,
    i18n.translate('xpack.streams.memory.detectGapsActionName', {
      defaultMessage: 'Detect gaps',
    })
  );
};
