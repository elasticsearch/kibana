/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';

import { i18n } from '@kbn/i18n';
import type { OnSaveProps, SaveResult } from '@kbn/saved-objects-plugin/public';
import {
  SavedObjectSaveModalWithSaveResult,
  showSaveModal,
} from '@kbn/saved-objects-plugin/public';

import { linksClient } from '.';
import { LINKS_EMBEDDABLE_TYPE, LINKS_LIBRARY_TYPE } from '../../common';
import type { EditorState } from '../editor/get_editor_flyout';
import { serializeResolvedLinks } from '../lib/resolve_links';
import { hasLibraryItemWithTitle } from './has_library_item_with_title';

const modalTitle = i18n.translate('links.contentManagement.saveModalTitle', {
  defaultMessage: `Save {contentId} panel to library`,
  values: {
    contentId: LINKS_EMBEDDABLE_TYPE,
  },
});

export const runSaveToLibrary = async (newState: EditorState): Promise<EditorState | undefined> => {
  return new Promise<EditorState | undefined>((resolve, reject) => {
    const onSave = async ({ newTitle, newDescription }: OnSaveProps): Promise<SaveResult> => {
      const newAttributes = {
        ...newState,
        links: serializeResolvedLinks(newState.links ?? []),
        title: newTitle,
        description: newDescription,
      };

      try {
        const { id } = await linksClient.create(newAttributes);
        resolve({
          ...newState,
          title: newTitle,
          description: newDescription,
          refId: id,
        });
        return { id };
      } catch (error) {
        reject(error);
        return { error };
      }
    };

    const saveModal = (
      <SavedObjectSaveModalWithSaveResult
        lastSavedTitle={''}
        hasLibraryItemWithTitle={hasLibraryItemWithTitle}
        onSave={onSave}
        onClose={() => resolve(undefined)}
        title={newState.title ?? ''}
        customModalTitle={modalTitle}
        description={newState.description}
        showDescription
        showCopyOnSave={false}
        objectType={LINKS_LIBRARY_TYPE}
      />
    );
    showSaveModal(saveModal);
  });
};
