/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import useAsync from 'react-use/lib/useAsync';
import { PluginStart } from '@kbn/core-di';
import { useService } from '@kbn/core-di-browser';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DataView, DataViewSpec, FieldSpec } from '@kbn/data-views-plugin/common';

/**
 * Builds a display-only field spec. Execution-history rows come from a REST API, not a queryable
 * index, so these fields are never searched or aggregated client-side — `UnifiedDataTable` only
 * needs them to have a column identity, type, and label.
 *
 * `sortable` maps to `indexed`, which (with a sortable field type) is what `DataViewField.sortable`
 * keys off. Enable it only for columns the API can sort server-side.
 */
export const displayField = (
  name: string,
  type: string,
  customLabel: string,
  { sortable = false }: { sortable?: boolean } = {}
): FieldSpec => ({
  name,
  type,
  customLabel,
  searchable: false,
  aggregatable: false,
  indexed: sortable,
});

export interface AdHocDataViewState {
  dataView: DataView | undefined;
  isLoading: boolean;
  error: Error | undefined;
}

/**
 * Creates an in-memory, ad-hoc `DataView` from a static spec. `skipFetchFields` is always set
 * because the spec's `title` does not point at a real index; the fields are declared by us.
 * The spec is expected to be a stable module-level constant so the async create runs once.
 */
export const useAdHocDataView = (spec: DataViewSpec): AdHocDataViewState => {
  const dataViews = useService<DataViewsPublicPluginStart>(PluginStart('dataViews'));
  const { value, loading, error } = useAsync(() => dataViews.create(spec, true), [dataViews, spec]);
  return { dataView: value, isLoading: loading, error };
};
