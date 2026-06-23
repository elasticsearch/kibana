/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Reference } from '@kbn/content-management-utils';
import { flow } from 'lodash';
import { transformTimeRangeOut, transformTitlesOut } from '@kbn/presentation-publishing';
import type { FieldStatsTableEmbeddableState } from '@kbn/data-visualizer-server-schemas/embeddables/field_stats';
import type { StoredFieldStatisticsTableEmbeddableState } from './types';
import { FIELD_STATS_DATA_VIEW_REF_NAME } from './constants';
import { normalizeFieldStatsLegacyFields, type RawFieldStatsState } from './normalize_legacy_state';

export function transformOut(
  storedState: RawFieldStatsState,
  references?: Reference[]
): FieldStatsTableEmbeddableState {
  const state = flow(
    transformTitlesOut<StoredFieldStatisticsTableEmbeddableState>,
    transformTimeRangeOut<StoredFieldStatisticsTableEmbeddableState>
  )(storedState as StoredFieldStatisticsTableEmbeddableState) as RawFieldStatsState;

  const dataViewId =
    references?.find((ref) => ref.name === FIELD_STATS_DATA_VIEW_REF_NAME)?.id ??
    state.data_view_id ??
    state.dataViewId;

  const normalized = normalizeFieldStatsLegacyFields({ ...state, data_view_id: dataViewId });

  const {
    view_type: _viewType,
    data_view_id: _dataViewId,
    query: _query,
    show_distributions: _showDistributions,
    viewType: _legacyViewType,
    dataViewId: _legacyDataViewId,
    showDistributions: _legacyShowDistributions,
    ...passthrough
  } = state;

  return { ...passthrough, ...normalized };
}
