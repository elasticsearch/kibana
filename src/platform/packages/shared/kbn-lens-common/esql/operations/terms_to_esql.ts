/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { escapeEsqlColumnName } from '@kbn/esql-language';
import type { TermsIndexPatternColumn } from '../../datasources/operations';
import type { ToEsqlFn } from './types';

/**
 * Converts a Lens terms (Top values) dimension to an ES|QL BY expression.
 * SORT / LIMIT for top-N are assembled in generateEsqlQuery.
 */
export const termsToESQL: ToEsqlFn<TermsIndexPatternColumn> = (column) => ({
  template: escapeEsqlColumnName(column.sourceField),
});
