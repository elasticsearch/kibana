/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

export const EMPTY_LABEL = i18n.translate('fieldFormats.blankLabel', {
  defaultMessage: '(blank)',
  description: 'Represents the label used to replace an empty string value in tables and charts',
});

export const NULL_LABEL = i18n.translate('fieldFormats.nullLabel', {
  defaultMessage: '(null)',
  description: 'Represents the label used to replace an null value in tables and charts',
});

export const NAN_LABEL = 'NaN';

export const MISSING_TOKEN = '__missing__';

export function getMissingValueLabel(val: unknown): string | undefined {
  if (val === '') return EMPTY_LABEL;
  if (val == null || val === MISSING_TOKEN) return NULL_LABEL;
}
