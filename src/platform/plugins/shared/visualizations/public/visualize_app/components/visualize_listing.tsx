/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { EuiButton } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import useUnmount from 'react-use/lib/useUnmount';
import useMount from 'react-use/lib/useMount';
import { useLocation, useParams } from 'react-router-dom';

import { useKibana, useExecutionContext } from '@kbn/kibana-react-plugin/public';
import {
  TabbedTableListView,
  type TableListTab,
} from '@kbn/content-management-tabbed-table-list-view';

import { VisualizeConstants } from '@kbn/visualizations-common';

import { showNewVisModal } from '../../wizard';
import type { VisualizeUserContent } from '../../utils/to_table_list_view_saved_object';
import type { VisualizeServices } from '../types';
import { VisualizeListingProvider } from './visualize_listing_provider';
import { VisualizeContentList } from './visualize_content_list';

const visualizeLibraryPageTitle = i18n.translate('visualizations.listingPageTitle', {
  defaultMessage: 'Visualize library',
});

const VISUALIZE_TAB_ID = 'visualizations';

export const VisualizeListing = () => {
  const {
    services: {
      application,
      executionContext,
      chrome,
      history,
      stateTransferService,
      listingViewRegistry,
      serverless,
    },
  } = useKibana<VisualizeServices>();
  const { pathname } = useLocation();
  const closeNewVisModal = useRef(() => {});

  useExecutionContext(executionContext, {
    type: 'application',
    page: 'list',
  });

  useEffect(() => {
    if (pathname === '/new') {
      // In case the user navigated to the page via the /visualize/new URL we
      // start the dialog immediately.
      closeNewVisModal.current = showNewVisModal({
        onClose: () => {
          // Replace the URL so reload / back doesn't reopen the modal.
          history.push(VisualizeConstants.LANDING_PAGE_PATH);
        },
      });
    } else {
      // Close any modal window opened by a prior navigation.
      closeNewVisModal.current();
    }
  }, [history, pathname]);

  useMount(() => {
    stateTransferService.clearEditorState();
    if (serverless?.setBreadcrumbs) {
      // "Visualization" breadcrumb is set automatically by serverless nav —
      // reset any deeper context breadcrumbs left over from another page.
      serverless.setBreadcrumbs([]);
    } else {
      chrome.setBreadcrumbs([{ text: visualizeLibraryPageTitle }]);
    }
    chrome.docTitle.change(visualizeLibraryPageTitle);
  });
  useUnmount(() => closeNewVisModal.current());

  const onCreateNewVis = useCallback(() => {
    closeNewVisModal.current = showNewVisModal({
      originatingApp: VisualizeConstants.APP_ID,
      breadcrumbs: [
        {
          text: visualizeLibraryPageTitle,
          href: application.getUrlForApp(VisualizeConstants.APP_ID, {
            path: `#${VisualizeConstants.LANDING_PAGE_PATH}`,
          }),
        },
      ],
    });
  }, [application]);

  const visualizeTab: TableListTab<VisualizeUserContent> = useMemo(
    () => ({
      title: 'Visualizations',
      id: VISUALIZE_TAB_ID,
      getTableList: ({ setPageDataTestSubject }) => (
        <VisualizeListingProvider>
          <VisualizeContentList {...{ onCreateNewVis, setPageDataTestSubject }} />
        </VisualizeListingProvider>
      ),
    }),
    [onCreateNewVis]
  );

  const tabs = useMemo(
    () => [visualizeTab, ...Array.from(listingViewRegistry as Set<TableListTab>)],
    [listingViewRegistry, visualizeTab]
  );

  const { activeTab } = useParams<{ activeTab: string }>();

  // The shell renders one shared header across tabs; only the Visualizations
  // tab owns a create action (registry tabs create their content elsewhere).
  // `activeTab` is undefined on the default route, which resolves to this tab.
  const rightSideItems = useMemo(() => {
    if (activeTab && activeTab !== VISUALIZE_TAB_ID) {
      return undefined;
    }
    return [
      <EuiButton
        data-test-subj="newItemButton"
        iconType="plusInCircle"
        onClick={onCreateNewVis}
        fill
      >
        <FormattedMessage
          id="visualizations.listing.createNewVisualizationButtonLabel"
          defaultMessage="Create new visualization"
        />
      </EuiButton>,
    ];
  }, [activeTab, onCreateNewVis]);

  return (
    <TabbedTableListView
      headingId="visualizeListingHeading"
      title={visualizeLibraryPageTitle}
      tabs={tabs}
      activeTabId={activeTab}
      changeActiveTab={(id) => {
        application.navigateToUrl(`#/${id}`);
      }}
      rightSideItems={rightSideItems}
    />
  );
};
