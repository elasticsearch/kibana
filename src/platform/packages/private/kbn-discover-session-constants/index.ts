/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const SavedSearchType = 'search';
// While the legacy SO name has to stay "search" the display name can be customized.
export const SavedSearchTypeDisplayName = 'discover session'; // visible on Saved Objects page

export const LATEST_VERSION = 1;

export const MIN_SAVED_SEARCH_SAMPLE_SIZE = 1;
export const MAX_SAVED_SEARCH_SAMPLE_SIZE = 10000;

export const MAX_DISCOVER_SESSION_COLUMNS = 10_000;
export const MAX_DISCOVER_SESSION_COLUMNS_SERVERLESS = 50;
export const MAX_DISCOVER_SESSION_TABS = 25;

export const MAX_SESSION_TITLE_LENGTH = 256;
export const MAX_SESSION_DESCRIPTION_LENGTH = 1000;
export const MAX_TAB_LABEL_LENGTH = 120;
export const MAX_BREAKDOWN_FIELD_LENGTH = 1000;
export const MAX_VIS_CONTEXT_ATTRIBUTE_KEY_LENGTH = 256;
export const MAX_DISCOVER_SESSION_CONTROL_PANELS = 100;
export const MAX_DISCOVER_SESSION_TAGS = 1000;
export const MAX_SEARCH_QUERY_LENGTH = 1000;
export const MAX_METRICS_TAB_DIMENSIONS = 5;
export const MAX_METRICS_TAB_STATE_STRING_LENGTH = 1000;

/**
 * Aggregations supported by the metrics grid.
 * Values match ES|QL's FunctionNames enum (avg, sum, min, max).
 */
export const METRICS_GRID_SIMPLE_AGGREGATIONS = ['avg', 'sum', 'min', 'max'] as const;

export const METRICS_GRID_HISTOGRAM_PERCENTILES = ['p50', 'p75', 'p90', 'p95', 'p99'] as const;

export type SavedSearchContentType = typeof SavedSearchType;

export enum VIEW_MODE {
  DOCUMENT_LEVEL = 'documents',
  AGGREGATED_LEVEL = 'aggregated',
  PATTERN_LEVEL = 'patterns',
}

export enum DataGridDensity {
  COMPACT = 'compact',
  EXPANDED = 'expanded',
  NORMAL = 'normal',
}

export enum UnifiedHistogramSuggestionType {
  unsupported = 'unsupported',
  lensSuggestion = 'lensSuggestion',
  histogramForESQL = 'histogramForESQL',
  histogramForDataView = 'histogramForDataView',
}

/** Identifies the experience represented by a Discover tab. */
export enum DiscoverTabType {
  Default = 'default',
  Metrics = 'metrics',
}
