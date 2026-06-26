/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { useEntityFromStore } from '../../../../flyout/entity_details/shared/hooks/use_entity_from_store';
import { useEntitiesOverview } from './use_entities_overview';

jest.mock('@kbn/entity-store/public', () => {
  const actual = jest.requireActual('@kbn/entity-store/public');
  return {
    ...actual,
    useEntityStoreEuidApi: jest.fn(),
  };
});

jest.mock('../../../../flyout/entity_details/shared/hooks/use_entity_from_store');

const mockUseEntityStoreEuidApi = useEntityStoreEuidApi as jest.Mock;
const mockUseEntityFromStore = useEntityFromStore as jest.Mock;

const mockGetEntityIdentifiersFromDocument = jest.fn();
const mockGetEuidFromObject = jest.fn();

const buildHit = (source: Record<string, unknown>): DataTableRecord =>
  buildDataTableRecord({ _id: 'id-1', _index: 'idx-1', _source: source });

const getDefaultEntityFromStoreResult = () => ({
  entityRecord: null,
  entity: null,
  firstSeen: null,
  lastSeen: null,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
});

describe('useEntitiesOverview', () => {
  beforeEach(() => {
    mockUseEntityStoreEuidApi.mockReturnValue({
      euid: {
        getEntityIdentifiersFromDocument: mockGetEntityIdentifiersFromDocument,
        getEuidFromObject: mockGetEuidFromObject,
      },
    });
    mockGetEntityIdentifiersFromDocument.mockReturnValue(undefined);
    mockGetEuidFromObject.mockReturnValue(undefined);
    mockUseEntityFromStore.mockReturnValue(getDefaultEntityFromStoreResult());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('queries entity store when document has identity fields', () => {
    const hit = buildHit({ host: { name: 'host-1' }, user: { name: 'user-1' } });

    const { result } = renderHook(() => useEntitiesOverview({ hit }));

    expect(result.current).toEqual({
      user: {
        name: 'user-1',
        identityFields: undefined,
        entityRecord: null,
      },
      host: {
        name: 'host-1',
        identityFields: undefined,
        entityRecord: null,
      },
      hasAnyEntity: true,
    });
    expect(mockUseEntityFromStore).toHaveBeenCalledWith(
      expect.objectContaining({
        identityFields: { 'user.name': 'user-1' },
        entityType: 'user',
        skip: false,
      })
    );
    expect(mockUseEntityFromStore).toHaveBeenCalledWith(
      expect.objectContaining({
        identityFields: { 'host.name': 'host-1' },
        entityType: 'host',
        skip: false,
      })
    );
  });

  it('uses entity store v2 records when the document has only EUID identifiers', () => {
    const userEntityRecord = {
      entity: { id: 'user:store-id', name: 'store-user' },
    };
    const hostEntityRecord = {
      entity: { id: 'host:store-id', name: 'store-host' },
    };
    mockGetEntityIdentifiersFromDocument.mockImplementation((entityType: 'host' | 'user') => {
      return entityType === 'user' ? { 'user.id': 'user-id' } : { 'host.id': 'host-id' };
    });
    mockGetEuidFromObject.mockImplementation((entityType: 'host' | 'user') => {
      return `${entityType}:store-id`;
    });
    mockUseEntityFromStore.mockImplementation(({ entityType }) => ({
      ...getDefaultEntityFromStoreResult(),
      entityRecord: entityType === 'user' ? userEntityRecord : hostEntityRecord,
    }));
    const hit = buildHit({ user: { id: 'user-id' }, host: { id: 'host-id' } });

    const { result } = renderHook(() => useEntitiesOverview({ hit }));

    expect(result.current).toEqual({
      user: {
        name: 'store-user',
        identityFields: { 'user.id': 'user-id' },
        entityRecord: userEntityRecord,
      },
      host: {
        name: 'store-host',
        identityFields: { 'host.id': 'host-id' },
        entityRecord: hostEntityRecord,
      },
      hasAnyEntity: true,
    });
    expect(mockUseEntityFromStore).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'user:store-id',
        identityFields: { 'user.id': 'user-id' },
        entityType: 'user',
        skip: false,
      })
    );
  });

  it('falls back to document names for store queries when EUID identifiers are unavailable', () => {
    const hit = buildHit({ user: { name: 'user-1' } });

    const { result } = renderHook(() => useEntitiesOverview({ hit }));

    expect(mockUseEntityFromStore).toHaveBeenCalledWith(
      expect.objectContaining({
        identityFields: { 'user.name': 'user-1' },
        entityType: 'user',
        skip: false,
      })
    );
    expect(result.current).toEqual({
      user: {
        name: 'user-1',
        identityFields: undefined,
        entityRecord: null,
      },
      host: undefined,
      hasAnyEntity: true,
    });
  });

  it('uses hit flattened data as the EUID identity source', () => {
    const hit = buildHit({ host: { name: 'host-1' }, user: { name: 'user-1' } });

    renderHook(() => useEntitiesOverview({ hit }));

    expect(mockGetEntityIdentifiersFromDocument).toHaveBeenCalledWith('host', hit.flattened);
    expect(mockGetEntityIdentifiersFromDocument).toHaveBeenCalledWith('user', hit.flattened);
    expect(mockGetEuidFromObject).toHaveBeenCalledWith('host', hit.flattened);
    expect(mockGetEuidFromObject).toHaveBeenCalledWith('user', hit.flattened);
  });
});
