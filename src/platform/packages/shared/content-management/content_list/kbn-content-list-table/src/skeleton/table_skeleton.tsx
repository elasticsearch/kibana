/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiSkeletonCircle,
  EuiSkeletonRectangle,
  EuiSkeletonText,
  useEuiTheme,
  type UseEuiTheme,
} from '@elastic/eui';
import { isCustomSkeletonNode, type SkeletonOutput } from '@kbn/content-list-assembly';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ResolvedColumn } from '../hooks/use_columns';

/**
 * Approximate body-row placeholder height. A real EUI body cell is
 * `2 × euiTheme.border.width.thin` + `2 × euiTheme.size.s` (or `xs` when
 * compressed) + `euiFontSize('m').lineHeight` — no single theme token covers
 * that sum, so this is a tuned visual fit rather than a derived value.
 */
const CELL_HEIGHT = 28;

/**
 * Approximate header-row placeholder height. Sized for visual prominence
 * over `CELL_HEIGHT` rather than to match the rendered EUI header height.
 */
const HEADER_HEIGHT = 36;

export const MAX_SKELETON_ROW_COUNT = 20;

const tableCss = css`
  width: 100%;
  border-collapse: collapse;
`;

const headerCellCssFor = (euiTheme: UseEuiTheme['euiTheme']) => css`
  padding: ${euiTheme.size.s} ${euiTheme.size.base};
  vertical-align: middle;
`;

const bodyCellCssFor = (euiTheme: UseEuiTheme['euiTheme'], compressed: boolean) => css`
  padding: ${compressed ? euiTheme.size.xs : euiTheme.size.s} ${euiTheme.size.base};
  vertical-align: middle;
`;

const renderSkeletonCell = (
  output: SkeletonOutput,
  defaultRectangleHeight: string
): React.ReactNode => {
  if (isCustomSkeletonNode(output)) {
    return output.node;
  }

  if (output.shape === 'text') {
    // `EuiSkeletonText` occupies the full width of its container by
    // default; wrap in a fixed-width box to honor the descriptor.
    return (
      <div style={{ width: output.width ?? '100%' }}>
        <EuiSkeletonText lines={output.lines ?? 1} isLoading />
      </div>
    );
  }

  if (output.shape === 'circle') {
    return (
      <EuiSkeletonCircle isLoading size="m" style={{ width: output.size, height: output.size }} />
    );
  }

  // Rectangle is the default.
  return (
    <EuiSkeletonRectangle
      isLoading
      width={output.width ?? '100%'}
      height={output.height ?? defaultRectangleHeight}
      borderRadius="s"
    />
  );
};

/**
 * Props for {@link TableSkeleton}.
 */
export interface TableSkeletonProps {
  /** Resolved columns and their skeleton descriptors. */
  columns: ResolvedColumn[];
  /** Whether to prepend the selection checkbox column. */
  hasSelection: boolean;
  /**
   * Desired body row count. Clamped to `1..MAX_SKELETON_ROW_COUNT` so the
   * skeleton tracks page size without creating huge loading placeholders.
   */
  rowCount?: number;
  /** Matches the real table layout. */
  tableLayout: 'fixed' | 'auto';
  /** Matches the real table density. */
  compressed: boolean;
  'data-test-subj'?: string;
}

interface ColumnDescriptor {
  /** Stable React `key` derived from `field` or column index. */
  key: string | number;
  /** Inline `style` for the `<th>`/`<td>` width, or `undefined` to skip allocation. */
  style: { width: string | number } | undefined;
  /** Pre-rendered body-cell content. Identical across rows. */
  bodyContent: React.ReactNode;
}

/**
 * Column-aware loading skeleton shown while the initial table fetch is in
 * flight. Cell shapes come from preset/custom descriptors or column metadata.
 */
export const TableSkeleton = ({
  columns,
  hasSelection,
  rowCount,
  tableLayout,
  compressed,
  'data-test-subj': dataTestSubj = CONTENT_LIST_TEST_SUBJECTS.tableSkeleton,
}: TableSkeletonProps) => {
  const { euiTheme } = useEuiTheme();

  const headerCellCss = useMemo(() => headerCellCssFor(euiTheme), [euiTheme]);
  const bodyCellCss = useMemo(() => bodyCellCssFor(euiTheme, compressed), [euiTheme, compressed]);

  // Pre-compute per-column descriptors so the body-row loop reuses the same
  // React nodes across all rows instead of re-allocating per cell.
  const columnDescriptors = useMemo<ColumnDescriptor[]>(
    () =>
      columns.map((resolved, colIdx) => {
        const colWidth = 'width' in resolved.column ? resolved.column.width : undefined;
        const colKey =
          'field' in resolved.column && resolved.column.field
            ? String(resolved.column.field)
            : colIdx;
        return {
          key: colKey,
          style: colWidth ? { width: colWidth } : undefined,
          bodyContent: renderSkeletonCell(resolved.skeleton, euiTheme.size.base),
        };
      }),
    [columns, euiTheme.size.base]
  );

  const clampedRowCount = Math.min(
    Math.max(rowCount ?? MAX_SKELETON_ROW_COUNT, 1),
    MAX_SKELETON_ROW_COUNT
  );

  // Width of the selection checkbox column matches `euiTheme.size.xl` (32px),
  // which is the rendered width of the EUI checkbox cell.
  const checkboxColumnWidth = euiTheme.size.xl;
  const checkboxColumnStyle = useMemo(
    () => ({ width: checkboxColumnWidth }),
    [checkboxColumnWidth]
  );

  return (
    <table css={tableCss} style={{ tableLayout }} data-test-subj={dataTestSubj} aria-hidden="true">
      <thead>
        <tr>
          {hasSelection && (
            <th css={headerCellCss} style={checkboxColumnStyle}>
              <EuiSkeletonRectangle
                isLoading
                width={checkboxColumnWidth}
                height={HEADER_HEIGHT}
                borderRadius="s"
              />
            </th>
          )}
          {columnDescriptors.map(({ key, style }) => (
            <th key={key} css={headerCellCss} style={style}>
              <EuiSkeletonRectangle
                isLoading
                width="100%"
                height={HEADER_HEIGHT}
                borderRadius="s"
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: clampedRowCount }, (_unused, rowIdx) => (
          <tr key={rowIdx} data-test-subj={`${dataTestSubj}-row`}>
            {hasSelection && (
              <td css={bodyCellCss} style={checkboxColumnStyle}>
                <EuiSkeletonRectangle
                  isLoading
                  width={checkboxColumnWidth}
                  height={CELL_HEIGHT}
                  borderRadius="s"
                />
              </td>
            )}
            {columnDescriptors.map(({ key, style, bodyContent }) => (
              <td key={key} css={bodyCellCss} style={style}>
                {bodyContent}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
