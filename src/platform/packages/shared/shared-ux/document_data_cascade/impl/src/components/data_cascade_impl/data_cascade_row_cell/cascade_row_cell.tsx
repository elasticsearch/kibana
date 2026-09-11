/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useSyncExternalStore,
} from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSkeletonText, useEuiTheme } from '@elastic/eui';
import type { CascadeRowCellPrimitiveProps } from '../types';
import {
  getCascadeRowNodePath,
  getCascadeRowNodePathValueRecord,
  getCascadeRowLeafDataCacheKey,
} from '../../../lib/utils';
import {
  type GroupNode,
  type LeafNode,
  useDataCascadeState,
  useDataCascadeActions,
} from '../../../store_provider';
import type { ChildVirtualizerController } from '../../../lib/core/virtualizer/child_virtualizer_controller';
import { cascadeRowCellStyles } from './cascade_row_cell.styles';

export function CascadeRowCellPrimitive<G extends GroupNode, L extends LeafNode>({
  children,
  getVirtualizer,
  onCascadeLeafNodeExpanded,
  onCascadeLeafNodeCollapsed,
  row,
  size,
}: CascadeRowCellPrimitiveProps<G, L>) {
  const { euiTheme } = useEuiTheme();
  const { leafNodes, currentGroupByColumns } = useDataCascadeState<G, L>();
  const actions = useDataCascadeActions<G, L>();
  const hasPendingRequest = useRef<boolean>(false);
  const [isPendingRowLeafDataFetch, setRowLeafDataFetch] = useState<boolean>(false);

  const styles = useMemo(() => cascadeRowCellStyles(euiTheme), [euiTheme]);

  const nodePath = useMemo(
    () => getCascadeRowNodePath(currentGroupByColumns, row),
    [currentGroupByColumns, row]
  );

  const nodePathMap = useMemo(
    () => getCascadeRowNodePathValueRecord(currentGroupByColumns, row),
    [currentGroupByColumns, row]
  );

  const leafCacheKey = useMemo(() => {
    return getCascadeRowLeafDataCacheKey(nodePath, nodePathMap, row.id);
  }, [nodePath, nodePathMap, row]);

  const leafData = useMemo(() => {
    return leafNodes.get(leafCacheKey) ?? null;
  }, [leafCacheKey, leafNodes]);

  const childController: ChildVirtualizerController = useMemo(
    () => getVirtualizer().childController,
    [getVirtualizer]
  );

  // Subscribe to the controller's activation state.
  // This is the coordination signal — the stagger decides when heavy content should mount.
  const isActivated = useSyncExternalStore(
    childController.subscribe,
    () => childController.shouldActivate(row.index),
    () => false
  );

  // Defer the enqueue by one paint frame so we are never attempting to render the heavy content in the same i/o cycle that's processing leaf data
  // this way we don't block the main thread,
  // this however means that for all cases even when the leaf data is available the skeleton will display briefly.
  const enqueueCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!childController) return;
    const rafId = requestAnimationFrame(() => {
      enqueueCleanupRef.current = childController.enqueue(leafCacheKey, row.index);
    });
    return () => {
      cancelAnimationFrame(rafId);
      enqueueCleanupRef.current?.();
      enqueueCleanupRef.current = null;
    };
  }, [childController, leafCacheKey, row.index]);

  const fetchGroupLeafData = useCallback(() => {
    const dataFetchFn = async () => {
      const groupLeafData = await onCascadeLeafNodeExpanded({
        row: row.original,
        nodePathMap,
        nodePath,
      });

      if (!groupLeafData) {
        return;
      }

      actions.setRowGroupLeafData({
        cacheKey: leafCacheKey,
        data: groupLeafData,
      });
    };

    return dataFetchFn().catch(() => {
      // do nothing, error is expected to be handled by consumer for now
    });
  }, [actions, leafCacheKey, nodePath, nodePathMap, onCascadeLeafNodeExpanded, row]);

  const fetchCascadeRowGroupLeafData = useCallback(() => {
    if (!hasPendingRequest.current) {
      hasPendingRequest.current = true;

      fetchGroupLeafData().finally(() => {
        setRowLeafDataFetch(false);
        hasPendingRequest.current = false;
      });
    }
  }, [fetchGroupLeafData]);

  useEffect(() => {
    if (!leafData && !isPendingRowLeafDataFetch) {
      fetchCascadeRowGroupLeafData();
    }
  }, [fetchCascadeRowGroupLeafData, leafData, isPendingRowLeafDataFetch]);

  useEffect(
    () => () => {
      onCascadeLeafNodeCollapsed?.({
        row: row.original,
        nodePath,
        nodePathMap,
      });
    },
    [onCascadeLeafNodeCollapsed, nodePath, nodePathMap, row]
  );

  const isRowReturning = childController?.isReturningCell(leafCacheKey) ?? false;
  const isReady =
    Boolean(leafData) && !isPendingRowLeafDataFetch && (isActivated || isRowReturning);

  const memoizedChild = useMemo(() => {
    return React.createElement(children, {
      data: leafData,
      cellId: leafCacheKey,
      key: leafCacheKey,
      nodePath,
      nodePathMap,
      virtualizerController: childController,
      rowIndex: row.index,
    });
  }, [children, leafData, leafCacheKey, nodePath, nodePathMap, childController, row.index]);

  return (
    <EuiFlexGroup>
      <EuiFlexItem css={styles.cellWrapper} tabIndex={0}>
        <EuiSkeletonText lines={3} size={size === 'l' ? 'm' : size} isLoading={!isReady}>
          <div css={styles.cellInner}>{memoizedChild}</div>
        </EuiSkeletonText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
