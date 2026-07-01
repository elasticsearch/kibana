/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DataSetWithName,
  DatasetSettings,
  DatasetSettingsFile,
} from '../../common/dataset_types';
import {
  emptyCreateDatasetSettingsFormValues,
  type CreateDatasetFormValues,
  type CreateDatasetSettingsFormValues,
  type DatasetBooleanFormValue,
  type DatasetErrorModeFormValue,
  type DatasetFormatFormValue,
  type DatasetModeFormValue,
  type DatasetMultiValueSyntaxFormValue,
  type DatasetPartitionDetectionFormValue,
} from './create_dataset_flyout_form_state';

export const emptyDatasetFlyoutFormValues = (): CreateDatasetFormValues => ({
  name: '',
  description: '',
  data_source: '',
  resource: '',
  settings: emptyCreateDatasetSettingsFormValues(),
});

/** Maps a list-table row to flyout initial state (no extra GET). */
export const dataSetFromListItem = (item: DataSetWithName): DataSetWithName => ({
  ...item,
  description: item.description ?? '',
});

const boolToFormValue = (value: boolean | undefined): DatasetBooleanFormValue => {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
};

const settingsToFlyoutFormValues = (
  settings: DatasetSettings | undefined
): CreateDatasetSettingsFormValues => {
  const defaults = emptyCreateDatasetSettingsFormValues();
  if (!settings) {
    return defaults;
  }

  const s = settings as DatasetSettingsFile;

  return {
    ...defaults,
    format: (s.format ?? '') as DatasetFormatFormValue,
    partition_detection: (s.partition_detection ?? '') as DatasetPartitionDetectionFormValue,
    schema_sample_size: s.schema_sample_size !== undefined ? String(s.schema_sample_size) : '',
    delimiter: s.delimiter ?? '',
    mode: (s.mode ?? '') as DatasetModeFormValue,
    header_row: boolToFormValue(s.header_row),
    null_value: s.null_value ?? '',
    encoding: s.encoding ?? '',
    error_mode: (s.error_mode ?? '') as DatasetErrorModeFormValue,
    max_errors: s.max_errors !== undefined ? String(s.max_errors) : '',
    max_error_ratio: s.max_error_ratio !== undefined ? String(s.max_error_ratio) : '',
    quote: s.quote ?? '',
    escape: s.escape ?? '',
    comment: s.comment ?? '',
    column_prefix: s.column_prefix ?? '',
    datetime_format: s.datetime_format ?? '',
    multi_value_syntax: (s.multi_value_syntax ?? '') as DatasetMultiValueSyntaxFormValue,
    max_field_size: s.max_field_size !== undefined ? String(s.max_field_size) : '',
    segment_size: s.segment_size ?? '',
    optimized_reader: boolToFormValue(s.optimized_reader),
    late_materialization: boolToFormValue(s.late_materialization),
  };
};

export const dataSetToFlyoutFormValues = (data: DataSetWithName): CreateDatasetFormValues => ({
  name: data.name,
  description: data.description ?? '',
  data_source: data.data_source,
  resource: data.resource,
  settings: settingsToFlyoutFormValues(data.settings),
});
