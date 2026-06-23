/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldStatsTableEmbeddableState } from '@kbn/data-visualizer-server-schemas/embeddables/field_stats';

// Pre-9.x stored panels used camelCase for these fields.
export interface LegacyFieldStatsFields {
  viewType?: FieldStatsTableEmbeddableState['view_type'];
  showDistributions?: boolean;
  dataViewId?: string;
}

type FieldStatsEsqlState = Extract<FieldStatsTableEmbeddableState, { view_type: 'esql' }>;
type FieldStatsDataViewState = Extract<FieldStatsTableEmbeddableState, { view_type: 'dataview' }>;

// Read branch-specific fields before `view_type` narrows the state.
type PartialFieldStatsState = Partial<
  FieldStatsTableEmbeddableState &
    Pick<FieldStatsEsqlState, 'query'> &
    Pick<FieldStatsDataViewState, 'data_view_id'>
>;

export type RawFieldStatsState = PartialFieldStatsState & LegacyFieldStatsFields;

export type NormalizedFieldStatsFields =
  | { view_type: 'dataview'; data_view_id: string; show_distributions: boolean }
  | { view_type: 'esql'; query: { esql: string }; show_distributions: boolean };

export const normalizeFieldStatsLegacyFields = (
  state: RawFieldStatsState
): NormalizedFieldStatsFields => {
  const query = state.query;
  const dataViewId = state.data_view_id ?? state.dataViewId;
  const showDistributions = state.show_distributions ?? state.showDistributions ?? false;
  const viewType = state.view_type ?? state.viewType ?? (query ? 'esql' : 'dataview');

  if (viewType === 'esql') {
    if (!query) {
      throw new Error(
        'Invalid field statistics embeddable state: query is required for ES|QL mode'
      );
    }
    return { view_type: 'esql', query, show_distributions: showDistributions };
  }
  if (!dataViewId) {
    throw new Error(
      'Invalid field statistics embeddable state: data_view_id is required for data view mode'
    );
  }
  return { view_type: 'dataview', data_view_id: dataViewId, show_distributions: showDistributions };
};
