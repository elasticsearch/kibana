/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TimeRange } from '@kbn/es-query';
import type { EpisodesFilterState, EpisodesSortState } from './queries/episodes_query';

export const queryKeys = {
  all: ['alert-episodes'] as const,
  actionsAll: () => [...queryKeys.all, 'actions'] as const,
  actions: (spaceId: string, episodeIds: string[]) =>
    [...queryKeys.actionsAll(), spaceId, ...episodeIds] as const,
  groupActionsAll: () => [...queryKeys.all, 'group-actions'] as const,
  groupActions: (spaceId: string, groupHashes: string[]) =>
    [...queryKeys.groupActionsAll(), spaceId, ...groupHashes] as const,
  actionsHistoryAll: () => [...queryKeys.all, 'actions-history'] as const,
  actionsHistory: (spaceId: string, episodeId: string, groupHash: string) =>
    [...queryKeys.actionsHistoryAll(), spaceId, episodeId, groupHash] as const,
  listAll: () => [...queryKeys.all, 'list'] as const,
  list: (
    spaceId: string,
    pageSize: number,
    filterState?: EpisodesFilterState,
    sortState?: EpisodesSortState,
    timeRange?: { from: string; to: string } | null
  ) => [...queryKeys.listAll(), spaceId, pageSize, filterState, sortState, timeRange] as const,
  episodeAll: () => [...queryKeys.all, 'episode'] as const,
  episode: (spaceId: string, episodeId: string) =>
    [...queryKeys.episodeAll(), spaceId, episodeId] as const,
  episodeEventsAll: () => [...queryKeys.all, 'episode-events'] as const,
  episodeEvents: (spaceId: string, episodeId: string) =>
    [...queryKeys.episodeEventsAll(), spaceId, episodeId] as const,
  relatedSameGroupEpisodes: (
    spaceId: string,
    ruleId: string,
    groupHash: string,
    pageSize: number
  ) =>
    [
      ...queryKeys.all,
      'related-episodes-same-group',
      spaceId,
      ruleId,
      groupHash,
      pageSize,
    ] as const,
  relatedOtherEpisodes: (
    spaceId: string,
    ruleId: string,
    pageSize: number,
    currentGroupKey: string,
    excludeEpisodeId: string
  ) =>
    [
      ...queryKeys.all,
      'related-episodes-other',
      spaceId,
      ruleId,
      pageSize,
      currentGroupKey,
      excludeEpisodeId,
    ] as const,
  episodeEventDataAll: () => [...queryKeys.all, 'episode-event-data'] as const,
  episodeEventData: (spaceId: string, episodeId: string) =>
    [...queryKeys.episodeEventDataAll(), spaceId, episodeId] as const,
  tagOptionsAll: () => [...queryKeys.all, 'tag-options'] as const,
  tagOptions: (spaceId: string, timeRange?: { from: string; to: string } | null) =>
    [...queryKeys.tagOptionsAll(), spaceId, timeRange] as const,
  tagSuggestionsAll: () => [...queryKeys.all, 'tag-suggestions'] as const,
  tagSuggestions: (spaceId: string) => [...queryKeys.tagSuggestionsAll(), spaceId] as const,
  assigneeSuggestions: (searchTerm: string) =>
    [...queryKeys.all, 'assignee-suggestions', searchTerm] as const,
  bulkGetProfiles: (uids: string[]) => [...queryKeys.all, 'bulk-get-profiles', ...uids] as const,
  fetchRule: (id: string) => [...queryKeys.all, 'fetch-rule', id] as const,
  histogramAll: () => [...queryKeys.all, 'histogram'] as const,
  histogram: (
    spaceId: string | undefined,
    filterState: EpisodesFilterState,
    timeRange: TimeRange | undefined,
    breakdownField: string | undefined
  ) => [...queryKeys.histogramAll(), spaceId, filterState, timeRange, breakdownField] as const,
  currentUserProfile: () => [...queryKeys.all, 'current-user-profile'] as const,
  kpisAll: () => [...queryKeys.all, 'kpis'] as const,
  kpis: (
    spaceId: string,
    filterState?: EpisodesFilterState,
    timeRange?: { from: string; to: string } | null,
    currentUserUid?: string
  ) => [...queryKeys.kpisAll(), spaceId, filterState, timeRange, currentUserUid] as const,
};
