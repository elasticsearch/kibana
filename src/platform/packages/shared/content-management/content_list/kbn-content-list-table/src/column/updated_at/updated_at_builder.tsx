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
import { i18n } from '@kbn/i18n';
import type { ContentListItem } from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ColumnBuilderContext } from '../types';
import { column } from '../part';
import { getColumnLayoutProps, pickAttribute, type ColumnLayoutProps } from '../layout';
import { UpdatedAtCell } from './updated_at_cell';

/** Default i18n-translated column title for the updated at column. */
const DEFAULT_UPDATED_AT_COLUMN_TITLE = i18n.translate(
  'contentManagement.contentList.table.column.updatedAt.title',
  { defaultMessage: 'Last updated' }
);

/**
 * English baseline width for the updated-at column.
 *
 * `9.5em` matches the legacy `TableListView` width — chosen so the column
 * always fits both relative time strings ("2 hours ago") and abbreviated
 * absolute dates ("Jan 5, 2025"). With `tableLayout='auto'`, longer
 * translated headers (e.g. de "Letzte Aktualisierung", fr "Dernière mise à
 * jour") still expand the column past this width via the `'max-content'`
 * `minWidth` floor below — `min-width` trumps `max-width` per the CSS spec.
 */
const DEFAULT_UPDATED_AT_WIDTH = '9.5em';

/**
 * Props for the `Column.UpdatedAt` preset component.
 *
 * These are the declarative attributes consumers pass in JSX. The builder
 * reads them directly from the parsed attributes.
 */
export interface UpdatedAtColumnProps extends ColumnLayoutProps {
  /** Custom column title. Defaults to `'Last updated'`. */
  columnTitle?: string;
  /**
   * Whether the column is sortable.
   *
   * @default true
   */
  sortable?: boolean;
}

/**
 * Build an `EuiBasicTableColumn` from `Column.UpdatedAt` declarative attributes.
 *
 * @param attributes - The declarative attributes from the parsed `Column.UpdatedAt` element.
 * @param context - Builder context with provider configuration.
 * @returns An `EuiBasicTableColumn<ContentListItem>` for the updated at column.
 */
export const buildUpdatedAtColumn = (
  attributes: UpdatedAtColumnProps,
  context: ColumnBuilderContext
): EuiBasicTableColumn<ContentListItem> => {
  const { columnTitle, sortable: sortableProp } = attributes;

  const supportsSorting = context.supports?.sorting ?? true;

  // Default sortable to `true` for the updatedAt field, when sorting is supported.
  const sortable = supportsSorting ? sortableProp ?? true : false;

  const resolvedWidth = pickAttribute(attributes, 'width', DEFAULT_UPDATED_AT_WIDTH);

  return {
    field: 'updatedAt',
    name: columnTitle ?? DEFAULT_UPDATED_AT_COLUMN_TITLE,
    sortable,
    ...getColumnLayoutProps({
      width: resolvedWidth,
      minWidth: pickAttribute(attributes, 'minWidth', 'max-content'),
      // `maxWidth` cascades from `width`: if the consumer overrides `width`
      // (and doesn't override `maxWidth`), the cap follows the new width so
      // the column stays locked at the consumer's preferred footprint.
      maxWidth: pickAttribute(attributes, 'maxWidth', resolvedWidth),
      truncateText: pickAttribute(attributes, 'truncateText', undefined),
    }),
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.columnUpdatedAt,
    render: (_value: Date | undefined, item: ContentListItem) => {
      return <UpdatedAtCell updatedAt={item.updatedAt} />;
    },
  };
};

/**
 * UpdatedAt column specification component for `ContentListTable`.
 *
 * This is a declarative component that doesn't render anything.
 * It's used to specify the UpdatedAt column configuration as React children.
 *
 * @example Basic usage
 * ```tsx
 * const { Column } = ContentListTable;
 *
 * <ContentListTable>
 *   <Column.Name />
 *   <Column.UpdatedAt />
 * </ContentListTable>
 * ```
 *
 * @example With custom configuration
 * ```tsx
 * const { Column } = ContentListTable;
 *
 * <ContentListTable>
 *   <Column.Name />
 *   <Column.UpdatedAt
 *     columnTitle="Modified"
 *     width="150px"
 *   />
 * </ContentListTable>
 * ```
 */
export const UpdatedAtColumn = column.createPreset({
  name: 'updatedAt',
  resolve: buildUpdatedAtColumn,
  skeleton: (attributes) => ({
    shape: 'text',
    width: attributes.width ?? DEFAULT_UPDATED_AT_WIDTH,
  }),
});
