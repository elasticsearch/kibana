/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataStreamDocsStat, DatasetUserPrivileges } from '../../../../common/api_types';
import type { DataStreamStat, DataStreamStatType } from '../../../../common/data_streams_stats';
import type { Integration } from '../../../../common/data_streams_stats/integration';
import type {
  DataStreamType,
  QualityIndicators,
  TableCriteria,
  TimeRangeConfig,
} from '../../../../common/types';
import type { DatasetTableSortField } from '../../../hooks';

interface FiltersCriteria {
  inactive: boolean;
  fullNames: boolean;
  timeRange: TimeRangeConfig;
  integrations: string[];
  namespaces: string[];
  qualities: QualityIndicators[];
  types: string[];
  query?: string;
}

export interface WithAuthorizedDatasetTypes {
  authorizedDatasetTypes: DataStreamType[];
}

export interface WithTableOptions {
  table: TableCriteria<DatasetTableSortField>;
}

export interface WithFilters {
  filters: FiltersCriteria;
}

export type DictionaryType<T> = Record<DataStreamType, T[]>;

export interface WithDataStreamStats {
  datasetUserPrivileges: DatasetUserPrivileges;
  dataStreamStats: DataStreamStatType[];
}

export interface WithTotalDocs {
  totalDocsStats: DictionaryType<DataStreamDocsStat>;
  loadedTotalDocsTypes: DataStreamType[];
}

export interface WithDegradedDocs {
  degradedDocStats: DataStreamDocsStat[];
}

export interface WithFailedDocs {
  failedDocStats: DataStreamDocsStat[];
}

export interface WithNonAggregatableDatasets {
  nonAggregatableDatasets: string[];
}

export interface WithDatasets {
  datasets: DataStreamStat[];
}

export interface WithIntegrations {
  integrations: Integration[];
}

export type DefaultDatasetQualityControllerState = WithTableOptions &
  WithDataStreamStats &
  WithTotalDocs &
  WithDegradedDocs &
  WithFailedDocs &
  WithDatasets &
  WithFilters &
  WithAuthorizedDatasetTypes &
  WithNonAggregatableDatasets &
  Partial<WithIntegrations>;

type DefaultDatasetQualityStateContext = DefaultDatasetQualityControllerState;

export type DatasetQualityControllerTypeState =
  | {
      value: 'initializing';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'initializationFailed';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.stats.datasets.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.stats.datasets.loaded';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.stats.docsStats.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.stats.degradedDocs.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.stats.failedDocs.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.stats.nonAggregatableDatasets.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.integrations.fetching';
      context: DefaultDatasetQualityStateContext;
    }
  | {
      value: 'main.nonAggregatableDatasets.fetching';
      context: DefaultDatasetQualityStateContext;
    };

export type DatasetQualityControllerContext = DatasetQualityControllerTypeState['context'];

export type DatasetQualityControllerEvent =
  | {
      type: 'UPDATE_TABLE_CRITERIA';
      dataset_criteria: TableCriteria<DatasetTableSortField>;
    }
  | {
      type: 'UPDATE_INSIGHTS_TIME_RANGE';
      timeRange: TimeRangeConfig;
    }
  | {
      type: 'TOGGLE_INACTIVE_DATASETS';
    }
  | {
      type: 'TOGGLE_FULL_DATASET_NAMES';
    }
  | {
      type: 'UPDATE_TIME_RANGE';
      timeRange: TimeRangeConfig;
    }
  | {
      type: 'REFRESH_DATA';
    }
  | {
      type: 'UPDATE_INTEGRATIONS';
      integrations: string[];
    }
  | {
      type: 'UPDATE_NAMESPACES';
      namespaces: string[];
    }
  | {
      type: 'UPDATE_QUALITIES';
      qualities: QualityIndicators[];
    }
  | {
      type: 'UPDATE_QUERY';
      query: string;
    }
  | {
      type: 'UPDATE_TYPES';
      types: DataStreamType[];
    }
  | {
      type: 'UPDATE_FAILURE_STORE';
      dataStream: DataStreamStat;
    }
  | { type: 'SAVE_TOTAL_DOCS_STATS'; data: DataStreamDocsStat[]; dataStreamType: DataStreamType }
  | { type: 'NOTIFY_TOTAL_DOCS_STATS_FAILED'; error: Error };
