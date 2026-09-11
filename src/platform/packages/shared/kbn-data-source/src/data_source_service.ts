/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { EsqlSource } from './sources/esql_source';
import { DataViewSource } from './sources/data_view_source';

type DataSource = EsqlSource | DataViewSource;

/**
 * Minimal DataView lookup contract used by `DataSourceService`.
 *
 * Decoupled from the full `DataViewsPublicPluginStart` contract so the service
 * is easy to test and not tied to a specific plugin lifecycle. The Kibana
 * `dataViewsService` already satisfies this shape.
 */
export interface DataViewLookup {
  get(id: string): Promise<DataView>;
}

const ESQL_ID_PREFIX = 'esql-';

/**
 * Polymorphic registry that resolves any data-source id to a `DataSource`.
 *
 * `EsqlSource` registration is consumer-owned: the code that runs the query
 * calls `registerEsqlSource()` and `unregisterEsqlSource()` on teardown.
 * Multiple registrations of the same id are last-write-wins.
 */
export class DataSourceService {
  private readonly esqlSources = new Map<string, EsqlSource>();

  constructor(private readonly dataViews: DataViewLookup) {}

  public async get(id: string): Promise<DataSource | undefined> {
    if (id.startsWith(ESQL_ID_PREFIX)) {
      return this.esqlSources.get(id);
    }
    try {
      const dataView = await this.dataViews.get(id);
      return new DataViewSource(dataView);
    } catch {
      return undefined;
    }
  }

  /** Synchronous alternative to `get()` for callers that already have a `DataView` in hand. */
  public fromDataView(dataView: DataView): DataSource | undefined {
    if (!dataView.id) return undefined;
    if (dataView.id.startsWith(ESQL_ID_PREFIX)) {
      return this.esqlSources.get(dataView.id);
    }
    return new DataViewSource(dataView);
  }

  public registerEsqlSource(source: EsqlSource): void {
    this.esqlSources.set(source.id, source);
  }

  public unregisterEsqlSource(id: string): void {
    this.esqlSources.delete(id);
  }
}
