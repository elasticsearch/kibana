/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import { getChangePointSeriesColumns } from '@kbn/esql-utils';
import { buildChangePointCards } from '../utils/derive_change_point_cards';
import { getEsqlQuery } from '../utils/get_esql_query';
import type { UnifiedChangePointGridProps } from '../types';

/**
 * Derives change point cards and series columns from the current fetch params.
 * Memoizes on (query, table) so re-derivation only happens when Discover delivers
 * new data, not on every render.
 */
export const useChangePointCards = (fetchParams: UnifiedChangePointGridProps['fetchParams']) => {
  const esql = useMemo(() => getEsqlQuery(fetchParams.query), [fetchParams.query]);

  const cards = useMemo(
    () => buildChangePointCards({ table: fetchParams.table, esql: esql ?? '' }),
    [esql, fetchParams.table]
  );

  const seriesColumns = useMemo(
    () => (esql ? getChangePointSeriesColumns(esql) : undefined),
    [esql]
  );

  return { cards, seriesColumns };
};
