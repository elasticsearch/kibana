/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ApplicationStart } from '@kbn/core/public';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { GlobalQueryStateFromUrl } from '@kbn/data-plugin/public';
import { setStateToKbnUrl } from '@kbn/kibana-utils-plugin/public';
import { GLOBAL_STATE_STORAGE_KEY, VISUALIZE_APP_NAME } from '@kbn/visualizations-common';
import { getUISettings } from '../../services';
import type { VisualizeEditor } from '../components/navigate_to_visualize_editor';

/**
 * Minimum shape needed to resolve the listing-row link. Mirrors the flat
 * `ContentListItem` fields the strategy spreads onto the table row so callers
 * don't have to reconstruct the legacy `{ attributes: {...} }` envelope.
 */
export interface VisualizeListItemLinkInput {
  editor?: VisualizeEditor;
  error?: string;
  readOnly?: boolean;
}

export const getVisualizeListItemLinkFn =
  (application: ApplicationStart, kbnUrlStateStorage: IKbnUrlStateStorage) =>
  ({ editor, error, readOnly }: VisualizeListItemLinkInput) => {
    if (readOnly || (editor && 'onEdit' in editor)) {
      return;
    }

    const fallback = { editApp: undefined, editUrl: '' };
    const { editApp, editUrl } =
      editor && 'editUrl' in editor
        ? { editApp: editor.editApp, editUrl: editor.editUrl }
        : fallback;
    if (error || (!editApp && !editUrl)) {
      return;
    }

    // for visualizations the editApp is undefined
    let url = application.getUrlForApp(editApp ?? VISUALIZE_APP_NAME, {
      path: editApp ? editUrl : `#${editUrl}`,
    });
    const useHash = getUISettings().get('state:storeInSessionStorage');
    const globalStateInUrl =
      kbnUrlStateStorage.get<GlobalQueryStateFromUrl>(GLOBAL_STATE_STORAGE_KEY) || {};

    url = setStateToKbnUrl<GlobalQueryStateFromUrl>(
      GLOBAL_STATE_STORAGE_KEY,
      globalStateInUrl,
      { useHash },
      url
    );
    return url;
  };
