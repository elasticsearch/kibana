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
import type { EditActionProps, ActionOutput, ActionBuilderContext } from '../types';

/** Default i18n-translated label for the edit action. */
const DEFAULT_EDIT_LABEL = i18n.translate('contentManagement.contentList.table.action.edit.label', {
  defaultMessage: 'Edit',
});

/** Default i18n-translated description for the edit action. */
const DEFAULT_EDIT_DESCRIPTION = i18n.translate(
  'contentManagement.contentList.table.action.edit.description',
  { defaultMessage: 'Edit this item' }
);

/**
 * Build a `DefaultItemAction` for the edit action preset.
 *
 * Returns `undefined` when read-only or when neither
 * `actions.edit.onItemAction` nor `actions.edit.getItemActionHref` is
 * configured. Composes `enabled` and `description` with
 * `actions.edit.restriction` to disable the icon and surface the reason
 * when restricted.
 *
 * When `getItemActionHref` is configured the row icon renders as an
 * `<a href>` link (with native right-click / middle-click open-in-new-tab
 * affordances). Otherwise it renders as a button calling `onItemAction`.
 *
 * @param attributes - The declarative attributes from the parsed `Action.Edit` element.
 * @param context - Builder context with provider configuration.
 * @returns A `DefaultItemAction<ContentListItem>` for the edit action, or `undefined` to skip.
 */
export const buildEditAction = (
  attributes: EditActionProps,
  context: ActionBuilderContext
): ActionOutput | undefined => {
  const { itemConfig, isReadOnly } = context;

  if (isReadOnly || !itemConfig) {
    return undefined;
  }

  const editConfig = itemConfig.actions?.edit;
  const onItemAction = editConfig?.onItemAction;
  const getItemActionHref = editConfig?.getItemActionHref;

  if (!onItemAction && !getItemActionHref) {
    return undefined;
  }

  const label = attributes.label ?? DEFAULT_EDIT_LABEL;
  const { enabled: consumerEnabled } = attributes;
  const restriction = editConfig?.restriction;

  const enabled = (item: ContentListItem): boolean => {
    if (restriction && restriction(item) !== undefined) {
      return false;
    }
    return consumerEnabled ? consumerEnabled(item) : true;
  };

  // EUI surfaces `description` as the icon's tooltip. When a restriction
  // predicate is configured we forward a function so the tooltip can carry
  // the per-item reason; otherwise we keep the static string (preserves
  // EUI's fast-path for static descriptions).
  const description: ActionOutput['description'] = restriction
    ? (item) => {
        const reason = restriction(item);
        return reason ?? DEFAULT_EDIT_DESCRIPTION;
      }
    : DEFAULT_EDIT_DESCRIPTION;

  return {
    name: label,
    description,
    icon: 'pencil',
    type: 'icon',
    isPrimary: true,
    enabled,
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.actionEdit,
    ...(getItemActionHref
      ? { href: (item) => getItemActionHref(item) }
      : { onClick: (item) => onItemAction!(item) }),
  };
};
