/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { themeServiceMock } from '@kbn/core/public/mocks';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import {
  createCommonMockServices,
  createIndexFormKibanaMocks,
  MockDataViewPicker,
  mockFieldFormatter,
  MockSearchBar,
} from './test_utils/workflow_form_test_setup';
import { WorkflowExecuteIndexForm } from './workflow_execute_index_form';
import { useKibana } from '../../../hooks/use_kibana';
import { TestProvider } from '../../../shared/mocks/test_providers';

jest.mock('../../../hooks/use_kibana');
jest.mock('@kbn/unified-search-plugin/public', () => ({
  SearchBar: MockSearchBar,
  DataViewPicker: MockDataViewPicker,
}));
jest.mock('./workflow_execute_unified_data_table', () => ({
  WorkflowExecuteUnifiedDataTable: () => null,
}));

jest.mock('@kbn/unified-data-table', () => {
  const actual = jest.requireActual('@kbn/unified-data-table');
  return {
    ...actual,
    UnifiedDataTable: () => <div data-test-subj="unifiedDataTable" />,
  };
});

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;
const mockTheme = themeServiceMock.createSetupContract({ darkMode: false, name: 'borealis' });
const mockUiSettings = {
  get: jest.fn(),
  isDefault: jest.fn(() => true),
};
const mockStorage = {
  get: jest.fn(),
  set: jest.fn(),
  clear: jest.fn(),
  remove: jest.fn(),
};

const TestWrapper = TestProvider;

describe('WorkflowExecuteIndexForm', () => {
  const mockSetValue = jest.fn();
  const mockSetErrors = jest.fn();
  const { mockDataViews, mockData } = createIndexFormKibanaMocks();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibana.mockReturnValue({
      services: {
        unifiedSearch: {
          ui: {
            SearchBar: MockSearchBar,
          },
        },
        dataViews: mockDataViews as any,
        data: mockData as any,
        fieldFormats: fieldFormatsMock,
        theme: mockTheme,
        uiSettings: mockUiSettings,
        storage: mockStorage,
        ...createCommonMockServices(),
      },
    } as any);
  });

  it('renders search bar and data view picker', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByTestId('search-bar')).toBeInTheDocument();
      expect(getByTestId('data-view-picker')).toBeInTheDocument();
    });
  });

  it('loads data views on mount', async () => {
    render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });
  });

  it('refreshes fields when data view is selected', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByTestId('data-view-picker')).toBeInTheDocument();
    });

    const pickerButton = getByTestId('data-view-picker').querySelector('button');
    pickerButton?.click();

    await waitFor(() => {
      expect(mockDataViews.refreshFields).toHaveBeenCalled();
    });
  });

  it('triggers search on query submission', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByTestId('search-bar')).toBeInTheDocument();
    });

    const queryInput = getByTestId('query-input') as HTMLInputElement;
    fireEvent.change(queryInput, { target: { value: 'rule.name:test' } });
    fireEvent.keyDown(queryInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockData.search.search).toHaveBeenCalled();
    });
  });

  it('fetches documents on data view selection', async () => {
    render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockDataViews.get).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockData.search.search).toHaveBeenCalled();
    });
  });

  it('does not trigger fetch on query change without submit', async () => {
    const { getByTestId } = render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByTestId('query-input')).toBeInTheDocument();
    });

    // Wait for initial fetch and capture call count
    await waitFor(() => {
      expect(mockData.search.search).toHaveBeenCalled();
    });
    const initialCallCount = mockData.search.search.mock.calls.length;

    // Simulate typing without submitting using fireEvent
    const queryInput = getByTestId('query-input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(queryInput, { target: { value: 'test query' } });
    });

    // After act() flushes state updates, the call count should remain the same
    // because onQueryChange only updates the draft query, not the submitted query
    expect(mockData.search.search.mock.calls.length).toBe(initialCallCount);
  });

  it('skips field refresh when data view already has fields', async () => {
    // Create a data view mock that already has fields loaded
    const dataViewWithFields = {
      id: 'test-data-view-id',
      title: 'logs-*',
      name: 'logs-*',
      timeFieldName: '@timestamp',
      getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      getFormatterForField: jest.fn().mockReturnValue(mockFieldFormatter),
      getFieldByName: jest.fn((name: string) => ({
        name,
        type: name === '@timestamp' ? 'date' : 'string',
        esTypes: name === '@timestamp' ? ['date'] : ['keyword'],
      })),
      fields: {
        replaceAll: jest.fn(),
        getByName: jest.fn().mockReturnValue(null),
        getAll: jest.fn().mockReturnValue([{ name: '@timestamp' }, { name: 'message' }]),
        create: jest.fn((spec: { name: string }) => ({ name: spec.name, type: 'string' })),
        add: jest.fn(),
        remove: jest.fn(),
        update: jest.fn(),
        length: 2, // Has fields - should skip refresh
        filter: jest.fn().mockReturnValue([]),
      },
    };

    mockDataViews.get.mockResolvedValue(dataViewWithFields);

    const { getByTestId } = render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByTestId('data-view-picker')).toBeInTheDocument();
    });

    // Clear the mock to track only the calls from handleDataViewChange
    mockDataViews.refreshFields.mockClear();

    const pickerButton = getByTestId('data-view-picker').querySelector('button');
    pickerButton?.click();

    // Wait for the data view change to complete
    await waitFor(() => {
      expect(mockDataViews.get).toHaveBeenCalledWith('test-data-view-id');
    });

    // refreshFields should NOT be called since fields.length > 0
    expect(mockDataViews.refreshFields).not.toHaveBeenCalled();
  });

  it('shows warning toast when field refresh fails', async () => {
    const mockNotifications = createCommonMockServices().notifications;

    const dataViewWithFields = {
      id: 'initial-data-view-id',
      title: 'logs-*',
      name: 'logs-*',
      timeFieldName: '@timestamp',
      getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      getFormatterForField: jest.fn().mockReturnValue(mockFieldFormatter),
      getFieldByName: jest.fn((name: string) => ({
        name,
        type: name === '@timestamp' ? 'date' : 'string',
        esTypes: name === '@timestamp' ? ['date'] : ['keyword'],
      })),
      fields: {
        replaceAll: jest.fn(),
        getByName: jest.fn().mockReturnValue(null),
        getAll: jest.fn().mockReturnValue([{ name: '@timestamp' }, { name: 'message' }]),
        create: jest.fn((spec: { name: string }) => ({ name: spec.name, type: 'string' })),
        add: jest.fn(),
        remove: jest.fn(),
        update: jest.fn(),
        length: 2,
        filter: jest.fn().mockReturnValue([]),
      },
    };
    const dataViewWithoutFields = {
      id: 'test-data-view-id',
      title: 'logs-*',
      name: 'logs-*',
      timeFieldName: '@timestamp',
      getIndexPattern: jest.fn().mockReturnValue('logs-*'),
      getFormatterForField: jest.fn().mockReturnValue(mockFieldFormatter),
      getFieldByName: jest.fn((name: string) => ({
        name,
        type: name === '@timestamp' ? 'date' : 'string',
        esTypes: name === '@timestamp' ? ['date'] : ['keyword'],
      })),
      fields: {
        replaceAll: jest.fn(),
        getByName: jest.fn().mockReturnValue(null),
        getAll: jest.fn().mockReturnValue([]),
        create: jest.fn((spec: { name: string }) => ({ name: spec.name, type: 'string' })),
        add: jest.fn(),
        remove: jest.fn(),
        update: jest.fn(),
        length: 0, // No fields - triggers refresh
        filter: jest.fn().mockReturnValue([]),
      },
    };
    mockDataViews.getIdsWithTitle.mockResolvedValueOnce([
      { id: 'initial-data-view-id', title: 'logs-*' },
    ]);
    mockDataViews.get.mockImplementation(async (dataViewId: string) =>
      dataViewId === 'test-data-view-id' ? dataViewWithoutFields : dataViewWithFields
    );
    mockDataViews.refreshFields.mockImplementation(async (dataView: { id?: string }) => {
      if (dataView.id === 'test-data-view-id') {
        throw new Error('Refresh failed');
      }
    });

    mockUseKibana.mockReturnValue({
      services: {
        unifiedSearch: {
          ui: {
            SearchBar: MockSearchBar,
          },
        },
        dataViews: mockDataViews as any,
        data: mockData as any,
        fieldFormats: fieldFormatsMock,
        theme: mockTheme,
        uiSettings: mockUiSettings,
        storage: mockStorage,
        notifications: mockNotifications,
        http: { get: jest.fn(), post: jest.fn() },
      },
    } as any);

    const { getByTestId } = render(
      <TestWrapper>
        <WorkflowExecuteIndexForm setValue={mockSetValue} errors={null} setErrors={mockSetErrors} />
      </TestWrapper>
    );

    // Wait for initial load to complete
    await waitFor(() => {
      expect(mockDataViews.getIdsWithTitle).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByTestId('data-view-picker')).toBeInTheDocument();
    });

    // Click the picker to trigger handleDataViewChange
    const pickerButton = getByTestId('data-view-picker').querySelector('button');
    expect(pickerButton).not.toBeNull();
    fireEvent.click(pickerButton as HTMLButtonElement);

    // Wait for the refresh to fail and warning to be shown
    await waitFor(() => {
      expect(mockNotifications.toasts.addWarning).toHaveBeenCalled();
    });

    // Should still set the data view despite refresh failure (get is called for the change)
    expect(mockDataViews.get).toHaveBeenCalledWith('test-data-view-id');
  });
});
