/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { createSearchBar } from './create_search_bar';

jest.mock('./lib/use_saved_query', () => ({
  useSavedQuery: () => ({
    savedQuery: undefined,
    setSavedQuery: jest.fn(),
    clearSavedQuery: jest.fn(),
  }),
}));

jest.mock('./lib/use_timefilter', () => ({
  useTimefilter: () => ({
    timeRange: { from: 'now-15m', to: 'now' },
    refreshInterval: { value: 0, pause: true },
    minRefreshInterval: 0,
  }),
}));

jest.mock('./lib/use_query_string_manager', () => ({
  useQueryStringManager: () => ({
    query: { language: 'kuery', query: 'response:200' },
  }),
}));

const useFilterManagerMock = jest.fn();

jest.mock('./lib/use_filter_manager', () => ({
  useFilterManager: (...args: unknown[]) => useFilterManagerMock(...args),
}));

describe('createSearchBar', () => {
  const core = coreMock.createStart();
  const data = dataPluginMock.createStartContract();
  const StatefulSearchBar = createSearchBar({
    core,
    data,
    storage: {} as any,
    kql: { autocomplete: {} as any },
    cps: {} as any,
  });

  it('throws when asCodeFilterMode and useDefaultBehaviors are both enabled', () => {
    expect(() =>
      render(
        <StatefulSearchBar
          appName="test"
          asCodeFilterMode={true}
          useDefaultBehaviors={true}
          onFiltersUpdated={jest.fn()}
        />
      )
    ).toThrow(
      'StatefulSearchBar does not support asCodeFilterMode with useDefaultBehaviors=true. Provide explicit filter handlers instead.'
    );
  });

  beforeEach(() => {
    useFilterManagerMock.mockReturnValue({ filters: [] });
  });

  it('throws when asCodeFilterMode is enabled without onFiltersUpdated', () => {
    expect(() => render(<StatefulSearchBar appName="test" asCodeFilterMode={true} />)).toThrow(
      'StatefulSearchBar requires onFiltersUpdated when asCodeFilterMode is enabled.'
    );
  });

  it('preserves pinned filters returned by useFilterManager in asCode mode', async () => {
    useFilterManagerMock.mockReturnValue({
      filters: [
        {
          meta: {
            key: 'host.name',
            field: 'host.name',
            type: 'phrase',
            params: { query: 'web-01' },
            disabled: false,
            negate: false,
            alias: null,
          },
          query: {
            match_phrase: {
              'host.name': 'web-01',
            },
          },
          $state: { store: 'globalState' },
        },
      ],
    });

    const onFiltersUpdated = jest.fn();
    const { rerender } = render(
      <StatefulSearchBar
        appName="test"
        asCodeFilterMode={true}
        onFiltersUpdated={onFiltersUpdated}
        filters={[]}
      />
    );

    rerender(
      <StatefulSearchBar
        appName="test"
        asCodeFilterMode={true}
        onFiltersUpdated={onFiltersUpdated}
        filters={[
          {
            meta: {
              key: 'status',
              type: 'phrase',
              params: { query: 'active' },
              disabled: false,
              negate: false,
              alias: null,
            },
            query: {
              match_phrase: {
                status: 'active',
              },
            },
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(onFiltersUpdated).not.toHaveBeenCalled();
    });
  });
});
