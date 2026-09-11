/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { prettifyError } from '@kbn/zod';
import { asCodeFilterSchema, type AsCodeFilter } from '@kbn/as-code-filters-schema';
import { fromStoredFilter } from '@kbn/as-code-filters-transforms';
import type { AsCodeQuery } from '@kbn/as-code-shared-schemas';
import { toAsCodeQuery } from '@kbn/as-code-shared-transforms';
import type { SavedObjectReference } from '@kbn/core/server';
import { injectReferences, parseSearchSourceJSON } from '@kbn/data-plugin/common';
import type { Filter } from '@kbn/es-query';

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { migrateLegacyQuery } from '../../../../common';
import type { DashboardSavedObjectAttributes } from '../../../dashboard_saved_object';
import { logger } from '../../../kibana_services';
import type { getDashboardStateSchema } from '../../dashboard_state_schemas';
import type { Warnings } from '../../types';

export function transformSearchSourceOut(
  kibanaSavedObjectMeta: DashboardSavedObjectAttributes['kibanaSavedObjectMeta'] = {},
  references: SavedObjectReference[] = [],
  strictValidationSchema: ReturnType<typeof getDashboardStateSchema>
): Pick<DashboardState, 'filters' | 'query'> & { warnings: Warnings } {
  const warnings: Warnings = [];

  const { searchSourceJSON } = kibanaSavedObjectMeta;
  if (!searchSourceJSON) {
    return { warnings };
  }
  let parsedSearchSource;
  try {
    parsedSearchSource = parseSearchSourceJSON(searchSourceJSON);
  } catch (parseError) {
    logger.warn(`Unable to parse searchSourceJSON. Error: ${parseError.message}`);
    return { warnings };
  }

  let searchSource;
  try {
    searchSource = injectReferences(parsedSearchSource, references);
  } catch (injectError) {
    logger.warn(
      `Unable to transform filter and query state on read. Error: ${injectError.message}`
    );
    // fallback to parsed if injection fails
    searchSource = parsedSearchSource;
  }

  const validFilters: AsCodeFilter[] = [];
  const invalidFilters: Array<{ filter: Filter; message: string }> = [];
  searchSource.filter?.forEach((storedFilter) => {
    try {
      let asCodeFilter = fromStoredFilter(storedFilter, logger);
      asCodeFilter = asCodeFilterSchema.parse(asCodeFilter);
      validFilters.push(asCodeFilter);
    } catch (error) {
      invalidFilters.push({
        filter: storedFilter,
        message: prettifyError(error),
      });
    }
  });

  if (invalidFilters.length) {
    const warningMessage = `Unexpected error transforming filter state on read.\n\n${invalidFilters
      .map(({ message }, index) => `[filters.${index + 1}]: ${message}`)
      .join('\n\n')}`;
    logger.warn(warningMessage);
    warnings.push({
      type: 'dropped_property',
      message: warningMessage,
      key: 'filters',
      value: invalidFilters.map(({ filter }) => filter),
    });
  }

  let query: AsCodeQuery | undefined;
  const storedQuery = searchSource.query ? migrateLegacyQuery(searchSource.query) : undefined;
  try {
    query = strictValidationSchema.shape.query.parse(toAsCodeQuery(storedQuery));
  } catch (error) {
    const warningMessage = `Unexpected error transforming query state on read.\n\n${prettifyError(
      error
    )}`;
    logger.warn(warningMessage);
    warnings.push({
      type: 'dropped_property',
      message: warningMessage,
      key: 'query',
      value: storedQuery,
    });
  }

  return { filters: validFilters, query, warnings };
}
