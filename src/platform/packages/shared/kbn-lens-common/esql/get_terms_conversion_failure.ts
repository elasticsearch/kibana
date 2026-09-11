/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TermsIndexPatternColumn } from '../datasources/operations';
import type { EsqlConversionFailureReason } from './to_esql_failure_reasons';

const UNSUPPORTED_ORDER_BY_TYPES = new Set(['rare', 'significant', 'custom']);

export interface TermsConversionContext {
  hasDateHistogram: boolean;
}

/**
 * Returns a conversion failure reason when a terms dimension cannot be
 * translated to ES|QL, or `undefined` when the column is eligible.
 *
 * Until terms→ES|QL assembly is implemented for multi-bucket charts, callers
 * must still reject layers with more than one bucket dimension (Phase 1).
 */
export const getTermsConversionFailure = (
  { params }: TermsIndexPatternColumn,
  { hasDateHistogram }: TermsConversionContext
): EsqlConversionFailureReason | undefined => {
  if (hasDateHistogram) {
    return 'terms_not_supported';
  }

  if ((params.secondaryFields?.length ?? 0) > 0) {
    return 'terms_not_supported';
  }

  if (params.accuracyMode === true) {
    return 'terms_not_supported';
  }

  if ((params.include?.length ?? 0) > 0 || (params.exclude?.length ?? 0) > 0) {
    return 'terms_not_supported';
  }

  // Lens defaults otherBucket to true when unset.
  // No dedicated missingBucket failure: the UI only enables "Include documents without
  // the selected field" when Other is on, and toEsAggsFn forces
  // missingBucket = otherBucket && missingBucket. So Other-off implies missing is off
  // for real configs; a separate reason would never surface in the happy-path UI.
  if (params.otherBucket !== false) {
    return 'terms_other_bucket_not_supported';
  }

  if (UNSUPPORTED_ORDER_BY_TYPES.has(params.orderBy.type)) {
    return 'terms_order_by_not_supported';
  }

  return undefined;
};
