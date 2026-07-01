/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { memo, useEffect } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { DocumentDetailsRightPanelKey } from '../shared/constants/panel_keys';
import { useTabs } from './hooks/use_tabs';
import { FLYOUT_STORAGE_KEYS } from '../shared/constants/local_storage';
import { useKibana } from '../../../common/lib/kibana';
import { useDocumentDetailsContext } from '../shared/context';
import { useFlyoutPagination } from '../../../common/utils/flyout_pagination/use_flyout_pagination';
import type { DocumentDetailsProps } from '../shared/types';
import { PanelNavigation } from './navigation';
import { PanelHeader } from './header';
import { PanelContent } from './content';
import type { RightPanelTabType } from './tabs';
import { PanelFooter } from './footer';
import { useFlyoutIsExpandable } from './hooks/use_flyout_is_expandable';
import { DocumentEventTypes } from '../../../common/lib/telemetry';
import { FLYOUT_LOADING_SPINNER_TEST_ID } from './components/test_ids';

export type RightPanelPaths = 'overview' | 'table' | 'json';

/**
 * Panel to be displayed in the document details expandable flyout right section
 */
export const RightPanel: FC<Partial<DocumentDetailsProps>> = memo(({ path }) => {
  const { storage, telemetry } = useKibana().services;
  const { openRightPanel, closeFlyout } = useExpandableFlyoutApi();
  const {
    eventId,
    indexName,
    scopeId,
    isRulePreview,
    dataAsNestedObject,
    getFieldsData,
    paginationInstanceId,
  } = useDocumentDetailsContext();
  const { isFlyoutAlertLoading } = useFlyoutPagination(paginationInstanceId);

  // if the flyout is expandable we render all 3 tabs (overview, table and json)
  // if the flyout is not, we render only table and json
  const flyoutIsExpandable = useFlyoutIsExpandable({ getFieldsData, dataAsNestedObject });
  const { tabsDisplayed, selectedTabId } = useTabs({ flyoutIsExpandable, path });

  const setSelectedTabId = (tabId: RightPanelTabType['id']) => {
    openRightPanel({
      id: DocumentDetailsRightPanelKey,
      path: {
        tab: tabId,
      },
      params: {
        id: eventId,
        indexName,
        scopeId,
        paginationInstanceId,
      },
    });

    // saving which tab is currently selected in the right panel in local storage
    storage.set(FLYOUT_STORAGE_KEYS.RIGHT_PANEL_SELECTED_TABS, tabId);

    telemetry.reportEvent(DocumentEventTypes.DetailsFlyoutTabClicked, {
      location: scopeId,
      panel: 'right',
      tabId,
    });
  };

  // If flyout is open in rule preview, do not reload with stale information
  useEffect(() => {
    const beforeUnloadHandler = () => {
      if (isRulePreview) {
        closeFlyout();
      }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [isRulePreview, closeFlyout]);

  // While the in-flyout pagination is fetching an alert from a different page
  // than the alerts table is showing, render a centered spinner instead of
  // the panel content. The header (and its pagination) are still rendered so
  // the user can keep navigating without their click being lost. Once the
  // alert is fetched, `AlertsTableComponent` re-opens the flyout with the new
  // params and `isFlyoutAlertLoading` flips back to false.
  if (isFlyoutAlertLoading) {
    return (
      <>
        <PanelNavigation flyoutIsExpandable={flyoutIsExpandable} />
        <PanelHeader
          tabs={tabsDisplayed}
          selectedTabId={selectedTabId}
          setSelectedTabId={setSelectedTabId}
        />
        <EuiFlexGroup
          alignItems="center"
          justifyContent="center"
          css={{ height: '100%' }}
          data-test-subj={FLYOUT_LOADING_SPINNER_TEST_ID}
        >
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  }

  return (
    <>
      <PanelNavigation flyoutIsExpandable={flyoutIsExpandable} />
      <PanelHeader
        tabs={tabsDisplayed}
        selectedTabId={selectedTabId}
        setSelectedTabId={setSelectedTabId}
      />
      <PanelContent tabs={tabsDisplayed} selectedTabId={selectedTabId} />
      <PanelFooter isRulePreview={isRulePreview} />
    </>
  );
});

RightPanel.displayName = 'RightPanel';
