/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { AppHeaderBack } from '@kbn/app-header';
import {
  TransferAction,
  type EmbeddableEditorService,
} from '../../../../plugin_imports/embeddable_editor_service';

/**
 * Returns true if the session is being edited from an existing embeddable.
 * (Do not confuse with Discover displayMode: 'embedded')
 */
const isExistingEmbeddable = (embeddableEditor: EmbeddableEditorService): boolean =>
  embeddableEditor.isEmbeddedEditor() && Boolean(embeddableEditor.getEmbeddableId());

/**
 * Back navigation when editing a Discover session from an embeddable (Today it's only from a dashboard).
 */
export const getChromeHeaderBack = (
  embeddableEditor: EmbeddableEditorService
): AppHeaderBack | undefined => {
  if (!isExistingEmbeddable(embeddableEditor)) {
    return undefined;
  }

  const originatingPath = embeddableEditor.getOriginatingPath() ?? '#/';

  return {
    href: originatingPath,
    onClick: (event) => {
      event.preventDefault();
      embeddableEditor.transferBackToEditor(TransferAction.Cancel);
    },
    label: i18n.translate('discover.titleDashboardEditBackLabel', {
      defaultMessage: 'Dashboard',
    }),
  };
};

/**
 * Returns the title to display in the Chrome App Header.
 */
export const getChromeHeaderTitle = ({
  embeddableEditor,
  sessionTitle,
}: {
  embeddableEditor: EmbeddableEditorService;
  sessionTitle?: string;
}): string => {
  // When editting a session from an embeddable.
  if (isExistingEmbeddable(embeddableEditor)) {
    const title =
      // Session persisted by value inside a dashboard.
      embeddableEditor.getByValueTab()?.label ||
      // Session edited by reference: it exists outside a particular dashboard.
      sessionTitle ||
      // Default, I.E: editing a by-value session that has no name.
      i18n.translate('discover.discoverSessionTitle', {
        defaultMessage: 'Discover session',
      });

    return i18n.translate('discover.editDiscoverSessionWithTitle', {
      defaultMessage: 'Editing {title}',
      values: { title },
    });
  }

  // Opening a saved session.
  if (sessionTitle) {
    return sessionTitle;
  }

  // New unsaved session.
  return i18n.translate('discover.pageTitleNewSession', {
    defaultMessage: 'New session',
  });
};
