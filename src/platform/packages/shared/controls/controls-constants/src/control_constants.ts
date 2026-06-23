/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Do not change constant values - part of public REST APIs
export const ESQL_CONTROL = 'esql_control';
export const OPTIONS_LIST_CONTROL = 'options_list_control';
export const RANGE_SLIDER_CONTROL = 'range_slider_control';
export const TIME_SLIDER_CONTROL = 'time_slider_control';

export const DEFAULT_DATA_CONTROL_STATE = {
  use_global_filters: true,
  ignore_validations: false,
};

export enum ControlValuesSource {
  FIELD = 'field',
  ESQL = 'esql',
}
export const DEFAULT_CONTROL_VALUES_SOURCE = ControlValuesSource.FIELD;
export const SELECTIONS_MAX = 10000;
