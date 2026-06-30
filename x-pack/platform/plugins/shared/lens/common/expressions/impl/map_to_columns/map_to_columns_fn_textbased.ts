/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import type {
  OriginalColumn,
  MapToColumnsExpressionFunction,
} from '../../defs/map_to_columns/types';

export const mapToOriginalColumnsTextBased: MapToColumnsExpressionFunction['fn'] = (
  data,
  { idMap: encodedIdMap }
) => {
  const isOriginalColumn = (item: OriginalColumn | undefined): item is OriginalColumn => {
    return !!item;
  };
  const idMap = JSON.parse(encodedIdMap) as Record<string, OriginalColumn[]>;

  // extract all the entries once
  const idMapColEntries = Object.entries(idMap);
  // create a lookup id => column
  const colLookups = new Map<string, DatatableColumn>(data.columns.map((c) => [c.id, c]));

  // now create a lookup to get the original columns for each variable
  const colVariableLookups = new Map<string, OriginalColumn[]>(
    idMapColEntries.flatMap(([id, columns]) =>
      columns.filter(({ variable }) => variable).map(({ variable }) => [`${variable}`, columns])
    )
  );

  return {
    ...data,
    rows: data.rows.map((row) => {
      const mappedRow: Record<string, unknown> = {};

      for (const id in row) {
        if (id in idMap) {
          for (const cachedEntry of idMap[id]) {
            mappedRow[cachedEntry.id] = row[id];
          }
        } else {
          const col = colLookups.get(id);
          if (col?.variable) {
            const originalColumn = colVariableLookups.get(col.variable);
            if (originalColumn) {
              for (const cachedEntry of originalColumn) {
                mappedRow[cachedEntry.id] = row[id];
              }
            }
          }
        }
      }

      return mappedRow;
    }),
    columns: data.columns.flatMap((column) => {
      if (!(column.id in idMap) && !column.variable) {
        return [];
      }
      if (column.variable) {
        const originalColumn = idMapColEntries
          .map(([_id, cols]) => cols.find((c) => c.variable === column.variable))
          .filter(isOriginalColumn);

        if (!originalColumn) {
          return [];
        }

        return originalColumn.map((c) => ({ ...column, id: c.id }));
      }

      const params =
        column.meta?.sourceParams?.params &&
        typeof column.meta.sourceParams.params === 'object' &&
        !Array.isArray(column.meta.sourceParams.params)
          ? column.meta.sourceParams.params
          : undefined;

      return idMap[column.id].map((originalColumn) => ({
        ...column,
        id: originalColumn.id,
        name: originalColumn.label,
        meta: {
          ...column.meta,
          ...('sourceField' in originalColumn ? { field: originalColumn.sourceField } : {}),
          ...('format' in originalColumn ? { params: originalColumn.format } : {}),
          sourceParams: {
            ...(column.meta?.sourceParams ?? {}),
            ...('sourceField' in originalColumn ? { sourceField: originalColumn.sourceField } : {}),
            ...('operationType' in originalColumn
              ? { operationType: originalColumn.operationType }
              : {}),
            ...('interval' in originalColumn ? { interval: originalColumn.interval } : {}),
            ...('dropPartials' in originalColumn
              ? {
                  params: {
                    ...(params ?? {}),
                    drop_partials: Boolean(originalColumn.dropPartials),
                  },
                }
              : {}),
          },
        },
      }));
    }),
  };
};
