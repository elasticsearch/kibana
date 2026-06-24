/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor, renderHook } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { useKibana, useToasts } from '../../../../common/lib/kibana';
import { useFindSavedObjects } from './use_find_saved_objects';
import { SUPPORTED_SO_TYPES } from './helpers';

jest.mock('../../../../common/lib/kibana');

const useKibanaMock = useKibana as jest.Mock;
const useToastsMock = useToasts as jest.Mock;

const buildHttpMock = (getImpl: jest.Mock) => ({
  services: { http: { get: getImpl } },
});

describe('useFindSavedObjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls the `_find` endpoint with sort + wildcard search query', async () => {
    const getMock = jest.fn().mockResolvedValue({ saved_objects: [], total: 0 });
    useKibanaMock.mockReturnValue(buildHttpMock(getMock));

    renderHook(
      () => useFindSavedObjects({ types: SUPPORTED_SO_TYPES, query: 'foo', page: 1, perPage: 25 }),
      { wrapper: TestProviders }
    );

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/api/kibana/management/saved_objects/_find', {
        query: {
          type: SUPPORTED_SO_TYPES,
          search: 'foo*',
          page: 2,
          perPage: 25,
          sortField: 'updated_at',
          sortOrder: 'desc',
        },
      })
    );
  });

  it('omits the search clause when the query is empty', async () => {
    const getMock = jest.fn().mockResolvedValue({ saved_objects: [], total: 0 });
    useKibanaMock.mockReturnValue(buildHttpMock(getMock));

    renderHook(
      () => useFindSavedObjects({ types: SUPPORTED_SO_TYPES, query: '', page: 0, perPage: 10 }),
      { wrapper: TestProviders }
    );

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ query: expect.objectContaining({ search: undefined, page: 1 }) })
      )
    );
  });

  it('returns the items and total from the response', async () => {
    const items = [{ id: 'a', type: 'dashboard', meta: { title: 'A' } }];
    const getMock = jest.fn().mockResolvedValue({ saved_objects: items, total: 42 });
    useKibanaMock.mockReturnValue(buildHttpMock(getMock));

    const { result } = renderHook(
      () => useFindSavedObjects({ types: SUPPORTED_SO_TYPES, query: '', page: 0, perPage: 10 }),
      { wrapper: TestProviders }
    );

    await waitFor(() => expect(result.current.items).toEqual(items));
    expect(result.current.total).toBe(42);
  });

  it('surfaces fetch failures via toasts.addError', async () => {
    const addError = jest.fn();
    useToastsMock.mockReturnValue({ addError });
    const error = new Error('boom');
    const getMock = jest.fn().mockRejectedValue(error);
    useKibanaMock.mockReturnValue(buildHttpMock(getMock));

    renderHook(
      () => useFindSavedObjects({ types: SUPPORTED_SO_TYPES, query: '', page: 0, perPage: 10 }),
      { wrapper: TestProviders }
    );

    await waitFor(() =>
      expect(addError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ title: expect.any(String) })
      )
    );
  });
});
