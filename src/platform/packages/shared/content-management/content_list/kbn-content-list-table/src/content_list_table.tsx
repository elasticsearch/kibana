/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import type { ReactNode } from 'react';
import { css } from '@emotion/react';
import { EuiBasicTable, useEuiTheme } from '@elastic/eui';
import type { EuiBreakpointSize, EuiThemeComputed } from '@elastic/eui';
import { cssFavoriteHoverWithinEuiTableRow } from '@kbn/content-management-favorites-public';
import { CONTENT_LIST_TEST_SUBJECTS, getContentListRowSubj } from '@kbn/content-list-common';
import {
  useContentListConfig,
  useContentListItems,
  useContentListPagination,
  useDeleteConfirmation,
  type ContentListItem,
} from '@kbn/content-list-provider';
import {
  Column as BaseColumn,
  NameColumn,
  UpdatedAtColumn,
  ActionsColumn,
  StarredColumn,
  CreatedByColumn,
} from './column';
import { Action as BaseAction, EditAction, DeleteAction, ContentEditorAction } from './action';
import { useColumns, useSorting, useSelection } from './hooks';
import { TableSkeleton } from './skeleton/table_skeleton';
import { WIDE_VIEWPORT_NAME_BREAKPOINT_PX } from './breakpoints';

/**
 * Props for ContentListTable component.
 */
export interface ContentListTableProps {
  /** Accessible title for the table (used as table caption for screen readers). */
  title: string;
  /** Table layout mode. */
  tableLayout?: 'fixed' | 'auto';
  /** Compressed table style. */
  compressed?: boolean;
  /**
   * Whether to enable horizontal scrolling when columns exceed the container width.
   * Required for sticky columns (e.g. `Column.Actions` with `sticky: true`).
   *
   * @default true
   */
  scrollableInline?: boolean;
  /**
   * Named breakpoint below which the table collapses into responsive cards.
   * Set to `false` to always render as a table, or `true` to always render cards.
   *
   * Content List defaults to `false` because the card layout does not support
   * selection checkboxes, tag badges, star buttons, or action columns.
   *
   * @default false
   */
  responsiveBreakpoint?: EuiBreakpointSize | boolean;
  /**
   * Custom message to display when a search or filter returns zero results.
   * When omitted, `EuiBasicTable` renders its built-in empty row. Has no
   * effect when the whole list is empty; `<ContentList>` owns that state.
   */
  noItemsMessage?: ReactNode;
  /**
   * Column components as children.
   * If no children provided, defaults to Name column.
   */
  children?: ReactNode;
  /**
   * Optional filter function to filter items from the provider.
   * Useful when multiple tables share a single provider but display different subsets.
   *
   * **Important:** This function should be memoized (e.g., with `useCallback`) to prevent
   * unnecessary re-filtering on every render.
   *
   * @example
   * ```tsx
   * const filter = useCallback(
   *   (item: ContentListItem) => item.type === 'dashboard',
   *   []
   * );
   * <ContentListTable filter={filter} />
   * ```
   */
  filter?: (item: ContentListItem) => boolean;
  /** Test subject for testing. */
  'data-test-subj'?: string;
}

/**
 * Get a stable row ID for EuiBasicTable's `itemId` prop.
 *
 * @param id - The item's ID.
 * @returns A stable row ID string.
 */
export const getRowId = getContentListRowSubj;

/**
 * Keep sticky cells (e.g. `Column.Actions` with `sticky: true`) in visual sync
 * with the row's interactive backgrounds.
 *
 * EUI paints sticky cells with `--euiTableCellStickyBackgroundColor`
 * (defaulting to `backgroundBasePlain`) so they occlude scrolled-over cells.
 * That solid fill also overrides the row's hover/selected backgrounds, leaving
 * the actions column out of the highlight. We update the CSS variable for each
 * interactive row state so the sticky cell tracks the row's color.
 *
 * Hover uses `transparent` rather than the row token, because EUI's
 * `tableRowBackgroundHover` (`primary100Alpha4`) is a 4% translucent overlay
 * — applying it on both the row and the sticky cell stacks the alpha and
 * darkens the cell. Letting the row's translucent fill bleed through keeps
 * the colors in lockstep. (Hovering during horizontal scroll could briefly
 * leak content under the cell, which is acceptable for a transient state.)
 *
 * Selected states use `tableRowBackgroundSelected` /
 * `tableRowBackgroundSelectedHover` directly because those tokens are opaque
 * (`primary10` / `primary20`) and don't suffer the layering problem.
 */
const cssStickyCellRowStateSync = (euiTheme: EuiThemeComputed) => css`
  .euiTableRow {
    &:hover {
      --euiTableCellStickyBackgroundColor: transparent;
    }
    &.euiTableRow-isSelected {
      --euiTableCellStickyBackgroundColor: ${euiTheme.components.tableRowBackgroundSelected};
      &:hover {
        --euiTableCellStickyBackgroundColor: ${euiTheme.components.tableRowBackgroundSelectedHover};
      }
    }
  }
`;

/**
 * Render a trailing spacer column purely in CSS, via a `::after`
 * pseudo-cell on every `<tr>`, activated only at viewports ≥
 * {@link WIDE_VIEWPORT_NAME_BREAKPOINT_PX}.
 *
 * Browsers ignore `max-width` on table cells (per the
 * [CSS Tables spec](https://drafts.csswg.org/css-tables/#computing-the-table-width)),
 * so the only way to keep populated columns at their preferred widths on a
 * wide page is to give the slack to a column that wants it. Without a
 * trailing absorber, that role falls to whichever column has no explicit
 * `width` (typically `Column.Name`), which then stretches to fill the table.
 *
 * Setting `display: table-cell` on a `tr::after` is the spec-defined way to
 * inject an anonymous, unsized table cell into the layout algorithm without
 * adding any markup. Because every preset ships with an explicit `width`,
 * the pseudo-cell is the only column without one, so the browser hands it
 * all the leftover horizontal space — populated columns sit left-aligned at
 * their preferred widths and the trailing whitespace lives after the last
 * populated column.
 *
 * The rule is scoped to the wide-viewport media query so the pseudo-cell
 * does not appear on narrower viewports where the spacer is not needed.
 *
 * Why a pseudo-cell rather than a real `<td>` column:
 * - **No DOM impact** — the rendered table has exactly the columns the
 *   consumer declared.
 * - **No accessibility impact** — pseudo-elements aren't in the
 *   accessibility tree, so screen readers report the correct column count
 *   and don't announce a phantom "blank cell" at the end of every row.
 * - **No clipboard impact** — `content: ''` isn't selectable, so copying
 *   rows into a spreadsheet doesn't add a trailing tab.
 *
 * `border-block` mirrors the `border-vertical: euiTheme.border.thin`
 * declaration that EUI applies to every real `<th>` / `<td>` (see
 * `table_row_cell.styles.js` and `table_cells_shared.styles.js` in
 * `@elastic/eui`). Without it, the row separator would stop at the last
 * populated cell and leave the trailing whitespace visually un-ruled.
 *
 * @see {@link DEFAULT_NAME_WIDTH} in `name_builder.tsx` for why
 * `Column.Name` ships with an explicit `width`.
 */
const cssTrailingSpacer = (euiTheme: EuiThemeComputed) => css`
  @media (min-width: ${WIDE_VIEWPORT_NAME_BREAKPOINT_PX}px) {
    thead tr::after,
    tbody tr::after {
      content: '';
      display: table-cell;
      border-block: ${euiTheme.border.thin};
    }
  }
`;

/**
 * Preferred {@link DEFAULT_NAME_WIDTH} bump applied at viewports
 * ≥ {@link WIDE_VIEWPORT_NAME_BREAKPOINT_PX}.
 *
 * `90em` (~1440px) keeps the column inside a comfortable reading-line
 * range while letting longer titles render without truncation. The
 * trailing pseudo-cell from {@link cssTrailingSpacer} still absorbs
 * everything beyond this width, so even on truly massive viewports the
 * title column stops growing here.
 */
const WIDE_VIEWPORT_NAME_WIDTH = '90em';

/**
 * Widen `Column.Name` on viewports ≥ {@link WIDE_VIEWPORT_NAME_BREAKPOINT_PX}.
 *
 * EUI applies `width` / `max-width` as inline styles on every `<th>` and
 * `<td>` (via `resolveWidthPropsAsStyle` in `@elastic/eui`), so the only
 * way to override them from CSS is with `!important`. That trade is worth
 * it here because the alternative — driving the bump from JS via
 * `matchMedia` + `useState` + `useEffect` and either swapping the column's
 * `width` or appending a layout-only column — adds either re-render churn
 * on resize or a phantom DOM cell that screen readers see as a real column
 * (no amount of imperative `aria-hidden`/`role="presentation"` hides it
 * cleanly from the table grid).
 *
 * The trailing pseudo-cell from {@link cssTrailingSpacer} still absorbs
 * leftover horizontal slack at every viewport size, so this rule only
 * shifts the `Column.Name` / spacer ratio on wide pages — populated
 * sibling columns (UpdatedAt, CreatedBy, Actions, etc.) keep their
 * defaults.
 *
 * Selectors:
 * - **Body** — `td[data-test-subj='content-list-table-column-name']`. The
 *   column object's `data-test-subj` is forwarded by `EuiBasicTable`'s
 *   `renderItemCell` via the spread `rest` props.
 * - **Header** — `th[data-test-subj^='tableHeaderCell_title_']`. EUI's
 *   `renderTableHead` always emits
 *   `data-test-subj="tableHeaderCell_${field}_${index}"`, and
 *   `Column.Name`'s `field` is `'title'`. The `^=` prefix match keeps the
 *   selector stable regardless of the column index.
 *
 * Applies regardless of consumer-supplied `width` / `maxWidth` overrides
 * — the wide-viewport bump is a cross-cutting layout decision rather than
 * a per-instance default. Consumers who need the column to stay locked at
 * their value can scope a more-specific CSS rule against the rendered
 * table.
 */
const cssWideViewportNameWidth = css`
  @media (min-width: ${WIDE_VIEWPORT_NAME_BREAKPOINT_PX}px) {
    th[data-test-subj^='tableHeaderCell_title_'],
    td[data-test-subj='content-list-table-column-name'] {
      width: ${WIDE_VIEWPORT_NAME_WIDTH} !important;
      max-width: ${WIDE_VIEWPORT_NAME_WIDTH} !important;
    }
  }
`;

/**
 * Keep `Column.Actions` row icons (including the EUI-provided "All actions"
 * 3-dot overflow trigger) on a single line at every viewport width.
 *
 * EUI's `euiTableCellContent` ships `flex-wrap: wrap` for action cells on
 * desktop (see the `hasActions.desktop` style in `_table_cell_content.styles.js`
 * in `@elastic/eui`). With the wrap enabled, the cell's `max-content`
 * intrinsic width collapses to the widest single icon (~28px) instead of
 * the full inline row, so the auto table-layout algorithm happily shrinks
 * the actions column whenever the container squeezes — which lands the
 * overflow trigger (or the trailing icons) on a second line underneath
 * the primary icons.
 *
 * Pinning the cell's flex container to `flex-wrap: nowrap` restores the
 * unwrapped intrinsic width (`36N + 12` at the default theme), so the
 * column's `min-width: 'max-content'` floor (set in
 * {@link buildActionsColumn}) actually holds at the icon-row width and
 * the browser stops shrinking the column past that point. When the rest
 * of the row genuinely cannot fit, `scrollableInline` takes over and the
 * icons stay inline inside the horizontal scroll instead of wrapping
 * vertically.
 *
 * Anchored on `td.euiTableRowCell--hasActions` because that is the class
 * EUI actually applies to body action `<td>`s
 * ({@link https://github.com/elastic/eui/blob/main/packages/eui/src/components/table/table_row_cell.tsx | `EuiTableRowCell`}).
 * An earlier revision of this rule targeted
 * `td[data-test-subj='content-list-table-column-actions']`, but
 * `EuiBasicTable.renderItemActionsCell` does not forward the column's
 * `data-test-subj` to the body cell — only the header `<th>` receives
 * it — so the selector matched zero DOM nodes and the rule silently did
 * nothing. The accompanying unit test only asserted the rule text was
 * in the stylesheet, which is why the regression kept reappearing.
 *
 * The rule is scoped to this `ContentListTable` instance via the parent
 * `<div className="euiBasicTable">` that the `tableCss` prop lands on,
 * so other Kibana tables that use `EuiBasicTable` action columns are
 * unaffected.
 */
const cssActionsCellNoWrap = css`
  td.euiTableRowCell--hasActions .euiTableCellContent {
    flex-wrap: nowrap;
  }
`;

/**
 * ContentListTable - Table renderer for content listings.
 *
 * Integrates with EUI's EuiBasicTable and ContentListProvider for state management.
 * Supports configurable columns via compound components, row selection with
 * checkboxes, and empty states.
 *
 * Selection checkboxes are automatically added when `features.selection` is enabled
 * (the default). Selection state is managed by the provider and accessible to the
 * toolbar for bulk actions via {@link useContentListSelection}.
 *
 * @example Basic usage (defaults to Name column)
 * ```tsx
 * <ContentListProvider {...config}>
 *   <ContentListTable title="Dashboards" />
 * </ContentListProvider>
 * ```
 *
 * @example With actions column
 * ```tsx
 * const { Column, Action } = ContentListTable;
 *
 * <ContentListTable title="My Dashboards">
 *   <Column.Name />
 *   <Column.Actions>
 *     <Action.Edit />
 *     <Action.Delete />
 *   </Column.Actions>
 * </ContentListTable>
 * ```
 *
 * @example With selection and toolbar
 * ```tsx
 * <ContentListProvider {...config}>
 *   <ContentListToolbar />
 *   <ContentListTable title="Dashboards" />
 * </ContentListProvider>
 * ```
 */
const ContentListTableComponent = ({
  title,
  tableLayout = 'auto',
  compressed = false,
  scrollableInline = true,
  responsiveBreakpoint = false,
  noItemsMessage,
  children,
  filter,
  'data-test-subj': dataTestSubj = CONTENT_LIST_TEST_SUBJECTS.table,
}: ContentListTableProps) => {
  const { supports } = useContentListConfig();
  const { euiTheme } = useEuiTheme();
  const { items: rawItems, isLoading, isFetching, hasNoItems, error } = useContentListItems();
  const { pageSize } = useContentListPagination();
  const items = useMemo(() => (filter ? rawItems.filter(filter) : rawItems), [rawItems, filter]);

  const { requestDelete, deleteModal } = useDeleteConfirmation();

  const resolvedColumns = useColumns(children, requestDelete);
  const basicTableColumns = useMemo(() => resolvedColumns.map((r) => r.column), [resolvedColumns]);
  const { sorting, onChange } = useSorting();
  const { selection } = useSelection();

  const tableCss = useMemo(
    () => [
      cssStickyCellRowStateSync(euiTheme),
      // Excess horizontal space is absorbed by `cssTrailingSpacer` so it lands
      // after the last populated column rather than stretching `Column.Name`.
      cssTrailingSpacer(euiTheme),
      // On viewports ≥ 2560px (~4K), bump the Name column past its default
      // 64em cap so users with wide displays see more of the title. The
      // pseudo-cell still absorbs the rest of the slack.
      cssWideViewportNameWidth,
      // Keep the actions row icons + 3-dot overflow trigger inline at every
      // viewport width. Without this, EUI's default `flex-wrap: wrap` on
      // action cells lets the column collapse when the table squeezes.
      cssActionsCellNoWrap,
      ...(supports.starred ? [cssFavoriteHoverWithinEuiTableRow(euiTheme)] : []),
    ],
    [euiTheme, supports.starred]
  );

  if (isLoading) {
    return (
      <TableSkeleton
        columns={resolvedColumns}
        hasSelection={!!selection}
        rowCount={pageSize}
        tableLayout={tableLayout}
        compressed={compressed}
      />
    );
  }

  if (hasNoItems) {
    return null;
  }

  return (
    <>
      <EuiBasicTable
        tableCaption={title}
        columns={basicTableColumns}
        compressed={compressed}
        css={tableCss}
        error={error?.message}
        itemId={(item) => getRowId(item.id)}
        items={items}
        loading={isFetching}
        noItemsMessage={noItemsMessage}
        onChange={onChange}
        sorting={sorting}
        selection={selection}
        scrollableInline={scrollableInline}
        responsiveBreakpoint={responsiveBreakpoint}
        tableLayout={tableLayout}
        data-test-subj={dataTestSubj}
      />
      {deleteModal}
    </>
  );
};

// Create Column namespace with sub-components.
export const Column = Object.assign(BaseColumn, {
  Name: NameColumn,
  UpdatedAt: UpdatedAtColumn,
  Actions: ActionsColumn,
  Starred: StarredColumn,
  CreatedBy: CreatedByColumn,
});

// Create Action namespace with sub-components.
export const Action = Object.assign(BaseAction, {
  Edit: EditAction,
  Delete: DeleteAction,
  ContentEditor: ContentEditorAction,
});

export const ContentListTable = Object.assign(ContentListTableComponent, {
  Column,
  Action,
});
