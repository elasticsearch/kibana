/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type {
  Column,
  ColumnSource,
  DataSourceBase,
  DataSourceKind,
  SerializedDataSource,
} from './src/types';

export { DataViewSource } from './src/sources/data_view_source';
export { EsqlSource } from './src/sources/esql_source';
export type { EsqlSourceArgs } from './src/sources/esql_source';

import type { EsqlSource } from './src/sources/esql_source';
import type { DataViewSource } from './src/sources/data_view_source';
/** Discriminated union of all concrete DataSource implementations. Narrowing on `kind` resolves to the concrete type — no casts needed. */
export type DataSource = EsqlSource | DataViewSource;
export { columnFromDataViewField, columnFromDatatableColumn } from './src/to_column';
export { DataSourceService } from './src/data_source_service';
export type { DataViewLookup } from './src/data_source_service';
export {
  registerEsqlSourceInDataViewsCache,
  unregisterFromDataViewsCache,
} from './src/cache_adapter';
