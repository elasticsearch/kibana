/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getHistoryFilters } from '../actions/history_filter_storage';

export type StaticPage =
  | 'base'
  | 'overview'
  | 'live_queries'
  | 'live_query_new'
  | 'history'
  | 'new_query'
  | 'packs'
  | 'pack_add'
  | 'saved_queries'
  | 'saved_query_new';

export type DynamicPage =
  | 'live_query_details'
  | 'history_details'
  | 'history_scheduled_details'
  | 'pack_edit'
  | 'saved_query_edit';

export type Page = StaticPage | DynamicPage;

export interface DynamicPagePathValues {
  [key: string]: string;
}

// If routing paths are changed here, please also check to see if
// `pagePathGetters()`, below, needs any modifications
export const PAGE_ROUTING_PATHS = {
  overview: '/',
  live_queries: '/live_queries',
  live_query_new: '/live_queries/new',
  live_query_details: '/live_queries/:liveQueryId',
  history: '/history',
  history_details: '/history/:liveQueryId',
  history_scheduled_details: '/history/scheduled/:scheduleId/:executionCount',
  new_query: '/new',
  packs: '/packs',
  pack_add: '/packs/add',
  pack_edit: '/packs/:packId/edit',
  saved_queries: '/saved_queries',
  saved_query_new: '/saved_queries/new',
  saved_query_edit: '/saved_queries/:savedQueryId',
};

export const pagePathGetters: {
  [key in StaticPage]: () => string;
} & {
  [key in DynamicPage]: (values: DynamicPagePathValues) => string;
} = {
  base: () => '/',
  overview: () => '/',
  live_queries: () => '/live_queries',
  live_query_new: () => '/live_queries/new',
  live_query_details: ({ liveQueryId }) => `/live_queries/${liveQueryId}`,
  // Note: unlike other getters, history() reads sessionStorage to restore persisted filters.
  history: () => `/history${getHistoryFilters()}`,
  history_details: ({ liveQueryId }) => `/history/${liveQueryId}`,
  history_scheduled_details: ({ scheduleId, executionCount }) =>
    `/history/scheduled/${scheduleId}/${executionCount}`,
  new_query: () => '/new',
  saved_queries: () => '/saved_queries',
  saved_query_new: () => '/saved_queries/new',
  saved_query_edit: ({ savedQueryId }) => `/saved_queries/${savedQueryId}`,
  packs: () => '/packs',
  pack_add: () => '/packs/add',
  pack_edit: ({ packId }) => `/packs/${packId}/edit`,
};
