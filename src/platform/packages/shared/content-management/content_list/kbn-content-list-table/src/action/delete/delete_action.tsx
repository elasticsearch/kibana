/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { ContentListItem } from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { DeleteActionProps, ActionOutput, ActionBuilderContext } from '../types';

/** Default i18n-translated label for the delete action. */
const DEFAULT_DELETE_LABEL = i18n.translate(
  'contentManagement.contentList.table.action.delete.label',
  { defaultMessage: 'Delete' }
);

/** Default i18n-translated description for the delete action. */
const DEFAULT_DELETE_DESCRIPTION = i18n.translate(
  'contentManagement.contentList.table.action.delete.description',
  { defaultMessage: 'Delete this item' }
);

/**
 * Build a `DefaultItemAction` for the delete action preset.
 *
 * Returns `undefined` when read-only or when `onBulkAction` is not configured.
 * The `onClick` handler opens the table-level delete confirmation modal.
 *
 * Composes `enabled` and `description` with `actions.delete.restriction` to
 * disable the icon and surface the reason when restricted.
 *
 * @param attributes - The declarative attributes from the parsed `Action.Delete` element.
 * @param context - Builder context with provider configuration.
 * @returns A `DefaultItemAction<ContentListItem>` for the delete action, or `undefined` to skip.
 */
export const buildDeleteAction = (
  attributes: DeleteActionProps,
  context: ActionBuilderContext
): ActionOutput | undefined => {
  const { itemConfig, isReadOnly, actions } = context;

  if (isReadOnly) {
    return undefined;
  }

  const deleteConfig = itemConfig?.actions?.delete;
  if (typeof deleteConfig?.onBulkAction !== 'function') {
    return undefined;
  }

  const label = attributes.label ?? DEFAULT_DELETE_LABEL;
  const { enabled: consumerEnabled } = attributes;
  const restriction = deleteConfig.restriction;

  const enabled = (item: ContentListItem): boolean => {
    if (restriction && restriction(item) !== undefined) {
      return false;
    }
    return consumerEnabled ? consumerEnabled(item) : true;
  };

  // EUI surfaces `description` as the icon's tooltip. When a restriction
  // predicate is configured we forward a function so the tooltip can carry
  // the per-item reason; otherwise we keep the static string (preserves the
  // EUI fast-path for static descriptions).
  const description: ActionOutput['description'] = restriction
    ? (item) => {
        const reason = restriction(item);
        return reason ?? DEFAULT_DELETE_DESCRIPTION;
      }
    : DEFAULT_DELETE_DESCRIPTION;

  return {
    name: label,
    description,
    icon: 'trash',
    type: 'icon',
    color: 'danger',
    isPrimary: true,
    onClick: (item) => actions?.onDelete?.([item]),
    enabled,
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.actionDelete,
  };
};
