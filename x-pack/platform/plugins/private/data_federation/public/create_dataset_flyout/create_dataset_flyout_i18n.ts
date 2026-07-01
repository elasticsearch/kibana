/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

/** Localized strings for the create / edit dataset flyout. */
export const createDatasetFlyoutStrings = {
  createTitle: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.createTitle', {
      defaultMessage: 'Add dataset',
    }),

  createDescription: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.createDescription', {
      defaultMessage:
        'Select the data within a connected data source you want to query with ES|QL.',
    }),

  editTitle: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.editTitle', {
      defaultMessage: 'Edit dataset',
    }),

  editTitleWithId: (id: string) =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.editTitleWithId', {
      defaultMessage: 'Edit dataset: {id}',
      values: { id },
    }),

  nameRequired: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.nameRequired', {
      defaultMessage: 'Name is required.',
    }),

  nameAlreadyExists: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.nameAlreadyExists', {
      defaultMessage: 'A dataset with this name already exists.',
    }),

  dataSourceRequired: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.dataSourceRequired', {
      defaultMessage: 'Data source is required.',
    }),

  resourceRequired: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.resourceRequired', {
      defaultMessage: 'Resource is required.',
    }),

  nameLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.nameLabel', {
      defaultMessage: 'Name',
    }),

  nameHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.nameHelp', {
      defaultMessage: 'Unique name for use in queries',
    }),

  descriptionLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.descriptionLabel', {
      defaultMessage: 'Description',
    }),

  dataSourceLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.dataSourceLabel', {
      defaultMessage: 'Data source',
    }),

  dataSourcePlaceholder: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.dataSourcePlaceholder', {
      defaultMessage: 'Select a data source',
    }),

  dataSourceEmptyHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.dataSourceEmptyHelp', {
      defaultMessage: 'Create a data source on the Sources tab before adding a dataset.',
    }),

  dataSourceHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.dataSourceHelp', {
      defaultMessage: 'Select the external data source this dataset belongs to.',
    }),

  resourceLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.resourceLabel', {
      defaultMessage: 'Resource',
    }),

  resourceHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.resourceHelp', {
      defaultMessage: 'Path or identifier for the dataset resource.',
    }),

  settingsFormatLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsFormatLabel', {
      defaultMessage: 'Format',
    }),

  settingsFormatPlaceholder: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsFormatPlaceholder', {
      defaultMessage: 'Select a format',
    }),

  settingsFormatParquet: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsFormatParquet', {
      defaultMessage: 'Parquet',
    }),

  settingsFormatCsv: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsFormatCsv', {
      defaultMessage: 'CSV',
    }),

  settingsFormatNdjson: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsFormatNdjson', {
      defaultMessage: 'NDJSON',
    }),

  settingsFormatTsv: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsFormatTsv', {
      defaultMessage: 'TSV',
    }),

  settingsFormatOrc: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsFormatOrc', {
      defaultMessage: 'ORC',
    }),

  settingsErrorModeLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsErrorModeLabel', {
      defaultMessage: 'Error mode',
    }),

  settingsErrorModePlaceholder: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsErrorModePlaceholder', {
      defaultMessage: 'Default',
    }),

  settingsErrorModeFailFast: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsErrorModeFailFast', {
      defaultMessage: 'Fail fast',
    }),

  settingsErrorModeSkipRow: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsErrorModeSkipRow', {
      defaultMessage: 'Skip row',
    }),

  settingsErrorModeNullField: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsErrorModeNullField', {
      defaultMessage: 'Null field',
    }),

  settingsMaxErrorsLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxErrorsLabel', {
      defaultMessage: 'Max errors',
    }),

  settingsMaxErrorsHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxErrorsHelp', {
      defaultMessage: 'Maximum number of row errors before failing.',
    }),

  settingsMaxErrorRatioLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxErrorRatioLabel', {
      defaultMessage: 'Max error ratio',
    }),

  settingsMaxErrorRatioHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxErrorRatioHelp', {
      defaultMessage: 'Maximum ratio of row errors before failing (0 to 1).',
    }),

  settingsMaxErrorsInvalid: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxErrorsInvalid', {
      defaultMessage: 'Must be a non-negative integer.',
    }),

  settingsMaxErrorRatioInvalid: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxErrorRatioInvalid', {
      defaultMessage: 'Must be a number between 0 and 1.',
    }),

  settingsSchemaSampleSizeLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsSchemaSampleSizeLabel', {
      defaultMessage: 'Schema sample size',
    }),

  settingsSchemaSampleSizeHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsSchemaSampleSizeHelp', {
      defaultMessage: 'Number of rows to sample when inferring schema.',
    }),

  settingsSchemaSampleSizeInvalid: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsSchemaSampleSizeInvalid', {
      defaultMessage: 'Must be a positive integer.',
    }),

  settingsPartitionDetectionLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsPartitionDetectionLabel', {
      defaultMessage: 'Partition detection',
    }),

  settingsPartitionDetectionPlaceholder: () =>
    i18n.translate(
      'xpack.dataFederation.createDatasetFlyout.settingsPartitionDetectionPlaceholder',
      {
        defaultMessage: 'Default',
      }
    ),

  settingsPartitionDetectionAuto: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsPartitionDetectionAuto', {
      defaultMessage: 'Auto',
    }),

  settingsPartitionDetectionHive: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsPartitionDetectionHive', {
      defaultMessage: 'Hive',
    }),

  settingsPartitionDetectionTemplate: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsPartitionDetectionTemplate', {
      defaultMessage: 'Template',
    }),

  settingsPartitionDetectionNone: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsPartitionDetectionNone', {
      defaultMessage: 'None',
    }),

  settingsPartitionPathLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsPartitionPathLabel', {
      defaultMessage: 'Partition path',
    }),

  settingsPartitionPathHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsPartitionPathHelp', {
      defaultMessage: 'Path pattern used for partition detection.',
    }),

  settingsHivePartitioningLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsHivePartitioningLabel', {
      defaultMessage: 'Hive partitioning',
    }),

  settingsDelimiterLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsDelimiterLabel', {
      defaultMessage: 'Delimiter',
    }),

  settingsDelimiterHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsDelimiterHelp', {
      defaultMessage: 'The character that separates fields.',
    }),

  settingsModeLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsModeLabel', {
      defaultMessage: 'Quote mode',
    }),

  settingsModePlaceholder: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsModePlaceholder', {
      defaultMessage: 'Default',
    }),

  settingsModeQuoted: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsModeQuoted', {
      defaultMessage: 'Quoted',
    }),

  settingsModeEscaped: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsModeEscaped', {
      defaultMessage: 'Escaped',
    }),

  settingsModePlain: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsModePlain', {
      defaultMessage: 'Plain',
    }),

  settingsHeaderRowLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsHeaderRowLabel', {
      defaultMessage: 'Header row',
    }),

  settingsHeaderRowPlaceholder: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsHeaderRowPlaceholder', {
      defaultMessage: 'Default',
    }),

  settingsHeaderRowTrue: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsHeaderRowTrue', {
      defaultMessage: 'Yes',
    }),

  settingsHeaderRowFalse: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsHeaderRowFalse', {
      defaultMessage: 'No',
    }),

  settingsNullValueLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsNullValueLabel', {
      defaultMessage: 'Null value',
    }),

  settingsNullValueHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsNullValueHelp', {
      defaultMessage: 'The string treated as null, for example NULL or NA.',
    }),

  settingsEncodingLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsEncodingLabel', {
      defaultMessage: 'Encoding',
    }),

  settingsEncodingHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsEncodingHelp', {
      defaultMessage: 'Character encoding of the file.',
    }),

  settingsQuoteLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsQuoteLabel', {
      defaultMessage: 'Quote character',
    }),

  settingsQuoteHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsQuoteHelp', {
      defaultMessage: 'The character used to quote fields.',
    }),

  settingsEscapeLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsEscapeLabel', {
      defaultMessage: 'Escape character',
    }),

  settingsEscapeHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsEscapeHelp', {
      defaultMessage: 'The character used to escape special characters.',
    }),

  settingsCommentLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsCommentLabel', {
      defaultMessage: 'Comment prefix',
    }),

  settingsCommentHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsCommentHelp', {
      defaultMessage: 'Lines beginning with this prefix are skipped.',
    }),

  settingsColumnPrefixLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsColumnPrefixLabel', {
      defaultMessage: 'Column prefix',
    }),

  settingsColumnPrefixHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsColumnPrefixHelp', {
      defaultMessage: 'Prefix for generated column names when no header row is present.',
    }),

  settingsDatetimeFormatLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsDatetimeFormatLabel', {
      defaultMessage: 'Datetime format',
    }),

  settingsDatetimeFormatHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsDatetimeFormatHelp', {
      defaultMessage: 'Pattern used to parse date and time values.',
    }),

  settingsMultiValueSyntaxLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMultiValueSyntaxLabel', {
      defaultMessage: 'Multi-value syntax',
    }),

  settingsMultiValueSyntaxPlaceholder: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMultiValueSyntaxPlaceholder', {
      defaultMessage: 'Default',
    }),

  settingsMultiValueSyntaxNone: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMultiValueSyntaxNone', {
      defaultMessage: 'None',
    }),

  settingsMultiValueSyntaxBrackets: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMultiValueSyntaxBrackets', {
      defaultMessage: 'Brackets',
    }),

  settingsMaxFieldSizeLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxFieldSizeLabel', {
      defaultMessage: 'Max field size',
    }),

  settingsMaxFieldSizeHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxFieldSizeHelp', {
      defaultMessage: 'Maximum size of a single field in bytes. 0 means unlimited.',
    }),

  settingsMaxFieldSizeInvalid: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsMaxFieldSizeInvalid', {
      defaultMessage: 'Must be a non-negative integer.',
    }),

  settingsSegmentSizeLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsSegmentSizeLabel', {
      defaultMessage: 'Segment size',
    }),

  settingsSegmentSizeHelp: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsSegmentSizeHelp', {
      defaultMessage: 'Unit a file is divided into for parallel reading, for example 4mb.',
    }),

  settingsOptimizedReaderLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsOptimizedReaderLabel', {
      defaultMessage: 'Optimized reader',
    }),

  settingsOptimizedReaderPlaceholder: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsOptimizedReaderPlaceholder', {
      defaultMessage: 'Default',
    }),

  settingsOptimizedReaderEnabled: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsOptimizedReaderEnabled', {
      defaultMessage: 'Enabled',
    }),

  settingsOptimizedReaderDisabled: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsOptimizedReaderDisabled', {
      defaultMessage: 'Disabled',
    }),

  settingsLateMaterializationLabel: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsLateMaterializationLabel', {
      defaultMessage: 'Late materialization',
    }),

  settingsLateMaterializationPlaceholder: () =>
    i18n.translate(
      'xpack.dataFederation.createDatasetFlyout.settingsLateMaterializationPlaceholder',
      {
        defaultMessage: 'Default',
      }
    ),

  settingsLateMaterializationEnabled: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsLateMaterializationEnabled', {
      defaultMessage: 'Enabled',
    }),

  settingsLateMaterializationDisabled: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.settingsLateMaterializationDisabled', {
      defaultMessage: 'Disabled',
    }),

  advancedSettingsShow: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.advancedSettingsShow', {
      defaultMessage: 'Show advanced settings',
    }),

  advancedSettingsHide: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.advancedSettingsHide', {
      defaultMessage: 'Hide advanced settings',
    }),

  cancelButton: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.cancelButton', {
      defaultMessage: 'Cancel',
    }),

  addButton: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.addButton', {
      defaultMessage: 'Add',
    }),

  saveButton: () =>
    i18n.translate('xpack.dataFederation.createDatasetFlyout.saveButton', {
      defaultMessage: 'Save',
    }),
};
