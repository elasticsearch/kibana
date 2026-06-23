/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { EuiFlexGroup } from '@elastic/eui';
import { CASE_VIEW_PAGE_TABS } from '../../../../../common/types';
import type { CaseUI } from '../../../../../common';
import { useUrlParams } from '../../../../common/navigation';
import { ATTACHMENT_TAB_ALIASES } from '../../../case_view/use_case_attachment_tabs';
import { CaseViewActivity } from './case_view_activity';
import { CaseViewSimilarCases } from '../../../case_view/components/case_view_similar_cases';
import { CaseViewAttachments } from '../../../case_view/components/case_view_attachments';
import type { OnUpdateFields } from '../../../case_view/types';

interface CaseViewTabContentProps {
  caseData: CaseUI;
  searchTerm: string;
  onSearch: (term: string) => void;
  onUpdateField: (args: OnUpdateFields) => void;
}

export const CaseViewTabContent: FC<CaseViewTabContentProps> = ({
  caseData,
  searchTerm,
  onSearch,
  onUpdateField,
}) => {
  const { urlParams } = useUrlParams();
  const rawTabId = urlParams?.tabId ?? CASE_VIEW_PAGE_TABS.ACTIVITY;

  const activeTabId =
    rawTabId === CASE_VIEW_PAGE_TABS.ACTIVITY ||
    rawTabId === CASE_VIEW_PAGE_TABS.SIMILAR_CASES ||
    ATTACHMENT_TAB_ALIASES.has(rawTabId)
      ? rawTabId
      : CASE_VIEW_PAGE_TABS.ACTIVITY;

  return (
    <EuiFlexGroup data-test-subj={`case-view-tab-content-${activeTabId}`} alignItems="baseline">
      {activeTabId === CASE_VIEW_PAGE_TABS.ACTIVITY && (
        <CaseViewActivity caseData={caseData} searchTerm={searchTerm} />
      )}
      {ATTACHMENT_TAB_ALIASES.has(activeTabId) && (
        <CaseViewAttachments
          caseData={caseData}
          onSearch={onSearch}
          searchTerm={searchTerm}
          onUpdateField={onUpdateField}
        />
      )}
      {activeTabId === CASE_VIEW_PAGE_TABS.SIMILAR_CASES && (
        <CaseViewSimilarCases caseData={caseData} searchTerm={searchTerm} />
      )}
    </EuiFlexGroup>
  );
};

CaseViewTabContent.displayName = 'CaseViewTabContent';
