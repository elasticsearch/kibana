/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  EuiButtonIcon,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiProgress,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { getCascadeRowNodePath, getCascadeRowNodePathValueRecord } from '../../../../lib/utils';
import { useAdaptedTableRows } from '../../../../lib/core/table';
import {
  type GroupNode,
  type LeafNode,
  useDataCascadeActions,
  useDataCascadeState,
} from '../../../../store_provider';
import type { CascadeRowHeaderPrimitiveProps } from '../../types';
import { CascadeRowActions } from './cascade_row_actions';
import { styles as cascadeRowHeaderStyles, flexHelper } from './cascade_row_header.styles';
import { CascadeRowHeaderSlotsRenderer } from './cascade_row_header_slots_renderer';

/**
 * @internal
 */
export function CascadeRowHeaderPrimitive<G extends GroupNode, L extends LeafNode>({
  isMobile,
  rowInstance,
  rowHeaderTitleSlot: RowTitleSlot,
  rowHeaderMetaSlots,
  rowHeaderActions,
  size,
  enableRowSelection,
  enableSecondaryExpansionAction,
  isGroupNode,
  onCascadeGroupNodeExpanded,
  onCascadeGroupNodeCollapsed,
}: CascadeRowHeaderPrimitiveProps<G, L>) {
  const { euiTheme } = useEuiTheme();
  const actions = useDataCascadeActions<G, L>();
  const { currentGroupByColumns } = useDataCascadeState<G, L>();
  const [isPendingRowGroupDataFetch, setRowGroupDataFetch] = useState<boolean>(false);

  const styles = useMemo(() => cascadeRowHeaderStyles(euiTheme, size), [euiTheme, size]);

  const {
    rowData,
    rowIsExpanded,
    rowDepth,
    rowId,
    rowChildrenCount,
    rowToggleFn,
    rowSelectionFn,
    rowHasSelectedChildren,
    isRowSelected,
    rowCanSelect,
  } = useAdaptedTableRows<G, L>({ rowInstance });

  const nodePath = useMemo(
    () => getCascadeRowNodePath(currentGroupByColumns, rowInstance),
    [currentGroupByColumns, rowInstance]
  );

  const nodePathMap = useMemo(
    () => getCascadeRowNodePathValueRecord(currentGroupByColumns, rowInstance),
    [currentGroupByColumns, rowInstance]
  );

  const headerMetaSlots = useMemo(
    () => rowHeaderMetaSlots?.({ rowData, rowDepth, nodePath }),
    [rowHeaderMetaSlots, rowData, rowDepth, nodePath]
  );

  const headerActions = useMemo(
    () => rowHeaderActions?.({ rowData, nodePath }),
    [rowHeaderActions, rowData, nodePath]
  );

  const fetchGroupNodeData = useCallback(() => {
    const dataFetchFn = async () => {
      const groupNodeData = await onCascadeGroupNodeExpanded({
        row: rowInstance.original,
        nodePath,
        nodePathMap,
      });

      if (!groupNodeData) {
        return;
      }

      actions.setRowGroupNodeData({
        id: rowId,
        data: groupNodeData,
      });
    };

    return dataFetchFn().catch((error) => {
      // eslint-disable-next-line no-console -- added for debugging purposes
      console.error('Error fetching data for row with ID: %s', rowId, error);
    });
  }, [onCascadeGroupNodeExpanded, nodePath, nodePathMap, actions, rowId, rowInstance.original]);

  const onCascadeSecondaryExpansion = useCallback(() => {}, []);

  useEffect(() => {
    // fetch the data for the sub-rows
    if (isGroupNode && rowIsExpanded && !Boolean(rowChildrenCount)) {
      setRowGroupDataFetch(true);
      fetchGroupNodeData().finally(() => {
        setRowGroupDataFetch(false);
      });
    }
  }, [rowIsExpanded, rowChildrenCount, isGroupNode, fetchGroupNodeData]);

  useEffect(() => {
    if (!rowIsExpanded && isGroupNode) {
      onCascadeGroupNodeCollapsed?.({
        row: rowInstance.original,
        nodePath,
        nodePathMap,
      });
    }
  }, [
    onCascadeGroupNodeCollapsed,
    nodePath,
    nodePathMap,
    rowInstance.original,
    rowIsExpanded,
    isGroupNode,
  ]);

  return (
    <React.Fragment>
      <React.Fragment>
        {isPendingRowGroupDataFetch && (
          <EuiProgress size="xs" color="accent" position={rowDepth === 0 ? 'fixed' : 'absolute'} />
        )}
      </React.Fragment>
      <EuiFlexGroup
        data-test-subj={`${rowId}-row-header`}
        gutterSize={size}
        direction="row"
        alignItems="center"
        justifyContent="spaceBetween"
        css={flexHelper}
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <React.Fragment>
              {enableRowSelection && rowCanSelect() && (
                <EuiFlexItem grow={false}>
                  <EuiCheckbox
                    id={`dataCascadeSelectRowCheckbox-${rowId}`}
                    indeterminate={rowHasSelectedChildren()}
                    checked={isRowSelected()}
                    onChange={rowSelectionFn}
                  />
                </EuiFlexItem>
              )}
            </React.Fragment>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={
                  rowIsExpanded
                    ? i18n.translate('sharedUXPackages.dataCascade.collapseRowButtonLabel', {
                        defaultMessage: 'Collapse row',
                      })
                    : i18n.translate('sharedUXPackages.dataCascade.expandRowButtonLabel', {
                        defaultMessage: 'Expand row',
                      })
                }
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  color="text"
                  iconType={rowIsExpanded ? 'chevronSingleDown' : 'chevronSingleRight'}
                  onClick={rowToggleFn}
                  aria-label={
                    rowIsExpanded
                      ? i18n.translate('sharedUXPackages.dataCascade.collapseRowButtonLabel', {
                          defaultMessage: 'Collapse row',
                        })
                      : i18n.translate('sharedUXPackages.dataCascade.expandRowButtonLabel', {
                          defaultMessage: 'Expand row',
                        })
                  }
                  data-test-subj={`toggle-row-${rowId}-button`}
                />
              </EuiToolTip>
            </EuiFlexItem>
            <React.Fragment>
              {enableSecondaryExpansionAction && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={i18n.translate('sharedUXPackages.dataCascade.expandRowButtonLabel', {
                      defaultMessage: 'Expand row',
                    })}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      color="text"
                      iconType="maximize"
                      onClick={onCascadeSecondaryExpansion}
                      aria-label={i18n.translate(
                        'sharedUXPackages.dataCascade.expandRowButtonLabel',
                        {
                          defaultMessage: 'Expand row',
                        }
                      )}
                      data-test-subj={`expand-row-${rowId}-button`}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </React.Fragment>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem css={flexHelper}>
          <EuiFlexGroup
            gutterSize="s"
            justifyContent="spaceBetween"
            direction="row"
            responsive={false}
          >
            <EuiFlexItem grow={4} css={styles.rowHeaderTitleWrapper}>
              <RowTitleSlot rowData={rowInstance.original} nodePath={nodePath} />
            </EuiFlexItem>
            <EuiFlexItem grow={6} css={styles.rowHeaderSlotContainer}>
              <EuiFlexGroup
                direction="row"
                gutterSize="s"
                alignItems="center"
                justifyContent="flexEnd"
                css={styles.rowHeaderSlotContainerInner}
                responsive={false}
              >
                <React.Fragment>
                  {Boolean(headerMetaSlots?.length) && (
                    <EuiFlexItem css={flexHelper} grow>
                      <CascadeRowHeaderSlotsRenderer headerMetaSlots={headerMetaSlots!} />
                    </EuiFlexItem>
                  )}
                </React.Fragment>
                <React.Fragment>
                  {Boolean(headerActions?.length) && (
                    <EuiFlexItem
                      key="actions"
                      css={[
                        styles.rowHeaderSlotItemWrapper,
                        {
                          paddingLeft: euiTheme.size[size],
                        },
                      ]}
                    >
                      <CascadeRowActions headerRowActions={headerActions!} isMobile={isMobile} />
                    </EuiFlexItem>
                  )}
                </React.Fragment>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </React.Fragment>
  );
}
