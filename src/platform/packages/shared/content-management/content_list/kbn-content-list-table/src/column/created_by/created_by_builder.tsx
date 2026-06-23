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
import type { ContentListItem } from '@kbn/content-list-provider';
import { i18n } from '@kbn/i18n';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ColumnBuilderContext } from '../types';
import { column } from '../part';
import { getColumnLayoutProps, pickAttribute, type ColumnLayoutProps } from '../layout';
import { CreatedByCell } from './created_by_cell';

/**
 * Default column header.
 *
 * ContentList intentionally standardises on `'Created by'` for both the
 * column header *and* the filter button, correcting the legacy
 * `TableListView` mismatch where the column said `'Creator'` but the filter
 * said `'Created by'`. Translators in `de-DE.json` / `fr-FR.json` /
 * `ja-JP.json` / `zh-CN.json` get fresh entries for this key — see the
 * package README's "Naming and translation backfill" notes before changing
 * the wording.
 */
const DEFAULT_COLUMN_TITLE = i18n.translate(
  'contentManagement.contentList.table.column.createdBy',
  { defaultMessage: 'Created by' }
);

/**
 * Locked English baseline width for the created-by column.
 *
 * `88px` ≈ the `'Created by'` header text (~75px) plus a small breathing
 * gutter for the centered 24px avatar. Long-text locales (e.g. de "Erstellt
 * von" ~85px) still fit because `minWidth: 'max-content'` lets the column
 * expand past `width` when the header demands it.
 */
const DEFAULT_CREATED_BY_WIDTH = '88px';

/**
 * Props for the `Column.CreatedBy` preset component.
 */
export interface CreatedByColumnProps extends ColumnLayoutProps {
  /** Override column header text. Defaults to "Created by". */
  columnTitle?: string;
}

/**
 * Build an `EuiBasicTableColumn` from `Column.CreatedBy` declarative attributes.
 *
 * Returns `undefined` when `supports.userProfiles` is false so the column is
 * omitted entirely from the table (no empty column or wasted space).
 */
export const buildCreatedByColumn = (
  attributes: CreatedByColumnProps,
  context: ColumnBuilderContext
): EuiBasicTableColumn<ContentListItem> | undefined => {
  if (!context.supports?.userProfiles) {
    return undefined;
  }

  const { columnTitle } = attributes;
  const resolvedWidth = pickAttribute(attributes, 'width', DEFAULT_CREATED_BY_WIDTH);

  return {
    ...getColumnLayoutProps({
      width: resolvedWidth,
      minWidth: pickAttribute(attributes, 'minWidth', 'max-content'),
      maxWidth: pickAttribute(attributes, 'maxWidth', resolvedWidth),
      truncateText: pickAttribute(attributes, 'truncateText', undefined),
    }),
    field: 'createdBy',
    name: columnTitle ?? DEFAULT_COLUMN_TITLE,
    sortable: false,
    // The cell renders a small fixed-size `EuiAvatar` (or a `—` placeholder),
    // never free-form text — center it horizontally in the column so it
    // doesn't visually float to the left of the header.
    align: 'center',
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.columnCreatedBy,
    render: (value: string | undefined, record: ContentListItem) => {
      return <CreatedByCell createdBy={value} managed={!!record.managed} />;
    },
  };
};

/**
 * Created By column specification component for `ContentListTable`.
 *
 * This is a declarative component that doesn't render anything.
 * It specifies a column showing the item's creator as a clickable avatar.
 *
 * Clicking the avatar toggles an include filter for that user. Hold
 * Cmd (Mac) or Ctrl (Windows/Linux) while clicking to exclude instead.
 *
 * @example
 * ```tsx
 * const { Column } = ContentListTable;
 *
 * <ContentListTable title="Dashboards">
 *   <Column.Name />
 *   <Column.CreatedBy />
 *   <Column.UpdatedAt />
 * </ContentListTable>
 * ```
 */
/** EUI user-profile avatar default diameter. */
const CREATED_BY_AVATAR_SIZE = 24;

export const CreatedByColumn = column.createPreset({
  name: 'createdBy',
  resolve: buildCreatedByColumn,
  skeleton: () => ({
    shape: 'circle',
    size: CREATED_BY_AVATAR_SIZE,
  }),
});
