/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CASE_VIEW_PAGE_TABS } from '../../../common/types';
import { useUrlParams } from '../../common/navigation';
import { CaseActionBar } from '../case_action_bar';
import { HeaderPage } from '../header_page';
import { EditableTitle } from '../header_page/editable_title';
import { useCasesTitleBreadcrumbs } from '../use_breadcrumbs';
import { CaseViewActivity } from './components/case_view_activity';
import { CaseViewMetrics } from './metrics';
import type { CaseViewPageProps } from './types';
import { useRefreshCaseViewPage } from './use_on_refresh_case_view_page';
import { useOnUpdateField } from './use_on_update_field';
import { CaseViewSimilarCases } from './components/case_view_similar_cases';
import { CaseViewAttachments } from './components/case_view_attachments';
import { filterCaseAttachmentsBySearchTerm } from './components/helpers';
import { ATTACHMENT_TAB_ALIASES } from './use_case_attachment_tabs';
import { SavedObjectInAppUrlsProvider } from '../attachments/common/saved_object/saved_object_in_app_urls_context';

const getActiveTabId = (tabId?: string) => {
  if (tabId && Object.values(CASE_VIEW_PAGE_TABS).includes(tabId as CASE_VIEW_PAGE_TABS)) {
    return tabId;
  }

  return CASE_VIEW_PAGE_TABS.ACTIVITY;
};

export const CaseViewPage = React.memo<CaseViewPageProps>(({ caseData, refreshRef }) => {
  const { urlParams } = useUrlParams();
  const refreshCaseViewPage = useRefreshCaseViewPage();

  const [searchTerm, setSearchTerm] = useState<string>('');
  const onSearch = useCallback(
    (newSearch: string) => {
      const trimSearch = newSearch.trim();
      setSearchTerm(trimSearch);
    },
    [setSearchTerm]
  );

  const caseWithFilteredAttachments = useMemo(
    () => filterCaseAttachmentsBySearchTerm(caseData, searchTerm),
    [caseData, searchTerm]
  );

  useCasesTitleBreadcrumbs(caseData.title);

  const activeTabId = getActiveTabId(urlParams?.tabId);

  const { onUpdateField, isLoading, loadingKey } = useOnUpdateField({
    caseData,
  });

  // Set `refreshRef` if needed
  useEffect(() => {
    let isStale = false;
    if (refreshRef) {
      refreshRef.current = {
        refreshCase: async () => {
          // Do nothing if component (or instance of this render cycle) is stale or it is already loading
          if (isStale || isLoading) {
            return;
          }
          refreshCaseViewPage();
        },
      };
      return () => {
        isStale = true;
        refreshRef.current = null;
      };
    }
  }, [isLoading, refreshRef, refreshCaseViewPage]);

  const onSubmitTitle = useCallback(
    (newTitle: string) =>
      onUpdateField({
        key: 'title',
        value: newTitle,
      }),
    [onUpdateField]
  );

  return (
    <>
      <HeaderPage
        border={false}
        data-test-subj="case-view-title"
        titleNode={
          <EditableTitle
            key={caseData.id}
            isLoading={isLoading && loadingKey === 'title'}
            title={caseData.title}
            onSubmit={onSubmitTitle}
          />
        }
        title={caseData.title}
        incrementalId={caseData.incrementalId}
      >
        <CaseActionBar
          caseData={caseData}
          isLoading={isLoading && (loadingKey === 'status' || loadingKey === 'settings')}
          onUpdateField={onUpdateField}
        />
      </HeaderPage>
      <EuiFlexGroup>
        <EuiFlexItem>
          <CaseViewMetrics data-test-subj="case-view-metrics" caseId={caseData.id} />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <SavedObjectInAppUrlsProvider caseData={caseData}>
        <EuiFlexGroup data-test-subj={`case-view-tab-content-${activeTabId}`} alignItems="baseline">
          {activeTabId === CASE_VIEW_PAGE_TABS.ACTIVITY && (
            <CaseViewActivity caseData={caseWithFilteredAttachments} searchTerm={searchTerm} />
          )}
          {ATTACHMENT_TAB_ALIASES.has(activeTabId) && (
            <CaseViewAttachments
              onSearch={onSearch}
              searchTerm={searchTerm}
              caseData={caseWithFilteredAttachments}
              onUpdateField={onUpdateField}
            />
          )}
          {activeTabId === CASE_VIEW_PAGE_TABS.SIMILAR_CASES && (
            <CaseViewSimilarCases caseData={caseWithFilteredAttachments} searchTerm={searchTerm} />
          )}
        </EuiFlexGroup>
      </SavedObjectInAppUrlsProvider>
    </>
  );
});
CaseViewPage.displayName = 'CaseViewPage';
