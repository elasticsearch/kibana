/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { AsyncField, createPrebuildFields } from './use_rule_description_fields';
import { screen, render, waitFor } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useKibana } from '../../../../common/lib/kibana/kibana_react';
import { createStartServicesMock } from '../../../../common/lib/kibana/kibana_react.mock';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';
import { existsFilter } from '@kbn/es-query/src/filters/stubs';

jest.mock('../../../../common/lib/kibana/kibana_react');

jest.mock('@kbn/unified-search-plugin/public', () => ({
  FilterItems: () => <div data-test-subj="filter-items-mock" />,
}));

const dataViewGetMock = jest.fn();

jest.mocked(useKibana).mockReturnValue({
  services: {
    ...createStartServicesMock(),
    dataViews: {
      get: dataViewGetMock,
    },
  },
} as unknown as ReturnType<typeof useKibana>);

describe('use_rule_description_fields', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en">{children}</IntlProvider>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          cacheTime: 0,
          staleTime: 0,
          refetchOnWindowFocus: false,
          refetchOnMount: false,
          refetchOnReconnect: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.invalidateQueries();
    queryClient.clear();
  });

  describe('AsyncField', () => {
    it('should render async loaded data', async () => {
      const RESPONSE_TEXT = 'my test data';
      const mockQueryFn = jest.fn().mockResolvedValue({ data: RESPONSE_TEXT });

      render(
        <AsyncField<{
          data: string;
        }>
          queryKey={['test-query']}
          queryFn={mockQueryFn}
        >
          {(response) => <div>{response.data}</div>}
        </AsyncField>,
        { wrapper }
      );

      expect(await screen.findByText(RESPONSE_TEXT)).toBeInTheDocument();
    });
  });

  describe('prebuild fields: data view index pattern', () => {
    it('should fetch the index pattern by id', async () => {
      const DATA_VIEW_ID = 'my-data-view-id';
      const DATA_VIEW_TITLE = 'Test Data View';

      dataViewGetMock.mockResolvedValueOnce(
        createStubDataView({
          spec: {
            id: DATA_VIEW_ID,
            title: DATA_VIEW_TITLE,
          },
        })
      );

      const prebuildFields = createPrebuildFields({
        border: '1px solid red',
      });

      const node = prebuildFields.dataViewIndexPattern(DATA_VIEW_ID);

      render(node.description, { wrapper });

      expect(dataViewGetMock).toHaveBeenCalledWith(DATA_VIEW_ID);
      expect(await screen.findByTestId('rule-description-index-patterns')).toBeInTheDocument();
      expect(screen.getByText(DATA_VIEW_TITLE)).toBeInTheDocument();
    });

    it('should show error "-" when something goes wrong', async () => {
      jest.spyOn(console, 'error').mockImplementation(jest.fn());
      const DATA_VIEW_ID = 'my-data-view-id-error-test';

      dataViewGetMock.mockRejectedValue(new Error('Test error fetching data view'));

      const prebuildFields = createPrebuildFields({
        border: '1px solid red',
      });

      const node = prebuildFields.dataViewIndexPattern(DATA_VIEW_ID);

      render(node.description, { wrapper });

      expect(
        await screen.findByTestId('rule-description-field-error-boundary')
      ).toBeInTheDocument();
    });
  });

  describe('prebuild fields: query filters', () => {
    it('should fetch the index pattern by id', async () => {
      const DATA_VIEW_ID = 'my-data-view-id';

      dataViewGetMock.mockResolvedValueOnce({ id: DATA_VIEW_ID });

      const prebuildFields = createPrebuildFields({
        border: '1px solid red',
      });

      const node = prebuildFields.queryFilters({
        filters: [existsFilter],
        dataViewId: DATA_VIEW_ID,
      });

      render(node.description, { wrapper });

      await waitFor(() => expect(dataViewGetMock).toHaveBeenCalledWith(DATA_VIEW_ID));
      expect(screen.getByTestId('description-detail-query-filter')).toBeInTheDocument();
    });
  });
});
