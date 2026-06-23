/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DATA_VIEW_SAVED_OBJECT_TYPE } from '@kbn/data-views-plugin/common';
import type { Reference } from '@kbn/content-management-utils';
import type { FieldStatsTableEmbeddableState } from '@kbn/data-visualizer-server-schemas/embeddables/field_stats';
import type { StoredFieldStatisticsTableEmbeddableState } from './types';
import { FIELD_STATS_DATA_VIEW_REF_NAME } from './constants';

export function transformIn(state: FieldStatsTableEmbeddableState): {
  state: StoredFieldStatisticsTableEmbeddableState;
  references: Reference[];
} {
  if (state.view_type === 'dataview') {
    const { data_view_id, ...rest } = state;
    return {
      state: rest,
      references: [
        {
          type: DATA_VIEW_SAVED_OBJECT_TYPE,
          name: FIELD_STATS_DATA_VIEW_REF_NAME,
          id: data_view_id,
        },
      ],
    };
  }
  return { state, references: [] };
}
