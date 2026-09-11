/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { hasTransformationalCommand } from '@kbn/esql-utils';

export const ESQL_MAX_NUM_OF_COLUMNS = 50;
export const ESQL_TABLE_VIEW_COLUMN_THRESHOLD = 5;

/**
 * Selects default ES|QL table columns from a query response.
 * Transformational queries (or responses with at most five columns) expose result
 * columns, capped at 50. Wider non-transformational responses keep Discover's
 * document-table / Summary default.
 */
export const getEsqlDefaultColumns = ({
  esql,
  responseColumns,
}: {
  esql: string;
  responseColumns: string[] | undefined;
}): string[] => {
  if (responseColumns === undefined) {
    return [];
  }

  if (
    hasTransformationalCommand(esql) ||
    responseColumns.length <= ESQL_TABLE_VIEW_COLUMN_THRESHOLD
  ) {
    return responseColumns.slice(0, ESQL_MAX_NUM_OF_COLUMNS);
  }

  return [];
};
