/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { i18n } from '@kbn/i18n';

const getComputedColumnFilterDisabledMessage = ({
  computedColumnNames,
  allColumnsAreComputed,
}: {
  computedColumnNames: string[];
  allColumnsAreComputed: boolean;
}) => {
  const count = computedColumnNames.length;

  if (allColumnsAreComputed) {
    return i18n.translate(
      'chartExpressionsCommon.computedColumn.filterDrilldownDisabledDescription',
      {
        defaultMessage:
          "You can't apply a filter or drill down {count, plural, one {from this value because it relies on a field} other {from these values because they rely on fields}} created at query time.",
        values: { count },
      }
    );
  }

  const names = computedColumnNames.map((n) => `'${n}'`).join(', ');
  return i18n.translate(
    'chartExpressionsCommon.computedColumn.partialFilterDrilldownDisabledDescription',
    {
      defaultMessage:
        "You can't apply a filter or drill down from {names} because {count, plural, one {it relies on a field} other {they rely on fields}} created at query time.",
      values: { names, count },
    }
  );
};

function isComputedColumnNonFilterable(column: DatatableColumn): boolean {
  if (column.isComputedColumn !== true) {
    return false;
  }
  const sourceField = column.meta?.sourceParams?.sourceField;
  // Without a string sourceField the filter action falls back to column.name, which always
  // collides with the computed output column itself — filtering is never possible.
  if (typeof sourceField !== 'string') {
    return true;
  }
  // A column produced by RENAME has name !== sourceField; the underlying index field
  // remains addressable, so filtering is still possible.
  return column.name === sourceField;
}

/**
 * Returns the warning message to show when filterable chart columns are computed ES|QL
 * fields that cannot be used for filtering. Returns `undefined` when there is nothing
 * to warn about.
 */
export const getComputedColumnWarningForColumns = (
  filterableColumns: Array<DatatableColumn | undefined>
): string | undefined => {
  const defined = filterableColumns.filter((c): c is DatatableColumn => c != null);
  if (defined.length === 0) {
    return undefined;
  }

  const nonFilterableComputedColumnNames = defined
    .filter((col) => isComputedColumnNonFilterable(col))
    .map((col) => col.name);

  if (nonFilterableComputedColumnNames.length === 0) {
    return undefined;
  }

  const allColumnsAreComputed = nonFilterableComputedColumnNames.length === defined.length;
  return getComputedColumnFilterDisabledMessage({
    computedColumnNames: nonFilterableComputedColumnNames,
    allColumnsAreComputed,
  });
};
