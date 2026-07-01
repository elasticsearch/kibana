/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Filter } from '@kbn/es-query';
import { buildPhrasesFilter, buildExistsFilter, buildPhraseFilter } from '@kbn/es-query';
import { MISSING_TOKEN } from '@kbn/field-formats-common';
import type { IBucketAggConfig } from '../bucket_agg_type';

interface CreateFilterTermsParams {
  terms?: Array<string | number | boolean>;
}

export const createFilterTerms = (
  aggConfig: IBucketAggConfig,
  key: string,
  params: CreateFilterTermsParams
) => {
  const field = aggConfig.params.field;
  const indexPattern = aggConfig.aggConfigs.indexPattern;

  if (key === '__other__') {
    const terms = params.terms ?? [];

    const phraseFilter = buildPhrasesFilter(field, terms, indexPattern);
    phraseFilter.meta.negate = true;

    const filters: Filter[] = [phraseFilter];

    if (terms.some((term) => term === MISSING_TOKEN)) {
      filters.push(buildExistsFilter(field, indexPattern));
    }

    return filters;
  } else if (key === MISSING_TOKEN) {
    const existsFilter = buildExistsFilter(field, indexPattern);
    existsFilter.meta.negate = true;
    return existsFilter;
  }
  return buildPhraseFilter(field, key, indexPattern);
};
