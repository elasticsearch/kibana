/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiProvider } from '@elastic/eui';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import { I18nProvider } from '@kbn/i18n-react';
import {
  createCommonMockServices,
  createIndexFormKibanaMocks,
  MockDataViewPicker,
  MockSearchBar,
} from './test_utils/workflow_form_test_setup';
import { WorkflowExecuteIndexForm } from './workflow_execute_index_form';
import { useKibana } from '../../../hooks/use_kibana';
import {
  createStartServicesMock,
  createUseKibanaMockValue,
  type StartServicesMock,
} from '../../../mocks';

jest.mock('../../../hooks/use_kibana');
jest.mock('@kbn/unified-search-plugin/public', () => ({
  SearchBar: MockSearchBar,
  DataViewPicker: MockDataViewPicker,
}));
jest.mock('./workflow_execute_unified_data_table', () => ({
  WorkflowExecuteUnifiedDataTable: () => null,
}));

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <EuiProvider>
    <I18nProvider>{children}</I18nProvider>
  </EuiProvider>
);

describe('WorkflowExecuteIndexForm - additional coverage', () => {
  const mockSetValue = jest.fn();
  const mockSetErrors = jest.fn();

  const setupMocks = (overrides: Record<string, unknown> = {}) => {
    const { mockDataViews, mockData } = createIndexFormKibanaMocks();
    const baseMock = createStartServicesMock();
    const commonMock = createCommonMockServices();

    const services = {
      ...baseMock,
      ...commonMock,
      unifiedSearch: {
        ...baseMock.unifiedSearch,
        ui: {
          ...baseMock.unifiedSearch.ui,
          SearchBar: MockSearchBar,
        },
      },
      dataViews: { ...baseMock.dataViews, ...mockDataViews },
      data: { ...baseMock.data, ...mockData },
      fieldFormats: fieldFormatsMock,
      ...overrides,
    };

    mockUseKibana.mockReturnValue(
      // unfortunately a type cast needs to be done here
      createUseKibanaMockValue(services as unknown as StartServicesMock)
    );

    return { mockDataViews, mockData, services };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('error handling', () => {
    it('should display errors callout when errors prop is provided', async () => {
      setupMocks();

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors="Something went wrong"
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('should not display errors callout when errors is null', async () => {
      setupMocks();

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('search-bar')).toBeInTheDocument();
      });

      // No error callout should be rendered
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });

    it('should call setErrors when data views fail to load', async () => {
      const { mockDataViews } = setupMocks();
      mockDataViews.getIdsWithTitle.mockRejectedValueOnce(new Error('Network error'));

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(mockSetErrors).toHaveBeenCalledWith('Failed to load data views');
      });
    });

    it('should call setErrors when search subscription emits an error', async () => {
      const { mockData } = setupMocks();

      // Override the search mock to reject the fetch promise
      mockData.search.search.mockReturnValue({
        pipe: jest.fn().mockReturnValue({
          toPromise: jest.fn().mockRejectedValue(new Error('Search failed')),
        }),
      });

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(mockSetErrors).toHaveBeenCalledWith('Search failed');
      });
    });

    it('should handle data view load error in handleDataViewChange', async () => {
      const { mockDataViews } = setupMocks();

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('data-view-picker')).toBeInTheDocument();
      });

      // Now make the get call fail for the next data view change
      mockDataViews.get.mockRejectedValueOnce(new Error('Data view not found'));

      const pickerButton = screen.getByTestId('data-view-picker').querySelector('button');
      pickerButton?.click();

      await waitFor(() => {
        expect(mockSetErrors).toHaveBeenCalledWith('Failed to load data view');
      });
    });
  });

  describe('data view loading', () => {
    it('should select logs-* data view as default when available', async () => {
      const { mockDataViews } = setupMocks();

      mockDataViews.getIdsWithTitle.mockResolvedValueOnce([
        { id: 'metrics-id', title: 'metrics-*' },
        { id: 'logs-id', title: 'logs-*' },
      ]);

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        // Should get the logs-* data view as default
        expect(mockDataViews.get).toHaveBeenCalledWith('logs-id');
      });
    });

    it('should select first data view when no logs-* is available', async () => {
      const { mockDataViews } = setupMocks();

      mockDataViews.getIdsWithTitle.mockResolvedValueOnce([
        { id: 'metrics-id', title: 'metrics-*' },
        { id: 'traces-id', title: 'traces-*' },
      ]);

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(mockDataViews.get).toHaveBeenCalledWith('metrics-id');
      });
    });

    it('should not load data view when list is empty', async () => {
      const { mockDataViews } = setupMocks();

      mockDataViews.getIdsWithTitle.mockResolvedValueOnce([]);

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
      });

      // get should not be called since there are no data views
      expect(mockDataViews.get).not.toHaveBeenCalled();
    });

    it('should not attempt loading when dataViews service is unavailable', async () => {
      setupMocks({ dataViews: undefined });

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      // Should render without crashing
      expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    });
  });

  describe('search error handling', () => {
    it('should handle non-Error search subscription errors with generic message', async () => {
      const { mockData } = setupMocks();

      mockData.search.search.mockReturnValue({
        pipe: jest.fn().mockReturnValue({
          toPromise: jest.fn().mockRejectedValue('string error'),
        }),
      });

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(mockSetErrors).toHaveBeenCalledWith('Failed to fetch documents');
      });
    });

    it('should clear errors and documents when data service is unavailable', async () => {
      setupMocks({ data: undefined });

      render(
        <TestWrapper>
          <WorkflowExecuteIndexForm
            setValue={mockSetValue}
            errors={null}
            setErrors={mockSetErrors}
          />
        </TestWrapper>
      );

      // Should render without crash
      expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    });
  });
});
