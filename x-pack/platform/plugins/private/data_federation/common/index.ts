/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export type { DataSource, DataSourceType, DataSourceWithSecrets } from './datasource_types';
export {
  ALL_DATA_SOURCE_TYPES,
  DATA_SOURCE_TYPES_TO_HELP_TEXT,
  DATA_SOURCE_TYPES_TO_ICONS,
} from './datasource_types';

export const PLUGIN_ID = 'data_federation';

/** Base path for this plugin's HTTP APIs (internal). */
export const INTERNAL_API_BASE_PATH = '/internal/data_federation' as const;

/** GET — list data sources (proxies to Elasticsearch `GET /_query/datasource`). */
export const DATA_SOURCES_LIST_ROUTE_PATH = `${INTERNAL_API_BASE_PATH}/data_sources` as const;

/**
 * By-id data source routes (Kibana path; `{id}` is a path parameter).
 * - GET → Elasticsearch `GET /_query/datasource/{id}`
 * - PUT → Elasticsearch `PUT /_query/datasource/{id}` (create data source)
 * - DELETE → Elasticsearch `DELETE /_query/datasource/{id}`
 */
export const DATA_SOURCE_BY_ID_ROUTE_PATH = `${INTERNAL_API_BASE_PATH}/data_sources/{id}` as const;

/** Resolves `DATA_SOURCE_BY_ID_ROUTE_PATH` with a URL-encoded id segment. */
export function getDataSourceByIdApiPath(id: string): string {
  return DATA_SOURCE_BY_ID_ROUTE_PATH.replace('{id}', encodeURIComponent(id));
}

/** GET — list data sets (proxies to Elasticsearch `GET /_query/data_set`). */
export const DATA_SETS_LIST_ROUTE_PATH = `${INTERNAL_API_BASE_PATH}/dataset` as const;

/**
 * By-id data set routes (Kibana path; `{id}` is a path parameter).
 * - GET → Elasticsearch `GET /_query/data_set/{id}`
 * - PUT → Elasticsearch `PUT /_query/data_set/{id}` (create data set)
 * - DELETE → Elasticsearch `DELETE /_query/data_set/{id}`
 */
export const DATA_SET_BY_ID_ROUTE_PATH = `${INTERNAL_API_BASE_PATH}/dataset/{id}` as const;

/** Resolves `DATA_SET_BY_ID_ROUTE_PATH` with a URL-encoded id segment. */
export function getDataSetByIdApiPath(id: string): string {
  return DATA_SET_BY_ID_ROUTE_PATH.replace('{id}', encodeURIComponent(id));
}

export type { Dataset, DataSetWithName, DatasetSettings } from './dataset_types';

export const PLUGIN_NAME = i18n.translate('xpack.dataFederation.pluginName', {
  defaultMessage: 'ES|QL Data Federation',
});

const DATA_SOURCES_PATH = '/_query/data_source';
const DATA_SETS_PATH = '/_query/dataset';
export const DATA_SOURCE_BY_ID_PATH = `${DATA_SOURCES_PATH}/{id}`;
export const DATA_SET_BY_ID_PATH = `${DATA_SETS_PATH}/{id}`;
