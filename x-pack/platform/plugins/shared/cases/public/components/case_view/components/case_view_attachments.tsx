/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexItem,
  EuiFlexGroup,
  EuiImage,
  EuiSpacer,
  EuiSuperUpdateButton,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CaseViewFilters } from './case_view_filters';
import { useCaseViewFilters } from '../hooks/use_case_view_filters';
import { useRefreshCaseViewPage } from '../use_on_refresh_case_view_page';
import noResultsIllustration from '../../../assets/illustration_product_no_results_magnifying_glass.svg';
import { CASE_VIEW_PAGE_TABS } from '../../../../common/types';
import type { CaseUI } from '../../../../common';
import { FILE_ATTACHMENT_TYPE } from '../../../../common/constants';
import { resolveUnifiedAttachmentType } from '../../../../common/utils/attachments/migration_utils';
import { useCasesContext } from '../../cases_context/use_cases_context';
import { useCasesFeatures } from '../../../common/use_cases_features';
import { SEARCH_PLACEHOLDER } from '../../actions/translations';
import { CaseViewAttachButton } from './case_view_attach_button';
import { CaseViewTabs } from '../case_view_tabs';
import { CaseViewObservables, OBSERVABLES_FILTER_ID } from './case_view_observables';
import { useCaseObservables } from '../use_case_observables';
import type { OnUpdateFields } from '../types';
import { AttachmentAccordion } from './attachment_accordion';
import { useGetCaseFileStats } from '../../../containers/use_get_case_file_stats';
import { getAttachmentItemCount } from './helpers';
import { NO_SEARCH_RESULTS_TITLE, NO_SEARCH_RESULTS_BODY, CLEAR_FILTERS } from './translations';

interface CaseViewAttachmentsProps {
  caseData: CaseUI;
  onSearch: (searchTerm: string) => void;
  searchTerm?: string;
  onUpdateField: (args: OnUpdateFields) => void;
}

export const CaseViewAttachments = ({
  caseData,
  onSearch,
  searchTerm,
  onUpdateField,
}: CaseViewAttachmentsProps) => {
  const { euiTheme } = useEuiTheme();
  const { unifiedAttachmentTypeRegistry } = useCasesContext();
  const { observablesAuthorized, isObservablesFeatureEnabled } = useCasesFeatures();
  const { data: fileStats } = useGetCaseFileStats({ caseId: caseData.id, searchTerm });
  const fileCount = fileStats?.total ?? 0;

  const owner = Array.isArray(caseData.owner) ? caseData.owner[0] : caseData.owner;

  const {
    filteredCaseData: authorFilteredCaseData,
    isTypeVisible,
    isAuthorFilterActive,
    hasActiveFilter,
    clearFilters,
    ...filters
  } = useCaseViewFilters(caseData);

  const countsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of authorFilteredCaseData.comments) {
      const unifiedType = resolveUnifiedAttachmentType(comment, owner);
      counts.set(unifiedType, (counts.get(unifiedType) ?? 0) + getAttachmentItemCount(comment));
    }
    return counts;
  }, [authorFilteredCaseData.comments, owner]);

  // fileStats covers the whole case; when an author filter is active fall back
  // to the per-author file count derived from caseData.comments so the badge
  // matches what the author is actually responsible for.
  const effectiveFileCount = isAuthorFilterActive
    ? countsByType.get(FILE_ATTACHMENT_TYPE) ?? 0
    : fileCount;

  const excludedTypes = useMemo(
    () =>
      unifiedAttachmentTypeRegistry
        .list()
        .filter((type) => !type.getAttachmentTabViewObject?.()?.children)
        .map((type) => type.id),
    [unifiedAttachmentTypeRegistry]
  );

  // Render one accordion per registered type that has a tab view AND a non-zero count.
  const attachmentSections = useMemo(
    () =>
      unifiedAttachmentTypeRegistry
        .list()
        .flatMap((type) => {
          if (!isTypeVisible(type.id)) return [];
          const Children = type.getAttachmentTabViewObject?.()?.children;
          if (!Children) {
            return [];
          }
          const count =
            type.id === FILE_ATTACHMENT_TYPE ? effectiveFileCount : countsByType.get(type.id) ?? 0;
          if (count < 1) {
            return [];
          }
          return [{ id: type.id, displayName: type.displayName, count, Children }];
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [unifiedAttachmentTypeRegistry, countsByType, effectiveFileCount, isTypeVisible]
  );

  // Observables stays hardcoded: there's no other entry point to add observables
  // to a case, so the accordion must be visible even when the count is 0.
  // Observables have no author, so any active author filter hides them.
  const showObservables =
    observablesAuthorized &&
    isObservablesFeatureEnabled &&
    isTypeVisible(OBSERVABLES_FILTER_ID) &&
    !isAuthorFilterActive;
  const { observables: filteredObservables, isLoading: isLoadingObservables } = useCaseObservables(
    caseData,
    searchTerm
  );

  const showNoResults = useMemo(
    () =>
      // observables is either hidden (e.g. observability)
      // or a search is active and produced zero matches
      (!showObservables || (Boolean(searchTerm) && filteredObservables.length === 0)) &&
      attachmentSections.length === 0,
    [searchTerm, attachmentSections.length, showObservables, filteredObservables.length]
  );

  const [inputValue, setInputValue] = useState(searchTerm ?? '');
  useEffect(() => {
    setInputValue(searchTerm ?? '');
  }, [searchTerm]);

  const refreshCaseView = useRefreshCaseViewPage();
  const isDirty = inputValue !== (searchTerm ?? '');
  const onClickUpdate = useCallback(() => {
    if (isDirty) {
      onSearch(inputValue);
    } else {
      refreshCaseView();
    }
  }, [isDirty, inputValue, onSearch, refreshCaseView]);

  return (
    <>
      <EuiFlexItem grow={6} data-test-subj="case-view-attachments">
        <CaseViewTabs
          caseData={caseData}
          activeTab={CASE_VIEW_PAGE_TABS.ATTACHMENTS}
          searchTerm={searchTerm}
        />
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow>
            <EuiFieldSearch
              placeholder={SEARCH_PLACEHOLDER}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onSearch={onSearch}
              data-test-subj="cases-files-search"
              fullWidth
            />
          </EuiFlexItem>
          <CaseViewFilters caseData={caseData} state={filters} excludedTypes={excludedTypes} />
          <EuiFlexItem grow={false}>
            <EuiSuperUpdateButton
              fill={false}
              needsUpdate={isDirty}
              onClick={onClickUpdate}
              data-test-subj="cases-attachments-update-button"
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <CaseViewAttachButton caseData={caseData} fill />
          </EuiFlexItem>
        </EuiFlexGroup>
        {hasActiveFilter ? (
          <>
            <EuiSpacer size="xs" />
            <EuiFlexGroup gutterSize="none" justifyContent="flexStart">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  onClick={clearFilters}
                  size="xs"
                  iconSide="left"
                  iconType="cross"
                  flush="left"
                  data-test-subj="case-view-filters-clear-filters"
                >
                  {CLEAR_FILTERS}
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
          </>
        ) : (
          <EuiSpacer size="m" />
        )}
        {showNoResults ? (
          <EuiEmptyPrompt
            data-test-subj="case-view-attachments-no-search-results"
            layout="horizontal"
            color="transparent"
            css={{ paddingBlockStart: euiTheme.size.xxl }}
            icon={
              <EuiImage
                css={{ width: 200, height: 148 }}
                size="200"
                alt=""
                url={noResultsIllustration}
              />
            }
            title={<h2>{NO_SEARCH_RESULTS_TITLE}</h2>}
            body={<p>{NO_SEARCH_RESULTS_BODY}</p>}
          />
        ) : (
          <EuiFlexGroup direction="column" gutterSize="m">
            {attachmentSections.map(({ id, displayName, count, Children }) => (
              <AttachmentAccordion key={id} id={id} title={displayName} count={count}>
                <Children caseData={authorFilteredCaseData} searchTerm={searchTerm} />
              </AttachmentAccordion>
            ))}
            {showObservables && (
              <CaseViewObservables
                caseData={caseData}
                observables={filteredObservables}
                isLoading={isLoadingObservables}
                searchTerm={searchTerm}
                onUpdateField={onUpdateField}
              />
            )}
          </EuiFlexGroup>
        )}
      </EuiFlexItem>
    </>
  );
};
CaseViewAttachments.displayName = 'CaseViewAttachments';
