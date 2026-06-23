/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSkeletonRectangle, useEuiTheme } from '@elastic/eui';
import { getContentListToolbarSubjects } from '@kbn/content-list-common';

/**
 * Approximate width of a filter button. EUI filter buttons size to content,
 * so an exact width isn't possible without rendering real labels — this is
 * visually close enough that the swap to the real toolbar doesn't shift
 * horizontally. Off-scale relative to `euiTheme.size`, so kept as a literal.
 */
const FILTER_BUTTON_WIDTH = 100;

/**
 * Props for {@link ToolbarSkeleton}.
 */
export interface ToolbarSkeletonProps {
  /** Number of filter-button placeholders to render to the right of the search input. */
  filterCount: number;
  /** When `true`, prepends a narrow checkbox placeholder matching the real selection UI. */
  hasSelection: boolean;
  /** Optional `data-test-subj`. */
  'data-test-subj'?: string;
}

/**
 * Loading-state placeholder for `ContentListToolbar`.
 *
 * Mirrors the real toolbar's horizontal layout: an optional selection
 * checkbox, a full-width search input, and one rectangle per configured
 * filter button. All cells share the same row height so the swap to the
 * real toolbar produces no vertical shift.
 */
export const ToolbarSkeleton = ({
  filterCount,
  hasSelection,
  'data-test-subj': dataTestSubj = getContentListToolbarSubjects().skeleton,
}: ToolbarSkeletonProps) => {
  const { euiTheme } = useEuiTheme();
  // Row height matches the rendered height of EUI's search-bar input and
  // filter buttons (`euiTheme.size.xxl`), and the selection checkbox occupies
  // the same `euiTheme.size.xl` width as the real `EuiCheckbox` cell.
  const rowHeight = euiTheme.size.xxl;
  const selectionCheckboxWidth = euiTheme.size.xl;

  return (
    <EuiFlexGroup
      gutterSize="s"
      alignItems="center"
      responsive={false}
      data-test-subj={dataTestSubj}
    >
      {hasSelection && (
        <EuiFlexItem grow={false}>
          <EuiSkeletonRectangle
            isLoading
            width={selectionCheckboxWidth}
            height={rowHeight}
            borderRadius="s"
          />
        </EuiFlexItem>
      )}
      <EuiFlexItem>
        <EuiSkeletonRectangle isLoading width="100%" height={rowHeight} borderRadius="s" />
      </EuiFlexItem>
      {Array.from({ length: filterCount }, (_unused, idx) => (
        <EuiFlexItem key={idx} grow={false}>
          <EuiSkeletonRectangle
            isLoading
            width={FILTER_BUTTON_WIDTH}
            height={rowHeight}
            borderRadius="s"
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};
