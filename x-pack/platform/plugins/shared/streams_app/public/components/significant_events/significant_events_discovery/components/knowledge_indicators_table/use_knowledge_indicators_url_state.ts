/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useDebouncedValue } from '@kbn/react-hooks';
import { COMPUTED_FEATURE_TYPES } from '@kbn/significant-events-schema';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStreamsAppParams } from '../../../../../hooks/use_streams_app_params';
import { useStreamsAppRouter } from '../../../../../hooks/use_streams_app_router';
import { getKnowledgeIndicatorItemId } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_item_id';
import { getKnowledgeIndicatorStreamName } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_stream_name';
import { getKnowledgeIndicatorSubtype } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_subtype';
import { matchesKnowledgeIndicatorFilters } from '../../../stream_detail_significant_events_view/utils/matches_knowledge_indicator_filters';
import { getKnowledgeIndicatorType } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_type';

const SEARCH_DEBOUNCE_MS = 300;
const COMPUTED_FEATURE_TYPES_SET = new Set<string>(COMPUTED_FEATURE_TYPES);

const toArray = (v: string | string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

interface UseKnowledgeIndicatorsUrlStateParams {
  knowledgeIndicators: KnowledgeIndicator[];
  isLoading: boolean;
  resetPagination: () => void;
  clearSelection: () => void;
}

export function useKnowledgeIndicatorsUrlState({
  knowledgeIndicators,
  isLoading,
  resetPagination,
  clearSelection,
}: UseKnowledgeIndicatorsUrlStateParams) {
  const router = useStreamsAppRouter();
  const { query } = useStreamsAppParams('/_discovery/{tab}');

  const timeRangeRef = useRef<{ rangeFrom?: string; rangeTo?: string }>({});
  timeRangeRef.current = { rangeFrom: query?.rangeFrom, rangeTo: query?.rangeTo };

  const selectedItemRef = useRef<string | undefined>(undefined);
  selectedItemRef.current = query?.selectedItem;

  const [tableSearchValue, setTableSearchValue] = useState(() => query?.search ?? '');
  const debouncedSearchTerm = useDebouncedValue(tableSearchValue, SEARCH_DEBOUNCE_MS)
    .trim()
    .toLowerCase();
  const [statusFilter, setStatusFilter] = useState<'active' | 'excluded'>(() =>
    query?.status === 'excluded' ? 'excluded' : 'active'
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => toArray(query?.type));
  const [selectedSubtypes, setSelectedSubtypes] = useState<string[]>(() => toArray(query?.subtype));
  const [selectedStreams, setSelectedStreams] = useState<string[]>(() => toArray(query?.stream));
  const [hideComputedTypes, setHideComputedTypes] = useState(() =>
    query?.showComputed === 'true' ? false : true
  );

  const selectedKnowledgeIndicator = useMemo(
    () =>
      query?.selectedItem
        ? knowledgeIndicators.find(
            (ki) => getKnowledgeIndicatorItemId(ki) === query.selectedItem
          ) ?? null
        : null,
    [knowledgeIndicators, query?.selectedItem]
  );

  const selectedKnowledgeIndicatorId = selectedKnowledgeIndicator
    ? getKnowledgeIndicatorItemId(selectedKnowledgeIndicator)
    : undefined;

  const currentParamsRef = useRef({
    debouncedSearchTerm,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    hideComputedTypes,
  });
  currentParamsRef.current = {
    debouncedSearchTerm,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    hideComputedTypes,
  };

  // Prune filter selections when the underlying data no longer supports them.
  // Guard: skip while data is still loading — an empty KI list would prune all
  // URL-initialised filter selections before they get a chance to match.
  useEffect(() => {
    if (isLoading) return;
    const availableTypes = new Set<string>();
    const availableSubtypes = new Set<string>();
    const availableStreams = new Set<string>();

    for (const ki of knowledgeIndicators) {
      if (
        matchesKnowledgeIndicatorFilters(ki, {
          statusFilter,
          selectedStreams,
          hideComputedTypes,
        })
      ) {
        availableTypes.add(getKnowledgeIndicatorType(ki));
      }
      if (
        matchesKnowledgeIndicatorFilters(ki, {
          statusFilter,
          selectedTypes,
          selectedStreams,
          hideComputedTypes,
        })
      ) {
        const subtype = getKnowledgeIndicatorSubtype(ki);
        if (subtype) availableSubtypes.add(subtype);
      }
      if (
        matchesKnowledgeIndicatorFilters(ki, {
          statusFilter,
          selectedTypes,
          hideComputedTypes,
        })
      ) {
        availableStreams.add(getKnowledgeIndicatorStreamName(ki));
      }
    }

    setSelectedTypes((current) => {
      const pruned = current.filter((t) => availableTypes.has(t));
      return pruned.length === current.length ? current : pruned;
    });
    setSelectedSubtypes((current) => {
      const pruned = current.filter((s) => availableSubtypes.has(s));
      return pruned.length === current.length ? current : pruned;
    });
    setSelectedStreams((current) => {
      const pruned = current.filter((s) => availableStreams.has(s));
      return pruned.length === current.length ? current : pruned;
    });
  }, [
    isLoading,
    knowledgeIndicators,
    statusFilter,
    selectedTypes,
    selectedStreams,
    hideComputedTypes,
  ]);

  // Sync filter state to URL
  useEffect(() => {
    const { rangeFrom, rangeTo } = timeRangeRef.current;
    const selectedItem = selectedItemRef.current;
    router.replace('/_discovery/{tab}', {
      path: { tab: 'knowledge_indicators' },
      query: {
        ...(rangeFrom ? { rangeFrom } : {}),
        ...(rangeTo ? { rangeTo } : {}),
        ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
        ...(statusFilter !== 'active' ? { status: statusFilter } : {}),
        ...(selectedTypes.length ? { type: selectedTypes } : {}),
        ...(selectedSubtypes.length ? { subtype: selectedSubtypes } : {}),
        ...(selectedStreams.length ? { stream: selectedStreams } : {}),
        ...(!hideComputedTypes ? { showComputed: 'true' } : {}),
        ...(selectedItem ? { selectedItem } : {}),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearchTerm,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    hideComputedTypes,
  ]);

  const buildQueryParams = useCallback((selectedItem?: string) => {
    const { rangeFrom, rangeTo } = timeRangeRef.current;
    const p = currentParamsRef.current;
    return {
      ...(rangeFrom ? { rangeFrom } : {}),
      ...(rangeTo ? { rangeTo } : {}),
      ...(p.debouncedSearchTerm ? { search: p.debouncedSearchTerm } : {}),
      ...(p.statusFilter !== 'active' ? { status: p.statusFilter } : {}),
      ...(p.selectedTypes.length ? { type: p.selectedTypes } : {}),
      ...(p.selectedSubtypes.length ? { subtype: p.selectedSubtypes } : {}),
      ...(p.selectedStreams.length ? { stream: p.selectedStreams } : {}),
      ...(!p.hideComputedTypes ? { showComputed: 'true' } : {}),
      ...(selectedItem ? { selectedItem } : {}),
    };
  }, []);

  const closeFlyout = useCallback(() => {
    router.push('/_discovery/{tab}', {
      path: { tab: 'knowledge_indicators' },
      query: buildQueryParams(),
    });
  }, [router, buildQueryParams]);

  const toggleSelectedKnowledgeIndicator = useCallback(
    (ki: KnowledgeIndicator) => {
      const id = getKnowledgeIndicatorItemId(ki);
      const isAlreadyOpen = id === selectedItemRef.current;
      router.push('/_discovery/{tab}', {
        path: { tab: 'knowledge_indicators' },
        query: buildQueryParams(isAlreadyOpen ? undefined : id),
      });
    },
    [router, buildQueryParams]
  );

  const handleStatusFilterChange = useCallback(
    (filter: 'active' | 'excluded') => {
      setStatusFilter(filter);
      clearSelection();
      resetPagination();
    },
    [resetPagination, clearSelection]
  );

  const handleSelectedTypesChange = useCallback(
    (types: string[]) => {
      setSelectedTypes(types);
      setSelectedSubtypes([]);
      resetPagination();
    },
    [resetPagination]
  );

  const handleSelectedSubtypesChange = useCallback(
    (subtypes: string[]) => {
      setSelectedSubtypes(subtypes);
      resetPagination();
    },
    [resetPagination]
  );

  const handleSelectedStreamsChange = useCallback(
    (streams: string[]) => {
      setSelectedStreams(streams);
      resetPagination();
    },
    [resetPagination]
  );

  const handleComputedToggleChange = useCallback(
    (checked: boolean) => {
      const shouldHide = !checked;
      setHideComputedTypes(shouldHide);
      if (shouldHide) {
        setSelectedTypes((current) =>
          current.filter((type) => !COMPUTED_FEATURE_TYPES_SET.has(type))
        );
      }
      resetPagination();
    },
    [resetPagination]
  );

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTableSearchValue(event.target.value);
      resetPagination();
    },
    [resetPagination]
  );

  return {
    tableSearchValue,
    debouncedSearchTerm,
    statusFilter,
    selectedTypes,
    selectedSubtypes,
    selectedStreams,
    hideComputedTypes,
    selectedKnowledgeIndicator,
    selectedKnowledgeIndicatorId,
    handleStatusFilterChange,
    handleSelectedTypesChange,
    handleSelectedSubtypesChange,
    handleSelectedStreamsChange,
    handleComputedToggleChange,
    handleSearchChange,
    closeFlyout,
    toggleSelectedKnowledgeIndicator,
  };
}
