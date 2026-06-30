/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { CriteriaWithPagination } from '@elastic/eui';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import type { Feature } from '@kbn/significant-events-schema';
import {
  useKnowledgeIndicatorsTable,
  getKnowledgeIndicatorTitle,
} from './use_knowledge_indicators_table';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockToasts = {
  addSuccess: jest.fn(),
  addWarning: jest.fn(),
  addError: jest.fn(),
};

let mockQuery: Record<string, unknown> = {};

jest.mock('../../../../../hooks/use_kibana', () => ({
  useKibana: () => ({
    core: { notifications: { toasts: mockToasts } },
  }),
}));

jest.mock('../../../../../hooks/use_streams_app_params', () => ({
  useStreamsAppParams: () => ({ query: mockQuery }),
}));

jest.mock('../../../../../hooks/use_streams_app_router', () => ({
  useStreamsAppRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

let mockKnowledgeIndicators: KnowledgeIndicator[] = [];
let mockIsLoading = false;
const mockRefetch = jest.fn();

jest.mock('../../../../../hooks/significant_events/use_fetch_knowledge_indicators', () => ({
  useFetchKnowledgeIndicators: () => ({
    knowledgeIndicators: mockKnowledgeIndicators,
    occurrencesByQueryId: {},
    isLoading: mockIsLoading,
    isEmpty: !mockIsLoading && mockKnowledgeIndicators.length === 0,
    refetch: mockRefetch,
  }),
}));

const mockExcludeFeaturesInBulk = jest.fn();
const mockRestoreFeaturesInBulk = jest.fn();

jest.mock('../../../../../hooks/significant_events/use_discovery_features_api', () => ({
  useDiscoveryFeaturesApi: () => ({
    excludeFeaturesInBulk: mockExcludeFeaturesInBulk,
    restoreFeaturesInBulk: mockRestoreFeaturesInBulk,
  }),
}));

const mockPromote = jest.fn();

jest.mock('../../../../../hooks/significant_events/use_queries_api', () => ({
  useQueriesApi: () => ({
    promote: mockPromote,
  }),
}));

const mockInvalidatePromoteRelatedQueries = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../../../hooks/significant_events/use_invalidate_promote_queries', () => ({
  useInvalidatePromoteRelatedQueries: () => mockInvalidatePromoteRelatedQueries,
}));

const mockDeleteKnowledgeIndicatorsInBulk = jest.fn();
let mockIsDeleting = false;

jest.mock('../../../../../hooks/significant_events/use_knowledge_indicators_bulk_delete', () => ({
  useKnowledgeIndicatorsBulkDelete: ({ onSuccess }: { onSuccess?: () => void }) => {
    mockBulkDeleteOnSuccess = onSuccess;
    return {
      deleteKnowledgeIndicatorsInBulk: mockDeleteKnowledgeIndicatorsInBulk,
      isDeleting: mockIsDeleting,
    };
  },
}));

let mockBulkDeleteOnSuccess: (() => void) | undefined;

jest.mock('@kbn/react-hooks', () => ({
  useDebouncedValue: (value: string) => value,
}));

let mockIsMutatingValue = 0;
const mockMutate = jest.fn();
let mockMutationCallbacks: { onSuccess?: () => Promise<void>; onError?: (e: Error) => void } = {};

jest.mock('@kbn/react-query', () => ({
  useIsMutating: () => mockIsMutatingValue,
  useMutation: (config: {
    mutationFn: (ids: string[]) => Promise<unknown>;
    onSuccess?: () => Promise<void>;
    onError?: (e: Error) => void;
  }) => {
    mockMutationCallbacks = { onSuccess: config.onSuccess, onError: config.onError };
    return {
      mutate: mockMutate,
      isLoading: false,
    };
  },
}));

function makeFeature(
  overrides: Partial<Feature> & { id: string; stream_name: string } & Record<string, unknown>
): Feature {
  return {
    type: 'entity',
    title: overrides.title ?? overrides.id,
    subtype: undefined,
    excluded: undefined,
    ...overrides,
  } as unknown as Feature;
}

function makeFeatureKI(
  overrides: Partial<Feature> & { id: string; stream_name: string } & Record<string, unknown>
): KnowledgeIndicator {
  return { kind: 'feature', feature: makeFeature(overrides) };
}

function makeQueryKI(opts: {
  id: string;
  title?: string;
  stream_name: string;
  backed?: boolean;
  type?: string;
}): KnowledgeIndicator {
  return {
    kind: 'query',
    query: {
      id: opts.id,
      title: opts.title ?? opts.id,
      type: opts.type ?? 'match',
    },
    rule: { backed: opts.backed ?? false, id: opts.id },
    stream_name: opts.stream_name,
  } as KnowledgeIndicator;
}

describe('getKnowledgeIndicatorTitle', () => {
  it('returns feature title when available', () => {
    const ki = makeFeatureKI({ id: 'f1', stream_name: 's1', title: 'My Feature' });
    expect(getKnowledgeIndicatorTitle(ki)).toBe('My Feature');
  });

  it('falls back to feature id when title is missing', () => {
    const ki = makeFeatureKI({ id: 'f1', stream_name: 's1', title: undefined });
    expect(getKnowledgeIndicatorTitle(ki)).toBe('f1');
  });

  it('returns query title when available', () => {
    const ki = makeQueryKI({ id: 'q1', title: 'My Query', stream_name: 's1' });
    expect(getKnowledgeIndicatorTitle(ki)).toBe('My Query');
  });

  it('falls back to query id when title is missing', () => {
    const ki = makeQueryKI({ id: 'q1', title: undefined, stream_name: 's1' });
    expect(getKnowledgeIndicatorTitle(ki)).toBe('q1');
  });
});

describe('useKnowledgeIndicatorsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = {};
    mockKnowledgeIndicators = [];
    mockIsLoading = false;
    mockIsDeleting = false;
    mockIsMutatingValue = 0;
  });

  describe('filteredKnowledgeIndicators', () => {
    it('filters by active status (excludes features with excluded)', () => {
      mockKnowledgeIndicators = [
        makeFeatureKI({ id: 'f1', stream_name: 's1' }),
        makeFeatureKI({ id: 'f2', stream_name: 's1', excluded: true }),
      ];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.filteredKnowledgeIndicators).toHaveLength(1);
      expect(result.current.filteredKnowledgeIndicators[0].kind).toBe('feature');
      if (result.current.filteredKnowledgeIndicators[0].kind === 'feature') {
        expect(result.current.filteredKnowledgeIndicators[0].feature.id).toBe('f1');
      }
    });

    it('sorts alphabetically by title', () => {
      mockKnowledgeIndicators = [
        makeFeatureKI({ id: 'f2', stream_name: 's1', title: 'Zebra' }),
        makeFeatureKI({ id: 'f1', stream_name: 's1', title: 'Alpha' }),
        makeQueryKI({ id: 'q1', stream_name: 's1', title: 'Middle' }),
      ];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      const titles = result.current.filteredKnowledgeIndicators.map(getKnowledgeIndicatorTitle);
      expect(titles).toEqual(['Alpha', 'Middle', 'Zebra']);
    });

    it('filters by search term (case-insensitive)', () => {
      mockKnowledgeIndicators = [
        makeFeatureKI({ id: 'f1', stream_name: 's1', title: 'CPU Usage' }),
        makeFeatureKI({ id: 'f2', stream_name: 's1', title: 'Memory' }),
      ];
      mockQuery = { search: 'cpu' };
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.filteredKnowledgeIndicators).toHaveLength(1);
    });

    it('hides computed feature types by default', () => {
      mockKnowledgeIndicators = [
        makeFeatureKI({ id: 'f1', stream_name: 's1', type: 'entity' }),
        makeFeatureKI({ id: 'f2', stream_name: 's1', type: 'dataset_analysis' }),
      ];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.filteredKnowledgeIndicators).toHaveLength(1);
    });

    it('shows computed types when showComputed is true', () => {
      mockQuery = { showComputed: 'true' };
      mockKnowledgeIndicators = [
        makeFeatureKI({ id: 'f1', stream_name: 's1', type: 'entity' }),
        makeFeatureKI({ id: 'f2', stream_name: 's1', type: 'dataset_analysis' }),
      ];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.filteredKnowledgeIndicators).toHaveLength(2);
    });
  });

  describe('handleTableChange', () => {
    it('updates pagination', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.handleTableChange({
          page: { index: 2, size: 50 },
        } as CriteriaWithPagination<KnowledgeIndicator>);
      });
      expect(result.current.pagination).toEqual({ pageIndex: 2, pageSize: 50 });
    });

    it('does nothing when page is undefined', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.handleTableChange({} as CriteriaWithPagination<KnowledgeIndicator>);
      });
      expect(result.current.pagination).toEqual({ pageIndex: 0, pageSize: 25 });
    });
  });

  describe('bulk exclude', () => {
    it('calls excludeFeaturesInBulk with features only, shows success', async () => {
      const feature = makeFeature({ id: 'f1', stream_name: 's1' });
      const ki = { kind: 'feature' as const, feature };
      mockKnowledgeIndicators = [ki];
      mockExcludeFeaturesInBulk.mockResolvedValue({ failedCount: 0 });

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });

      await act(async () => {
        await result.current.handleBulkExclude();
      });

      expect(mockExcludeFeaturesInBulk).toHaveBeenCalledWith([feature]);
      expect(mockToasts.addSuccess).toHaveBeenCalled();
      expect(result.current.selectedKnowledgeIndicators).toEqual([]);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('shows warning when some features fail', async () => {
      const ki = makeFeatureKI({ id: 'f1', stream_name: 's1' });
      mockKnowledgeIndicators = [ki];
      mockExcludeFeaturesInBulk.mockResolvedValue({ failedCount: 1 });

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });

      await act(async () => {
        await result.current.handleBulkExclude();
      });

      expect(mockToasts.addWarning).toHaveBeenCalled();
    });

    it('shows error toast when operation throws', async () => {
      const ki = makeFeatureKI({ id: 'f1', stream_name: 's1' });
      mockKnowledgeIndicators = [ki];
      mockExcludeFeaturesInBulk.mockRejectedValue(new Error('network fail'));

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });

      await act(async () => {
        await result.current.handleBulkExclude();
      });

      expect(mockToasts.addError).toHaveBeenCalled();
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('wraps non-Error throwables', async () => {
      const ki = makeFeatureKI({ id: 'f1', stream_name: 's1' });
      mockKnowledgeIndicators = [ki];
      mockExcludeFeaturesInBulk.mockRejectedValue('string error');

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });

      await act(async () => {
        await result.current.handleBulkExclude();
      });

      expect(mockToasts.addError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ title: expect.any(String) })
      );
    });

    it('skips when no features are selected (only queries)', async () => {
      const ki = makeQueryKI({ id: 'q1', stream_name: 's1' });
      mockKnowledgeIndicators = [ki];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });

      await act(async () => {
        await result.current.handleBulkExclude();
      });

      expect(mockExcludeFeaturesInBulk).not.toHaveBeenCalled();
    });
  });

  describe('bulk restore', () => {
    it('calls restoreFeaturesInBulk and shows success', async () => {
      const ki = makeFeatureKI({
        id: 'f1',
        stream_name: 's1',
        excluded: true,
      });
      mockKnowledgeIndicators = [ki];
      mockRestoreFeaturesInBulk.mockResolvedValue({ failedCount: 0 });

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });

      await act(async () => {
        await result.current.handleBulkRestore();
      });

      expect(mockRestoreFeaturesInBulk).toHaveBeenCalled();
      expect(mockToasts.addSuccess).toHaveBeenCalled();
    });
  });

  describe('bulk promote', () => {
    it('calls mutate with unbacked query ids', () => {
      const q1 = makeQueryKI({ id: 'q1', stream_name: 's1', backed: false });
      const q2 = makeQueryKI({ id: 'q2', stream_name: 's1', backed: true });
      mockKnowledgeIndicators = [q1, q2];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([q1, q2]);
      });

      act(() => {
        result.current.handleBulkPromote();
      });

      expect(mockMutate).toHaveBeenCalledWith(['q1']);
    });

    it('skips when no unbacked queries selected', () => {
      const q = makeQueryKI({ id: 'q1', stream_name: 's1', backed: true });
      mockKnowledgeIndicators = [q];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([q]);
      });

      act(() => {
        result.current.handleBulkPromote();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('promote onSuccess shows toast and invalidates queries', async () => {
      mockKnowledgeIndicators = [];
      renderHook(() => useKnowledgeIndicatorsTable());

      await act(async () => {
        await mockMutationCallbacks.onSuccess?.();
      });

      expect(mockToasts.addSuccess).toHaveBeenCalled();
      expect(mockInvalidatePromoteRelatedQueries).toHaveBeenCalled();
    });

    it('promote onError shows error toast', () => {
      renderHook(() => useKnowledgeIndicatorsTable());

      act(() => {
        mockMutationCallbacks.onError?.(new Error('promote failed'));
      });

      expect(mockToasts.addError).toHaveBeenCalled();
    });
  });

  describe('bulk delete callback', () => {
    it('onSuccess clears selections and closes flyout', () => {
      mockKnowledgeIndicators = [makeFeatureKI({ id: 'f1', stream_name: 's1' })];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());

      act(() => {
        result.current.setSelectedKnowledgeIndicators(mockKnowledgeIndicators);
        result.current.setKnowledgeIndicatorsToDelete(mockKnowledgeIndicators);
      });

      act(() => {
        mockBulkDeleteOnSuccess?.();
      });

      expect(result.current.selectedKnowledgeIndicators).toEqual([]);
      expect(result.current.knowledgeIndicatorsToDelete).toEqual([]);
      expect(mockPush).toHaveBeenCalled();
    });
  });

  describe('selection pruning', () => {
    it('prunes selected indicators when they disappear from data', () => {
      const ki1 = makeFeatureKI({ id: 'f1', stream_name: 's1' });
      const ki2 = makeFeatureKI({ id: 'f2', stream_name: 's1' });
      mockKnowledgeIndicators = [ki1, ki2];

      const { result, rerender } = renderHook(() => useKnowledgeIndicatorsTable());

      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki1, ki2]);
      });
      expect(result.current.selectedKnowledgeIndicators).toHaveLength(2);

      mockKnowledgeIndicators = [ki1];
      rerender();

      waitFor(() => {
        expect(result.current.selectedKnowledgeIndicators).toHaveLength(1);
      });
    });
  });

  describe('selection computed properties', () => {
    it('selectionContainsNonExcludable is true when queries are selected', () => {
      const q = makeQueryKI({ id: 'q1', stream_name: 's1' });
      mockKnowledgeIndicators = [q];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([q]);
      });
      expect(result.current.selectionContainsNonExcludable).toBe(true);
    });

    it('selectionContainsNonExcludable is true when computed features are selected', () => {
      const ki = makeFeatureKI({ id: 'f1', stream_name: 's1', type: 'dataset_analysis' });
      mockQuery = { showComputed: 'true' };
      mockKnowledgeIndicators = [ki];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });
      expect(result.current.selectionContainsNonExcludable).toBe(true);
    });

    it('selectionContainsNonExcludable is false for regular features', () => {
      const ki = makeFeatureKI({ id: 'f1', stream_name: 's1', type: 'entity' });
      mockKnowledgeIndicators = [ki];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });
      expect(result.current.selectionContainsNonExcludable).toBe(false);
    });

    it('isSelectionActionsDisabled is true when nothing selected', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.isSelectionActionsDisabled).toBe(true);
    });

    it('isSelectionActionsDisabled is true when operation in progress', () => {
      mockIsDeleting = true;
      const ki = makeFeatureKI({ id: 'f1', stream_name: 's1' });
      mockKnowledgeIndicators = [ki];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([ki]);
      });
      expect(result.current.isSelectionActionsDisabled).toBe(true);
    });

    it('hasPromotableSelected is true when unbacked queries selected', () => {
      const q = makeQueryKI({ id: 'q1', stream_name: 's1', backed: false });
      mockKnowledgeIndicators = [q];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([q]);
      });
      expect(result.current.hasPromotableSelected).toBe(true);
    });

    it('hasPromotableSelected is false when only backed queries selected', () => {
      const q = makeQueryKI({ id: 'q1', stream_name: 's1', backed: true });
      mockKnowledgeIndicators = [q];

      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      act(() => {
        result.current.setSelectedKnowledgeIndicators([q]);
      });
      expect(result.current.hasPromotableSelected).toBe(false);
    });
  });

  describe('isOperationInProgress', () => {
    it('is true when deleting', () => {
      mockIsDeleting = true;
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.isOperationInProgress).toBe(true);
    });

    it('is true when row action is in progress', () => {
      mockIsMutatingValue = 1;
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.isOperationInProgress).toBe(true);
    });

    it('is false when nothing is in progress', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.isOperationInProgress).toBe(false);
    });
  });

  describe('hasOnlyHiddenComputedFeatures', () => {
    it('returns false when hideComputedTypes is false', () => {
      mockQuery = { showComputed: 'true' };
      mockKnowledgeIndicators = [
        makeFeatureKI({ id: 'f1', stream_name: 's1', type: 'dataset_analysis' }),
      ];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.hasOnlyHiddenComputedFeatures).toBe(false);
    });

    it('returns false when there are no indicators', () => {
      mockKnowledgeIndicators = [];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.hasOnlyHiddenComputedFeatures).toBe(false);
    });

    it('returns false when there are visible filtered results', () => {
      mockKnowledgeIndicators = [makeFeatureKI({ id: 'f1', stream_name: 's1', type: 'entity' })];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.hasOnlyHiddenComputedFeatures).toBe(false);
    });

    it('returns true when all matching indicators are hidden computed features', () => {
      mockKnowledgeIndicators = [
        makeFeatureKI({ id: 'f1', stream_name: 's1', type: 'dataset_analysis' }),
      ];
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());
      expect(result.current.filteredKnowledgeIndicators).toHaveLength(0);
      expect(result.current.hasOnlyHiddenComputedFeatures).toBe(true);
    });
  });

  describe('resetPagination', () => {
    it('resets page to 0 when changing filters', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsTable());

      act(() => {
        result.current.handleTableChange({
          page: { index: 3, size: 25 },
        } as CriteriaWithPagination<KnowledgeIndicator>);
      });
      expect(result.current.pagination.pageIndex).toBe(3);

      act(() => {
        result.current.handleStatusFilterChange('excluded');
      });
      expect(result.current.pagination.pageIndex).toBe(0);
    });
  });
});
