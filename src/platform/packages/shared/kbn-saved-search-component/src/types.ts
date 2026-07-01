/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import type { ISearchStartSearchSource } from '@kbn/data-plugin/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { NonPersistedDisplayOptions } from '@kbn/discover-plugin/common';
import type { CSSProperties } from 'react';
import type { SortOrder } from '@kbn/saved-search-plugin/public';
import type { DiscoverGridSettings } from '@kbn/saved-search-plugin/common';
import type { DataGridDensity } from '@kbn/unified-data-table';
import type { KibanaExecutionContext } from '@kbn/core-execution-context-common';

export interface SavedSearchComponentDependencies {
  embeddable: EmbeddableStart;
  searchSource: ISearchStartSearchSource;
  dataViews: DataViewsContract;
}

/**
 * Represents the table configuration of the saved search component
 * that can be persisted externally (e.g., in URL params or local storage)
 *
 * This includes user customizations related to how the data table is displayed:
 * columns selection, sorting, grid layout and row display options.
 */
export interface SavedSearchTableConfig {
  columns?: string[];
  sort?: SortOrder[];
  grid?: DiscoverGridSettings;
  rowHeight?: number;
  rowsPerPage?: number;
  density?: DataGridDensity;
  inTableSearchTerm?: string;
}

export interface SavedSearchComponentProps extends SavedSearchTableConfig {
  dependencies: SavedSearchComponentDependencies;
  index: string;
  timeRange?: TimeRange;
  query?: Query;
  filters?: Filter[];
  /**
   * Filters that should not trigger highlighting.
   * These filters will be included in the search query for document retrieval,
   * but excluded from the highlight_query parameter in Elasticsearch.
   */
  nonHighlightingFilters?: Filter[];
  timestampField?: string;
  height?: CSSProperties['height'];
  displayOptions?: NonPersistedDisplayOptions;
  onTableConfigChange?: (config: SavedSearchTableConfig) => void;
  /**
   * Called synchronously when the embeddable column state changes.
   * Return column names to substitute Discover default/Summary columns; return
   * undefined to keep the emitted columns.
   */
  resolveColumnsOnChange?: (columns: string[] | undefined) => string[] | undefined;
  executionContext?: KibanaExecutionContext;
}
