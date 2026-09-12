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
  EuiIllustration,
  EuiSpacer,
  EuiSuperUpdateButton,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { notFound } from '@elastic/eui-illustrations';
import { CaseViewFilters } from './case_view_filters';
import { useCaseViewFilters } from '../hooks/use_case_view_filters';
import { useRefreshCaseViewPage } from '../use_on_refresh_case_view_page';
import type { CaseUI } from '../../../../common';
import { FILE_ATTACHMENT_TYPE } from '../../../../common/constants';
import { resolveUnifiedAttachmentType } from '../../../../common/utils/attachments/migration_utils';
import { useCasesContext } from '../../cases_context/use_cases_context';
import { useCasesFeatures } from '../../../common/use_cases_features';
import { SEARCH_PLACEHOLDER } from '../../actions/translations';
import { CaseViewAttachButton } from './case_view_attach_button';
import { CaseViewObservables, OBSERVABLES_FILTER_ID } from './case_view_observables';
import { useCaseObservables } from '../use_case_observables';
import type { OnUpdateFields } from '../types';
import { AttachmentAccordion } from './attachment_accordion';
import { useGetCaseFileStats } from '../../../containers/use_get_case_file_stats';
import { getAttachmentItemCount } from './helpers';
import {
  NO_SEARCH_RESULTS_TITLE,
  NO_SEARCH_RESULTS_BODY,
  CLEAR_FILTERS,
  COLLAPSE_ALL_ATTACHMENTS,
  EXPAND_ALL_ATTACHMENTS,
  NO_COLLAPSIBLE_ATTACHMENTS,
} from './translations';
import { SidebarToggleButton } from '../../cases_redesign/case_view/components/sidebar/sidebar_toggle_button';

interface CaseViewAttachmentsProps {
  caseData: CaseUI;
  onSearch: (searchTerm: string) => void;
  searchTerm?: string;
  onUpdateField: (args: OnUpdateFields) => void;
}

/** Explains the disabled pair on hover; a disabled button fires no pointer events of its own. */
const CollapseDisabledReason: React.FC<React.PropsWithChildren<{ show: boolean }>> = ({
  show,
  children,
}) =>
  show ? (
    <EuiToolTip content={NO_COLLAPSIBLE_ATTACHMENTS} display="inlineBlock">
      {/* Focusable so the explanation is reachable by keyboard: a disabled button is not. */}
      <span tabIndex={0}>{children}</span>
    </EuiToolTip>
  ) : (
    <>{children}</>
  );

CollapseDisabledReason.displayName = 'CollapseDisabledReason';

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
        .filter((type) => !type.getAttachmentList?.()?.children)
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
          const Children = type.getAttachmentList?.()?.children;
          if (!Children) {
            return [];
          }
          const count =
            type.id === FILE_ATTACHMENT_TYPE ? effectiveFileCount : countsByType.get(type.id) ?? 0;
          if (count < 1) {
            return [];
          }
          return [{ id: type.id, label: type.getLabel(), count, Children }];
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
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
  const hasVisibleObservables =
    showObservables && !(searchTerm && filteredObservables.length === 0);

  const showNoResults = useMemo(
    () =>
      // observables is either hidden (e.g. observability)
      // or a search is active and produced zero matches
      !hasVisibleObservables && attachmentSections.length === 0,
    [attachmentSections.length, hasVisibleObservables]
  );

  const [inputValue, setInputValue] = useState(searchTerm ?? '');
  const [collapsedAttachmentIds, setCollapsedAttachmentIds] = useState<Set<string>>(
    () => new Set()
  );
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

  const visibleAttachmentIds = useMemo(
    () => [
      ...attachmentSections.map((attachmentSection) => attachmentSection.id),
      ...(hasVisibleObservables ? [OBSERVABLES_FILTER_ID] : []),
    ],
    [attachmentSections, hasVisibleObservables]
  );
  // More than one, matching the activity feed: collapsing a single item is what its own toggle is
  // for, so a bulk control would be redundant rather than useful.
  const hasCollapsibleAttachments = visibleAttachmentIds.length > 1;
  const allAttachmentsCollapsed =
    visibleAttachmentIds.length > 0 &&
    visibleAttachmentIds.every((id) => collapsedAttachmentIds.has(id));
  const allAttachmentsExpanded = visibleAttachmentIds.every(
    (id) => !collapsedAttachmentIds.has(id)
  );

  const onAttachmentToggle = useCallback((id: string, isOpen: boolean) => {
    setCollapsedAttachmentIds((currentCollapsedAttachmentIds) => {
      const nextCollapsedAttachmentIds = new Set(currentCollapsedAttachmentIds);
      if (isOpen) {
        nextCollapsedAttachmentIds.delete(id);
      } else {
        nextCollapsedAttachmentIds.add(id);
      }
      return nextCollapsedAttachmentIds;
    });
  }, []);

  const collapseAllAttachments = useCallback(() => {
    setCollapsedAttachmentIds((currentCollapsedAttachmentIds) => {
      const nextCollapsedAttachmentIds = new Set(currentCollapsedAttachmentIds);
      visibleAttachmentIds.forEach((id) => nextCollapsedAttachmentIds.add(id));
      return nextCollapsedAttachmentIds;
    });
  }, [visibleAttachmentIds]);

  const expandAllAttachments = useCallback(() => {
    setCollapsedAttachmentIds((currentCollapsedAttachmentIds) => {
      const nextCollapsedAttachmentIds = new Set(currentCollapsedAttachmentIds);
      visibleAttachmentIds.forEach((id) => nextCollapsedAttachmentIds.delete(id));
      return nextCollapsedAttachmentIds;
    });
  }, [visibleAttachmentIds]);

  return (
    <>
      <EuiFlexItem grow={false} data-test-subj="case-view-attachments">
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
            <CaseViewAttachButton caseData={caseData} attachLocation="attachments" fill />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <SidebarToggleButton />
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
        {/* Always present, never appearing and disappearing with the contents of the tab: a control
            that comes and goes reads as instability. Disabled with a reason when there is nothing to
            collapse. Right-aligned and icon-led, matching the activity feed's equivalent pair. */}
        <EuiFlexGroup gutterSize="s" responsive={false} justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <CollapseDisabledReason show={!hasCollapsibleAttachments}>
              <EuiButtonEmpty
                size="xs"
                iconType="fold"
                onClick={collapseAllAttachments}
                disabled={!hasCollapsibleAttachments || allAttachmentsCollapsed}
                data-test-subj="case-view-attachments-collapse-all"
              >
                {COLLAPSE_ALL_ATTACHMENTS}
              </EuiButtonEmpty>
            </CollapseDisabledReason>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <CollapseDisabledReason show={!hasCollapsibleAttachments}>
              <EuiButtonEmpty
                size="xs"
                iconType="unfold"
                onClick={expandAllAttachments}
                disabled={!hasCollapsibleAttachments || allAttachmentsExpanded}
                data-test-subj="case-view-attachments-expand-all"
              >
                {EXPAND_ALL_ATTACHMENTS}
              </EuiButtonEmpty>
            </CollapseDisabledReason>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        {showNoResults ? (
          <EuiEmptyPrompt
            data-test-subj="case-view-attachments-no-search-results"
            layout="horizontal"
            color="transparent"
            css={{ paddingBlockStart: euiTheme.size.xxl }}
            icon={
              <EuiIllustration
                type={notFound}
                alt=""
                fullWidth={false}
                style={{ maxInlineSize: 160 }}
              />
            }
            title={<h2>{NO_SEARCH_RESULTS_TITLE}</h2>}
            body={<p>{NO_SEARCH_RESULTS_BODY}</p>}
          />
        ) : (
          <EuiFlexGroup direction="column" gutterSize="m">
            {attachmentSections.map(({ id, label, count, Children }) => (
              <AttachmentAccordion
                key={id}
                id={id}
                title={label}
                count={count}
                isOpen={!collapsedAttachmentIds.has(id)}
                onToggle={(isOpen) => onAttachmentToggle(id, isOpen)}
              >
                <Children caseData={authorFilteredCaseData} searchTerm={searchTerm} />
              </AttachmentAccordion>
            ))}
            {hasVisibleObservables && (
              <CaseViewObservables
                caseData={caseData}
                observables={filteredObservables}
                isLoading={isLoadingObservables}
                searchTerm={searchTerm}
                onUpdateField={onUpdateField}
                isOpen={!collapsedAttachmentIds.has(OBSERVABLES_FILTER_ID)}
                onToggle={(isOpen) => onAttachmentToggle(OBSERVABLES_FILTER_ID, isOpen)}
              />
            )}
          </EuiFlexGroup>
        )}
      </EuiFlexItem>
    </>
  );
};
CaseViewAttachments.displayName = 'CaseViewAttachments';
