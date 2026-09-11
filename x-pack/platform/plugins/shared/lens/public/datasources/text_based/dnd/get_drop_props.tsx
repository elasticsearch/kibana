/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DropType } from '@kbn/dom-drag-drop';
import type {
  TextBasedPrivateState,
  TextBasedLayerColumn,
  GetDropPropsArgs,
} from '@kbn/lens-common';
import { isOperation } from '../../../types_guards';
import { isDraggedField, isOperationFromTheSameGroup } from '../../../utils';
import {
  canColumnBeDroppedInMetricDimension,
  hasNumericColumn,
  resolveTextBasedColumnType,
} from '../utils';
import { retrieveLayerColumnsFromCache } from '../fieldlist_cache';

export const getDropProps = (
  props: GetDropPropsArgs<TextBasedPrivateState>
): { dropTypes: DropType[]; nextLabel?: string } | undefined => {
  const { source, target, state, activeData } = props;
  if (!source || source.id === target.columnId) {
    return;
  }
  const layer = state.layers[target.layerId];
  const allColumns = retrieveLayerColumnsFromCache(layer.columns, layer.query);
  const targetColumn = layer.columns.find((f) => f.columnId === target.columnId);
  const targetField = allColumns.find((f) => f.columnId === target.columnId);
  const sourceField = allColumns.find((f) => f.columnId === source.id);

  // Resolve column types against the Query Result Type overlay (inspector table) when available,
  // falling back to the persisted/cache column type otherwise.
  const activeColumns = activeData?.[target.layerId]?.columns;
  const resolveType = (column: TextBasedLayerColumn) =>
    resolveTextBasedColumnType(
      column,
      activeColumns?.find((activeColumn) => activeColumn.id === column.columnId)
    );

  if (isDraggedField(source)) {
    const nextLabel = source.humanData.label;
    if (target?.isMetricDimension && sourceField && resolveType(sourceField) !== 'number') {
      return;
    }
    return {
      dropTypes: [targetColumn ? 'field_replace' : 'field_add'],
      nextLabel,
    };
  }

  if (isOperation(source)) {
    if (source.layerId !== target.layerId) return;
    const nextLabel = source.humanData.label;
    if (isOperationFromTheSameGroup(source, target)) {
      if (!targetColumn) {
        return { dropTypes: ['duplicate_compatible'], nextLabel };
      }
      return { dropTypes: ['reorder'], nextLabel };
    }

    const hasNumberColumn = hasNumericColumn(allColumns, activeColumns);

    const sourceFieldCanMoveToMetricDimension = canColumnBeDroppedInMetricDimension(
      hasNumberColumn,
      sourceField && resolveType(sourceField)
    );

    const targetFieldCanMoveToMetricDimension = canColumnBeDroppedInMetricDimension(
      hasNumberColumn,
      targetField && resolveType(targetField)
    );

    const isMoveable =
      !target?.isMetricDimension ||
      (target.isMetricDimension && sourceFieldCanMoveToMetricDimension);

    if (targetColumn) {
      const isSwappable =
        (isMoveable && !source?.isMetricDimension) ||
        (source.isMetricDimension && targetFieldCanMoveToMetricDimension);
      if (isMoveable) {
        if (isSwappable) {
          return {
            dropTypes: ['replace_compatible', 'replace_duplicate_compatible', 'swap_compatible'],
            nextLabel,
          };
        }
        return {
          dropTypes: ['replace_compatible', 'replace_duplicate_compatible'],
          nextLabel,
        };
      }
    } else {
      if (isMoveable) {
        return {
          dropTypes: ['move_compatible', 'duplicate_compatible'],
          nextLabel,
        };
      }
    }
  }
  return;
};
