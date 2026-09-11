/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { DiscoverGridSettings } from '@kbn/saved-search-plugin/common';
import { SOURCE_COLUMN } from '@kbn/unified-data-table';
import { uniqBy } from 'lodash';
import type { DefaultAppStateColumn } from '../types';

export const getResolvedProfileColumns = ({
  profileColumns = [],
  fallbackColumns = [],
  dataView,
  esqlQueryColumns,
}: {
  profileColumns?: DefaultAppStateColumn[];
  fallbackColumns?: string[];
  dataView: DataView;
  esqlQueryColumns?: Array<{ name: string }>;
}): {
  columns: string[];
  grid: DiscoverGridSettings | undefined;
} => {
  const mappedFallbackColumns = fallbackColumns.map((name) => ({ name }));
  const isValidColumn = getIsValidColumn(dataView, esqlQueryColumns);
  const validColumns = uniqBy(
    profileColumns.concat(mappedFallbackColumns).filter(isValidColumn),
    'name'
  );

  if (!validColumns.length) {
    return { columns: [], grid: undefined };
  }

  const hasAutoWidthColumn = validColumns.some(({ width }) => !width);
  const gridColumns = validColumns.reduce<DiscoverGridSettings['columns']>(
    (acc, { name, width }, index) => {
      // Ensure there's at least one auto width column so the columns fill the grid
      const skipColumnWidth = !hasAutoWidthColumn && index === validColumns.length - 1;
      return width && !skipColumnWidth ? { ...acc, [name]: { width } } : acc;
    },
    undefined
  );

  return {
    columns: validColumns.map(({ name }) => name),
    grid: gridColumns ? { columns: gridColumns } : undefined,
  };
};

const getIsValidColumn =
  (dataView: DataView, esqlQueryColumns: Array<{ name: string }> | undefined) =>
  (column: DefaultAppStateColumn) => {
    // Summary is a synthetic column; allow it even when absent from the data view / ES|QL result
    if (column.name === SOURCE_COLUMN) {
      return true;
    }

    const isValid = esqlQueryColumns
      ? esqlQueryColumns.some((esqlColumn) => esqlColumn.name === column.name)
      : dataView.fields.getByName(column.name);

    return Boolean(isValid);
  };
