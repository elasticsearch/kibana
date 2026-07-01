/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DatasetSettings, DatasetSettingsFile } from '../../common/dataset_types';

import { createDatasetFlyoutStrings } from './create_dataset_flyout_i18n';

export type DatasetFormatFormValue = '' | 'parquet' | 'csv' | 'tsv' | 'ndjson' | 'orc';
export type DatasetErrorModeFormValue = '' | 'fail_fast' | 'skip_row' | 'null_field';
export type DatasetModeFormValue = '' | 'quoted' | 'escaped' | 'plain';
export type DatasetMultiValueSyntaxFormValue = '' | 'none' | 'brackets';
export type DatasetPartitionDetectionFormValue = '' | 'auto' | 'hive' | 'template' | 'none';
export type DatasetBooleanFormValue = '' | 'true' | 'false';

export interface CreateDatasetSettingsFormValues {
  format: DatasetFormatFormValue;
  partition_detection: DatasetPartitionDetectionFormValue;
  schema_sample_size: string;
  // CSV/TSV commonly changed
  delimiter: string;
  mode: DatasetModeFormValue;
  header_row: DatasetBooleanFormValue;
  null_value: string;
  encoding: string;
  // CSV/TSV error handling
  error_mode: DatasetErrorModeFormValue;
  max_errors: string;
  max_error_ratio: string;
  // CSV/TSV advanced
  quote: string;
  escape: string;
  comment: string;
  column_prefix: string;
  datetime_format: string;
  multi_value_syntax: DatasetMultiValueSyntaxFormValue;
  max_field_size: string;
  // NDJSON advanced
  segment_size: string;
  // Parquet advanced
  optimized_reader: DatasetBooleanFormValue;
  late_materialization: DatasetBooleanFormValue;
}

export interface CreateDatasetFormValues {
  name: string;
  description: string;
  data_source: string;
  resource: string;
  settings: CreateDatasetSettingsFormValues;
}

export const emptyCreateDatasetSettingsFormValues = (): CreateDatasetSettingsFormValues => ({
  format: '',
  partition_detection: '',
  schema_sample_size: '',
  delimiter: '',
  mode: '',
  header_row: '',
  null_value: '',
  encoding: '',
  error_mode: '',
  max_errors: '',
  max_error_ratio: '',
  quote: '',
  escape: '',
  comment: '',
  column_prefix: '',
  datetime_format: '',
  multi_value_syntax: '',
  max_field_size: '',
  segment_size: '',
  optimized_reader: '',
  late_materialization: '',
});

const parseOptionalPositiveInteger = (value: string): number | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
};

const parseNonNegativeInteger = (value: string): number | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
};

const parseRatio = (value: string): number | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (isNaN(parsed) || parsed < 0 || parsed > 1) return undefined;
  return parsed;
};

const parseBooleanFormValue = (value: DatasetBooleanFormValue): boolean | undefined => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

export const validateSchemaSampleSize = (value: string): true | string => {
  const parsed = parseOptionalPositiveInteger(value);
  if (value?.trim() && parsed === undefined) {
    return createDatasetFlyoutStrings.settingsSchemaSampleSizeInvalid();
  }
  return true;
};

export const validateMaxErrors = (value: string): true | string => {
  if (!value?.trim()) return true;
  const parsed = parseNonNegativeInteger(value);
  if (parsed === undefined) return createDatasetFlyoutStrings.settingsMaxErrorsInvalid();
  return true;
};

export const validateMaxErrorRatio = (value: string): true | string => {
  if (!value?.trim()) return true;
  const parsed = parseRatio(value);
  if (parsed === undefined) return createDatasetFlyoutStrings.settingsMaxErrorRatioInvalid();
  return true;
};

export const validateMaxFieldSize = (value: string): true | string => {
  if (!value?.trim()) return true;
  const parsed = parseNonNegativeInteger(value);
  if (parsed === undefined) return createDatasetFlyoutStrings.settingsMaxFieldSizeInvalid();
  return true;
};

/**
 * Maps flyout form values to settings for the API payload.
 *
 * The form uses empty strings for "unset"; the API uses omitted fields.
 * Fields are filtered to only the subset valid for the chosen format so that
 * leftover values from a previously-selected format don't leak into the payload.
 */
export const buildDatasetSettingsFromFormValues = (
  settings: CreateDatasetSettingsFormValues
): DatasetSettings | undefined => {
  const applied: DatasetSettingsFile = {};

  if (settings.format) applied.format = settings.format;
  if (settings.partition_detection) applied.partition_detection = settings.partition_detection;

  const { format } = settings;
  const isCsvTsv = format === 'csv' || format === 'tsv';
  const isNdjson = format === 'ndjson';
  const isParquet = format === 'parquet';

  if (isCsvTsv) {
    if (settings.delimiter) applied.delimiter = settings.delimiter;
    if (settings.mode) applied.mode = settings.mode;

    const headerRow = parseBooleanFormValue(settings.header_row);
    if (headerRow !== undefined) applied.header_row = headerRow;

    if (settings.null_value) applied.null_value = settings.null_value;
    if (settings.encoding) applied.encoding = settings.encoding;
    if (settings.error_mode) applied.error_mode = settings.error_mode;

    const maxErrors = parseNonNegativeInteger(settings.max_errors);
    if (maxErrors !== undefined) applied.max_errors = maxErrors;

    const maxErrorRatio = parseRatio(settings.max_error_ratio);
    if (maxErrorRatio !== undefined) applied.max_error_ratio = maxErrorRatio;

    if (settings.quote) applied.quote = settings.quote;
    if (settings.escape) applied.escape = settings.escape;
    if (settings.comment) applied.comment = settings.comment;
    if (settings.column_prefix) applied.column_prefix = settings.column_prefix;
    if (settings.datetime_format) applied.datetime_format = settings.datetime_format;
    if (settings.multi_value_syntax) applied.multi_value_syntax = settings.multi_value_syntax;

    const maxFieldSize = parseNonNegativeInteger(settings.max_field_size);
    if (maxFieldSize !== undefined) applied.max_field_size = maxFieldSize;
  }

  if (isCsvTsv || isNdjson) {
    const schemaSampleSize = parseOptionalPositiveInteger(settings.schema_sample_size);
    if (schemaSampleSize !== undefined) applied.schema_sample_size = schemaSampleSize;
  }

  if (isNdjson) {
    if (settings.segment_size) applied.segment_size = settings.segment_size;
  }

  if (isParquet) {
    const optimizedReader = parseBooleanFormValue(settings.optimized_reader);
    if (optimizedReader !== undefined) applied.optimized_reader = optimizedReader;

    const lateMaterialization = parseBooleanFormValue(settings.late_materialization);
    if (lateMaterialization !== undefined) applied.late_materialization = lateMaterialization;
  }

  return Object.keys(applied).length > 0 ? applied : undefined;
};
