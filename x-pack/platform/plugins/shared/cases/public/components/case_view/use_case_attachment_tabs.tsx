/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiThemeComputed } from '@elastic/eui';
import { EuiNotificationBadge } from '@elastic/eui';
import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import { CASE_VIEW_PAGE_TABS } from '../../../common/types';
import { useCasesContext } from '../cases_context/use_cases_context';
import { type CaseUI } from '../../../common';
import { useGetCaseFileStats } from '../../containers/use_get_case_file_stats';
import { useCaseObservables } from './use_case_observables';
import { useCasesFeatures } from '../../common/use_cases_features';
import { resolveUnifiedAttachmentType } from '../../../common/utils/attachments/migration_utils';
import { FILE_ATTACHMENT_TYPE } from '../../../common/constants';
import { getAttachmentItemCount } from './components/helpers';

/**
 * Tab ids that resolve to the consolidated attachments view. Includes the
 * legacy per-type sub-tab ids so deep links from older URLs still work.
 */
export const ATTACHMENT_TAB_ALIASES: ReadonlySet<string> = new Set([
  CASE_VIEW_PAGE_TABS.ATTACHMENTS,
  CASE_VIEW_PAGE_TABS.ALERTS,
  CASE_VIEW_PAGE_TABS.EVENTS,
  CASE_VIEW_PAGE_TABS.FILES,
  CASE_VIEW_PAGE_TABS.OBSERVABLES,
]);

export const SimilarCasesBadge = ({
  activeTab,
  count,
  euiTheme,
}: {
  activeTab: string;
  count?: number;
  euiTheme: EuiThemeComputed<{}>;
}) => (
  <EuiNotificationBadge
    size="m"
    css={css`
      border-radius: 999px;
      margin-left: ${euiTheme.size.xs};
    `}
    data-test-subj="case-view-similar-cases-badge"
    color={activeTab === CASE_VIEW_PAGE_TABS.SIMILAR_CASES ? 'accent' : 'subdued'}
  >
    {count ?? 0}
  </EuiNotificationBadge>
);
SimilarCasesBadge.displayName = 'SimilarCasesBadge';

export const AttachmentsBadge = ({
  isActive,
  count,
  euiTheme,
}: {
  isActive: boolean;
  count?: number;
  euiTheme: EuiThemeComputed<{}>;
}) => (
  <EuiNotificationBadge
    size="m"
    css={css`
      border-radius: 999px;
      margin-left: ${euiTheme.size.xs};
    `}
    data-test-subj="case-view-attachments-badge"
    color={isActive ? 'accent' : 'subdued'}
  >
    {count ?? 0}
  </EuiNotificationBadge>
);
AttachmentsBadge.displayName = 'AttachmentsBadge';

/**
 * Computes the total count shown on the top-level "Attachments" tab badge.
 * Reflects the active search filter so the badge tracks what the user actually
 * sees: comments matching a registered type with a tab view, plus files (from
 * `fileStatsData`) and — if licensed — observables.
 */
export const useCaseAttachmentsTotal = ({
  caseData,
  searchTerm,
}: {
  caseData: CaseUI;
  searchTerm?: string;
}): number => {
  const { unifiedAttachmentTypeRegistry } = useCasesContext();
  const { data: fileStatsData } = useGetCaseFileStats({ caseId: caseData.id, searchTerm });
  const { observables } = useCaseObservables(caseData, searchTerm);
  const { observablesAuthorized: canShowObservableTabs, isObservablesFeatureEnabled } =
    useCasesFeatures();

  return useMemo(() => {
    const owner = Array.isArray(caseData.owner) ? caseData.owner[0] : caseData.owner;
    const typesWithTabView = new Set(
      unifiedAttachmentTypeRegistry
        .list()
        .filter(
          (type) =>
            type.id !== FILE_ATTACHMENT_TYPE &&
            type.getAttachmentTabViewObject?.()?.children != null
        )
        .map((type) => type.id)
    );

    let registryTotal = 0;
    for (const comment of caseData.comments) {
      if (typesWithTabView.has(resolveUnifiedAttachmentType(comment, owner))) {
        registryTotal += getAttachmentItemCount(comment);
      }
    }

    return (
      registryTotal +
      Number(fileStatsData?.total ?? 0) +
      (canShowObservableTabs && isObservablesFeatureEnabled ? observables.length : 0)
    );
  }, [
    caseData.owner,
    caseData.comments,
    unifiedAttachmentTypeRegistry,
    fileStatsData?.total,
    canShowObservableTabs,
    isObservablesFeatureEnabled,
    observables.length,
  ]);
};
