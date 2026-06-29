/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonEmpty,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiSwitch,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React from 'react';
import { TableTitle } from '../../../stream_detail_systems/table_title';
import { KnowledgeIndicatorsTypeFilter } from '../../../stream_detail_significant_events_view/knowledge_indicators_type_filter';
import { KnowledgeIndicatorsSubtypeFilter } from '../../../stream_detail_significant_events_view/knowledge_indicators_subtype_filter';
import { MATCH_QUERY_TYPE } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_type';
import { KnowledgeIndicatorsStatusFilter } from '../../../stream_detail_significant_events_view/knowledge_indicators_status_filter';
import { StreamFilter } from '../stream_filter';
import {
  SEARCH_PLACEHOLDER,
  SEARCH_ARIA_LABEL,
  SHOW_COMPUTED_LABEL,
  CLEAR_SELECTION_LABEL,
  DELETE_SELECTED_LABEL,
  EXCLUDE_SELECTED_LABEL,
  RESTORE_SELECTED_LABEL,
  TABLE_LABEL,
  CANNOT_EXCLUDE_SELECTION_TOOLTIP,
  PROMOTE_SELECTED_LABEL,
} from './translations';

const searchBarStyle = css`
  width: 100%;
  min-height: 44px;
`;

interface KnowledgeIndicatorsToolbarProps {
  knowledgeIndicators: KnowledgeIndicator[];
  filteredCount: number;
  tableSearchValue: string;
  debouncedSearchTerm: string;
  statusFilter: 'active' | 'excluded';
  selectedTypes: string[];
  selectedSubtypes: string[];
  selectedStreams: string[];
  hideComputedTypes: boolean;
  pagination: { pageIndex: number; pageSize: number };
  selectedKnowledgeIndicators: KnowledgeIndicator[];
  isBulkOperationInProgress: boolean;
  isBulkPromoteInProgress: boolean;
  isDeleting: boolean;
  isSelectionActionsDisabled: boolean;
  selectionContainsNonExcludable: boolean;
  hasPromotableSelected: boolean;
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onStatusFilterChange: (filter: 'active' | 'excluded') => void;
  onSelectedTypesChange: (types: string[]) => void;
  onSelectedSubtypesChange: (subtypes: string[]) => void;
  onSelectedStreamsChange: (streams: string[]) => void;
  onComputedToggleChange: (checked: boolean) => void;
  onClearSelection: () => void;
  onBulkExclude: () => void;
  onBulkRestore: () => void;
  onBulkPromote: () => void;
  onDeleteSelected: () => void;
}

export function KnowledgeIndicatorsToolbar({
  knowledgeIndicators,
  filteredCount,
  tableSearchValue,
  debouncedSearchTerm,
  statusFilter,
  selectedTypes,
  selectedSubtypes,
  selectedStreams,
  hideComputedTypes,
  pagination,
  selectedKnowledgeIndicators,
  isBulkOperationInProgress,
  isBulkPromoteInProgress,
  isDeleting,
  isSelectionActionsDisabled,
  selectionContainsNonExcludable,
  hasPromotableSelected,
  onSearchChange,
  onStatusFilterChange,
  onSelectedTypesChange,
  onSelectedSubtypesChange,
  onSelectedStreamsChange,
  onComputedToggleChange,
  onClearSelection,
  onBulkExclude,
  onBulkRestore,
  onBulkPromote,
  onDeleteSelected,
}: KnowledgeIndicatorsToolbarProps) {
  return (
    <>
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} css={searchBarStyle}>
        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            value={tableSearchValue}
            onChange={onSearchChange}
            placeholder={SEARCH_PLACEHOLDER}
            aria-label={SEARCH_ARIA_LABEL}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <KnowledgeIndicatorsStatusFilter
            knowledgeIndicators={knowledgeIndicators}
            searchTerm={debouncedSearchTerm}
            selectedTypes={selectedTypes}
            selectedStreams={selectedStreams}
            hideComputedTypes={hideComputedTypes}
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <KnowledgeIndicatorsTypeFilter
            knowledgeIndicators={knowledgeIndicators}
            searchTerm={debouncedSearchTerm}
            statusFilter={statusFilter}
            selectedTypes={selectedTypes}
            onSelectedTypesChange={onSelectedTypesChange}
            hideComputedTypes={hideComputedTypes}
            selectedStreams={selectedStreams}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <KnowledgeIndicatorsSubtypeFilter
            knowledgeIndicators={knowledgeIndicators}
            searchTerm={debouncedSearchTerm}
            statusFilter={statusFilter}
            selectedTypes={selectedTypes}
            selectedSubtypes={selectedSubtypes}
            onSelectedSubtypesChange={onSelectedSubtypesChange}
            hideComputedTypes={hideComputedTypes}
            selectedStreams={selectedStreams}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <StreamFilter
            knowledgeIndicators={knowledgeIndicators}
            searchTerm={debouncedSearchTerm}
            statusFilter={statusFilter}
            selectedTypes={selectedTypes}
            hideComputedTypes={hideComputedTypes}
            selectedStreams={selectedStreams}
            onSelectedStreamsChange={onSelectedStreamsChange}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label={SHOW_COMPUTED_LABEL}
            checked={!hideComputedTypes}
            onChange={(e) => onComputedToggleChange(e.target.checked)}
            compressed
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          <TableTitle
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            total={filteredCount}
            label={TABLE_LABEL}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="cross"
            size="xs"
            aria-label={CLEAR_SELECTION_LABEL}
            isDisabled={isSelectionActionsDisabled}
            onClick={onClearSelection}
          >
            {CLEAR_SELECTION_LABEL}
          </EuiButtonEmpty>
        </EuiFlexItem>
        {statusFilter === 'active' ? (
          <EuiFlexItem grow={false}>
            <BulkExcludeButton
              isLoading={isBulkOperationInProgress}
              isDisabled={isSelectionActionsDisabled || selectionContainsNonExcludable}
              showTooltip={selectionContainsNonExcludable}
              onClick={onBulkExclude}
            />
          </EuiFlexItem>
        ) : (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="eye"
              size="xs"
              aria-label={RESTORE_SELECTED_LABEL}
              isLoading={isBulkOperationInProgress}
              isDisabled={isSelectionActionsDisabled}
              onClick={onBulkRestore}
            >
              {RESTORE_SELECTED_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
        {selectedTypes.length === 1 && selectedTypes[0] === MATCH_QUERY_TYPE && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="plusInCircle"
              size="xs"
              isDisabled={
                isSelectionActionsDisabled || !hasPromotableSelected || isBulkPromoteInProgress
              }
              isLoading={isBulkPromoteInProgress}
              onClick={onBulkPromote}
            >
              {PROMOTE_SELECTED_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="trash"
            color="danger"
            size="xs"
            aria-label={DELETE_SELECTED_LABEL}
            isLoading={isDeleting}
            isDisabled={isSelectionActionsDisabled}
            onClick={onDeleteSelected}
          >
            {DELETE_SELECTED_LABEL}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}

function BulkExcludeButton({
  isLoading: loading,
  isDisabled,
  showTooltip,
  onClick,
}: {
  isLoading: boolean;
  isDisabled: boolean;
  showTooltip: boolean;
  onClick: () => void;
}) {
  const button = (
    <EuiButtonEmpty
      iconType="eyeClosed"
      color="warning"
      size="xs"
      aria-label={EXCLUDE_SELECTED_LABEL}
      isLoading={loading}
      isDisabled={isDisabled}
      hasAriaDisabled={showTooltip}
      onClick={onClick}
    >
      {EXCLUDE_SELECTED_LABEL}
    </EuiButtonEmpty>
  );

  if (showTooltip) {
    return <EuiToolTip content={CANNOT_EXCLUDE_SELECTION_TOOLTIP}>{button}</EuiToolTip>;
  }

  return button;
}
