/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject } from 'rxjs';

import {
  apiPublishesSavedObjectId,
  initializeTitleManager,
  type SerializedTitles,
} from '@kbn/presentation-publishing';
import {
  restorePanelSettings,
  snapshotPanelSettings,
  type PanelSettingsApi,
} from '@kbn/embeddable-plugin/public';

import type { LinksLayoutType } from '../../common/types';
import LinksEditor from '../components/editor/links_editor';
import { serializeResolvedLinks } from '../lib/resolve_links';
import { linksClient, runSaveToLibrary } from '../links_client';
import type { ResolvedLink } from '../types';

export interface EditorState extends SerializedTitles {
  layout?: LinksLayoutType;
  links?: ResolvedLink[];
  refId?: string;
  error?: Error;
}

const getTitleStateFromApi = (api: PanelSettingsApi): SerializedTitles => ({
  title: api.title$?.getValue(),
  description: api.description$?.getValue(),
  hide_title: api.hideTitle$?.getValue(),
  hide_border: api.hideBorder$?.getValue(),
});

export function getEditorFlyout({
  initialState,
  parentDashboard,
  onCompleteEdit,
  closeFlyout,
  panelSettingsApi,
}: {
  initialState?: EditorState;
  parentDashboard?: unknown;
  onCompleteEdit?: (newState?: EditorState) => void;
  closeFlyout: () => void;
  panelSettingsApi?: PanelSettingsApi;
}) {
  const flyoutId = `linksEditorFlyout-${uuidv4()}`;
  const localTitleManager = initializeTitleManager({
    title: initialState?.title,
    description: initialState?.description,
    hide_title: initialState?.hide_title,
    hide_border: initialState?.hide_border,
  });
  const settingsApi: PanelSettingsApi = panelSettingsApi ?? {
    ...localTitleManager.api,
    defaultTitle$: new BehaviorSubject(initialState?.title),
    defaultDescription$: new BehaviorSubject(initialState?.description),
  };
  const panelSettingsSnapshot = snapshotPanelSettings(settingsApi);

  const mergeTitleState = (state: EditorState): EditorState => ({
    ...state,
    ...getTitleStateFromApi(settingsApi),
  });

  return (
    <LinksEditor
      flyoutId={flyoutId}
      initialLinks={initialState?.links}
      initialLayout={initialState?.layout}
      panelSettingsApi={settingsApi}
      onClose={() => {
        restorePanelSettings(settingsApi, panelSettingsSnapshot);
        onCompleteEdit?.(undefined);
        closeFlyout();
      }}
      onSaveToLibrary={async (newLinks: ResolvedLink[], newLayout: LinksLayoutType) => {
        const newState = mergeTitleState({
          ...initialState,
          links: newLinks,
          layout: newLayout,
        });
        if (initialState?.refId) {
          const {
            refId,
            hide_title: _hideTitle,
            hide_border: _hideBorder,
            error: _error,
            ...updateState
          } = newState;
          const original = await linksClient.get(initialState.refId); // get the original library item so we can perform a full update
          await linksClient.update(initialState.refId, {
            ...original.data,
            ...updateState,
            links: serializeResolvedLinks(newLinks),
          });
          onCompleteEdit?.(newState);
          closeFlyout();
        } else {
          const saveResult = await runSaveToLibrary(newState);
          if (saveResult?.error) throw saveResult.error;
          onCompleteEdit?.(saveResult);
          // If saveResult is undefined, the user cancelled the save as modal and we should not close the flyout
          if (saveResult) closeFlyout();
        }
      }}
      onAddToDashboard={(newLinks: ResolvedLink[], newLayout: LinksLayoutType) => {
        const newState = mergeTitleState({
          ...initialState,
          links: newLinks,
          layout: newLayout,
        });
        onCompleteEdit?.(newState);
        closeFlyout();
      }}
      parentDashboardId={
        parentDashboard && apiPublishesSavedObjectId(parentDashboard)
          ? parentDashboard.savedObjectId$.value
          : undefined
      }
      isByReference={Boolean(initialState?.refId)}
    />
  );
}
