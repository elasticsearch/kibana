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

import { apiPublishesSavedObjectId } from '@kbn/presentation-publishing';

import type { LinksLayoutType } from '../../common/types';
import LinksEditor from '../components/editor/links_editor';
import { serializeResolvedLinks } from '../lib/resolve_links';
import { linksClient, runSaveToLibrary } from '../links_client';
import type { ResolvedLink } from '../types';

export interface EditorState {
  description?: string;
  layout?: LinksLayoutType;
  links?: ResolvedLink[];
  refId?: string;
  title?: string;
  error?: Error;
}

export function getEditorFlyout({
  initialState,
  parentDashboard,
  onCompleteEdit,
  closeFlyout,
}: {
  initialState?: EditorState;
  parentDashboard?: unknown;
  onCompleteEdit?: (newState?: EditorState) => void;
  closeFlyout: () => void;
}) {
  const flyoutId = `linksEditorFlyout-${uuidv4()}`;
  return (
    <LinksEditor
      flyoutId={flyoutId}
      initialLinks={initialState?.links}
      initialLayout={initialState?.layout}
      onClose={() => {
        onCompleteEdit?.(undefined);
        closeFlyout();
      }}
      onSaveToLibrary={async (newLinks: ResolvedLink[], newLayout: LinksLayoutType) => {
        const newState = {
          ...initialState,
          links: newLinks,
          layout: newLayout,
        };
        if (initialState?.refId) {
          const { refId, ...updateState } = newState;
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
        const newState = {
          ...initialState,
          links: newLinks,
          layout: newLayout,
        };
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
