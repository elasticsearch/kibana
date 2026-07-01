/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { firstValueFrom } from 'rxjs';
import { FormattedRelative } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { TableListViewKibanaProvider } from '@kbn/content-management-table-list-view-table';
import type { TableListTabParentProps } from '@kbn/content-management-tabbed-table-list-view';
import type { CoreStart } from '@kbn/core/public';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { SavedObjectTaggingOssPluginStart } from '@kbn/saved-objects-tagging-oss-plugin/public';
import type { VisualizationsStart } from '@kbn/visualizations-plugin/public';
import { VISUALIZE_APP_NAME } from '@kbn/visualizations-common';
import { VisualizationTableList } from './components/visualization_table_list';

export interface VisualizationListingPageServices {
  core: CoreStart;
  visualizations: VisualizationsStart;
  contentManagement: ContentManagementPublicStart;
  embeddable: EmbeddableStart;
  savedObjectsTagging?: SavedObjectTaggingOssPluginStart['getTaggingApi'];
}

export const getTableList = (
  parentProps: TableListTabParentProps,
  services: VisualizationListingPageServices
) => {
  return (
    <TableListViewKibanaProvider
      {...{
        core: services.core,
        savedObjectsTagging: services.savedObjectsTagging?.(),
        FormattedRelative,
      }}
    >
      <VisualizationTableList
        core={services.core}
        visualizations={services.visualizations}
        contentManagement={services.contentManagement}
        embeddable={services.embeddable}
        parentProps={parentProps}
      />
    </TableListViewKibanaProvider>
  );
};

export const showNewVisModalFromDashboard = async (
  coreStart: CoreStart,
  pluginsStart: { visualizations: VisualizationsStart; embeddable: EmbeddableStart },
  tabTitle: string
) => {
  try {
    const currentApp = await firstValueFrom(coreStart.application.currentAppId$);
    const breadcrumbs = currentApp
      ? [
          {
            text:
              pluginsStart.embeddable.getStateTransfer().getAppNameFromId(currentApp) ?? currentApp,
            href: coreStart.application.getUrlForApp(currentApp),
          },
          {
            text: tabTitle,
            href: coreStart.application.getUrlForApp(currentApp, {
              path: window.location.hash,
            }),
          },
        ]
      : undefined;
    pluginsStart.visualizations.showNewVisModal({
      originatingApp: currentApp,
      originatingPath: window.location.hash,
      outsideVisualizeApp: currentApp !== VISUALIZE_APP_NAME,
      breadcrumbs,
    });
  } catch (error) {
    coreStart.notifications.toasts.addError(error, {
      title: i18n.translate('visualizationListing.visualizeListingCreateErrorTitle', {
        defaultMessage: 'Error opening new visualization modal',
      }),
    });
  }
};
