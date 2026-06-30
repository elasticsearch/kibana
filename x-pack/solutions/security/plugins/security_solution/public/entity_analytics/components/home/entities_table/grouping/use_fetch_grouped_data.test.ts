/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { EntityType } from '../../../../../../common/entity_analytics/types';
import {
  getGroupedEntitiesQuery,
  parseTargetMetadataHits,
  useFetchTargetMetadata,
  type EntitiesGroupingQuery,
} from './use_fetch_grouped_data';
import { useKibana } from '../../../../../common/lib/kibana';
import { DataViewContext, type DataViewContextValue } from '..';

jest.mock('../../../../../common/lib/kibana');

const mockSearch = jest.fn();

const createWrapper = (
  indexPattern = 'entities-latest-default'
): React.FC<{ children: React.ReactNode }> => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const dataView = {
      getIndexPattern: () => indexPattern,
    } as unknown as DataViewContextValue['dataView'];
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(DataViewContext.Provider, { value: { dataView } }, children)
    );
  };
  return Wrapper;
};

describe('parseTargetMetadataHits', () => {
  it('extracts name, type, and riskScore from well-formed hits', () => {
    const hits = [
      {
        _source: {
          entity: {
            id: 'user:alice@okta',
            name: 'alice',
            EngineMetadata: { Type: EntityType.user },
            relationships: {
              resolution: { risk: { calculated_score_norm: 85.5 } },
            },
          },
        },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.size).toBe(1);
    expect(result.get('user:alice@okta')).toEqual({
      name: 'alice',
      type: EntityType.user,
      riskScore: 85.5,
      individualRiskScore: null,
    });
  });

  it('extracts individualRiskScore from entity.risk.calculated_score_norm', () => {
    const hits = [
      {
        _source: {
          entity: {
            id: 'user:solo@okta',
            name: 'solo',
            EngineMetadata: { Type: EntityType.user },
            risk: { calculated_score_norm: 67.25 },
          },
        },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.get('user:solo@okta')).toEqual({
      name: 'solo',
      type: EntityType.user,
      riskScore: null,
      individualRiskScore: 67.25,
    });
  });

  it('parses multiple hits into a map keyed by entity.id', () => {
    const hits = [
      {
        _source: {
          entity: {
            id: 'user:alice@okta',
            name: 'alice',
            EngineMetadata: { Type: EntityType.user },
          },
        },
      },
      {
        _source: {
          entity: {
            id: 'host:srv-01',
            name: 'srv-01',
            EngineMetadata: { Type: EntityType.host },
            relationships: {
              resolution: { risk: { calculated_score_norm: 42.0 } },
            },
          },
        },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.size).toBe(2);
    expect(result.get('user:alice@okta')).toEqual({
      name: 'alice',
      type: EntityType.user,
      riskScore: null,
      individualRiskScore: null,
    });
    expect(result.get('host:srv-01')).toEqual({
      name: 'srv-01',
      type: EntityType.host,
      riskScore: 42.0,
      individualRiskScore: null,
    });
  });

  it('sets riskScore to null when resolution risk fields are absent', () => {
    const hits = [
      {
        _source: {
          entity: {
            id: 'user:bob@ad',
            name: 'bob',
            EngineMetadata: { Type: EntityType.user },
          },
        },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.get('user:bob@ad')?.riskScore).toBeNull();
  });

  it('skips hits with missing entity.id', () => {
    const hits = [
      {
        _source: {
          entity: {
            name: 'no-id-entity',
            EngineMetadata: { Type: EntityType.user },
          },
        },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.size).toBe(0);
  });

  it('skips hits with missing entity.name', () => {
    const hits = [
      {
        _source: {
          entity: {
            id: 'user:nameless',
            EngineMetadata: { Type: EntityType.user },
          },
        },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.size).toBe(0);
  });

  it('skips hits with missing EngineMetadata.Type', () => {
    const hits = [
      {
        _source: {
          entity: {
            id: 'user:typeless',
            name: 'typeless-user',
          },
        },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.size).toBe(0);
  });

  it('skips hits with null _source', () => {
    const hits = [{ _source: null }, { _source: undefined }];

    const result = parseTargetMetadataHits(hits as Array<{ _source?: unknown }>);

    expect(result.size).toBe(0);
  });

  it('skips hits with _source that has no entity field', () => {
    const hits = [
      {
        _source: { someOtherField: 'value' },
      },
    ];

    const result = parseTargetMetadataHits(hits);

    expect(result.size).toBe(0);
  });

  it('returns an empty map for empty hits array', () => {
    const result = parseTargetMetadataHits([]);

    expect(result.size).toBe(0);
  });
});

describe('getGroupedEntitiesQuery', () => {
  const minimalQuery = { size: 0 } as EntitiesGroupingQuery;

  it('pins the grouped query to the origin entity store via project_routing', () => {
    const result = getGroupedEntitiesQuery(minimalQuery, 'entities-latest-default');

    expect(result).toHaveProperty('project_routing', '_alias:_origin');
  });

  it('targets the provided index pattern', () => {
    const result = getGroupedEntitiesQuery(minimalQuery, 'entities-latest-default');

    expect(result.index).toBe('entities-latest-default');
  });
});

describe('useFetchTargetMetadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearch.mockReturnValue(of({ rawResponse: { hits: { hits: [] } } }));
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        data: { search: { search: mockSearch } },
        notifications: { toasts: { addError: jest.fn() } },
      },
    });
  });

  it('pins the target-metadata query to the origin entity store', async () => {
    renderHook(() => useFetchTargetMetadata(['host:cps-host-id-001']), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockSearch).toHaveBeenCalled());

    expect(mockSearch.mock.calls[0][0].params).toHaveProperty('project_routing', '_alias:_origin');
  });

  it('does not fire when entityIds is empty', () => {
    renderHook(() => useFetchTargetMetadata([]), { wrapper: createWrapper() });

    expect(mockSearch).not.toHaveBeenCalled();
  });
});
