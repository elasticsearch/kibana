/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiDraggable, EuiFlexGroup, EuiFlexItem, EuiIcon } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import { BodyRow } from './body_row';
import type { Column } from './types';

export interface DraggableBodyRowProps<Item> {
  additionalProps?: object;
  ariaRowindex?: number;
  columns: Array<Column<Item>>;
  disableDragging?: boolean;
  errors?: string[];
  item: Item;
  rowIdentifier?: string;
  rowIndex: number;
}

export const DraggableBodyRow = <Item extends object>({
  additionalProps,
  ariaRowindex,
  columns,
  disableDragging = false,
  errors,
  item,
  rowIdentifier,
  rowIndex,
}: DraggableBodyRowProps<Item>) => {
  const draggableId = `draggable_row_${rowIndex}`;

  return (
    <EuiDraggable
      index={rowIndex}
      draggableId={draggableId}
      isDragDisabled={disableDragging}
      customDragHandle={!disableDragging}
      hasInteractiveChildren
      usePortal
      {...additionalProps}
    >
      {(provided) => (
        <BodyRow
          columns={columns}
          item={item}
          additionalProps={additionalProps}
          leftAction={
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem>
                {disableDragging ? (
                  <div style={{ width: '16px' }} />
                ) : (
                  <div
                    {...provided.dragHandleProps}
                    data-test-subj="dragHandle"
                    aria-label={i18n.translate(
                      'xpack.contentConnectors.draggableBodyRow.dragHandleLabel',
                      { defaultMessage: 'Drag handle' }
                    )}
                  >
                    <EuiIcon type="dragVertical" aria-hidden={true} />
                  </div>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          }
          rowIdentifier={rowIdentifier}
          errors={errors}
          ariaRowindex={ariaRowindex}
        />
      )}
    </EuiDraggable>
  );
};
