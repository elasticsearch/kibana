/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiIcon } from '@elastic/eui';
import type { ContentListItem } from '@kbn/content-list-provider';
import { useContentListFilters, getIncludeExcludeFlag } from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ColumnBuilderContext } from '../types';
import { column } from '../part';
import { getColumnLayoutProps, pickAttribute, type ColumnLayoutProps } from '../layout';
import { StarredCell } from './starred_cell';

/**
 * Locked width for the starred column.
 *
 * The header and cell render a single 16px `EuiIcon`; `40px` gives the icon
 * a small centered gutter on both sides without wasting horizontal space.
 * Both `minWidth` and `maxWidth` default to the same value so the column
 * stays pinned at exactly the icon footprint regardless of available table
 * width. No `'max-content'` floor needed because the header is iconic, not
 * textual, and so has no locale exposure.
 */
const DEFAULT_WIDTH = '40px';

/**
 * Column header for `Column.Starred`.
 *
 * Renders a filled star when the `starred` flag filter is active, and an
 * empty star otherwise, giving the header a live indicator of the filter state.
 */
const StarredColumnHeader = () => {
  const { filters } = useContentListFilters();
  const isStarredActive = getIncludeExcludeFlag(filters.starred)?.state === 'include';
  return (
    <EuiIcon type={isStarredActive ? 'starFilled' : 'starEmpty'} size="m" aria-label="Starred" />
  );
};

/**
 * Props for the `Column.Starred` preset component.
 */
export interface StarredColumnProps
  extends Pick<ColumnLayoutProps, 'width' | 'minWidth' | 'maxWidth'> {
  /** Column width (CSS value). Defaults to `'40px'`. */
  width?: string;
}

/**
 * Build an `EuiBasicTableColumn` from `Column.Starred` declarative attributes.
 *
 * Returns `undefined` when `supports.starred` is false so the column is
 * omitted entirely from the table (no empty column or wasted space).
 * Returns a narrow, non-sortable column containing a star icon button otherwise.
 */
export const buildStarredColumn = (
  attributes: StarredColumnProps,
  context: ColumnBuilderContext
): EuiBasicTableColumn<ContentListItem> | undefined => {
  if (!context.supports?.starred) {
    return undefined;
  }

  return {
    field: 'id',
    name: <StarredColumnHeader />,
    align: 'center' as const,
    sortable: false,
    ...getColumnLayoutProps({
      width: pickAttribute(attributes, 'width', DEFAULT_WIDTH),
      minWidth: pickAttribute(attributes, 'minWidth', DEFAULT_WIDTH),
      maxWidth: pickAttribute(attributes, 'maxWidth', DEFAULT_WIDTH),
    }),
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.columnStarred,
    render: (_value: string, item: ContentListItem) => {
      return <StarredCell id={item.id} />;
    },
  };
};

/**
 * Starred column specification component for `ContentListTable`.
 *
 * This is a declarative component that doesn't render anything.
 * It specifies a narrow star-icon column.
 *
 * @example
 * ```tsx
 * const { Column } = ContentListTable;
 *
 * <ContentListTable title="Dashboards">
 *   <Column.Starred />
 *   <Column.Name />
 *   <Column.UpdatedAt />
 * </ContentListTable>
 * ```
 */
/** Star glyph is square-ish and small; a narrow centered rectangle reads
 *  as an icon placeholder without pretending to be a perfect circle. */
const STARRED_SKELETON_SIZE = 16;

export const StarredColumn = column.createPreset({
  name: 'starred',
  resolve: buildStarredColumn,
  skeleton: () => ({
    shape: 'rectangle',
    width: STARRED_SKELETON_SIZE,
    height: STARRED_SKELETON_SIZE,
  }),
});
