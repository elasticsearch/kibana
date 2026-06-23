/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AppMenuActionId } from '@kbn/discover-utils';
import { omit } from 'lodash';
import { setStateToKbnUrl } from '@kbn/kibana-utils-plugin/public';
import { i18n } from '@kbn/i18n';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import type { AppMenuItemType, AppMenuPopoverItem } from '@kbn/core-chrome-app-menu-components';
import type { ShowShareMenuOptions } from '@kbn/share-plugin/public';
import type { ShareActionIntents, SharingData } from '@kbn/share-plugin/public/types';
import type { IntlShape } from '@kbn/i18n-react';
import type { ReportingCSVSharingData } from '@kbn/reporting-public/types';
import type { DataTotalHitsMsg } from '../../../state_management/discover_data_state_container';
import {
  getColumnsWithTimeField,
  getSharingData,
  showPublicUrlSwitch,
} from '../../../../../utils/get_sharing_data';
import { createSearchSource } from '../../../state_management/utils/create_search_source';
import type { DiscoverAppLocatorParams } from '../../../../../../common/app_locator';
import type { AppMenuDiscoverParams } from './types';
import type { DiscoverServices } from '../../../../../build_services';
import type { TabState } from '../../../state_management/redux';

interface BuildShareOptionsParams {
  discoverParams: AppMenuDiscoverParams;
  services: DiscoverServices;
  currentTab: TabState;
  persistedDiscoverSession: DiscoverSession | undefined;
  totalHitsState: DataTotalHitsMsg;
  hasUnsavedChanges: boolean;
}

/**
 * Specifies an explicit type for the sharing data of the Discover app.
 */
type DiscoverSharingData = SharingData<DiscoverAppLocatorParams> & ReportingCSVSharingData;

/**
 * Builds share options for both share modal and export integrations
 */
export const buildShareOptions = async ({
  discoverParams,
  services,
  currentTab,
  persistedDiscoverSession,
  totalHitsState,
  hasUnsavedChanges,
}: BuildShareOptionsParams): Promise<
  Omit<
    ShowShareMenuOptions<DiscoverAppLocatorParams, ReportingCSVSharingData>,
    'anchorElement' | 'asExport'
  >
> => {
  const { dataView, isEsqlMode } = discoverParams;

  const searchSource = createSearchSource({
    dataView,
    appState: currentTab.appState,
    globalState: currentTab.globalState,
    services,
  });

  const searchSourceSharingData = await getSharingData(searchSource, currentTab.appState, services);

  const { locator } = services;
  const { timefilter } = services.data.query.timefilter;
  const timeRange = timefilter.getTime();
  const absoluteTimeRange = timefilter.getAbsoluteTime();
  const refreshInterval = timefilter.getRefreshInterval();
  const filters = services.filterManager.getFilters();

  // Share -> Get links -> Snapshot
  const params: DiscoverSharingData['locatorParams'][number]['params'] = {
    ...omit(currentTab.appState, 'dataSource'),
    ...(persistedDiscoverSession?.id ? { savedSearchId: persistedDiscoverSession.id } : {}),
    ...(dataView?.isPersisted()
      ? { dataViewId: dataView?.id }
      : { dataViewSpec: dataView?.toMinimalSpec() }),
    filters,
    timeRange,
    refreshInterval,
  };

  if (currentTab) {
    params.tab = {
      id: currentTab.id,
      label: currentTab.label,
    };
  }

  const relativeUrl = locator.getRedirectUrl(params);

  // This logic is duplicated from `relativeToAbsolute` (for bundle size reasons). Ultimately, this should be
  // replaced when https://github.com/elastic/kibana/issues/153323 is implemented.
  const link = document.createElement('a');
  link.setAttribute('href', relativeUrl);
  const shareableUrl = link.href;

  // Share -> Get links -> Saved object
  let shareableUrlForSavedObject = await locator.getUrl(
    { savedSearchId: persistedDiscoverSession?.id },
    { absolute: true }
  );

  // UrlPanelContent forces a '_g' parameter in the saved object URL:
  // https://github.com/elastic/kibana/blob/a30508153c1467b1968fb94faf1debc5407f61ea/src/plugins/share/public/components/url_panel_content.tsx#L230
  // Since our locator doesn't add the '_g' parameter if it's not needed, UrlPanelContent
  // will interpret it as undefined and add '?_g=' to the URL, which is invalid in Discover,
  // so instead we add an empty object for the '_g' parameter to the URL.
  shareableUrlForSavedObject = setStateToKbnUrl('_g', {}, undefined, shareableUrlForSavedObject);

  return {
    allowShortUrl: !!services.capabilities.discover_v2.createShortUrl,
    shareableUrl,
    shareableUrlForSavedObject,
    // Share URL gets the unmodified `columns` array (without the automatically added time field)
    // so it does not trigger the unsaved changes badge when user opens the link
    shareableUrlLocatorParams: { locator, params },
    objectId: persistedDiscoverSession?.id,
    objectType: 'search',
    objectTypeAlias: i18n.translate('discover.share.objectTypeAlias', {
      defaultMessage: 'Discover session',
    }),
    objectTypeMeta: {
      title: i18n.translate('discover.share.shareModal.title', {
        defaultMessage: 'Share this Discover session',
      }),
      config: {
        embed: {
          disabled: true,
          showPublicUrlSwitch,
        },
        integration: {
          export: {
            csvReports: {
              draftModeCallOut: true,
            },
          },
        },
        link: {
          draftModeCallOut: true,
        },
      },
    },
    sharingData: {
      isTextBased: isEsqlMode,
      locatorParams: [
        {
          id: locator.id,
          version: services.metadata.version,
          params: isEsqlMode
            ? {
                ...params,
                // in ES|QL mode this `columns` array will be used when generating CSV on Discover page (CSV v2)
                // this way the time field will be included only for CSV export and not for Share URL
                columns: getColumnsWithTimeField({
                  columns: (params.columns as string[]) || [],
                  timeFieldName: dataView?.timeFieldName,
                  uiSettings: services.uiSettings,
                  query: currentTab.appState.query,
                }),
              }
            : params,
        },
      ],
      ...searchSourceSharingData,
      // CSV reports can be generated without a saved search so we provide a fallback title
      title:
        persistedDiscoverSession?.title ||
        i18n.translate('discover.localMenu.fallbackReportTitle', {
          defaultMessage: 'Untitled Discover session',
        }),
      totalHits: totalHitsState.result || 0,
      absoluteTimeRange: isEsqlMode ? absoluteTimeRange : undefined,
    },
    isDirty: !persistedDiscoverSession?.id || hasUnsavedChanges,
  };
};

/**
 * Generates export menu items from available share integrations
 */
const getExportItems = (
  buildShareOptionsParams: BuildShareOptionsParams,
  intl: IntlShape
): AppMenuPopoverItem[] => {
  const { services } = buildShareOptionsParams;

  if (!services.share) return [];

  const exportIntegrations = services.share.availableIntegrations('search', 'export');
  const exportDerivatives = services.share.availableIntegrations('search', 'exportDerivatives');

  const hasCsvReports = exportIntegrations.some(
    (item: ShareActionIntents) =>
      item.shareType === 'integration' && 'id' in item && item.id === 'csvReports'
  );
  const hasScheduledReports = exportDerivatives.some(
    (item: ShareActionIntents) =>
      item.shareType === 'integration' && 'id' in item && item.id === 'scheduledReports'
  );

  const exportItems: AppMenuPopoverItem[] = [];

  if (hasCsvReports) {
    exportItems.push({
      id: 'csvReports',
      label: i18n.translate('discover.localMenu.export.csvLabel', {
        defaultMessage: 'CSV',
      }),
      testId: 'exportMenuItem-CSV',
      iconType: 'table',
      order: 1,
      run: async () => {
        const shareOptions = await buildShareOptions(buildShareOptionsParams);
        const handler = await services.share?.getExportHandler(shareOptions, 'csvReports', intl);
        await handler?.();
      },
    });
  }

  if (hasScheduledReports) {
    exportItems.push({
      id: 'scheduledReports',
      label: i18n.translate('discover.localMenu.export.scheduleExportLabel', {
        defaultMessage: 'Schedule export',
      }),
      testId: 'exportMenuItem-scheduledReports',
      iconType: 'calendar',
      order: 2,
      run: async () => {
        const shareOptions = await buildShareOptions(buildShareOptionsParams);
        const handler = await services.share?.getExportDerivativeHandler(
          shareOptions,
          'scheduledReports'
        );
        await handler?.();
      },
    });
  }

  return exportItems;
};

export const getShareAppMenuItem = ({
  discoverParams,
  services,
  hasIntegrations,
  hasUnsavedChanges,
  currentTab,
  persistedDiscoverSession,
  totalHitsState,
  intl,
}: {
  discoverParams: AppMenuDiscoverParams;
  services: DiscoverServices;
  hasIntegrations: boolean;
  hasUnsavedChanges: boolean;
  currentTab: TabState;
  persistedDiscoverSession: DiscoverSession | undefined;
  totalHitsState: DataTotalHitsMsg;
  intl: IntlShape;
}): AppMenuItemType[] => {
  if (!services.share) {
    return [];
  }

  const shareExecutor = async () => {
    const shareOptions = await buildShareOptions({
      discoverParams,
      services,
      currentTab,
      persistedDiscoverSession,
      totalHitsState,
      hasUnsavedChanges,
    });
    services.share?.toggleShareContextMenu(shareOptions);
  };

  const menuItems: AppMenuItemType[] = [
    {
      id: AppMenuActionId.share,
      order: 1,
      label: i18n.translate('discover.localMenu.shareTitle', {
        defaultMessage: 'Share',
      }),
      tooltipContent: i18n.translate('discover.localMenu.shareTooltip', {
        defaultMessage: 'Share session',
      }),
      iconType: 'share',
      testId: 'shareTopNavButton',
      run: () => {
        shareExecutor();
      },
    },
  ];

  if (hasIntegrations) {
    const exportItems = getExportItems(
      {
        discoverParams,
        services,
        currentTab,
        persistedDiscoverSession,
        totalHitsState,
        hasUnsavedChanges,
      },
      intl
    );

    menuItems.unshift({
      id: AppMenuActionId.export,
      order: 8,
      label: i18n.translate('discover.localMenu.exportTitle', {
        defaultMessage: 'Export tab results',
      }),
      iconType: 'upload',
      testId: 'exportTopNavButton',
      items: exportItems,
      popoverTestId: 'exportPopoverPanel',
    });
  }

  return menuItems;
};
