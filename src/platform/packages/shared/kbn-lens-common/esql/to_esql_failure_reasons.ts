/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

/**
 * Specific reasons why ES|QL conversion failed.
 * These are used to provide granular user feedback.
 */
export type EsqlConversionFailureReason =
  | 'formula_not_supported'
  | 'time_shift_not_supported'
  | 'runtime_field_not_supported'
  | 'reduced_time_range_not_supported'
  | 'function_not_supported'
  | 'drop_partials_not_supported'
  | 'include_empty_rows_not_supported'
  | 'terms_not_supported'
  | 'terms_other_bucket_not_supported'
  | 'terms_order_by_not_supported'
  | 'saved_to_library_not_supported'
  | 'query_annotations_not_supported'
  | 'trendline_not_supported'
  | 'unsupported_settings'
  | 'unknown';

export const esqlConversionFailureReasonMessages: Record<EsqlConversionFailureReason, string> = {
  formula_not_supported: i18n.translate('xpack.lens.config.cannotConvertToEsqlFormulaTooltip', {
    defaultMessage:
      'Cannot convert to ES|QL: Formula operations will be supported in an upcoming update.',
  }),
  time_shift_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlTimeShiftTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: Time shift will be supported in an upcoming update.',
    }
  ),
  runtime_field_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlRuntimeFieldTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: Runtime fields will be supported in an upcoming update.',
    }
  ),
  reduced_time_range_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlReducedTimeRangeTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: Reduced time range will be supported in an upcoming update.',
    }
  ),
  function_not_supported: i18n.translate('xpack.lens.config.cannotConvertToEsqlOperationTooltip', {
    defaultMessage:
      'Cannot convert to ES|QL: Support for one or more functions used will be coming in an upcoming update.',
  }),
  drop_partials_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlDropPartialsTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: "Drop partial buckets" will be supported in an upcoming update.',
    }
  ),
  include_empty_rows_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlIncludeEmptyRowsTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: "Include empty rows" will be supported in an upcoming update.',
    }
  ),
  terms_not_supported: i18n.translate('xpack.lens.config.cannotConvertToEsqlTermsTooltip', {
    defaultMessage:
      'Cannot convert to ES|QL: Top values (terms) aggregation will be supported in an upcoming update.',
  }),
  terms_other_bucket_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlTermsOtherBucketTooltip',
    {
      defaultMessage: 'Cannot convert to ES|QL: "Group other values as Other" is not supported.',
    }
  ),
  terms_order_by_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlTermsOrderByTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: This Top values ranking option is not supported for conversion.',
    }
  ),
  saved_to_library_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertSavedToLibraryTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: Charts saved to library will be supported in an upcoming update.',
    }
  ),
  query_annotations_not_supported: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlQueryAnnotationsTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: Query-based annotations will be supported in an upcoming update.',
    }
  ),
  trendline_not_supported: i18n.translate('xpack.lens.config.cannotConvertToEsqlTrendlineTooltip', {
    defaultMessage:
      'Cannot convert to ES|QL: The trendline layer uses a configuration that is not yet supported for conversion.',
  }),
  unsupported_settings: i18n.translate(
    'xpack.lens.config.cannotConvertToEsqlUnsupportedSettingsTooltip',
    {
      defaultMessage:
        'Cannot convert to ES|QL: Some settings used will be supported in an upcoming update.',
    }
  ),
  unknown: i18n.translate('xpack.lens.config.cannotConvertToEsqlUnknownTooltip', {
    defaultMessage:
      'Cannot convert to ES|QL: This visualization will be supported in an upcoming update.',
  }),
};

export const getFailureTooltip = (reason: EsqlConversionFailureReason | undefined): string => {
  if (!reason) {
    return esqlConversionFailureReasonMessages.unknown;
  }
  return (
    esqlConversionFailureReasonMessages[reason] ??
    esqlConversionFailureReasonMessages.unsupported_settings
  );
};
