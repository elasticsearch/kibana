/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useRef, useMemo, useEffect } from 'react';
import { firstValueFrom } from 'rxjs';
import { useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { CoreStart } from '@kbn/core/public';
import type { Reference } from '@kbn/content-management-utils';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { OpenContentEditorParams } from '@kbn/content-management-content-editor';
import type { TableListTabParentProps } from '@kbn/content-management-tabbed-table-list-view';
import { TableListViewTable } from '@kbn/content-management-table-list-view-table';
import {
  toTableListViewSavedObject,
  type VisualizationsStart,
  type VisualizeUserContent,
} from '@kbn/visualizations-plugin/public';
import {
  VISUALIZE_APP_NAME,
  SAVED_OBJECTS_LIMIT_SETTING,
  SAVED_OBJECTS_PER_PAGE_SETTING,
} from '@kbn/visualizations-common';
import {
  getCustomColumn,
  getCustomSortingOptions,
  getNoItemsMessage,
  getVisualizationListingTableStyles,
} from '@kbn/visualization-listing-components';

interface VisualizationTableListProps {
  core: CoreStart;
  visualizations: VisualizationsStart;
  contentManagement: ContentManagementPublicStart;
  embeddable: EmbeddableStart;
  parentProps: TableListTabParentProps;
}

export const VisualizationTableList = ({
  core,
  visualizations,
  contentManagement,
  embeddable,
  parentProps,
}: VisualizationTableListProps) => {
  const { getBreadcrumbs, onFetchSuccess, setPageDataTestSubject, showCreateButton } = parentProps;
  const euiThemeContext = useEuiTheme();
  const tableStyles = useMemo(
    () => getVisualizationListingTableStyles(euiThemeContext),
    [euiThemeContext]
  );

  const listingLimit = core.uiSettings.get(SAVED_OBJECTS_LIMIT_SETTING);
  const initialPageSize = core.uiSettings.get(SAVED_OBJECTS_PER_PAGE_SETTING);

  const visualizeCapabilities = core.application.capabilities.visualize_v2;
  const visualizedUserContent = useRef<VisualizeUserContent[]>();
  const closeNewVisModal = useRef(() => {});

  const createNewVis = useCallback(() => {
    firstValueFrom(core.application.currentAppId$)
      .then((currentApp) => {
        const breadcrumbs = currentApp ? getBreadcrumbs?.(currentApp) : undefined;
        closeNewVisModal.current = visualizations.showNewVisModal({
          originatingApp: currentApp,
          originatingPath: window.location.hash,
          breadcrumbs,
          outsideVisualizeApp: currentApp !== VISUALIZE_APP_NAME,
        });
      })
      .catch((error) => {
        core.notifications.toasts.addError(error, {
          title: i18n.translate('visualizationListing.visualizeListingCreateErrorTitle', {
            defaultMessage: 'Error opening new visualization modal',
          }),
        });
      });
  }, [visualizations, core.application, core.notifications.toasts, getBreadcrumbs]);

  useEffect(() => {
    return () => {
      closeNewVisModal.current();
    };
  }, []);

  const editItem = useCallback(
    async ({ attributes: { id }, editor = { editUrl: '' } }: VisualizeUserContent) => {
      if (!('editApp' in editor || 'editUrl' in editor)) {
        await (editor as { onEdit: (id: string) => Promise<void> }).onEdit(id);
        return;
      }

      const { editApp, editUrl } = editor as { editApp?: string; editUrl?: string };
      const targetApp = editApp ?? VISUALIZE_APP_NAME;
      const currentApp = await firstValueFrom(core.application.currentAppId$);

      // Add originatingApp query param to keep Dashboard as active nav item
      const separator = editUrl?.includes('?') ? '&' : '?';
      const queryParam = `${separator}originatingApp=${currentApp}`;
      const path = editApp ? `${editUrl}${queryParam}` : `#${editUrl}${queryParam}`;

      if (currentApp && currentApp !== VISUALIZE_APP_NAME) {
        await embeddable.getStateTransfer().navigateToEditor(targetApp, {
          path,
          state: {
            originatingApp: currentApp,
            originatingPath: window.location.hash,
            breadcrumbs: getBreadcrumbs?.(currentApp),
          },
        });
        return;
      }

      core.application.navigateToApp(targetApp, { path });
    },
    [core.application, embeddable, getBreadcrumbs]
  );

  const fetchItems = useCallback(
    async (
      searchTerm: string,
      {
        references,
        referencesToExclude,
      }: {
        references?: Reference[];
        referencesToExclude?: Reference[];
      } = {}
    ) => {
      const { total, hits } = await visualizations.findListItems(
        searchTerm,
        listingLimit,
        references,
        referencesToExclude
      );

      const content = hits.map(
        (hit: Record<string, unknown>) => toTableListViewSavedObject(hit) as VisualizeUserContent
      );

      visualizedUserContent.current = content;

      return {
        total,
        hits: content,
      };
    },
    [listingLimit, visualizations]
  );

  const onContentEditorSave = useCallback(
    async (args: { id: string; title: string; description?: string }) => {
      const content = visualizedUserContent.current?.find(({ id }) => id === args.id);
      if (content) {
        // Note: the visualize listing table does not currently support tag editing
        await visualizations.updateVisualizationLibraryItem(content.id, content.type, {
          title: args.title,
          description: args.description ?? '',
        });
      }
    },
    [visualizations]
  );

  const contentEditorValidators: OpenContentEditorParams['customValidators'] = useMemo(
    () => ({
      title: [
        {
          type: 'warning',
          async fn(value, id) {
            // Duplicate title check could be added here if needed
            return undefined;
          },
        },
      ],
    }),
    []
  );

  const deleteItems = useCallback(
    async (items: object[]) => {
      await Promise.all(
        (items as VisualizeUserContent[]).map(async (item) => {
          await contentManagement.client.delete({
            contentTypeId: item.savedObjectType,
            id: item.id,
          });
        })
      ).catch((error) => {
        core.notifications.toasts.addError(error, {
          title: i18n.translate('visualizationListing.visualizeListingDeleteErrorTitle', {
            defaultMessage: 'Error deleting visualization',
          }),
        });
      });
    },
    [contentManagement, core.notifications.toasts]
  );

  const noItemsFragment = useMemo(() => getNoItemsMessage(createNewVis), [createNewVis]);

  const visualizeLibraryTitle = i18n.translate('visualizationListing.listing.table.listTitle', {
    defaultMessage: 'Visualize library',
  });

  return (
    <div css={tableStyles}>
      <TableListViewTable<VisualizeUserContent>
        id="visualizationListing"
        findItems={fetchItems}
        deleteItems={visualizeCapabilities.delete ? deleteItems : undefined}
        editItem={visualizeCapabilities.save ? editItem : undefined}
        contentEditor={{
          isReadonly: !visualizeCapabilities.save,
          onSave: onContentEditorSave,
          customValidators: contentEditorValidators,
        }}
        emptyPrompt={noItemsFragment}
        createItem={showCreateButton === false ? undefined : createNewVis}
        customTableColumn={getCustomColumn()}
        customSortingOptions={getCustomSortingOptions()}
        initialPageSize={initialPageSize}
        initialFilter={''}
        entityName={i18n.translate('visualizationListing.listing.table.entityName', {
          defaultMessage: 'visualization',
        })}
        entityNamePlural={i18n.translate('visualizationListing.listing.table.entityNamePlural', {
          defaultMessage: 'visualizations',
        })}
        getOnClickTitle={(item) =>
          item.attributes.readOnly || item.error ? undefined : () => editItem(item)
        }
        tableCaption={visualizeLibraryTitle}
        rowItemActions={({ managed, attributes: { readOnly } }) =>
          !visualizeCapabilities.save || readOnly
            ? {
                edit: {
                  enabled: false,
                  reason: managed
                    ? i18n.translate('visualizationListing.managedLegacyVisMessage', {
                        defaultMessage:
                          'Elastic manages this visualisation. Changing it is not possible.',
                      })
                    : i18n.translate('visualizationListing.readOnlyLegacyVisMessage', {
                        defaultMessage:
                          "These details can't be edited because this visualization is no longer supported.",
                      }),
                },
              }
            : undefined
        }
        onFetchSuccess={onFetchSuccess}
        setPageDataTestSubject={setPageDataTestSubject}
      />
    </div>
  );
};
