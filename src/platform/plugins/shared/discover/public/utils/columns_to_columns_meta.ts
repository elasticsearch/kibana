/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Column } from '@kbn/data-source';
import type { DataTableColumnsMeta } from '@kbn/unified-data-table';

/** Converts ES|QL columns to the `columnsMeta` shape consumed by the unified data table. */
export function columnsToColumnsMeta(columns: readonly Column[]): DataTableColumnsMeta {
  return Object.fromEntries(
    columns.map((c) => [c.name, c.esType ? { type: c.type, esType: c.esType } : { type: c.type }])
  ) as DataTableColumnsMeta;
}
