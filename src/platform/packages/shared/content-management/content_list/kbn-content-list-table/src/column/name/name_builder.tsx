/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { ReactNode } from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ContentListItem } from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ColumnBuilderContext } from '../types';
import { column } from '../part';
import { getColumnLayoutProps, pickAttribute, type ColumnLayoutProps } from '../layout';
import { NameCell, type NameCellProps } from './name_cell';

/** Default i18n-translated column title for the name column. */
const DEFAULT_NAME_COLUMN_TITLE = i18n.translate(
  'contentManagement.contentList.table.column.name.title',
  { defaultMessage: 'Name' }
);

/**
 * Preferred width for the name column.
 *
 * `64em` (~896px at the default theme scale) is a comfortable maximum line
 * length for descriptive text. Set as `width` (not just `maxWidth`) so the
 * column actually stops at this size on wide pages — `max-width` is ignored
 * by browsers on `<th>` / `<td>` regardless of `table-layout`, so a `width`
 * is the only way to lock the column. The `ContentListTable` then appends
 * a trailing CSS pseudo-cell (`tr::after { display: table-cell; }`) to
 * absorb the leftover slack, putting the trailing whitespace after the
 * populated columns instead of inside the Name cell. See the package
 * README's "Defaults" section for the full width / minWidth / maxWidth
 * contract.
 *
 * On viewports narrower than the sum of all column widths, the browser
 * shrinks `Column.Name` first (because it has the most slack to give up
 * before it hits {@link DEFAULT_NAME_MIN_WIDTH}), so the floor is what
 * keeps the cell readable on small screens. On viewports ≥ 2560px (~4K)
 * `ContentListTable` widens the column past this preferred footprint via
 * a media-query CSS override (`cssWideViewportNameWidth` in
 * `content_list_table.tsx`) so users with wide displays see more of the
 * title — the trailing pseudo-cell still absorbs whatever remains.
 */
const DEFAULT_NAME_WIDTH = '64em';

/**
 * Floor for the name column.
 *
 * Matches the legacy `TableListView` `minWidth: '18em'` so the title, optional
 * description, and inline tags stay readable as the table narrows. The
 * browser will shrink `Column.Name` from {@link DEFAULT_NAME_WIDTH} down to
 * this floor on narrow viewports before tightening sibling columns.
 */
const DEFAULT_NAME_MIN_WIDTH = '18em';

/**
 * Advisory cap for the name column.
 *
 * Mirrors {@link DEFAULT_NAME_WIDTH} for API parity with sibling presets,
 * which all pin `width === maxWidth`. The cap itself is dead weight on
 * `<th>` / `<td>` (browsers ignore `max-width` on table cells per the CSS
 * Tables spec); the visible footprint is enforced by `width` plus the
 * trailing CSS pseudo-cell injected by `ContentListTable`.
 *
 * Intentionally not `'max-content'`: `Column.Name` cells render user-supplied
 * titles whose intrinsic width can be arbitrarily large, so an intrinsic-size
 * floor or cap would let one long title explode the whole column.
 */
const DEFAULT_NAME_MAX_WIDTH = DEFAULT_NAME_WIDTH;

/**
 * Props for the `Column.Name` preset component.
 *
 * These are the declarative attributes consumers pass in JSX. The name builder
 * reads them directly from the parsed attributes.
 */
export interface NameColumnProps extends ColumnLayoutProps {
  /** Custom column title. Defaults to `'Name'`. */
  columnTitle?: string;
  /**
   * Whether the column is sortable.
   *
   * @default true
   */
  sortable?: boolean;
  /**
   * Whether to show the description.
   *
   * @default true
   */
  showDescription?: boolean;
  /**
   * Whether to show tags below the title/description.
   * Requires `item.tags` to contain tag IDs and a tags service
   * to be configured on the `ContentListProvider`.
   *
   * Auto-enabled when the provider has `supports.tags === true`
   * (i.e., a tags service is configured). Set to `false` to
   * explicitly disable tags even when the service is available.
   *
   * @default supports.tags
   */
  showTags?: boolean;
  /**
   * Whether to show a star button inline after the title.
   * Requires `services.favorites` to be configured on the `ContentListProvider`.
   *
   * @default false
   */
  showStarred?: boolean;
  /**
   * Optional click handler for the title.
   * When provided, the provider-level `item.getHref` is ignored unless
   * `shouldUseHref` is explicitly `true`.
   */
  onClick?: (item: ContentListItem) => void;
  /**
   * Whether to use the provider-level `item.getHref` for the title link.
   * Defaults to `true` unless `onClick` is provided.
   */
  shouldUseHref?: boolean;
  /**
   * Optional click handler for tag badges.
   * Called with the tag and a boolean indicating whether a modifier key
   * (Cmd on Mac, Ctrl on Windows/Linux) was held during the click.
   * Only effective when `showTags` is `true`.
   */
  onTagClick?: NameCellProps['onTagClick'];
  /** Custom render function (overrides default rendering). */
  render?: (item: ContentListItem) => ReactNode;
}

/**
 * Build an `EuiBasicTableColumn` from `Column.Name` declarative attributes.
 *
 * @param attributes - The declarative attributes from the parsed `Column.Name` element.
 * @param context - Builder context with provider configuration.
 * @returns An `EuiBasicTableColumn<ContentListItem>` for the name column.
 */
export const buildNameColumn = (
  attributes: NameColumnProps,
  context: ColumnBuilderContext
): EuiBasicTableColumn<ContentListItem> => {
  const {
    columnTitle,
    sortable: sortableProp,
    showDescription = true,
    showTags = context.supports?.tags ?? false,
    showStarred = false,
    onClick,
    shouldUseHref,
    onTagClick,
    render: customRender,
  } = attributes;

  const supportsSorting = context.supports?.sorting ?? true;

  // Default sortable to `true` for the title field, when sorting is supported.
  const sortable = supportsSorting ? sortableProp ?? true : false;

  return {
    field: 'title',
    name: columnTitle ?? DEFAULT_NAME_COLUMN_TITLE,
    sortable,
    ...getColumnLayoutProps({
      width: pickAttribute(attributes, 'width', DEFAULT_NAME_WIDTH),
      minWidth: pickAttribute(attributes, 'minWidth', DEFAULT_NAME_MIN_WIDTH),
      maxWidth: pickAttribute(attributes, 'maxWidth', DEFAULT_NAME_MAX_WIDTH),
      truncateText: pickAttribute(attributes, 'truncateText', undefined),
    }),
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.columnName,
    render: (title: string, item: ContentListItem) => {
      if (customRender) {
        return customRender(item);
      }

      return (
        <NameCell
          {...{ item, showDescription, showTags, showStarred, onClick, shouldUseHref, onTagClick }}
        />
      );
    },
  };
};

/**
 * Name column specification component for `ContentListTable`.
 *
 * This is a declarative component that doesn't render anything.
 * It's used to specify the Name column configuration as React children.
 *
 * @example Basic usage
 * ```tsx
 * const { Column } = ContentListTable;
 *
 * <ContentListTable>
 *   <Column.Name />
 * </ContentListTable>
 * ```
 *
 * @example With custom configuration
 * ```tsx
 * const { Column } = ContentListTable;
 *
 * <ContentListTable>
 *   <Column.Name
 *     showDescription={false}
 *     showTags
 *     width="50%"
 *   />
 * </ContentListTable>
 * ```
 */
/**
 * Default width for the skeleton placeholder.
 *
 * `40%` is a visually plausible bar length for a loading row; it deliberately
 * does *not* track `DEFAULT_NAME_WIDTH` because the skeleton is a single
 * placeholder bar, not a sized cell. The live cell's width is set on the
 * column itself via {@link DEFAULT_NAME_WIDTH}.
 */
const DEFAULT_NAME_SKELETON_WIDTH = '40%';

export const NameColumn = column.createPreset({
  name: 'name',
  resolve: buildNameColumn,
  skeleton: (attributes) => ({
    shape: 'text',
    width: attributes.width ?? DEFAULT_NAME_SKELETON_WIDTH,
  }),
});
