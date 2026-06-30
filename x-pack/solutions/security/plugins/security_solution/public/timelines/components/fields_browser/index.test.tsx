/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { RenderHookResult } from '@testing-library/react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { Store } from 'redux';
import type { FieldEditorActionsRef, UseFieldBrowserOptions, UseFieldBrowserOptionsProps } from '.';
import { useFieldBrowserOptions } from '.';
import type { Start } from '@kbn/data-view-field-editor-plugin/public/mocks';
import { indexPatternFieldEditorPluginMock } from '@kbn/data-view-field-editor-plugin/public/mocks';

import { TestProviders } from '../../../common/mock';
import { useKibana } from '../../../common/lib/kibana';
import type { DataView, DataViewField } from '@kbn/data-plugin/common';
import { defaultColumnHeaderType } from '../timeline/body/column_headers/default_headers';
import { DEFAULT_COLUMN_MIN_WIDTH } from '../timeline/body/constants';
import { EuiInMemoryTable } from '@elastic/eui';
import type { BrowserFieldItem } from '@kbn/response-ops-alerts-fields-browser/types';
import { PageScope } from '../../../data_view_manager/constants';

let mockIndexPatternFieldEditor: Start;
jest.mock('../../../common/lib/kibana');
const useKibanaMock = useKibana as jest.Mocked<typeof useKibana>;

jest.mock('../../../data_view_manager/hooks/use_data_view');

const mockRemoveColumn = jest.fn();
const mockUpsertColumn = jest.fn();
const mockOnHide = jest.fn();

const runAllPromises = () => new Promise(setImmediate);

// helper function to render the hook
const renderUseFieldBrowserOptions = ({
  store,
  ...props
}: Partial<UseFieldBrowserOptionsProps & { store?: Store }> = {}) =>
  renderHook<
    ReturnType<UseFieldBrowserOptions>,
    React.PropsWithChildren<UseFieldBrowserOptionsProps & { store?: Store }>
  >(
    () =>
      useFieldBrowserOptions({
        sourcererScope: PageScope.default,
        removeColumn: mockRemoveColumn,
        upsertColumn: mockUpsertColumn,
        ...props,
      }),
    {
      wrapper: ({ children }) => {
        if (store) {
          return <TestProviders store={store}>{children}</TestProviders>;
        }
        return <TestProviders>{children}</TestProviders>;
      },
    }
  );

// helper function to render the hook and wait for the first update
const renderUpdatedUseFieldBrowserOptions = async (
  props: Partial<UseFieldBrowserOptionsProps> = {}
) => {
  let renderHookResult: RenderHookResult<
    ReturnType<UseFieldBrowserOptions>,
    UseFieldBrowserOptionsProps
  > | null = null;
  await act(async () => {
    renderHookResult = renderUseFieldBrowserOptions(props);
    await waitFor(() => new Promise((resolve) => resolve(null)));
  });
  return renderHookResult!;
};

const fieldItem: BrowserFieldItem = {
  name: 'field1',
  isRuntime: true,
  category: 'test',
  selected: false,
};

describe('useFieldBrowserOptions', () => {
  const mockAddDanger = jest.fn();

  beforeEach(() => {
    mockIndexPatternFieldEditor = indexPatternFieldEditorPluginMock.createStartContract();
    mockIndexPatternFieldEditor.userPermissions.editIndexPattern = () => true;
    useKibanaMock().services.dataViewFieldEditor = mockIndexPatternFieldEditor;
    useKibanaMock().services.data.dataViews.get = () => new Promise(() => undefined);
    useKibanaMock().services.data.dataViews.clearInstanceCache = () => undefined;
    useKibanaMock().services.notifications.toasts.addDanger = mockAddDanger;

    useKibanaMock().services.application.capabilities = {
      ...useKibanaMock().services.application.capabilities,
      indexPatterns: { save: true },
    };
    jest.clearAllMocks();
  });

  // refactor below tests once resolved: https://github.com/elastic/kibana/issues/122462
  it('should return the button and action column when user has edit permissions', async () => {
    const { result } = renderUseFieldBrowserOptions();

    expect(result.current.createFieldButton).toBeDefined();
    expect(result.current.getFieldTableColumns({ highlight: '', onHide: mockOnHide })).toHaveLength(
      5
    );
  });

  it("should not return the button and action column when user doesn't have read permissions", () => {
    mockIndexPatternFieldEditor.userPermissions.editIndexPattern = () => false;
    const { result } = renderUseFieldBrowserOptions();

    expect(result.current.createFieldButton).toBeUndefined();
    expect(result.current.getFieldTableColumns({ highlight: '', onHide: mockOnHide })).toHaveLength(
      4
    );
  });

  it('should return the button when a dataView is present', async () => {
    const { result } = renderUseFieldBrowserOptions();

    expect(result.current.createFieldButton).toBeDefined();
    expect(result.current.getFieldTableColumns({ highlight: '', onHide: mockOnHide })).toHaveLength(
      5
    );
  });

  it('should call onHide when button is pressed', async () => {
    useKibanaMock().services.data.dataViews.get = () => Promise.resolve({} as DataView);
    const { result } = await renderUpdatedUseFieldBrowserOptions();

    const CreateFieldButton = result!.current.createFieldButton!;
    const { getByTestId } = render(<CreateFieldButton onHide={mockOnHide} />, {
      wrapper: TestProviders,
    });

    expect(getByTestId('create-field')).toBeInTheDocument();
    getByTestId('create-field').click();
    expect(mockOnHide).toHaveBeenCalled();
  });

  it('should call onHide when the column action buttons are pressed', async () => {
    useKibanaMock().services.data.dataViews.get = () => Promise.resolve({} as DataView);
    const { result } = await renderUpdatedUseFieldBrowserOptions();

    const columns = result.current.getFieldTableColumns({
      highlight: '',
      onHide: mockOnHide,
    });

    const { getByTestId } = render(<EuiInMemoryTable items={[fieldItem]} columns={columns} />, {
      wrapper: TestProviders,
    });

    getByTestId('actionEditRuntimeField').click();
    expect(mockOnHide).toHaveBeenCalledTimes(1);
    getByTestId('actionDeleteRuntimeField').click();
    expect(mockOnHide).toHaveBeenCalledTimes(2);
  });

  it('should dispatch the proper action when a new field is saved', async () => {
    let onSave: ((field: DataViewField[]) => void) | undefined;
    useKibanaMock().services.data.dataViews.get = () => Promise.resolve({} as DataView);
    useKibanaMock().services.dataViewFieldEditor.openEditor = async (options) => {
      onSave = options.onSave;
      return () => {};
    };

    const { result } = await renderUpdatedUseFieldBrowserOptions();

    const CreateFieldButton = result.current.createFieldButton!;
    const { getByTestId } = render(<CreateFieldButton onHide={mockOnHide} />, {
      wrapper: TestProviders,
    });

    getByTestId('create-field').click();
    expect(onSave).toBeDefined();

    const savedField = [{ name: 'newField' }] as DataViewField[];
    onSave!(savedField);
    await runAllPromises();

    expect(mockUpsertColumn).toHaveBeenCalledTimes(1);
    expect(mockUpsertColumn).toHaveBeenCalledWith(
      {
        columnHeaderType: defaultColumnHeaderType,
        id: savedField[0].name,
        initialWidth: DEFAULT_COLUMN_MIN_WIDTH,
      },
      0
    );
  });

  it('should dispatch the proper actions when a field is edited', async () => {
    let onSave: ((field: DataViewField[]) => void) | undefined;
    useKibanaMock().services.data.dataViews.get = () => Promise.resolve({} as DataView);
    useKibanaMock().services.dataViewFieldEditor.openEditor = async (options) => {
      onSave = options.onSave;
      return () => {};
    };

    const { result } = await renderUpdatedUseFieldBrowserOptions();

    const columns = result.current.getFieldTableColumns({
      highlight: '',
      onHide: mockOnHide,
    });

    const { getByTestId } = render(<EuiInMemoryTable items={[fieldItem]} columns={columns} />, {
      wrapper: TestProviders,
    });

    getByTestId('actionEditRuntimeField').click();
    expect(onSave).toBeDefined();

    const savedField = [{ name: `new ${fieldItem.name}` }] as DataViewField[];
    onSave!(savedField);
    await runAllPromises();

    expect(mockRemoveColumn).toHaveBeenCalledWith(fieldItem.name);
    expect(mockUpsertColumn).toHaveBeenCalledWith(
      {
        columnHeaderType: defaultColumnHeaderType,
        id: savedField[0].name,
        initialWidth: DEFAULT_COLUMN_MIN_WIDTH,
      },
      0
    );
  });

  it('should dispatch the proper actions when a field is removed', async () => {
    let onDelete: ((fields: string[]) => void) | undefined;
    useKibanaMock().services.data.dataViews.get = () => Promise.resolve({} as DataView);
    useKibanaMock().services.dataViewFieldEditor.openDeleteModal = async (options) => {
      onDelete = options.onDelete;
      return () => {};
    };

    const { result } = await renderUpdatedUseFieldBrowserOptions();

    const columns = result.current.getFieldTableColumns({
      highlight: '',
      onHide: mockOnHide,
    });

    const { getByTestId } = render(<EuiInMemoryTable items={[fieldItem]} columns={columns} />, {
      wrapper: TestProviders,
    });

    getByTestId('actionDeleteRuntimeField').click();
    expect(onDelete).toBeDefined();

    onDelete!([fieldItem.name]);
    await runAllPromises();

    expect(mockRemoveColumn).toHaveBeenCalledTimes(1);
    expect(mockRemoveColumn).toHaveBeenCalledWith(fieldItem.name);
  });

  it("should store 'closeEditor' in the actions ref when editor is open by create button", async () => {
    const mockCloseEditor = jest.fn();
    useKibanaMock().services.data.dataViews.get = () => Promise.resolve({} as DataView);
    useKibanaMock().services.dataViewFieldEditor.openEditor = async () => mockCloseEditor;

    const editorActionsRef: FieldEditorActionsRef = React.createRef();

    const { result } = await renderUpdatedUseFieldBrowserOptions({ editorActionsRef });

    const CreateFieldButton = result!.current.createFieldButton!;
    const { getByTestId } = render(<CreateFieldButton onHide={mockOnHide} />, {
      wrapper: TestProviders,
    });

    expect(editorActionsRef?.current).toBeNull();

    getByTestId('create-field').click();
    await runAllPromises();

    expect(mockCloseEditor).not.toHaveBeenCalled();
    expect(editorActionsRef?.current?.closeEditor).toBeDefined();

    editorActionsRef!.current!.closeEditor();

    expect(mockCloseEditor).toHaveBeenCalled();
    expect(editorActionsRef!.current).toBeNull();
  });

  it("should store 'closeEditor' in the actions ref when editor is open by edit button", async () => {
    const mockCloseEditor = jest.fn();
    useKibanaMock().services.data.dataViews.get = () => Promise.resolve({} as DataView);
    useKibanaMock().services.dataViewFieldEditor.openEditor = async () => mockCloseEditor;

    const editorActionsRef: FieldEditorActionsRef = React.createRef();

    const { result } = await renderUpdatedUseFieldBrowserOptions({ editorActionsRef });

    const columns = result.current.getFieldTableColumns({
      highlight: '',
      onHide: mockOnHide,
    });

    const { getByTestId } = render(<EuiInMemoryTable items={[fieldItem]} columns={columns} />, {
      wrapper: TestProviders,
    });

    expect(editorActionsRef?.current).toBeNull();

    getByTestId('actionEditRuntimeField').click();
    await runAllPromises();

    expect(mockCloseEditor).not.toHaveBeenCalled();
    expect(editorActionsRef?.current?.closeEditor).toBeDefined();

    editorActionsRef!.current!.closeEditor();

    expect(mockCloseEditor).toHaveBeenCalled();
    expect(editorActionsRef!.current).toBeNull();
  });
});
