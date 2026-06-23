/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ControlGroupRuntimeState } from '@kbn/control-group-renderer';
import type { OptionsListDSLControlState } from '@kbn/controls-schemas';
import type { Filter } from '@kbn/es-query';
import { ALERT_DURATION, ALERT_RULE_NAME, ALERT_START, ALERT_STATUS } from '@kbn/rule-data-utils';
import { ControlValuesSource, DEFAULT_DSL_OPTIONS_LIST_STATE } from '@kbn/controls-constants';

export interface ControlGroupOutput {
  loading: boolean;
  rendered: boolean;
  dataViewIds: string[];
  filters: Filter[];
}

export const sampleOutputData: ControlGroupOutput = {
  loading: false,
  rendered: true,
  dataViewIds: ['alert-filters-test-dv'],
  filters: [
    {
      meta: {
        index: 'alert-filters-test-dv',
        key: 'kibana.alert.building_block_type',
        negate: true,
      },
      query: {
        exists: {
          field: 'kibana.alert.building_block_type',
        },
      },
    },
  ],
};

export const initialInputData = {
  initialChildControlState: {
    '0': {
      type: 'options_list_control',
      grow: true,
      order: 0,
      width: 'small',
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      values_source: ControlValuesSource.FIELD,
      data_view_id: 'alert-filters-test-dv',
      field_name: ALERT_STATUS,
      title: 'Status',
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        placeholder: '',
      },
    },
    '1': {
      type: 'options_list_control',
      grow: true,
      order: 1,
      width: 'small',
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      values_source: ControlValuesSource.FIELD,
      data_view_id: 'alert-filters-test-dv',
      field_name: ALERT_RULE_NAME,
      title: 'Rule',
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        placeholder: '',
      },
    },
    '2': {
      type: 'options_list_control',
      grow: true,
      order: 2,
      width: 'small',
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      values_source: ControlValuesSource.FIELD,
      data_view_id: 'alert-filters-test-dv',
      field_name: ALERT_START,
      title: 'Started at',
      exists_selected: true,
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        placeholder: '',
      },
    },
    '3': {
      type: 'options_list_control',
      grow: true,
      order: 3,
      width: 'small',
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      values_source: ControlValuesSource.FIELD,
      data_view_id: 'alert-filters-test-dv',
      field_name: ALERT_DURATION,
      title: 'Duration',
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        placeholder: '',
      },
    },
    '4': {
      type: 'options_list_control',
      grow: true,
      order: 4,
      width: 'small',
      ...DEFAULT_DSL_OPTIONS_LIST_STATE,
      values_source: ControlValuesSource.FIELD,
      data_view_id: 'alert-filters-test-dv',
      field_name: 'host.name',
      title: 'Host',
      display_settings: {
        hide_exclude: true,
        hide_sort: true,
        placeholder: '',
      },
    },
  },
  ignoreParentSettings: {
    ignoreFilters: false,
    ignoreQuery: false,
    ignoreTimerange: false,
    ignoreValidations: false,
  },
} as unknown as ControlGroupRuntimeState<OptionsListDSLControlState>;
