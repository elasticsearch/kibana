/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { toStoredFilters } from '@kbn/as-code-filters-transforms';
import { extractReferences } from '@kbn/data-plugin/common';
import { toStoredQuery } from '@kbn/as-code-shared-transforms';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { logger } from '../../../kibana_services';

export function transformSearchSourceIn(
  filters?: DashboardState['filters'],
  query?: DashboardState['query']
) {
  if (!filters && !query) {
    return { searchSourceJSON: '{}', references: [] };
  }

  try {
    const storedFilters = toStoredFilters(filters, logger);
    const storedQuery = toStoredQuery(query);
    const [extractedState, references] = extractReferences({
      filter: storedFilters,
      query: storedQuery,
    });
    return { searchSourceJSON: JSON.stringify(extractedState), references };
  } catch (error) {
    // If the references can not be extracted, we log a warning
    // and return the original searchSource stringified.
    logger.warn(`Unable to transform filter and query state on save. Error: ${error.message}`);
    return { searchSourceJSON: '{}', references: [] };
  }
}
