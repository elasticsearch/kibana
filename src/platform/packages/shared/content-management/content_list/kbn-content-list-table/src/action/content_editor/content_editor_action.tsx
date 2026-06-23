/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import type { ContentEditorActionProps, ActionOutput, ActionBuilderContext } from '../types';

/**
 * The user-facing label and i18n key remain `Inspect` ("View details") —
 * the `ContentEditor` rename is internal API only.
 */
const DEFAULT_CONTENT_EDITOR_LABEL = i18n.translate(
  'contentManagement.contentList.table.action.inspect.label',
  { defaultMessage: 'View details' }
);

/**
 * Builds the "view details" action preset, returning `undefined` to skip when
 * `context.features.contentEditor.open` isn't wired.
 */
export const buildContentEditorAction = (
  attributes: ContentEditorActionProps,
  context: ActionBuilderContext
): ActionOutput | undefined => {
  const open = context.features?.contentEditor?.open;
  if (!open) {
    return undefined;
  }

  const label = attributes.label ?? DEFAULT_CONTENT_EDITOR_LABEL;
  const { enabled: consumerEnabled } = attributes;

  return {
    name: label,
    description: DEFAULT_CONTENT_EDITOR_LABEL,
    icon: 'inspect',
    type: 'icon',
    ...(consumerEnabled && { enabled: consumerEnabled }),
    'data-test-subj': CONTENT_LIST_TEST_SUBJECTS.actionInspect,
    onClick: (item) => open(item),
  };
};
