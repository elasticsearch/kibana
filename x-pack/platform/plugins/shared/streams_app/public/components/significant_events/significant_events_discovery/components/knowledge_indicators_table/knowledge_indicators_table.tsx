/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAIFeatures } from '../../../../../hooks/use_ai_features';
import { getFeaturesFromKIs } from '../../../stream_detail_significant_events_view/utils/get_features_from_kis';
import { AssetImage } from '../../../../asset_image';
import { LoadingPanel } from '../../../../loading_panel';
import { KnowledgeIndicatorDetailsFlyout } from '../../../stream_detail_significant_events_view/knowledge_indicator_details_flyout';
import { DeleteTableItemsModal } from '../../../stream_detail_significant_events_view/delete_table_items_modal';
import { getKnowledgeIndicatorItemId } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_item_id';
import { GenerateSplitButton } from '../shared/generate_split_button';
import { StreamPicker } from '../shared/stream_picker';
import { useKiGeneration } from './ki_generation_context';
import { useKnowledgeIndicatorsTable } from './use_knowledge_indicators_table';
import { useKnowledgeIndicatorsColumns } from './use_knowledge_indicators_columns';
import { KnowledgeIndicatorsToolbar } from './knowledge_indicators_toolbar';
import {
  TABLE_CAPTION,
  NO_ITEMS_MESSAGE,
  EMPTY_STATE_TITLE,
  EMPTY_STATE_DESCRIPTION,
  DELETE_MODAL_TITLE,
  HIDDEN_COMPUTED_FEATURES_HINT,
  GENERATION_IN_PROGRESS_TITLE,
  getGenerationInProgressDescription,
} from './translations';

export function KnowledgeIndicatorsTable() {
  const { euiTheme } = useEuiTheme();
  const [generationStreamNames, setGenerationStreamNames] = useState<string[]>([]);

  const {
    filteredStreams,
    isStreamsLoading,
    generatingStreamNames,
    isGenerating,
    isInitialGenerationStatusLoading,
    isScheduling,
    onboardingConfig,
    setOnboardingConfig,
    featuresConnectors,
    queriesConnectors,
    bulkOnboardAll,
    bulkOnboardFeaturesOnly,
    bulkOnboardQueriesOnly,
  } = useKiGeneration();

  const aiFeatures = useAIFeatures();
  const allConnectors = aiFeatures?.genAiConnectors?.connectors ?? [];
  const connectorError = aiFeatures?.genAiConnectors?.error;
  const isConnectorCatalogUnavailable =
    !allConnectors.length || !!aiFeatures?.genAiConnectors?.loading || !!connectorError;

  const runAndClearPicker = useCallback(
    async (action: (names: string[]) => Promise<string[]>) => {
      const names = generationStreamNames;
      setGenerationStreamNames([]);
      await action(names);
    },
    [generationStreamNames]
  );

  const onRunGeneration = useCallback(
    async () => runAndClearPicker(bulkOnboardAll),
    [runAndClearPicker, bulkOnboardAll]
  );
  const onRunFeaturesOnly = useCallback(
    async () => runAndClearPicker(bulkOnboardFeaturesOnly),
    [runAndClearPicker, bulkOnboardFeaturesOnly]
  );
  const onRunQueriesOnly = useCallback(
    async () => runAndClearPicker(bulkOnboardQueriesOnly),
    [runAndClearPicker, bulkOnboardQueriesOnly]
  );

  const isRunDisabled =
    generationStreamNames.length === 0 ||
    isConnectorCatalogUnavailable ||
    featuresConnectors.loading ||
    queriesConnectors.loading ||
    isScheduling;

  const {
    knowledgeIndicators,
    occurrencesByQueryId,
    isLoading,
    isEmpty,
    refetch,
    filteredKnowledgeIndicators,
    selectedKnowledgeIndicator,
    selectedKnowledgeIndicatorId,
    selectedKnowledgeIndicators,
    setSelectedKnowledgeIndicators,
    knowledgeIndicatorsToDelete,
    setKnowledgeIndicatorsToDelete,
    pagination,
    isDeleting,
    isBulkOperationInProgress,
    isBulkPromoteInProgress,
    isOperationInProgress,
    selectionContainsNonExcludable,
    hasPromotableSelected,
    isSelectionActionsDisabled,
    hasOnlyHiddenComputedFeatures,
    tableSearchValue,
    debouncedSearchTerm,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    hideComputedTypes,
    handleStatusFilterChange,
    handleSelectedTypesChange,
    handleSelectedSubtypesChange,
    handleSelectedStreamsChange,
    handleComputedToggleChange,
    handleSearchChange,
    handleTableChange,
    handleBulkExclude,
    handleBulkRestore,
    closeFlyout,
    toggleSelectedKnowledgeIndicator,
    deleteKnowledgeIndicatorsInBulk,
    handleBulkPromote,
  } = useKnowledgeIndicatorsTable();

  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    if (isGenerating) {
      wasGeneratingRef.current = true;
      const id = setInterval(() => refetch(), 10_000);
      return () => clearInterval(id);
    }
    if (wasGeneratingRef.current) {
      wasGeneratingRef.current = false;
      refetch();
    }
  }, [isGenerating, refetch]);

  const features = useMemo(() => getFeaturesFromKIs(knowledgeIndicators), [knowledgeIndicators]);

  const columns = useKnowledgeIndicatorsColumns({
    occurrencesByQueryId,
    selectedKnowledgeIndicatorId,
    toggleSelectedKnowledgeIndicator,
    setKnowledgeIndicatorsToDelete,
  });

  const generationRow = (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem>
        <StreamPicker
          streams={filteredStreams}
          isStreamsLoading={isStreamsLoading}
          selectedStreamNames={generationStreamNames}
          onSelectedStreamNamesChange={setGenerationStreamNames}
          excludedStreamNames={generatingStreamNames}
          isDisabled={isScheduling}
          fullWidth
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <GenerateSplitButton
          config={onboardingConfig}
          allConnectors={allConnectors}
          connectorError={connectorError}
          featuresResolvedConnectorId={featuresConnectors.resolvedConnectorId}
          queriesResolvedConnectorId={queriesConnectors.resolvedConnectorId}
          onConfigChange={setOnboardingConfig}
          onRun={onRunGeneration}
          onRunFeaturesOnly={onRunFeaturesOnly}
          onRunQueriesOnly={onRunQueriesOnly}
          isRunDisabled={isRunDisabled}
          isConfigDisabled={generationStreamNames.length === 0}
          isLoading={isScheduling}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const generationProgressCallout = isGenerating ? (
    <>
      <EuiSpacer size="m" />
      <EuiCallOut
        size="s"
        color="primary"
        iconType={EuiLoadingSpinner}
        title={GENERATION_IN_PROGRESS_TITLE}
        announceOnMount
      >
        <p>{getGenerationInProgressDescription(generatingStreamNames)}</p>
      </EuiCallOut>
    </>
  ) : null;

  if (knowledgeIndicators.length === 0 && (isLoading || isInitialGenerationStatusLoading)) {
    return <LoadingPanel size="l" />;
  }

  if (isEmpty && !isGenerating) {
    return (
      <EuiEmptyPrompt
        aria-live="polite"
        titleSize="xs"
        icon={<AssetImage type="knowledgeIndicatorsEmptyState" />}
        title={<h2>{EMPTY_STATE_TITLE}</h2>}
        body={<p>{EMPTY_STATE_DESCRIPTION}</p>}
        actions={generationRow}
      />
    );
  }

  return (
    <EuiPanel hasBorder hasShadow={false}>
      {generationRow}
      {generationProgressCallout}
      <EuiSpacer size="m" />
      <KnowledgeIndicatorsToolbar
        knowledgeIndicators={knowledgeIndicators}
        filteredCount={filteredKnowledgeIndicators.length}
        tableSearchValue={tableSearchValue}
        debouncedSearchTerm={debouncedSearchTerm}
        statusFilter={statusFilter}
        selectedTypes={selectedTypes}
        selectedSubtypes={selectedSubtypes}
        selectedStreams={selectedStreams}
        hideComputedTypes={hideComputedTypes}
        pagination={pagination}
        selectedKnowledgeIndicators={selectedKnowledgeIndicators}
        isBulkOperationInProgress={isBulkOperationInProgress}
        isBulkPromoteInProgress={isBulkPromoteInProgress}
        isDeleting={isDeleting}
        isSelectionActionsDisabled={isSelectionActionsDisabled}
        selectionContainsNonExcludable={selectionContainsNonExcludable}
        hasPromotableSelected={hasPromotableSelected}
        onSearchChange={handleSearchChange}
        onStatusFilterChange={handleStatusFilterChange}
        onSelectedTypesChange={handleSelectedTypesChange}
        onSelectedSubtypesChange={handleSelectedSubtypesChange}
        onSelectedStreamsChange={handleSelectedStreamsChange}
        onComputedToggleChange={handleComputedToggleChange}
        onClearSelection={() => setSelectedKnowledgeIndicators([])}
        onBulkExclude={handleBulkExclude}
        onBulkRestore={handleBulkRestore}
        onBulkPromote={handleBulkPromote}
        onDeleteSelected={() => setKnowledgeIndicatorsToDelete(selectedKnowledgeIndicators)}
      />
      <EuiSpacer size="s" />
      <EuiHorizontalRule
        margin="none"
        css={css`
          height: ${euiTheme.border.width.thick};
        `}
      />
      {hasOnlyHiddenComputedFeatures && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            size="s"
            color="primary"
            title={HIDDEN_COMPUTED_FEATURES_HINT}
            announceOnMount={false}
          />
        </>
      )}
      <EuiPanel
        color="transparent"
        hasShadow={false}
        hasBorder={false}
        paddingSize="none"
        css={css`
          overflow-x: auto;
          min-width: 0;
          ${isOperationInProgress
            ? `
                pointer-events: none;
                opacity: 0.6;
              `
            : ''}
        `}
      >
        <EuiInMemoryTable<KnowledgeIndicator>
          css={css`
            min-width: 700px;

            & thead tr {
              background-color: ${euiTheme.colors.backgroundBaseSubdued};
            }
          `}
          items={filteredKnowledgeIndicators}
          itemId={getKnowledgeIndicatorItemId}
          columns={columns}
          loading={isOperationInProgress}
          rowProps={(ki: KnowledgeIndicator) => ({
            isSelected: selectedKnowledgeIndicatorId === getKnowledgeIndicatorItemId(ki),
          })}
          selection={{
            selected: selectedKnowledgeIndicators,
            onSelectionChange: setSelectedKnowledgeIndicators,
          }}
          pagination={{
            pageIndex: pagination.pageIndex,
            pageSize: pagination.pageSize,
            pageSizeOptions: [25, 50, 100],
          }}
          onTableChange={handleTableChange}
          tableCaption={TABLE_CAPTION}
          noItemsMessage={!isLoading ? NO_ITEMS_MESSAGE : ''}
        />
      </EuiPanel>
      {selectedKnowledgeIndicator ? (
        <KnowledgeIndicatorDetailsFlyout
          knowledgeIndicator={selectedKnowledgeIndicator}
          occurrencesByQueryId={occurrencesByQueryId}
          onClose={closeFlyout}
          features={features}
        />
      ) : null}
      {knowledgeIndicatorsToDelete.length > 0 ? (
        <DeleteTableItemsModal
          title={DELETE_MODAL_TITLE(knowledgeIndicatorsToDelete.length)}
          items={knowledgeIndicatorsToDelete}
          onCancel={() => setKnowledgeIndicatorsToDelete([])}
          onConfirm={() => {
            void deleteKnowledgeIndicatorsInBulk(knowledgeIndicatorsToDelete);
          }}
          isLoading={isDeleting}
        />
      ) : null}
    </EuiPanel>
  );
}
