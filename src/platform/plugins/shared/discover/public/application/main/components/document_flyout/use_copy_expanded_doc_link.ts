/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo, useRef } from 'react';
import { copyToClipboard } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DataView } from '@kbn/data-views-plugin/public';
import { isOfAggregateQueryType, type AggregateQuery, type Query } from '@kbn/es-query';
import { constructCascadeQuery } from '@kbn/esql-utils';
import {
  getDiscoverLocatorParams,
  toCascadeDocShareLocatorParams,
} from '../../utils/get_discover_locator_params';
import {
  selectCurrentProfileLocatorState,
  useCurrentTabSelector,
  useInternalStateSelector,
  useRuntimeStateManager,
} from '../../state_management/redux';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';

/**
 * Copies a flyout link using the absolute time range that produced the current results.
 */
export const useCopyExpandedDocLink = ({
  dataView,
}: {
  dataView: DataView;
}): {
  copyLink: () => Promise<void>;
  shareQuery: Query | AggregateQuery | undefined;
} => {
  const services = useDiscoverServices();
  const runtimeStateManager = useRuntimeStateManager();
  const currentTab = useCurrentTabSelector((tab) => tab);
  const persistedDiscoverSession = useInternalStateSelector(
    (state) => state.persistedDiscoverSession
  );
  const isCopyingLinkRef = useRef(false);

  const cascadeShareQuery = useMemo(() => {
    if (!currentTab.expandedDocCascadePath || !isOfAggregateQueryType(currentTab.appState.query)) {
      return undefined;
    }

    try {
      return constructCascadeQuery({
        query: currentTab.appState.query,
        dataView,
        esqlVariables: currentTab.esqlVariables,
        nodeType: 'leaf',
        ...currentTab.expandedDocCascadePath,
      });
    } catch {
      return undefined;
    }
  }, [
    currentTab.appState.query,
    currentTab.esqlVariables,
    currentTab.expandedDocCascadePath,
    dataView,
  ]);

  const shareQuery = cascadeShareQuery ?? currentTab.appState.query;

  const copyLink = useCallback(async () => {
    const {
      locator,
      share,
      capabilities,
      filterManager,
      data,
      profileStateRegistry,
      toastNotifications,
    } = services;
    const { timefilter } = data.query.timefilter;

    const locatorParams = getDiscoverLocatorParams({
      currentTab,
      dataView,
      persistedDiscoverSession,
      filters: filterManager.getFilters(),
      timeRange: currentTab.dataRequestParams.timeRangeAbsolute ?? timefilter.getAbsoluteTime(),
      refreshInterval: timefilter.getRefreshInterval(),
      profileState: selectCurrentProfileLocatorState({
        runtimeStateManager,
        tabId: currentTab.id,
        profileStateMap: currentTab.profileState,
        profileStateRegistry,
      }),
    });

    const params = cascadeShareQuery
      ? toCascadeDocShareLocatorParams({
          locatorParams,
          query: cascadeShareQuery,
          expandedDoc: currentTab.expandedDoc,
        })
      : locatorParams;

    try {
      let url: string;

      if (capabilities.discover_v2.createShortUrl && share) {
        const shortUrl = await share.url.shortUrls.get(null).createWithLocator({ locator, params });
        url = await shortUrl.locator.getUrl(shortUrl.params, { absolute: true });
      } else {
        const link = document.createElement('a');
        link.setAttribute('href', locator.getRedirectUrl(params));
        url = link.href;
      }

      copyToClipboard(url);
      toastNotifications.addSuccess({
        title: i18n.translate('discover.docViews.flyout.copyLinkSuccessTitle', {
          defaultMessage: 'Link copied to clipboard',
        }),
      });
    } catch (error) {
      toastNotifications.addDanger({
        title: i18n.translate('discover.docViews.flyout.copyLinkErrorTitle', {
          defaultMessage: 'Unable to copy link',
        }),
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    cascadeShareQuery,
    currentTab,
    dataView,
    persistedDiscoverSession,
    runtimeStateManager,
    services,
  ]);

  const copyLinkOnce = useCallback(async () => {
    if (isCopyingLinkRef.current) {
      return;
    }

    isCopyingLinkRef.current = true;

    try {
      await copyLink();
    } finally {
      isCopyingLinkRef.current = false;
    }
  }, [copyLink]);

  return { copyLink: copyLinkOnce, shareQuery };
};
