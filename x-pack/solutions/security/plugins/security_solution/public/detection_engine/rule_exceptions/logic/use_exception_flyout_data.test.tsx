/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor } from '@testing-library/react';

import { useFetchIndexPatterns } from './use_exception_flyout_data';
import type { Rule } from '../../rule_management/logic/types';
import {
  getRulesSchemaMock,
  getRulesMlSchemaMock,
  getEsqlRuleSchemaMock,
} from '../../../../common/api/detection_engine/model/rule_schema/rule_response_schema.mock';
import { useKibana } from '../../../common/lib/kibana';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { useFetchIndex } from '../../../common/containers/source';
import { useRuleIndices } from '../../rule_management/logic/use_rule_indices';
import { getMachineLearningJobId } from '../../common/helpers';

jest.mock('../../../common/lib/kibana', () => ({ useKibana: jest.fn() }));
jest.mock('../../../common/hooks/use_app_toasts');
jest.mock('../../../common/containers/source');
jest.mock('../../rule_management/logic/use_rule_indices');
jest.mock('../../common/helpers', () => ({ getMachineLearningJobId: jest.fn() }));

const mockUseKibana = useKibana as jest.Mock;
const mockUseAppToasts = useAppToasts as jest.Mock;
const mockUseFetchIndex = useFetchIndex as jest.Mock;
const mockUseRuleIndices = useRuleIndices as jest.Mock;
const mockGetMachineLearningJobId = getMachineLearningJobId as jest.Mock;

// Distinct markers so we can tell which source `indexPatterns` / the extended
// field spec came from.
const indexFetchPatterns = { title: 'from-use-fetch-index', fields: [] };
const indexFetchDataViewSpec = { id: 'index-data-view-spec', title: 'index-data-view-spec' };
const dataViewSpecObject = { id: 'security-dv', title: 'data-view-spec' };

// Minimal data view double: the hook stores the returned object as the index
// patterns and calls `toSpec()` for the field spec.
const fakeDataView = (id: string) => ({
  id,
  title: 'from-data-view',
  fields: [],
  toSpec: () => dataViewSpecObject,
});

// Typed per-type rule fixtures (see rule_response_schema.mock).
const dataViewRule: Rule = {
  ...getRulesSchemaMock(),
  data_view_id: 'security-dv',
  index: undefined,
};
const indexPatternRule: Rule = {
  ...getRulesSchemaMock(),
  index: ['logs-*'],
  data_view_id: undefined,
};
const esqlRule: Rule = getEsqlRuleSchemaMock(); // query: 'from auditbeat* | limit 10'
const mlRule: Rule = getRulesMlSchemaMock();

describe('useFetchIndexPatterns', () => {
  let addWarning: jest.Mock;
  let getActiveSpace: jest.Mock;
  let dataViewsGet: jest.Mock;
  let refreshFields: jest.Mock;
  let getFieldsForIndexPattern: jest.Mock;

  const mockKibana = ({ withSpaces = true }: { withSpaces?: boolean } = {}) => {
    mockUseKibana.mockReturnValue({
      services: {
        data: {
          dataViews: {
            get: dataViewsGet,
            refreshFields,
            getFieldsForIndexPattern,
          },
        },
        spaces: withSpaces ? { getActiveSpace } : undefined,
      },
    });
  };

  beforeEach(() => {
    addWarning = jest.fn();
    getActiveSpace = jest.fn().mockResolvedValue({ id: 'default' });
    dataViewsGet = jest.fn().mockResolvedValue(fakeDataView('security-dv'));
    refreshFields = jest.fn().mockResolvedValue(undefined);
    getFieldsForIndexPattern = jest.fn().mockResolvedValue([]);

    mockUseAppToasts.mockReturnValue({ addWarning });
    mockKibana();
    mockUseFetchIndex.mockReturnValue([
      false,
      { indexPatterns: indexFetchPatterns, dataView: undefined },
    ]);
    mockUseRuleIndices.mockReturnValue({ mlJobLoading: false, ruleIndices: [] });
    mockGetMachineLearningJobId.mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const lastFetchIndexArgs = () =>
    mockUseFetchIndex.mock.calls[mockUseFetchIndex.mock.calls.length - 1];

  describe('machine learning rule', () => {
    beforeEach(() => {
      mockGetMachineLearningJobId.mockReturnValue(['ml-job-1']);
      mockUseRuleIndices.mockReturnValue({
        mlJobLoading: false,
        ruleIndices: ['.ml-anomalies-custom-ml-job-1'],
      });
    });

    it('resolves the job ids from the rule and hands them to useRuleIndices', async () => {
      renderHook(() => useFetchIndexPatterns([mlRule]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());

      expect(mockGetMachineLearningJobId).toHaveBeenCalledWith(mlRule);
      expect(mockUseRuleIndices).toHaveBeenCalledWith(['ml-job-1']);
    });

    it('fetches fields from the resolved ML anomaly indices', async () => {
      renderHook(() => useFetchIndexPatterns([mlRule]));

      await waitFor(() =>
        expect(lastFetchIndexArgs()).toEqual([
          ['.ml-anomalies-custom-ml-job-1'],
          false,
          'indexFields',
        ])
      );
      expect(dataViewsGet).not.toHaveBeenCalled();
    });

    it('reports loading while the ML job summary request is in flight', async () => {
      mockUseRuleIndices.mockReturnValue({ mlJobLoading: true, ruleIndices: [] });

      const { result } = renderHook(() => useFetchIndexPatterns([mlRule]));

      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(result.current.isLoading).toBe(true);
    });

    it('is not loading once the ML indices resolve', async () => {
      const { result } = renderHook(() => useFetchIndexPatterns([mlRule]));

      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(result.current.isLoading).toBe(false);
    });

    it('returns extended fields from the resolved anomaly index spec', async () => {
      const extended = [{ name: 'host.name', type: 'string' }];
      getFieldsForIndexPattern.mockResolvedValue(extended);
      mockUseFetchIndex.mockReturnValue([
        false,
        { indexPatterns: indexFetchPatterns, dataView: indexFetchDataViewSpec },
      ]);

      const { result } = renderHook(() => useFetchIndexPatterns([mlRule]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());

      await expect(result.current.getExtendedFields(['host.name'])).resolves.toEqual(extended);
      expect(getFieldsForIndexPattern).toHaveBeenCalledWith(indexFetchDataViewSpec, {
        includeUnmapped: true,
        fields: ['host.name'],
      });
    });

    // Failure cases.
    it('falls back to an empty index list when the ML job has no resolved indices', async () => {
      mockUseRuleIndices.mockReturnValue({ mlJobLoading: false, ruleIndices: [] });

      renderHook(() => useFetchIndexPatterns([mlRule]));

      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(lastFetchIndexArgs()[0]).toEqual([]);
    });

    it('warns and returns an empty list when the extended fields request fails', async () => {
      const error = new Error('field caps failed');
      getFieldsForIndexPattern.mockRejectedValue(error);
      mockUseFetchIndex.mockReturnValue([
        false,
        { indexPatterns: indexFetchPatterns, dataView: indexFetchDataViewSpec },
      ]);

      const { result } = renderHook(() => useFetchIndexPatterns([mlRule]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());

      await expect(result.current.getExtendedFields(['host.name'])).resolves.toEqual([]);
      expect(addWarning).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ title: expect.any(String) })
      );
    });
  });

  describe('rule pointing to indices', () => {
    it('fetches fields from the rule index with no alerts and the indexFields strategy', async () => {
      renderHook(() => useFetchIndexPatterns([indexPatternRule]));

      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(lastFetchIndexArgs()).toEqual([['logs-*'], false, 'indexFields']);
      expect(dataViewsGet).not.toHaveBeenCalled();
    });

    it('derives the indices from the ES|QL query for an esql rule', async () => {
      renderHook(() => useFetchIndexPatterns([esqlRule]));
      await waitFor(() => expect(lastFetchIndexArgs()[0]).toEqual(['auditbeat*']));
    });

    it('follows the index pattern loading flag', async () => {
      mockUseFetchIndex.mockReturnValue([true, { indexPatterns: indexFetchPatterns }]);

      const { result } = renderHook(() => useFetchIndexPatterns([indexPatternRule]));

      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(result.current.isLoading).toBe(true);
    });

    it('is not loading once the index pattern fetch is done', async () => {
      const { result } = renderHook(() => useFetchIndexPatterns([indexPatternRule]));

      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(result.current.isLoading).toBe(false);
    });

    it('returns the useFetchIndex patterns to the builder', async () => {
      const { result } = renderHook(() => useFetchIndexPatterns([indexPatternRule]));

      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(result.current.indexPatterns).toBe(indexFetchPatterns);
    });

    it('returns extended fields from the useFetchIndex data view spec', async () => {
      const extended = [{ name: 'host.name', type: 'string' }];
      getFieldsForIndexPattern.mockResolvedValue(extended);
      mockUseFetchIndex.mockReturnValue([
        false,
        { indexPatterns: indexFetchPatterns, dataView: indexFetchDataViewSpec },
      ]);

      const { result } = renderHook(() => useFetchIndexPatterns([indexPatternRule]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());

      await expect(result.current.getExtendedFields(['host.name'])).resolves.toEqual(extended);
      expect(getFieldsForIndexPattern).toHaveBeenCalledWith(indexFetchDataViewSpec, {
        includeUnmapped: true,
        fields: ['host.name'],
      });
    });

    // Failure cases.
    it('passes an empty index list when the ES|QL query has no source', async () => {
      // `getIndexListFromEsqlQuery` yields no indices for a sourceless query.
      renderHook(() => useFetchIndexPatterns([{ ...getEsqlRuleSchemaMock(), query: 'ROW x = 1' }]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());
      expect(lastFetchIndexArgs()[0]).toEqual([]);
    });

    it('returns an empty extended field list without fetching when no data view spec exists', async () => {
      // `useFetchIndex` reports no `dataView` both before its request starts and
      // after it fails, so there is nothing to resolve fields against.
      mockUseFetchIndex.mockReturnValue([
        false,
        { indexPatterns: indexFetchPatterns, dataView: undefined },
      ]);

      const { result } = renderHook(() => useFetchIndexPatterns([indexPatternRule]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());

      await expect(result.current.getExtendedFields(['host.name'])).resolves.toEqual([]);
      expect(getFieldsForIndexPattern).not.toHaveBeenCalled();
    });

    it('warns and returns an empty list when the extended fields request fails', async () => {
      const error = new Error('field caps failed');
      getFieldsForIndexPattern.mockRejectedValue(error);
      mockUseFetchIndex.mockReturnValue([
        false,
        { indexPatterns: indexFetchPatterns, dataView: indexFetchDataViewSpec },
      ]);

      const { result } = renderHook(() => useFetchIndexPatterns([indexPatternRule]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalled());

      await expect(result.current.getExtendedFields(['host.name'])).resolves.toEqual([]);
      expect(addWarning).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ title: expect.any(String) })
      );
    });
  });

  describe('rule pointing to a data view', () => {
    it('reads the active space id from the spaces service', async () => {
      renderHook(() => useFetchIndexPatterns([dataViewRule]));
      await waitFor(() => expect(getActiveSpace).toHaveBeenCalledTimes(1));
    });

    it('fetches the data view and passes an empty index list to useFetchIndex', async () => {
      renderHook(() => useFetchIndexPatterns([dataViewRule]));

      await waitFor(() => expect(dataViewsGet).toHaveBeenCalledWith('security-dv'));
      expect(lastFetchIndexArgs()[0]).toEqual([]);
    });

    it('reports loading from the first render until the data view fetch settles', async () => {
      const { result } = renderHook(() => useFetchIndexPatterns([dataViewRule]));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('returns the resolved data view to the builder once it loads', async () => {
      const dv = fakeDataView('security-dv');
      dataViewsGet.mockResolvedValue(dv);

      const { result } = renderHook(() => useFetchIndexPatterns([dataViewRule]));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.indexPatterns).toBe(dv);
    });

    it('uses the default space data view when there is no single rule', async () => {
      renderHook(() => useFetchIndexPatterns(null));

      await waitFor(() => expect(dataViewsGet).toHaveBeenCalledWith('security-solution-default'));
      expect(lastFetchIndexArgs()[0]).toEqual([]);
    });

    it('treats multiple selected rules like the default data view path', async () => {
      renderHook(() => useFetchIndexPatterns([indexPatternRule, esqlRule]));

      await waitFor(() => expect(dataViewsGet).toHaveBeenCalledWith('security-solution-default'));
      expect(lastFetchIndexArgs()[0]).toEqual([]);
    });

    it('prefers the data view spec over the useFetchIndex spec for extended fields', async () => {
      getFieldsForIndexPattern.mockResolvedValue([]);
      // Both a useFetchIndex data view spec and a resolved data view spec exist;
      // the data view spec (from `toSpec()`) must win.
      mockUseFetchIndex.mockReturnValue([
        false,
        { indexPatterns: indexFetchPatterns, dataView: indexFetchDataViewSpec },
      ]);

      const { result } = renderHook(() => useFetchIndexPatterns([dataViewRule]));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await result.current.getExtendedFields(['user.name']);
      expect(getFieldsForIndexPattern).toHaveBeenCalledWith(dataViewSpecObject, {
        includeUnmapped: true,
        fields: ['user.name'],
      });
    });

    // Failure cases.
    it('settles loading even when the data view resolves with no fields', async () => {
      // Guards against gating the signal on field count: a valid-but-empty data
      // view must still settle rather than report loading forever.
      dataViewsGet.mockResolvedValue({ ...fakeDataView('security-dv'), fields: [] });

      const { result } = renderHook(() => useFetchIndexPatterns([dataViewRule]));

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('settles loading and warns when the data view fetch fails', async () => {
      const error = new Error('conflicting data view id');
      dataViewsGet.mockRejectedValue(error);

      const { result } = renderHook(() => useFetchIndexPatterns([dataViewRule]));

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(addWarning).toHaveBeenCalledWith(error, {
        title: 'Failed to load data view for exceptions flyout',
      });
    });

    it('never fetches and stays loading when the spaces service is unavailable', async () => {
      mockKibana({ withSpaces: false });

      const { result } = renderHook(() => useFetchIndexPatterns([dataViewRule]));

      // Without a space id the data-view fetch is never issued, so the data view
      // can't settle. Documents the hard dependency on the spaces service.
      await waitFor(() => expect(lastFetchIndexArgs()[0]).toEqual([]));
      expect(getActiveSpace).not.toHaveBeenCalled();
      expect(dataViewsGet).not.toHaveBeenCalled();
      expect(result.current.isLoading).toBe(true);
      // Still hands the builder the useFetchIndex patterns rather than null.
      expect(result.current.indexPatterns).toBe(indexFetchPatterns);
    });
  });
});
