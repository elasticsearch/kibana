/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonEmpty,
  EuiFieldNumber,
  EuiFieldText,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { Control } from 'react-hook-form';
import { useController, useWatch } from 'react-hook-form';

import { createDatasetFlyoutStrings } from './create_dataset_flyout_i18n';
import {
  validateMaxErrorRatio,
  validateMaxErrors,
  validateMaxFieldSize,
  validateSchemaSampleSize,
  type CreateDatasetFormValues,
  type DatasetBooleanFormValue,
  type DatasetFormatFormValue,
} from './create_dataset_flyout_form_state';

// ---------------------------------------------------------------------------
// Module-level option factories — shared across components so each select
// renders consistently wherever it appears.
// ---------------------------------------------------------------------------

const FORMAT_OPTIONS = () => [
  { value: '', text: createDatasetFlyoutStrings.settingsFormatPlaceholder() },
  { value: 'csv', text: createDatasetFlyoutStrings.settingsFormatCsv() },
  { value: 'tsv', text: createDatasetFlyoutStrings.settingsFormatTsv() },
  { value: 'ndjson', text: createDatasetFlyoutStrings.settingsFormatNdjson() },
  { value: 'parquet', text: createDatasetFlyoutStrings.settingsFormatParquet() },
  { value: 'orc', text: createDatasetFlyoutStrings.settingsFormatOrc() },
];

const PARTITION_DETECTION_OPTIONS = () => [
  { value: '', text: createDatasetFlyoutStrings.settingsPartitionDetectionPlaceholder() },
  { value: 'auto', text: createDatasetFlyoutStrings.settingsPartitionDetectionAuto() },
  { value: 'hive', text: createDatasetFlyoutStrings.settingsPartitionDetectionHive() },
  { value: 'template', text: createDatasetFlyoutStrings.settingsPartitionDetectionTemplate() },
  { value: 'none', text: createDatasetFlyoutStrings.settingsPartitionDetectionNone() },
];

const ERROR_MODE_OPTIONS = () => [
  { value: '', text: createDatasetFlyoutStrings.settingsErrorModePlaceholder() },
  { value: 'fail_fast', text: createDatasetFlyoutStrings.settingsErrorModeFailFast() },
  { value: 'skip_row', text: createDatasetFlyoutStrings.settingsErrorModeSkipRow() },
  { value: 'null_field', text: createDatasetFlyoutStrings.settingsErrorModeNullField() },
];

const MODE_OPTIONS = () => [
  { value: '', text: createDatasetFlyoutStrings.settingsModePlaceholder() },
  { value: 'quoted', text: createDatasetFlyoutStrings.settingsModeQuoted() },
  { value: 'escaped', text: createDatasetFlyoutStrings.settingsModeEscaped() },
  { value: 'plain', text: createDatasetFlyoutStrings.settingsModePlain() },
];

const HEADER_ROW_OPTIONS = () => [
  { value: '', text: createDatasetFlyoutStrings.settingsHeaderRowPlaceholder() },
  { value: 'true', text: createDatasetFlyoutStrings.settingsHeaderRowTrue() },
  { value: 'false', text: createDatasetFlyoutStrings.settingsHeaderRowFalse() },
];

const MULTI_VALUE_SYNTAX_OPTIONS = () => [
  { value: '', text: createDatasetFlyoutStrings.settingsMultiValueSyntaxPlaceholder() },
  { value: 'none', text: createDatasetFlyoutStrings.settingsMultiValueSyntaxNone() },
  { value: 'brackets', text: createDatasetFlyoutStrings.settingsMultiValueSyntaxBrackets() },
];

const BOOLEAN_OPTIONS = (placeholder: string, enabled: string, disabled: string) => [
  { value: '', text: placeholder },
  { value: 'true', text: enabled },
  { value: 'false', text: disabled },
];

// ---------------------------------------------------------------------------
// Top-level export
// ---------------------------------------------------------------------------

export function CreateDatasetFlyoutSettings({
  control,
}: {
  control: Control<CreateDatasetFormValues>;
}) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const advancedId = useGeneratedHtmlId({ prefix: 'createDatasetFlyoutAdvancedSettings' });

  const { field: formatField } = useController({ name: 'settings.format', control });

  return (
    <>
      <EuiSpacer size="m" />
      <EuiFormRow label={createDatasetFlyoutStrings.settingsFormatLabel()} fullWidth>
        <EuiSelect
          options={FORMAT_OPTIONS()}
          data-test-subj="createDatasetFlyoutSettingsFormat"
          fullWidth
          aria-label={createDatasetFlyoutStrings.settingsFormatLabel()}
          value={formatField.value}
          onChange={(e) => formatField.onChange(e.target.value)}
          name={formatField.name}
          inputRef={formatField.ref}
        />
      </EuiFormRow>
      <EuiSpacer size="m" />
      <EuiButtonEmpty
        size="s"
        flush="left"
        iconType={isAdvancedOpen ? 'arrowDown' : 'arrowRight'}
        aria-expanded={isAdvancedOpen}
        aria-controls={advancedId}
        onClick={() => setIsAdvancedOpen((v) => !v)}
        data-test-subj="createDatasetFlyoutAdvancedSettingsToggle"
      >
        {isAdvancedOpen
          ? createDatasetFlyoutStrings.advancedSettingsHide()
          : createDatasetFlyoutStrings.advancedSettingsShow()}
      </EuiButtonEmpty>
      <div id={advancedId} hidden={!isAdvancedOpen}>
        <EuiSpacer size="s" />
        <PartitionDetectionField control={control} />
        <FormatSpecificSettings control={control} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Partition detection — always visible inside the advanced section
// ---------------------------------------------------------------------------

function PartitionDetectionField({ control }: { control: Control<CreateDatasetFormValues> }) {
  const { field: partitionDetectionField } = useController({
    name: 'settings.partition_detection',
    control,
  });

  return (
    <EuiFormRow label={createDatasetFlyoutStrings.settingsPartitionDetectionLabel()} fullWidth>
      <EuiSelect
        options={PARTITION_DETECTION_OPTIONS()}
        data-test-subj="createDatasetFlyoutSettingsPartitionDetection"
        fullWidth
        aria-label={createDatasetFlyoutStrings.settingsPartitionDetectionLabel()}
        value={partitionDetectionField.value}
        onChange={(e) => partitionDetectionField.onChange(e.target.value)}
        name={partitionDetectionField.name}
        inputRef={partitionDetectionField.ref}
      />
    </EuiFormRow>
  );
}

// ---------------------------------------------------------------------------
// Format-specific dispatch
// ---------------------------------------------------------------------------

function FormatSpecificSettings({ control }: { control: Control<CreateDatasetFormValues> }) {
  const format = useWatch({ control, name: 'settings.format' }) as DatasetFormatFormValue;

  if (format === 'csv' || format === 'tsv') {
    return <CsvTsvSettings control={control} />;
  }
  if (format === 'ndjson') {
    return <NdjsonSettings control={control} />;
  }
  if (format === 'parquet') {
    return <ParquetSettings control={control} />;
  }
  // orc, empty (no format selected), and any future format: no additional settings
  return null;
}

// ---------------------------------------------------------------------------
// CSV / TSV — all fields flat
// ---------------------------------------------------------------------------

function CsvTsvSettings({ control }: { control: Control<CreateDatasetFormValues> }) {
  const { field: delimiterField } = useController({ name: 'settings.delimiter', control });
  const { field: modeField } = useController({ name: 'settings.mode', control });
  const { field: headerRowField } = useController({ name: 'settings.header_row', control });
  const { field: nullValueField } = useController({ name: 'settings.null_value', control });
  const { field: encodingField } = useController({ name: 'settings.encoding', control });
  const { field: schemaSampleSizeField, fieldState: schemaSampleSizeState } = useController({
    name: 'settings.schema_sample_size',
    control,
    rules: { validate: validateSchemaSampleSize },
  });
  const { field: errorModeField } = useController({ name: 'settings.error_mode', control });
  const { field: maxErrorsField, fieldState: maxErrorsState } = useController({
    name: 'settings.max_errors',
    control,
    rules: { validate: validateMaxErrors },
  });
  const { field: maxErrorRatioField, fieldState: maxErrorRatioState } = useController({
    name: 'settings.max_error_ratio',
    control,
    rules: { validate: validateMaxErrorRatio },
  });
  const { field: quoteField } = useController({ name: 'settings.quote', control });
  const { field: escapeField } = useController({ name: 'settings.escape', control });
  const { field: commentField } = useController({ name: 'settings.comment', control });
  const { field: columnPrefixField } = useController({ name: 'settings.column_prefix', control });
  const { field: datetimeFormatField } = useController({
    name: 'settings.datetime_format',
    control,
  });
  const { field: multiValueSyntaxField } = useController({
    name: 'settings.multi_value_syntax',
    control,
  });
  const { field: maxFieldSizeField, fieldState: maxFieldSizeState } = useController({
    name: 'settings.max_field_size',
    control,
    rules: { validate: validateMaxFieldSize },
  });

  return (
    <>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsDelimiterLabel()}
        helpText={createDatasetFlyoutStrings.settingsDelimiterHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsDelimiter"
          fullWidth
          value={delimiterField.value}
          onChange={(e) => delimiterField.onChange(e.target.value)}
          name={delimiterField.name}
          inputRef={delimiterField.ref}
        />
      </EuiFormRow>
      <EuiFormRow label={createDatasetFlyoutStrings.settingsModeLabel()} fullWidth>
        <EuiSelect
          options={MODE_OPTIONS()}
          data-test-subj="createDatasetFlyoutSettingsMode"
          fullWidth
          aria-label={createDatasetFlyoutStrings.settingsModeLabel()}
          value={modeField.value}
          onChange={(e) => modeField.onChange(e.target.value)}
          name={modeField.name}
          inputRef={modeField.ref}
        />
      </EuiFormRow>
      <EuiFormRow label={createDatasetFlyoutStrings.settingsHeaderRowLabel()} fullWidth>
        <EuiSelect
          options={HEADER_ROW_OPTIONS()}
          data-test-subj="createDatasetFlyoutSettingsHeaderRow"
          fullWidth
          aria-label={createDatasetFlyoutStrings.settingsHeaderRowLabel()}
          value={headerRowField.value}
          onChange={(e) => headerRowField.onChange(e.target.value as DatasetBooleanFormValue)}
          name={headerRowField.name}
          inputRef={headerRowField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsNullValueLabel()}
        helpText={createDatasetFlyoutStrings.settingsNullValueHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsNullValue"
          fullWidth
          value={nullValueField.value}
          onChange={(e) => nullValueField.onChange(e.target.value)}
          name={nullValueField.name}
          inputRef={nullValueField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsEncodingLabel()}
        helpText={createDatasetFlyoutStrings.settingsEncodingHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsEncoding"
          fullWidth
          value={encodingField.value}
          onChange={(e) => encodingField.onChange(e.target.value)}
          name={encodingField.name}
          inputRef={encodingField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsSchemaSampleSizeLabel()}
        helpText={createDatasetFlyoutStrings.settingsSchemaSampleSizeHelp()}
        fullWidth
        isInvalid={Boolean(schemaSampleSizeState.error)}
        error={schemaSampleSizeState.error?.message}
      >
        <EuiFieldNumber
          data-test-subj="createDatasetFlyoutSettingsSchemaSampleSize"
          fullWidth
          min={1}
          step={1}
          isInvalid={Boolean(schemaSampleSizeState.error)}
          value={schemaSampleSizeField.value}
          onChange={(e) => schemaSampleSizeField.onChange(e.target.value)}
          name={schemaSampleSizeField.name}
          inputRef={schemaSampleSizeField.ref}
        />
      </EuiFormRow>
      <EuiFormRow label={createDatasetFlyoutStrings.settingsErrorModeLabel()} fullWidth>
        <EuiSelect
          options={ERROR_MODE_OPTIONS()}
          data-test-subj="createDatasetFlyoutSettingsErrorMode"
          fullWidth
          aria-label={createDatasetFlyoutStrings.settingsErrorModeLabel()}
          value={errorModeField.value}
          onChange={(e) => errorModeField.onChange(e.target.value)}
          name={errorModeField.name}
          inputRef={errorModeField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsMaxErrorsLabel()}
        helpText={createDatasetFlyoutStrings.settingsMaxErrorsHelp()}
        fullWidth
        isInvalid={Boolean(maxErrorsState.error)}
        error={maxErrorsState.error?.message}
      >
        <EuiFieldNumber
          data-test-subj="createDatasetFlyoutSettingsMaxErrors"
          fullWidth
          min={0}
          step={1}
          isInvalid={Boolean(maxErrorsState.error)}
          value={maxErrorsField.value}
          onChange={(e) => maxErrorsField.onChange(e.target.value)}
          name={maxErrorsField.name}
          inputRef={maxErrorsField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsMaxErrorRatioLabel()}
        helpText={createDatasetFlyoutStrings.settingsMaxErrorRatioHelp()}
        fullWidth
        isInvalid={Boolean(maxErrorRatioState.error)}
        error={maxErrorRatioState.error?.message}
      >
        <EuiFieldNumber
          data-test-subj="createDatasetFlyoutSettingsMaxErrorRatio"
          fullWidth
          min={0}
          max={1}
          step={0.01}
          isInvalid={Boolean(maxErrorRatioState.error)}
          value={maxErrorRatioField.value}
          onChange={(e) => maxErrorRatioField.onChange(e.target.value)}
          name={maxErrorRatioField.name}
          inputRef={maxErrorRatioField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsQuoteLabel()}
        helpText={createDatasetFlyoutStrings.settingsQuoteHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsQuote"
          fullWidth
          value={quoteField.value}
          onChange={(e) => quoteField.onChange(e.target.value)}
          name={quoteField.name}
          inputRef={quoteField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsEscapeLabel()}
        helpText={createDatasetFlyoutStrings.settingsEscapeHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsEscape"
          fullWidth
          value={escapeField.value}
          onChange={(e) => escapeField.onChange(e.target.value)}
          name={escapeField.name}
          inputRef={escapeField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsCommentLabel()}
        helpText={createDatasetFlyoutStrings.settingsCommentHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsComment"
          fullWidth
          value={commentField.value}
          onChange={(e) => commentField.onChange(e.target.value)}
          name={commentField.name}
          inputRef={commentField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsColumnPrefixLabel()}
        helpText={createDatasetFlyoutStrings.settingsColumnPrefixHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsColumnPrefix"
          fullWidth
          value={columnPrefixField.value}
          onChange={(e) => columnPrefixField.onChange(e.target.value)}
          name={columnPrefixField.name}
          inputRef={columnPrefixField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsDatetimeFormatLabel()}
        helpText={createDatasetFlyoutStrings.settingsDatetimeFormatHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsDatetimeFormat"
          fullWidth
          value={datetimeFormatField.value}
          onChange={(e) => datetimeFormatField.onChange(e.target.value)}
          name={datetimeFormatField.name}
          inputRef={datetimeFormatField.ref}
        />
      </EuiFormRow>
      <EuiFormRow label={createDatasetFlyoutStrings.settingsMultiValueSyntaxLabel()} fullWidth>
        <EuiSelect
          options={MULTI_VALUE_SYNTAX_OPTIONS()}
          data-test-subj="createDatasetFlyoutSettingsMultiValueSyntax"
          fullWidth
          aria-label={createDatasetFlyoutStrings.settingsMultiValueSyntaxLabel()}
          value={multiValueSyntaxField.value}
          onChange={(e) => multiValueSyntaxField.onChange(e.target.value)}
          name={multiValueSyntaxField.name}
          inputRef={multiValueSyntaxField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsMaxFieldSizeLabel()}
        helpText={createDatasetFlyoutStrings.settingsMaxFieldSizeHelp()}
        fullWidth
        isInvalid={Boolean(maxFieldSizeState.error)}
        error={maxFieldSizeState.error?.message}
      >
        <EuiFieldNumber
          data-test-subj="createDatasetFlyoutSettingsMaxFieldSize"
          fullWidth
          min={0}
          step={1}
          isInvalid={Boolean(maxFieldSizeState.error)}
          value={maxFieldSizeField.value}
          onChange={(e) => maxFieldSizeField.onChange(e.target.value)}
          name={maxFieldSizeField.name}
          inputRef={maxFieldSizeField.ref}
        />
      </EuiFormRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// NDJSON — all fields flat
// ---------------------------------------------------------------------------

function NdjsonSettings({ control }: { control: Control<CreateDatasetFormValues> }) {
  const { field: schemaSampleSizeField, fieldState: schemaSampleSizeState } = useController({
    name: 'settings.schema_sample_size',
    control,
    rules: { validate: validateSchemaSampleSize },
  });
  const { field: segmentSizeField } = useController({ name: 'settings.segment_size', control });

  return (
    <>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsSchemaSampleSizeLabel()}
        helpText={createDatasetFlyoutStrings.settingsSchemaSampleSizeHelp()}
        fullWidth
        isInvalid={Boolean(schemaSampleSizeState.error)}
        error={schemaSampleSizeState.error?.message}
      >
        <EuiFieldNumber
          data-test-subj="createDatasetFlyoutSettingsSchemaSampleSize"
          fullWidth
          min={1}
          step={1}
          isInvalid={Boolean(schemaSampleSizeState.error)}
          value={schemaSampleSizeField.value}
          onChange={(e) => schemaSampleSizeField.onChange(e.target.value)}
          name={schemaSampleSizeField.name}
          inputRef={schemaSampleSizeField.ref}
        />
      </EuiFormRow>
      <EuiFormRow
        label={createDatasetFlyoutStrings.settingsSegmentSizeLabel()}
        helpText={createDatasetFlyoutStrings.settingsSegmentSizeHelp()}
        fullWidth
      >
        <EuiFieldText
          data-test-subj="createDatasetFlyoutSettingsSegmentSize"
          fullWidth
          value={segmentSizeField.value}
          onChange={(e) => segmentSizeField.onChange(e.target.value)}
          name={segmentSizeField.name}
          inputRef={segmentSizeField.ref}
        />
      </EuiFormRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// Parquet — all fields flat
// ---------------------------------------------------------------------------

function ParquetSettings({ control }: { control: Control<CreateDatasetFormValues> }) {
  const { field: optimizedReaderField } = useController({
    name: 'settings.optimized_reader',
    control,
  });
  const { field: lateMaterializationField } = useController({
    name: 'settings.late_materialization',
    control,
  });

  return (
    <>
      <EuiFormRow label={createDatasetFlyoutStrings.settingsOptimizedReaderLabel()} fullWidth>
        <EuiSelect
          options={BOOLEAN_OPTIONS(
            createDatasetFlyoutStrings.settingsOptimizedReaderPlaceholder(),
            createDatasetFlyoutStrings.settingsOptimizedReaderEnabled(),
            createDatasetFlyoutStrings.settingsOptimizedReaderDisabled()
          )}
          data-test-subj="createDatasetFlyoutSettingsOptimizedReader"
          fullWidth
          aria-label={createDatasetFlyoutStrings.settingsOptimizedReaderLabel()}
          value={optimizedReaderField.value}
          onChange={(e) => optimizedReaderField.onChange(e.target.value as DatasetBooleanFormValue)}
          name={optimizedReaderField.name}
          inputRef={optimizedReaderField.ref}
        />
      </EuiFormRow>
      <EuiFormRow label={createDatasetFlyoutStrings.settingsLateMaterializationLabel()} fullWidth>
        <EuiSelect
          options={BOOLEAN_OPTIONS(
            createDatasetFlyoutStrings.settingsLateMaterializationPlaceholder(),
            createDatasetFlyoutStrings.settingsLateMaterializationEnabled(),
            createDatasetFlyoutStrings.settingsLateMaterializationDisabled()
          )}
          data-test-subj="createDatasetFlyoutSettingsLateMaterialization"
          fullWidth
          aria-label={createDatasetFlyoutStrings.settingsLateMaterializationLabel()}
          value={lateMaterializationField.value}
          onChange={(e) =>
            lateMaterializationField.onChange(e.target.value as DatasetBooleanFormValue)
          }
          name={lateMaterializationField.name}
          inputRef={lateMaterializationField.ref}
        />
      </EuiFormRow>
    </>
  );
}
