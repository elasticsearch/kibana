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
import { EuiFlexGroup, EuiFlexItem, EuiSkeletonRectangle } from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { ContentListItem } from '@kbn/content-list-provider';
import type { ParsedPart, SkeletonOutput } from '@kbn/content-list-assembly';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ColumnBuilderContext } from '../types';
import { column } from '../part';
import { getColumnLayoutProps, pickAttribute, type ColumnLayoutProps } from '../layout';
import { action, type ActionOutput, type ActionBuilderContext } from '../../action';

/** Default i18n-translated column title for the actions column. */
const DEFAULT_ACTIONS_COLUMN_TITLE = i18n.translate(
  'contentManagement.contentList.table.column.actions.title',
  { defaultMessage: 'Actions' }
);

/**
 * EUI renders row actions as `EuiButtonIcon` `size="s"`, which `euiButtonSizeMap`
 * sets to `euiTheme.size.xl` (32px) with an `euiTheme.size.xs` (4px) gap between
 * icons. The cell content adds `euiTheme.size.s` (8px) of padding on each side.
 * The formula below sizes the column to fit `N` icons inline plus padding:
 * `xl * N + xs * (N - 1) + s * 2`, which works out to `36N + 12` at the default
 * theme scale.
 *
 * `N` is the number of action parts the consumer declared (e.g. ContentEditor
 * + Edit + Delete = 3). When EUI's auto-collapse kicks in (>2 actions, see
 * `renderItemActionsCell` in `@elastic/eui`) the visible footprint is "primary
 * icons (max 2) + the 3-dot overflow trigger" — which still fits inside `36N`
 * because the 3-dot trigger replaces one of the inline icons rather than
 * adding a fourth.
 *
 * EUI's action cells ship `flex-wrap: wrap` on desktop, which without
 * intervention would let the icons stack vertically when the column squeezes.
 * `cssActionsCellNoWrap` (in `content_list_table.tsx`) pins the cell's flex
 * container to `flex-wrap: nowrap` — keyed on EUI's
 * `td.euiTableRowCell--hasActions` so the rule actually matches body cells,
 * not just the header (which is the only `<td>`/`<th>` that receives the
 * column's `data-test-subj`) — so the column's `min-width: 'max-content'`
 * floor resolves to the full icon-row width and the auto table-layout
 * algorithm can't shrink the column past that point.
 *
 * Falls back to the static formula when the theme is not threaded through
 * context (e.g. unit tests that construct contexts inline).
 */
const getActionsColumnDefaultWidth = (
  count: number,
  euiTheme: ColumnBuilderContext['euiTheme']
): string => {
  if (!euiTheme) {
    return `${count * 36 + 12}px`;
  }
  const iconWidth = parseInt(euiTheme.size.xl, 10);
  const iconGap = parseInt(euiTheme.size.xs, 10);
  const cellPadding = parseInt(euiTheme.size.s, 10);
  return `${count * iconWidth + (count - 1) * iconGap + cellPadding * 2}px`;
};

/**
 * Props for the `Column.Actions` preset component.
 *
 * These are the declarative attributes consumers pass in JSX. The actions builder
 * reads them directly from the parsed attributes.
 */
export interface ActionsColumnProps
  extends Pick<ColumnLayoutProps, 'width' | 'minWidth' | 'maxWidth'> {
  /** Custom column title. Defaults to `'Actions'`. */
  columnTitle?: string;
  /**
   * Whether to stick the actions column to the right side during horizontal scroll.
   *
   * @default true
   */
  sticky?: boolean;
  /**
   * Action children.
   *
   * When provided, only the specified actions are rendered in the given order.
   * When omitted, actions are determined automatically from the provider config
   * (e.g., edit is shown if `actions.edit.onItemAction` is configured, delete
   * is shown if `actions.delete.onBulkAction` is configured, content editor is
   * shown if `features.contentEditor.open` is configured).
   */
  children?: ReactNode;
}

/**
 * Build default action parts when `Column.Actions` has no children.
 *
 * Each configured `actions[id]` handler contributes its preset; the content
 * editor (view details) preset is sourced from `features.contentEditor.open`
 * instead, and is always shown when an editor is wired regardless of
 * read-only state — matching the existing TableListView behavior.
 */
const getDefaultActionParts = (context: ColumnBuilderContext): ParsedPart[] => {
  const parts: ParsedPart[] = [];
  const { itemConfig, isReadOnly, features } = context;
  const itemActions = itemConfig?.actions;

  if (!isReadOnly) {
    const hasEdit = itemActions?.edit?.onItemAction || itemActions?.edit?.getItemActionHref;
    const hasDelete = itemActions?.delete?.onBulkAction;

    if (hasEdit) {
      parts.push({
        type: 'part',
        part: 'action',
        preset: 'edit',
        instanceId: 'edit',
        attributes: {},
      });
    }

    if (hasDelete) {
      parts.push({
        type: 'part',
        part: 'action',
        preset: 'delete',
        instanceId: 'delete',
        attributes: {},
      });
    }
  }

  if (features?.contentEditor?.open) {
    parts.push({
      type: 'part',
      part: 'action',
      preset: 'contentEditor',
      instanceId: 'contentEditor',
      attributes: {},
    });
  }

  return parts;
};

/**
 * Build an `EuiBasicTableColumn` (actions column) from `Column.Actions` declarative attributes.
 *
 * Parses action children to determine which row actions to render. When no children
 * are provided, defaults are inferred from the provider configuration.
 *
 * @param attributes - The declarative attributes from the parsed `Column.Actions` element.
 * @param context - Builder context with provider configuration.
 * @returns An `EuiBasicTableColumn<ContentListItem>` for the actions column, or `undefined` to skip.
 */
export const buildActionsColumn = (
  attributes: ActionsColumnProps,
  context: ColumnBuilderContext
): EuiBasicTableColumn<ContentListItem> | undefined => {
  const { children, columnTitle, sticky = true } = attributes;

  // Parse action children from the Column.Actions element.
  const actionParts = children !== undefined ? action.parseChildren(children) : [];

  // Use explicit children if provided, otherwise determine defaults from context.
  const parts = actionParts.length > 0 ? actionParts : getDefaultActionParts(context);

  if (parts.length === 0) {
    return undefined;
  }

  const actionContext: ActionBuilderContext = context;

  // Resolve each action part into an EUI action definition.
  const actions = parts
    .map((part) => action.resolve(part, actionContext))
    .filter((a): a is ActionOutput => a !== undefined);

  if (actions.length === 0) {
    return undefined;
  }

  const defaultWidth = getActionsColumnDefaultWidth(actions.length, context.euiTheme);
  const resolvedWidth = pickAttribute(attributes, 'width', defaultWidth);

  return {
    name: columnTitle ?? DEFAULT_ACTIONS_COLUMN_TITLE,
    actions,
    ...getColumnLayoutProps({
      width: resolvedWidth,
      // `'max-content'` lets the translated header push the column wider
      // than the icon-row width when needed (e.g. de "Aktionen" ~75px is
      // wider than the one-icon `36 + 12 = 48px` derived width). `min-width`
      // wins over `max-width` per the CSS spec, so this floor never fights
      // the cap below.
      minWidth: pickAttribute(attributes, 'minWidth', 'max-content'),
      // Cap at the derived width so the column never absorbs slack on
      // full-width pages — the trailing whitespace lives in `Column.Name`
      // (which is the only column intentionally allowed to grow).
      maxWidth: pickAttribute(attributes, 'maxWidth', resolvedWidth),
    }),
    sticky,
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.columnActions,
  };
};

/**
 * Actions column specification component for `ContentListTable`.
 *
 * This is a declarative component that doesn't render anything.
 * It specifies the Actions column configuration as React children.
 * Action children control which row actions are displayed and in what order.
 *
 * @example Default actions (inferred from provider config)
 * ```tsx
 * const { Column } = ContentListTable;
 *
 * <ContentListTable>
 *   <Column.Name />
 *   <Column.Actions />
 * </ContentListTable>
 * ```
 *
 * @example Explicit actions
 * ```tsx
 * const { Column, Action } = ContentListTable;
 *
 * <ContentListTable>
 *   <Column.Name />
 *   <Column.Actions>
 *     <Action.Edit />
 *     <Action.Delete />
 *   </Column.Actions>
 * </ContentListTable>
 * ```
 */
/**
 * Build the skeleton for `Column.Actions` — a right-aligned row of small
 * rectangles, one per configured action.
 *
 * Mirrors the real actions column's visual layout so there's no jump when
 * the real row icons fade in. The action count is determined the same way
 * the resolver would determine it (explicit `Action.*` children → their
 * count; otherwise the provider-derived defaults from `itemConfig`).
 *
 * Returned as a `{ node }` escape-hatch because a "row of N shapes" isn't a
 * single `SkeletonDescriptor` variant.
 */
const buildActionsColumnSkeleton = (
  attributes: ActionsColumnProps,
  context: ColumnBuilderContext
): SkeletonOutput => {
  const { children } = attributes;
  const actionParts = children !== undefined ? action.parseChildren(children) : [];

  // Hard-coded fallback when no explicit children were provided. The real
  // resolver may ultimately produce 0 (none configured), 2 (edit + delete),
  // or 3 (edit, delete, content editor) depending on provider configuration
  // — 2 is the most common shape and close enough that the swap is not jarring.
  const count = actionParts.length > 0 ? actionParts.length : 2;

  // Match the rendered footprint of an `EuiButtonIcon size="s"` icon glyph
  // (~`euiTheme.size.l`, 24px). Falls back to a static value when no theme
  // is threaded through context (e.g. unit tests).
  const iconSize = context.euiTheme?.size.l ?? 20;

  return {
    node: (
      <EuiFlexGroup gutterSize="xs" justifyContent="flexEnd" alignItems="center" responsive={false}>
        {Array.from({ length: count }, (_unused, idx) => (
          <EuiFlexItem key={idx} grow={false}>
            <EuiSkeletonRectangle isLoading width={iconSize} height={iconSize} borderRadius="s" />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    ),
  };
};

export const ActionsColumn = column.createPreset({
  name: 'actions',
  resolve: buildActionsColumn,
  skeleton: buildActionsColumnSkeleton,
});
