/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type { RequestAdapter } from '@kbn/inspector-plugin/common';
import type { AggregateQuery, Filter, ProjectRouting, Query } from '@kbn/es-query';
import type { Serializable, SerializableRecord } from '@kbn/utility-types';
import type { PersistableStateService } from '@kbn/kibana-utils-plugin/common';
import type { ISearchOptions } from '@kbn/search-types';
import type { DataView, DataViewSpec } from '@kbn/data-views-plugin/common';
import type { SearchField } from '@kbn/es-types';
import type { AggConfigSerialized, IAggConfigs } from '../../../public';
import type { SearchSource } from './search_source';

/**
 * search source interface
 * @public
 */
export type ISearchSource = Pick<SearchSource, keyof SearchSource>;

/**
 * high level search service
 * @public
 */
export interface ISearchStartSearchSource
  extends PersistableStateService<SerializedSearchSourceFields> {
  /**
   * creates {@link SearchSource} based on provided serialized {@link SearchSourceFields}
   * @param fields
   */
  create: (fields?: SerializedSearchSourceFields) => Promise<ISearchSource>;

  createLazy: (fields?: SerializedSearchSourceFields) => Promise<ISearchSource>;
  /**
   * creates empty {@link SearchSource}
   */
  createEmpty: () => ISearchSource;
}

export enum SortDirection {
  asc = 'asc',
  desc = 'desc',
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SortDirectionFormat = {
  order: SortDirection;
  format?: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SortDirectionNumeric = {
  order: SortDirection;
  numeric_type?: 'double' | 'long' | 'date' | 'date_nanos';
};

export type EsQuerySortValue = Record<
  string,
  SortDirection | SortDirectionNumeric | SortDirectionFormat
>;

export type SearchFieldValue = SearchField & Serializable;

/**
 * search source fields
 */
export interface SearchSourceFields {
  type?: string;
  /**
   * {@link Query}
   */
  query?: Query | AggregateQuery;
  /**
   * {@link Filter}
   */
  filter?: Filter[] | Filter | (() => Filter[] | Filter | undefined);
  /**
   * Filters that should not trigger highlighting.
   * These filters will be included in the search query for document retrieval,
   * but excluded from the highlight_query parameter in Elasticsearch.
   * {@link Filter}
   */
  nonHighlightingFilters?: Filter[];
  /**
   * {@link EsQuerySortValue}
   */
  sort?: EsQuerySortValue | EsQuerySortValue[];
  highlight?: SerializableRecord;
  highlightAll?: boolean;
  trackTotalHits?: boolean | number;
  /**
   * {@link AggConfigs}
   */
  aggs?: object | IAggConfigs | (() => object);
  from?: number;
  size?: number;
  source?: boolean | estypes.Fields;
  version?: boolean;
  /**
   * Retrieve fields via the search Fields API
   */
  fields?: SearchFieldValue[];
  /**
   * Retreive fields directly from _source (legacy behavior)
   *
   * @deprecated It is recommended to use `fields` wherever possible.
   */
  fieldsFromSource?: estypes.Fields;
  /**
   * {@link IndexPatternService}
   */
  index?: DataView;
  timeout?: string;
  terminate_after?: number;
  searchAfter?: estypes.SortResults;
  /**
   * Allow querying to use a point-in-time ID for paging results
   */
  pit?: estypes.SearchPointInTimeReference;
  /**
   * {@link ProjectRouting}
   */
  projectRouting?: ProjectRouting;
  timezone?: string;

  parent?: SearchSourceFields;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type SerializedSearchSourceFields = {
  type?: string;
  /**
   * {@link Query}. Legacy saved objects may also store a bare Lucene string, which is normalized when hydrating a search source.
   */
  query?: Query | AggregateQuery | string;
  /**
   * {@link Filter}
   */
  filter?: Filter[];
  /**
   * Filters that should not trigger highlighting.
   * These filters will be included in the search query for document retrieval,
   * but excluded from the highlight_query parameter in Elasticsearch.
   * {@link Filter}
   */
  nonHighlightingFilters?: Filter[];
  /**
   * {@link EsQuerySortValue}
   */
  sort?: EsQuerySortValue[];
  highlight?: SerializableRecord;
  highlightAll?: boolean;
  trackTotalHits?: boolean | number;
  // todo: needs aggconfigs serializable type
  /**
   * {@link AggConfigs}
   */
  aggs?: AggConfigSerialized[];
  from?: number;
  size?: number;
  source?: boolean | estypes.Fields;
  version?: boolean;
  /**
   * Retrieve fields via the search Fields API
   */
  fields?: SearchFieldValue[];
  /**
   * Retreive fields directly from _source (legacy behavior)
   *
   * @deprecated It is recommended to use `fields` wherever possible.
   */
  fieldsFromSource?: estypes.Fields;
  /**
   * {@link IndexPatternService}
   */
  index?: string | DataViewSpec;
  searchAfter?: estypes.SortResults;
  timeout?: string;
  terminate_after?: number;
  /**
   * {@link ProjectRouting}
   */
  projectRouting?: ProjectRouting;
  timezone?: string;

  parent?: SerializedSearchSourceFields;
};

export interface SearchSourceOptions {
  callParentStartHandlers?: boolean;
}

export function isSerializedSearchSource(
  maybeSerializedSearchSource: unknown
): maybeSerializedSearchSource is SerializedSearchSourceFields {
  return (
    typeof maybeSerializedSearchSource === 'object' &&
    maybeSerializedSearchSource !== null &&
    !Array.isArray(maybeSerializedSearchSource)
  );
}

export interface IInspectorInfo {
  adapter?: RequestAdapter;
  title: string;
  id?: string;
  description?: string;
}

export interface SearchSourceSearchOptions extends ISearchOptions {
  /**
   * Inspector integration options
   */
  inspector?: IInspectorInfo;

  /**
   * Set to true to disable warning toasts and customize warning display
   */
  disableWarningToasts?: boolean;
}
