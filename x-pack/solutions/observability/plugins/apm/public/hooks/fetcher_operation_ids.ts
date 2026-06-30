/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const FETCHER_OPERATION_IDS = {
  FETCH_FULL_TRACE_WATERFALL: 'fetch-full-trace-waterfall',
  FETCH_FOCUSED_TRACE_WATERFALL: 'fetch-focused-trace-waterfall',
  FETCH_SPAN_LINKS: 'fetch-span-links',
  FETCH_TRACE_ROOT_SPAN: 'fetch-trace-root-span',
  FETCH_TRACE_ERRORS: 'fetch-trace-errors',
} as const;

export type FetcherOperationId = (typeof FETCHER_OPERATION_IDS)[keyof typeof FETCHER_OPERATION_IDS];
