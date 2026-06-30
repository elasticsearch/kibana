/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import type { Feature } from '@kbn/significant-events-schema';
import { useKnowledgeIndicatorsUrlState } from './use_knowledge_indicators_url_state';

const mockPush = jest.fn();
const mockReplace = jest.fn();

let mockQuery: Record<string, unknown> = {};

jest.mock('../../../../../hooks/use_streams_app_params', () => ({
  useStreamsAppParams: () => ({ query: mockQuery }),
}));

jest.mock('../../../../../hooks/use_streams_app_router', () => ({
  useStreamsAppRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@kbn/react-hooks', () => ({
  useDebouncedValue: (value: string) => value,
}));

function makeFeatureKI(
  overrides: Partial<Feature> & { uuid: string; stream_name: string } & Record<string, unknown>
): KnowledgeIndicator {
  return {
    kind: 'feature',
    feature: {
      type: 'entity',
      id: overrides.uuid,
      title: overrides.title ?? overrides.uuid,
      subtype: undefined,
      excluded_at: undefined,
      ...overrides,
    } as unknown as Feature,
  };
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

const defaultParams = {
  knowledgeIndicators: [] as KnowledgeIndicator[],
  isLoading: false,
  resetPagination: jest.fn(),
  clearSelection: jest.fn(),
};

describe('useKnowledgeIndicatorsUrlState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = {};
  });

  describe('initial state from URL query params', () => {
    it('returns empty defaults when no query params', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));

      expect(result.current.tableSearchValue).toBe('');
      expect(result.current.statusFilter).toBe('active');
      expect(result.current.selectedTypes).toEqual([]);
      expect(result.current.selectedSubtypes).toEqual([]);
      expect(result.current.selectedStreams).toEqual([]);
      expect(result.current.hideComputedTypes).toBe(true);
    });

    it('initializes search from query.search', () => {
      mockQuery = { search: 'hello' };
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      expect(result.current.tableSearchValue).toBe('hello');
    });

    it('initializes status from query.status', () => {
      mockQuery = { status: 'excluded' };
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      expect(result.current.statusFilter).toBe('excluded');
    });

    it('defaults status to active for unknown values', () => {
      mockQuery = { status: 'bogus' };
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      expect(result.current.statusFilter).toBe('active');
    });

    it('initializes type as array from string', () => {
      const knowledgeIndicators = [
        makeFeatureKI({ uuid: 'f1', stream_name: 's1', type: 'entity' }),
      ];
      mockQuery = { type: 'entity' };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedTypes).toEqual(['entity']);
    });

    it('initializes type as array from array', () => {
      const knowledgeIndicators = [
        makeFeatureKI({ uuid: 'f1', stream_name: 's1', type: 'entity' }),
        makeFeatureKI({ uuid: 'f2', stream_name: 's1', type: 'infrastructure' }),
      ];
      mockQuery = { type: ['entity', 'infrastructure'] };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedTypes).toEqual(['entity', 'infrastructure']);
    });

    it('initializes subtype from query', () => {
      const knowledgeIndicators = [
        makeFeatureKI({ uuid: 'f1', stream_name: 's1', subtype: 'sub1' }),
      ];
      mockQuery = { subtype: 'sub1' };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedSubtypes).toEqual(['sub1']);
    });

    it('initializes stream from query', () => {
      const knowledgeIndicators = [
        makeFeatureKI({ uuid: 'f1', stream_name: 's1' }),
        makeFeatureKI({ uuid: 'f2', stream_name: 's2' }),
      ];
      mockQuery = { stream: ['s1', 's2'] };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedStreams).toEqual(['s1', 's2']);
    });

    it('initializes hideComputedTypes=false when showComputed is true', () => {
      mockQuery = { showComputed: 'true' };
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      expect(result.current.hideComputedTypes).toBe(false);
    });
  });

  describe('selectedKnowledgeIndicator from selectedItem param', () => {
    it('returns null when no selectedItem param', () => {
      const knowledgeIndicators = [makeFeatureKI({ uuid: 'f1', stream_name: 's1' })];
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedKnowledgeIndicator).toBeNull();
    });

    it('finds matching feature by uuid', () => {
      const ki = makeFeatureKI({ uuid: 'f1', stream_name: 's1' });
      const knowledgeIndicators = [ki];
      mockQuery = { selectedItem: 'f1' };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedKnowledgeIndicator).toBe(ki);
      expect(result.current.selectedKnowledgeIndicatorId).toBe('f1');
    });

    it('finds matching query by id', () => {
      const ki = makeQueryKI({ id: 'q1', stream_name: 's1' });
      const knowledgeIndicators = [ki];
      mockQuery = { selectedItem: 'q1' };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedKnowledgeIndicator).toBe(ki);
    });

    it('returns null when selectedItem does not match any indicator', () => {
      const knowledgeIndicators = [makeFeatureKI({ uuid: 'f1', stream_name: 's1' })];
      mockQuery = { selectedItem: 'nonexistent' };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedKnowledgeIndicator).toBeNull();
    });
  });

  describe('URL sync effect', () => {
    it('calls router.replace with filter state', () => {
      renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));

      expect(mockReplace).toHaveBeenCalledWith('/_discovery/{tab}', {
        path: { tab: 'knowledge_indicators' },
        query: {},
      });
    });

    it('includes all active filters in URL', () => {
      mockQuery = {
        search: 'test',
        status: 'excluded',
        type: ['entity'],
        subtype: ['sub1'],
        stream: ['logs'],
        showComputed: 'true',
        rangeFrom: 'now-15m',
        rangeTo: 'now',
      };

      renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));

      expect(mockReplace).toHaveBeenCalledWith('/_discovery/{tab}', {
        path: { tab: 'knowledge_indicators' },
        query: expect.objectContaining({
          search: 'test',
          status: 'excluded',
          type: ['entity'],
          subtype: ['sub1'],
          stream: ['logs'],
          showComputed: 'true',
          rangeFrom: 'now-15m',
          rangeTo: 'now',
        }),
      });
    });

    it('preserves selectedItem in URL', () => {
      mockQuery = { selectedItem: 'f1' };
      renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      expect(mockReplace).toHaveBeenCalledWith('/_discovery/{tab}', {
        path: { tab: 'knowledge_indicators' },
        query: expect.objectContaining({ selectedItem: 'f1' }),
      });
    });
  });

  describe('flyout navigation', () => {
    it('closeFlyout pushes without selectedItem param', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      act(() => {
        result.current.closeFlyout();
      });
      expect(mockPush).toHaveBeenCalledWith('/_discovery/{tab}', {
        path: { tab: 'knowledge_indicators' },
        query: expect.not.objectContaining({ selectedItem: expect.anything() }),
      });
    });

    it('toggleSelectedKnowledgeIndicator opens flyout for new item', () => {
      const ki = makeFeatureKI({ uuid: 'f1', stream_name: 's1' });
      const knowledgeIndicators = [ki];
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );

      act(() => {
        result.current.toggleSelectedKnowledgeIndicator(ki);
      });
      expect(mockPush).toHaveBeenCalledWith('/_discovery/{tab}', {
        path: { tab: 'knowledge_indicators' },
        query: expect.objectContaining({ selectedItem: 'f1' }),
      });
    });

    it('toggleSelectedKnowledgeIndicator closes flyout for already-open item', () => {
      const ki = makeFeatureKI({ uuid: 'f1', stream_name: 's1' });
      const knowledgeIndicators = [ki];
      mockQuery = { selectedItem: 'f1' };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );

      act(() => {
        result.current.toggleSelectedKnowledgeIndicator(ki);
      });
      expect(mockPush).toHaveBeenCalledWith('/_discovery/{tab}', {
        path: { tab: 'knowledge_indicators' },
        query: expect.not.objectContaining({ selectedItem: expect.anything() }),
      });
    });
  });

  describe('handler callbacks', () => {
    it('handleStatusFilterChange updates statusFilter and calls clearSelection', () => {
      const clearSelection = jest.fn();
      const resetPagination = jest.fn();
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, clearSelection, resetPagination })
      );

      act(() => {
        result.current.handleStatusFilterChange('excluded');
      });
      expect(result.current.statusFilter).toBe('excluded');
      expect(clearSelection).toHaveBeenCalled();
      expect(resetPagination).toHaveBeenCalled();
    });

    it('handleSelectedTypesChange updates types and clears subtypes', () => {
      const knowledgeIndicators = [
        makeFeatureKI({ uuid: 'f1', stream_name: 's1', type: 'entity', subtype: 'sub1' }),
      ];
      mockQuery = { subtype: ['sub1'] };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedSubtypes).toEqual(['sub1']);

      act(() => {
        result.current.handleSelectedTypesChange(['entity']);
      });
      expect(result.current.selectedTypes).toEqual(['entity']);
      expect(result.current.selectedSubtypes).toEqual([]);
    });

    it('handleSelectedSubtypesChange updates subtypes', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      act(() => {
        result.current.handleSelectedSubtypesChange(['sub1', 'sub2']);
      });
      expect(result.current.selectedSubtypes).toEqual(['sub1', 'sub2']);
    });

    it('handleSelectedStreamsChange updates streams', () => {
      const knowledgeIndicators = [makeFeatureKI({ uuid: 'f1', stream_name: 'logs' })];
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      act(() => {
        result.current.handleSelectedStreamsChange(['logs']);
      });
      expect(result.current.selectedStreams).toEqual(['logs']);
    });

    it('handleComputedToggleChange toggles computed types', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      expect(result.current.hideComputedTypes).toBe(true);

      act(() => {
        result.current.handleComputedToggleChange(true);
      });
      expect(result.current.hideComputedTypes).toBe(false);

      act(() => {
        result.current.handleComputedToggleChange(false);
      });
      expect(result.current.hideComputedTypes).toBe(true);
    });

    it('handleComputedToggleChange removes computed types from selectedTypes when hiding', () => {
      const knowledgeIndicators = [
        makeFeatureKI({ uuid: 'f1', stream_name: 's1', type: 'entity' }),
        makeFeatureKI({ uuid: 'f2', stream_name: 's1', type: 'dataset_analysis' }),
      ];
      mockQuery = { type: ['entity', 'dataset_analysis'], showComputed: 'true' };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      expect(result.current.selectedTypes).toEqual(['entity', 'dataset_analysis']);

      act(() => {
        result.current.handleComputedToggleChange(false);
      });
      expect(result.current.hideComputedTypes).toBe(true);
      expect(result.current.selectedTypes).toEqual(['entity']);
    });

    it('handleSearchChange updates search value', () => {
      const { result } = renderHook(() => useKnowledgeIndicatorsUrlState(defaultParams));
      act(() => {
        result.current.handleSearchChange({
          target: { value: 'test' },
        } as React.ChangeEvent<HTMLInputElement>);
      });
      expect(result.current.tableSearchValue).toBe('test');
    });
  });

  describe('filter pruning effect', () => {
    it('does not prune while loading', () => {
      mockQuery = { type: ['nonexistent'] };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, isLoading: true })
      );
      expect(result.current.selectedTypes).toEqual(['nonexistent']);
    });

    it('prunes type filters that no longer match any indicator', () => {
      const knowledgeIndicators = [
        makeFeatureKI({ uuid: 'f1', stream_name: 's1', type: 'entity' }),
      ];
      mockQuery = { type: ['entity', 'nonexistent'] };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      waitFor(() => {
        expect(result.current.selectedTypes).toEqual(['entity']);
      });
    });

    it('prunes stream filters that no longer match any indicator', () => {
      const knowledgeIndicators = [makeFeatureKI({ uuid: 'f1', stream_name: 'logs' })];
      mockQuery = { stream: ['logs', 'metrics'] };
      const { result } = renderHook(() =>
        useKnowledgeIndicatorsUrlState({ ...defaultParams, knowledgeIndicators })
      );
      waitFor(() => {
        expect(result.current.selectedStreams).toEqual(['logs']);
      });
    });
  });
});
