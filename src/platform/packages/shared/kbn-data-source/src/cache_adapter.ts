/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import { ESQL_TYPE } from '@kbn/data-view-utils';
import { KBN_FIELD_TYPES } from '@kbn/field-types';
import type { EsqlSource } from './sources/esql_source';
import { columnToFieldBase } from './to_column';
import type { Column } from './types';

/**
 * Transitional shim. Registers a thin DataView in the `dataViewsService` cache so that
 * consumers still calling `dataViewsService.get(id)` for ES|QL ids keep resolving.
 * Delete this file once all such consumers migrate to `DataSourceService.get()`.
 *
 * Uses `skipFetchFields: true` — fields come from the `EsqlSource`'s columns, no `_field_caps`.
 * The cache is cleared first so re-registration picks up fresh columns when the query changes.
 */
export async function registerEsqlSourceInDataViewsCache(
  dataViews: DataViewsPublicPluginStart,
  source: EsqlSource
): Promise<DataView> {
  dataViews.clearInstanceCache(source.id);
  const dataView = await dataViews.create(
    {
      id: source.id,
      title: source.title,
      type: ESQL_TYPE,
      timeFieldName: source.timeFieldName,
      fields: makeFieldsSpec(source.getColumns(), source.timeFieldName),
    },
    true // skipFetchFields — never call _field_caps for ES|QL adapter DVs
  );
  return dataView;
}

export function unregisterFromDataViewsCache(
  dataViews: DataViewsPublicPluginStart,
  id: string
): void {
  dataViews.clearInstanceCache(id);
}

function makeFieldsSpec(columns: readonly Column[], timeFieldName?: string) {
  const spec = Object.fromEntries(
    columns.map((col) => [
      col.name,
      { ...columnToFieldBase(col), searchable: true, aggregatable: true },
    ])
  );
  // TODO: Remove once Discover's Redux state holds EsqlSource directly instead of a DataView shim.
  // DataView.isTimeBased() requires the time field to exist in the fields list
  // (not just timeFieldName being set on the spec). On first load resultColumns is empty,
  // so we inject a minimal entry to satisfy that check and enable the timepicker.
  if (timeFieldName && !spec[timeFieldName]) {
    spec[timeFieldName] = {
      name: timeFieldName,
      type: KBN_FIELD_TYPES.DATE,
      esTypes: ['date'],
      searchable: true,
      aggregatable: true,
    };
  }
  return spec;
}
