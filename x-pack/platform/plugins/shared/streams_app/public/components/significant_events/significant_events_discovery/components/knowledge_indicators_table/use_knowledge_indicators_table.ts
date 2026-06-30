/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CriteriaWithPagination } from '@elastic/eui';
import { useIsMutating, useMutation } from '@kbn/react-query';
import { isComputedFeature } from '@kbn/significant-events-schema';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetchKnowledgeIndicators } from '../../../../../hooks/significant_events/use_fetch_knowledge_indicators';
import { useDiscoveryFeaturesApi } from '../../../../../hooks/significant_events/use_discovery_features_api';
import { useKnowledgeIndicatorsBulkDelete } from '../../../../../hooks/significant_events/use_knowledge_indicators_bulk_delete';
import {
  useQueriesApi,
  type PromoteResult,
} from '../../../../../hooks/significant_events/use_queries_api';
import { useInvalidatePromoteRelatedQueries } from '../../../../../hooks/significant_events/use_invalidate_promote_queries';
import { useKibana } from '../../../../../hooks/use_kibana';
import { getFormattedError } from '../../../../../util/errors';
import { KI_ROW_ACTION_MUTATION_KEY } from '../../../stream_detail_significant_events_view/knowledge_indicator_actions_cell';
import { getKnowledgeIndicatorItemId } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_item_id';
import { matchesKnowledgeIndicatorFilters } from '../../../stream_detail_significant_events_view/utils/matches_knowledge_indicator_filters';
import {
  BULK_EXCLUDE_SUCCESS_TOAST_TITLE,
  BULK_EXCLUDE_PARTIAL_TOAST_TITLE,
  BULK_EXCLUDE_ERROR_TOAST_TITLE,
  BULK_RESTORE_SUCCESS_TOAST_TITLE,
  BULK_RESTORE_PARTIAL_TOAST_TITLE,
  BULK_RESTORE_ERROR_TOAST_TITLE,
  BULK_PROMOTE_SUCCESS_TOAST_TITLE,
  BULK_PROMOTE_ERROR_TITLE,
} from './translations';
import { useKnowledgeIndicatorsUrlState } from './use_knowledge_indicators_url_state';

export const getKnowledgeIndicatorTitle = (ki: KnowledgeIndicator): string =>
  ki.kind === 'feature' ? ki.feature.title ?? ki.feature.id : ki.query.title ?? ki.query.id;

export function useKnowledgeIndicatorsTable() {
  const {
    core: {
      notifications: { toasts },
    },
  } = useKibana();

  const { knowledgeIndicators, occurrencesByQueryId, isLoading, isEmpty, refetch } =
    useFetchKnowledgeIndicators();
  const { excludeFeaturesInBulk, restoreFeaturesInBulk } = useDiscoveryFeaturesApi();
  const { promote } = useQueriesApi();
  const invalidatePromoteRelatedQueries = useInvalidatePromoteRelatedQueries();

  const [selectedKnowledgeIndicators, setSelectedKnowledgeIndicators] = useState<
    KnowledgeIndicator[]
  >([]);
  const [knowledgeIndicatorsToDelete, setKnowledgeIndicatorsToDelete] = useState<
    KnowledgeIndicator[]
  >([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const resetPagination = useCallback(() => {
    setPagination((current) => {
      if (current.pageIndex === 0) return current;
      return { ...current, pageIndex: 0 };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKnowledgeIndicators([]);
  }, []);

  const urlState = useKnowledgeIndicatorsUrlState({
    knowledgeIndicators,
    isLoading,
    resetPagination,
    clearSelection,
  });

  const {
    debouncedSearchTerm,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    hideComputedTypes,
    closeFlyout,
  } = urlState;

  const { deleteKnowledgeIndicatorsInBulk, isDeleting } = useKnowledgeIndicatorsBulkDelete({
    onSuccess: () => {
      setSelectedKnowledgeIndicators([]);
      setKnowledgeIndicatorsToDelete([]);
      closeFlyout();
    },
  });

  const [isBulkOperationInProgress, setIsBulkOperationInProgress] = useState(false);
  const isRowActionInProgress = useIsMutating({ mutationKey: KI_ROW_ACTION_MUTATION_KEY }) > 0;

  // Prune checkbox selections when items disappear from the data (e.g. after
  // deletion or external refetch). The flyout is driven purely from the URL so
  // it does not need explicit pruning here.
  useEffect(() => {
    const validIds = new Set(knowledgeIndicators.map(getKnowledgeIndicatorItemId));

    setSelectedKnowledgeIndicators((current) => {
      const pruned = current.filter((ki) => validIds.has(getKnowledgeIndicatorItemId(ki)));
      return pruned.length === current.length ? current : pruned;
    });
  }, [knowledgeIndicators]);

  const filteredKnowledgeIndicators = useMemo(() => {
    const filtered = knowledgeIndicators.filter((ki) =>
      matchesKnowledgeIndicatorFilters(ki, {
        statusFilter,
        selectedTypes,
        selectedSubtypes,
        selectedStreams,
        hideComputedTypes,
        searchTerm: debouncedSearchTerm,
      })
    );

    return filtered.sort((a, b) =>
      getKnowledgeIndicatorTitle(a)
        .toLowerCase()
        .localeCompare(getKnowledgeIndicatorTitle(b).toLowerCase())
    );
  }, [
    knowledgeIndicators,
    debouncedSearchTerm,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    hideComputedTypes,
  ]);

  const handleTableChange = useCallback(({ page }: CriteriaWithPagination<KnowledgeIndicator>) => {
    if (!page) return;
    setPagination({ pageIndex: page.index, pageSize: page.size });
  }, []);

  const executeBulkFeatureOperation = useCallback(
    async ({
      operation,
      successTitle,
      partialTitle,
      errorTitle,
    }: {
      operation: typeof excludeFeaturesInBulk;
      successTitle: string;
      partialTitle: string;
      errorTitle: string;
    }) => {
      const features = selectedKnowledgeIndicators
        .filter((ki) => ki.kind === 'feature')
        .map((ki) => ki.feature);

      if (features.length === 0) return;

      setIsBulkOperationInProgress(true);
      try {
        const { failedCount } = await operation(features);
        if (failedCount === 0) {
          toasts.addSuccess({ title: successTitle });
        } else {
          toasts.addWarning({ title: partialTitle });
        }
        setSelectedKnowledgeIndicators([]);
        closeFlyout();
      } catch (error) {
        toasts.addError(error instanceof Error ? error : new Error(String(error)), {
          title: errorTitle,
        });
      } finally {
        setIsBulkOperationInProgress(false);
        refetch();
      }
    },
    [closeFlyout, selectedKnowledgeIndicators, toasts, refetch]
  );

  const handleBulkExclude = useCallback(
    () =>
      executeBulkFeatureOperation({
        operation: excludeFeaturesInBulk,
        successTitle: BULK_EXCLUDE_SUCCESS_TOAST_TITLE,
        partialTitle: BULK_EXCLUDE_PARTIAL_TOAST_TITLE,
        errorTitle: BULK_EXCLUDE_ERROR_TOAST_TITLE,
      }),
    [executeBulkFeatureOperation, excludeFeaturesInBulk]
  );

  const handleBulkRestore = useCallback(
    () =>
      executeBulkFeatureOperation({
        operation: restoreFeaturesInBulk,
        successTitle: BULK_RESTORE_SUCCESS_TOAST_TITLE,
        partialTitle: BULK_RESTORE_PARTIAL_TOAST_TITLE,
        errorTitle: BULK_RESTORE_ERROR_TOAST_TITLE,
      }),
    [executeBulkFeatureOperation, restoreFeaturesInBulk]
  );

  const bulkPromoteMutation = useMutation<PromoteResult, Error, string[]>({
    mutationFn: (queryIds) => promote({ queryIds }),
    onSuccess: async () => {
      toasts.addSuccess({ title: BULK_PROMOTE_SUCCESS_TOAST_TITLE });
      setSelectedKnowledgeIndicators([]);
      closeFlyout();
      await invalidatePromoteRelatedQueries();
    },
    onError: (error) => {
      toasts.addError(getFormattedError(error), { title: BULK_PROMOTE_ERROR_TITLE });
    },
  });

  const hasOnlyHiddenComputedFeatures = useMemo(() => {
    if (!hideComputedTypes || knowledgeIndicators.length === 0) return false;
    if (filteredKnowledgeIndicators.length > 0) return false;
    return knowledgeIndicators
      .filter((ki) =>
        matchesKnowledgeIndicatorFilters(ki, {
          statusFilter,
          selectedTypes,
          selectedSubtypes,
          selectedStreams,
          hideComputedTypes: false,
          searchTerm: debouncedSearchTerm,
        })
      )
      .some((ki) => ki.kind === 'feature' && isComputedFeature(ki.feature));
  }, [
    hideComputedTypes,
    knowledgeIndicators,
    filteredKnowledgeIndicators,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    debouncedSearchTerm,
  ]);

  const handleBulkPromote = useCallback(() => {
    const queryIds = selectedKnowledgeIndicators.flatMap((ki) =>
      ki.kind === 'query' && !ki.rule.backed ? [ki.query.id] : []
    );
    if (queryIds.length === 0) return;
    bulkPromoteMutation.mutate(queryIds);
  }, [selectedKnowledgeIndicators, bulkPromoteMutation]);

  const isBulkPromoteInProgress = bulkPromoteMutation.isLoading;

  const isOperationInProgress =
    isDeleting || isBulkOperationInProgress || isBulkPromoteInProgress || isRowActionInProgress;

  const { selectionContainsNonExcludable, isSelectionActionsDisabled, hasPromotableSelected } =
    useMemo(() => {
      const containsQueries = selectedKnowledgeIndicators.some((ki) => ki.kind === 'query');
      const containsComputed = selectedKnowledgeIndicators.some(
        (ki) => ki.kind === 'feature' && isComputedFeature(ki.feature)
      );
      const hasUnbackedQueries = selectedKnowledgeIndicators.some(
        (ki) => ki.kind === 'query' && !ki.rule.backed
      );
      return {
        selectionContainsNonExcludable: containsQueries || containsComputed,
        isSelectionActionsDisabled:
          selectedKnowledgeIndicators.length === 0 || isOperationInProgress,
        hasPromotableSelected: hasUnbackedQueries,
      };
    }, [selectedKnowledgeIndicators, isOperationInProgress]);

  return {
    knowledgeIndicators,
    occurrencesByQueryId,
    isLoading,
    isEmpty,
    refetch,
    filteredKnowledgeIndicators,
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
    handleTableChange,
    handleBulkExclude,
    handleBulkRestore,
    deleteKnowledgeIndicatorsInBulk,
    handleBulkPromote,
    ...urlState,
  };
}
