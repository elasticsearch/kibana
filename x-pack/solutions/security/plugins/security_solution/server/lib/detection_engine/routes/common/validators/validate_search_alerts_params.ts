/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryAlertsBodyParams } from '../../../../../../common/api/detection_engine/signals';

/**
 * Ensures a search request carries at least one searchable parameter.
 *
 * @returns an error message when the params are empty, otherwise `undefined`.
 */
export const validateSearchAlertsParams = (params: QueryAlertsBodyParams): string | undefined => {
  const { query, aggs, _source, fields, track_total_hits: trackTotalHits, size, sort } = params;

  if (
    query == null &&
    aggs == null &&
    _source == null &&
    fields == null &&
    trackTotalHits == null &&
    size == null &&
    sort == null
  ) {
    return '"value" must have at least 1 children';
  }
};
