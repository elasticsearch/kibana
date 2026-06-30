/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ContentListItem } from '@kbn/content-list';
import {
  ContentListClientProvider,
  createTagsService,
  createUserProfilesService,
  type ContentEditorConfig,
  type TableListViewFindItemsFn,
} from '@kbn/content-list-provider-client';
import type { OpenContentEditorParams } from '@kbn/content-management-content-editor';
import { SAVED_OBJECTS_LIMIT_SETTING } from '@kbn/visualizations-common';

import { findListItems } from '../../utils/saved_visualize_utils';
import {
  deleteListItems,
  updateBasicSoAttributes,
} from '../../utils/saved_objects_utils/update_basic_attributes';
import { hasLibraryItemWithTitle } from '../../utils/saved_objects_utils';
import { toTableListViewSavedObject } from '../../utils/to_table_list_view_saved_object';
import { getTypes } from '../../services';
import type { VisualizeServices } from '../types';
import { getVisualizeListItemLinkFn } from '../utils/get_visualize_list_item_link';
import { navigateToVisualizeEditor, type VisualizeEditor } from './navigate_to_visualize_editor';
import { visualizeTypeFilter } from './visualize_type_filter';

/**
 * Shape returned by {@link ContentListClientProvider}'s strategy after it
 * spreads `VisualizeUserContent` onto the base `ContentListItem`. Listed
 * explicitly so callbacks can read these fields straight off the table item
 * without round-tripping through a local id→raw cache.
 */
type VisualizeContentListItem = ContentListItem<{
  editor?: VisualizeEditor;
  error?: string;
  readOnly?: boolean;
  typeTitle?: string;
  savedObjectType?: string;
}>;

const labels = {
  entity: i18n.translate('visualizations.listing.table.entityName', {
    defaultMessage: 'visualization',
  }),
  entityPlural: i18n.translate('visualizations.listing.table.entityNamePlural', {
    defaultMessage: 'visualizations',
  }),
} as const;

const sortFields = [
  {
    field: 'title',
    name: i18n.translate('visualizations.listing.table.sortingByTitleName', {
      defaultMessage: 'Name',
    }),
  },
  {
    field: 'updatedAt',
    name: i18n.translate('visualizations.listing.table.sortingByUpdatedAtName', {
      defaultMessage: 'Last updated',
    }),
  },
  {
    field: 'typeTitle',
    name: i18n.translate('visualizations.listing.table.sortingByTypeName', {
      defaultMessage: 'Type',
    }),
  },
];

const toSavedObjectReferences = (
  refs?: Array<{ type: string; id: string; name?: string }>
): Array<{ type: string; id: string; name: string }> | undefined =>
  refs?.map((r) => ({ type: r.type, id: r.id, name: r.name ?? '' }));

/**
 * Wiring layer for the visualize listing. Reads plugin services from Kibana
 * context, builds the `findItems` data source, the per-item handlers, the
 * sort fields, and the tags / userProfiles / saved-objects-tagging services,
 * then mounts a single `ContentListClientProvider` for its children to read
 * via `useContentListConfig()`.
 *
 * Owns no JSX beyond the provider — the listing surface itself lives in
 * `visualize_content_list.tsx` and is rendered as `children`.
 */
export const VisualizeListingProvider = ({ children }: { children: ReactNode }) => {
  const {
    services: {
      application,
      history,
      savedObjectsTagging,
      stateTransferService,
      toastNotifications,
      visualizeCapabilities,
      contentManagement,
      http,
      userProfile,
      uiSettings,
      kbnUrlStateStorage,
      ...startServices
    },
  } = useKibana<VisualizeServices>();

  const canSave = !!visualizeCapabilities.save;
  const listingLimit = uiSettings.get<number>(SAVED_OBJECTS_LIMIT_SETTING);

  // Stash the most recent saved-object `type` per id so onSave / the
  // duplicate-title validator can look up the type and last-saved title
  // without an extra HTTP round-trip. The content editor's onSave doesn't
  // receive the SO type, and `updateBasicSoAttributes` needs it to pick
  // the right SO client.
  const lastByIdRef = useRef<Map<string, { type: string; title: string }>>(new Map());

  const getVisualizeListItemLink = useMemo(
    () => getVisualizeListItemLinkFn(application, kbnUrlStateStorage),
    [application, kbnUrlStateStorage]
  );

  const findItems: TableListViewFindItemsFn = useCallback(
    async (searchQuery, options, signal) => {
      // Bail early if a fresher search already superseded this one.
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      const { total, hits } = await findListItems(
        getTypes(),
        searchQuery,
        options?.listingLimit ?? listingLimit,
        toSavedObjectReferences(options?.references),
        toSavedObjectReferences(options?.referencesToExclude)
      );
      const items = hits.map(toTableListViewSavedObject);
      const cache = lastByIdRef.current;
      cache.clear();
      for (const item of items) {
        cache.set(item.id, { type: item.type, title: item.title });
      }
      return { total, hits: items };
    },
    [listingLimit]
  );

  const editItem = useCallback(
    (contentItem: ContentListItem) =>
      navigateToVisualizeEditor(contentItem as VisualizeContentListItem, {
        stateTransferService,
        history,
      }),
    [history, stateTransferService]
  );

  const editRestriction = useCallback((contentItem: ContentListItem): string | undefined => {
    const item = contentItem as VisualizeContentListItem;
    if (!item.readOnly) {
      return undefined;
    }
    return item.managed
      ? i18n.translate('visualizations.managedLegacyVisMessage', {
          defaultMessage: 'Elastic manages this visualisation. Changing it is not possible.',
        })
      : i18n.translate('visualizations.readOnlyLegacyVisMessage', {
          defaultMessage:
            "These details can't be edited because this visualization is no longer supported.",
        });
  }, []);

  const deleteItems = useCallback(
    async (items: ContentListItem[]) => {
      try {
        await deleteListItems(items, {
          savedObjectsTagging,
          typesService: getTypes(),
          contentManagement,
          http,
          ...startServices,
        });
      } catch (error) {
        toastNotifications.addError(error, {
          title: i18n.translate('visualizations.visualizeListingDeleteErrorTitle', {
            defaultMessage: 'Error deleting visualization',
          }),
        });
      }
    },
    [contentManagement, http, savedObjectsTagging, startServices, toastNotifications]
  );

  const onContentEditorSave = useCallback<NonNullable<ContentEditorConfig['onSave']>>(
    async ({ id, title, description, tags }) => {
      const cached = lastByIdRef.current.get(id);
      if (!cached) {
        return;
      }
      await updateBasicSoAttributes(
        id,
        cached.type,
        { title, description: description ?? '', tags },
        {
          savedObjectsTagging,
          typesService: getTypes(),
          contentManagement,
          http,
          ...startServices,
        }
      );
    },
    [savedObjectsTagging, contentManagement, http, startServices]
  );

  const customValidators = useMemo<OpenContentEditorParams['customValidators']>(
    () => ({
      title: [
        {
          type: 'warning',
          async fn(value, id) {
            if (!id) {
              return;
            }
            const cached = lastByIdRef.current.get(id);
            // Skip self-collisions: typing the unchanged title shouldn't warn.
            if (cached && value.toLowerCase() === cached.title.toLowerCase()) {
              return;
            }
            let hasDuplicateTitle = false;
            try {
              hasDuplicateTitle = await hasLibraryItemWithTitle(value);
            } catch (_) {
              // ignore — leave validation to the save handler
            }
            return hasDuplicateTitle
              ? i18n.translate('visualizations.visualizeListingDeleteErrorTitle.duplicateWarning', {
                  defaultMessage: 'Saving "{value}" creates a duplicate title.',
                  values: { value },
                })
              : undefined;
          },
        },
      ],
    }),
    []
  );

  const services = useMemo(
    () => ({
      tags: createTagsService(savedObjectsTagging?.ui),
      userProfiles: createUserProfilesService(userProfile),
      savedObjectsTagging,
    }),
    [savedObjectsTagging, userProfile]
  );

  const features = useMemo(
    () => ({
      sorting: {
        initialSort: { field: 'updatedAt', direction: 'desc' as const },
        fields: sortFields,
      },
      // Registers the `typeTitle` filter dimension (KQL search + facet counts).
      // The toolbar control is placed explicitly via `<VisualizeTypeFilter />`.
      filters: { visualizationType: visualizeTypeFilter },
      selection: canSave,
      contentEditor: {
        isReadonly: !canSave,
        onSave: onContentEditorSave,
        customValidators,
      },
    }),
    [canSave, onContentEditorSave, customValidators]
  );

  const item = useMemo(
    () => ({
      getHref: (contentItem: ContentListItem): string => {
        const { editor, error, readOnly } = contentItem as VisualizeContentListItem;
        return getVisualizeListItemLink({ editor, error, readOnly }) ?? '';
      },
      actions: {
        // Drop the action entirely (vs. always-present + restriction
        // string) when the user globally can't perform it. Matches the
        // annotation-listing migration's pattern.
        ...(canSave && {
          edit: { onItemAction: editItem, restriction: editRestriction },
          delete: { onBulkAction: deleteItems },
        }),
      },
    }),
    [getVisualizeListItemLink, canSave, editItem, editRestriction, deleteItems]
  );

  const core = useMemo(
    () => ({ ...startServices, http, uiSettings, userProfile }),
    [startServices, http, uiSettings, userProfile]
  );

  return (
    <ContentListClientProvider
      id="vis"
      labels={labels}
      core={core}
      services={services}
      findItems={findItems}
      features={features}
      item={item}
      isReadOnly={!canSave}
    >
      {children}
    </ContentListClientProvider>
  );
};
