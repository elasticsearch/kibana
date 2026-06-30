/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableCompareToolbarBtn } from './data_table_document_selection';
import React from 'react';
import userEvent from '@testing-library/user-event';
import {
  buildSelectedDocsState,
  dataTableContextMock,
  dataTableContextRowsMock,
} from '../../__mocks__/table_context';
import {
  DataTableDocumentToolbarBtn,
  SelectButton,
  getSelectAllButton,
} from './data_table_document_selection';
import { getDocId } from '@kbn/discover-utils';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { screen } from '@testing-library/react';
import { servicesMock } from '../../__mocks__/services';
import { UnifiedDataTableContext } from '../table_context';

const getSelectionToolbarButton = (selectedCount: number) =>
  screen.getByRole('button', { name: new RegExp(`Selected.*Active:\\s*${selectedCount}`) });

const renderWithTableContext = (ui: React.ReactElement, contextMock = dataTableContextMock) =>
  renderWithI18n(
    <UnifiedDataTableContext.Provider value={contextMock}>{ui}</UnifiedDataTableContext.Provider>
  );

describe('document selection', () => {
  describe('getDocId', () => {
    it('doc with custom routing', () => {
      const doc = {
        _id: 'test-id',
        _index: 'test-indices',
        _routing: 'why-not',
      };

      expect(getDocId(doc)).toBe('test-indices::test-id::why-not');
    });

    it('doc without custom routing', () => {
      const doc = {
        _id: 'test-id',
        _index: 'test-indices',
      };

      expect(getDocId(doc)).toBe('test-indices::test-id::');
    });
  });

  describe('SelectAllButton', () => {
    it('is not checked', () => {
      const contextMock = {
        ...dataTableContextMock,
      };

      const SelectAllButton = getSelectAllButton(dataTableContextRowsMock);

      renderWithTableContext(<SelectAllButton />, contextMock);

      expect(screen.getByRole('checkbox', { name: 'Select all visible rows' })).not.toBeChecked();
    });

    it('is checked correctly', () => {
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: buildSelectedDocsState(['i::1::']),
      };

      const SelectAllButton = getSelectAllButton(dataTableContextRowsMock);

      renderWithTableContext(<SelectAllButton />, contextMock);

      expect(screen.getByRole('checkbox', { name: 'Deselect all visible rows' })).toBeChecked();
    });
  });

  describe('SelectButton', () => {
    it('is not checked', () => {
      const contextMock = {
        ...dataTableContextMock,
      };

      renderWithTableContext(
        <SelectButton
          colIndex={0}
          columnId="test"
          isDetails={false}
          isExpandable={false}
          isExpanded={false}
          rowIndex={0}
          setCellProps={jest.fn()}
        />,
        contextMock
      );

      expect(screen.getByRole('checkbox', { name: "Select document '1'" })).not.toBeChecked();
    });

    it('is checked when the document is selected', () => {
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: buildSelectedDocsState(['i::1::']),
      };

      renderWithTableContext(
        <SelectButton
          colIndex={0}
          columnId="test"
          isDetails={false}
          isExpandable={false}
          isExpanded={false}
          rowIndex={0}
          setCellProps={jest.fn()}
        />,
        contextMock
      );

      expect(screen.getByRole('checkbox', { name: "Select document '1'" })).toBeChecked();
    });

    it('is not checked when the document is not selected', () => {
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: buildSelectedDocsState(['i::1::']),
      };

      renderWithTableContext(
        <SelectButton
          colIndex={0}
          columnId="test"
          isDetails={false}
          isExpandable={false}
          isExpanded={false}
          rowIndex={1}
          setCellProps={jest.fn()}
        />,
        contextMock
      );

      expect(screen.getByRole('checkbox', { name: "Select document '2'" })).not.toBeChecked();
    });

    it('adding a selection', async () => {
      const contextMock = {
        ...dataTableContextMock,
      };

      renderWithTableContext(
        <SelectButton
          colIndex={0}
          columnId="test"
          isDetails={false}
          isExpandable={false}
          isExpanded={false}
          rowIndex={0}
          setCellProps={jest.fn()}
        />,
        contextMock
      );

      await userEvent.click(screen.getByRole('checkbox', { name: "Select document '1'" }));

      expect(contextMock.selectedDocsState.toggleDocSelection).toHaveBeenCalledWith('i::1::');
    });

    it('removing a selection', async () => {
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: buildSelectedDocsState(['i::1::']),
      };

      renderWithTableContext(
        <SelectButton
          colIndex={0}
          columnId="test"
          isDetails={false}
          isExpandable={false}
          isExpanded={false}
          rowIndex={0}
          setCellProps={jest.fn()}
        />,
        contextMock
      );

      await userEvent.click(screen.getByRole('checkbox', { name: "Select document '1'" }));

      expect(contextMock.selectedDocsState.toggleDocSelection).toHaveBeenCalledWith('i::1::');
    });
  });

  describe('DataTableDocumentToolbarBtn', () => {
    it('it renders the button and its menu correctly', async () => {
      const props = {
        columns: ['test'],
        enableComparisonMode: true,
        fieldFormats: servicesMock.fieldFormats,
        isFilterActive: false,
        isPlainRecord: false,
        pageIndex: 0,
        pageSize: 2,
        rows: dataTableContextRowsMock,
        selectedDocsState: buildSelectedDocsState(['i::1::', 'i::2::']),
        setIsCompareActive: jest.fn(),
        setIsFilterActive: jest.fn(),
        toastNotifications: servicesMock.toastNotifications,
      };
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: props.selectedDocsState,
      };

      renderWithTableContext(<DataTableDocumentToolbarBtn {...props} />, contextMock);

      const button = getSelectionToolbarButton(2);
      expect(button).toBeVisible();

      await userEvent.click(button);

      expect(screen.getByText('Show selected documents only')).toBeVisible();
      expect(screen.getByText('Compare selected')).toBeVisible();
      expect(screen.getByText('Select all 5')).toBeVisible();

      await userEvent.click(screen.getByText('Clear selection'));

      expect(props.selectedDocsState.clearAllSelectedDocs).toHaveBeenCalled();
    });

    it('filters custom bulk actions based on the available predicate', async () => {
      const props = {
        columns: ['test'],
        customBulkActions: [
          {
            key: 'always',
            label: 'Always',
            'data-test-subj': 'bulkActionAlways',
            onClick: jest.fn(),
          },
          {
            key: 'never',
            label: 'Never',
            'data-test-subj': 'bulkActionNever',
            onClick: jest.fn(),
            isAvailable: () => false,
          },
          {
            key: 'when-two',
            label: 'When two',
            'data-test-subj': 'bulkActionWhenTwo',
            onClick: jest.fn(),
            isAvailable: ({ selectedDocIds }: { selectedDocIds: string[] }) =>
              selectedDocIds.length >= 2,
          },
        ],
        enableComparisonMode: false,
        fieldFormats: servicesMock.fieldFormats,
        isFilterActive: false,
        isPlainRecord: false,
        pageIndex: 0,
        pageSize: 2,
        rows: dataTableContextRowsMock,
        selectedDocsState: buildSelectedDocsState(['i::1::', 'i::2::']),
        setIsCompareActive: jest.fn(),
        setIsFilterActive: jest.fn(),
        toastNotifications: servicesMock.toastNotifications,
      };
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: props.selectedDocsState,
      };

      renderWithTableContext(<DataTableDocumentToolbarBtn {...props} />, contextMock);
      await userEvent.click(getSelectionToolbarButton(2));

      expect(screen.getByTestId('unifiedDataTableSelectionMenu')).toBeInTheDocument();
      expect(screen.getByText('Always')).toBeInTheDocument();
      expect(screen.queryByText('Never')).not.toBeInTheDocument();
      expect(screen.getByText('When two')).toBeInTheDocument();
    });

    it('hides default bulk actions when hideDefaultBulkActions is true', async () => {
      const props = {
        columns: ['test'],
        customBulkActions: [
          {
            key: 'myAction',
            label: 'My action',
            'data-test-subj': 'myBulkAction',
            onClick: jest.fn(),
          },
        ],
        enableComparisonMode: false,
        fieldFormats: servicesMock.fieldFormats,
        hideDefaultBulkActions: true,
        isFilterActive: false,
        isPlainRecord: false,
        pageIndex: 0,
        pageSize: 2,
        rows: dataTableContextRowsMock,
        selectedDocsState: buildSelectedDocsState(['i::1::', 'i::2::']),
        setIsCompareActive: jest.fn(),
        setIsFilterActive: jest.fn(),
        toastNotifications: servicesMock.toastNotifications,
      };
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: props.selectedDocsState,
      };

      renderWithTableContext(<DataTableDocumentToolbarBtn {...props} />, contextMock);
      await userEvent.click(getSelectionToolbarButton(2));

      expect(screen.getByText('My action')).toBeInTheDocument();
      expect(screen.queryByText('Copy selection as text')).not.toBeInTheDocument();
      expect(screen.queryByText('Copy selection as Markdown')).not.toBeInTheDocument();
      expect(screen.queryByText('Copy documents as JSON')).not.toBeInTheDocument();
      expect(screen.queryByText('Show selected documents only')).not.toBeInTheDocument();
      expect(screen.getByText('Clear selection')).toBeInTheDocument();
    });

    it('it should not render "Select all X" button if less than pageSize is selected', () => {
      const props = {
        columns: ['test'],
        enableComparisonMode: true,
        fieldFormats: servicesMock.fieldFormats,
        isFilterActive: false,
        isPlainRecord: false,
        pageIndex: 0,
        pageSize: 2,
        rows: dataTableContextRowsMock,
        selectedDocsState: buildSelectedDocsState(['i::1::']),
        setIsCompareActive: jest.fn(),
        setIsFilterActive: jest.fn(),
        toastNotifications: servicesMock.toastNotifications,
      };
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: props.selectedDocsState,
      };

      renderWithTableContext(<DataTableDocumentToolbarBtn {...props} />, contextMock);

      expect(getSelectionToolbarButton(1)).toBeVisible();
      expect(screen.queryByText('Select all 1')).not.toBeInTheDocument();
    });

    it('it should render "Select all X" button if all rows on the page are selected', async () => {
      const props = {
        columns: ['test'],
        enableComparisonMode: true,
        fieldFormats: servicesMock.fieldFormats,
        isFilterActive: false,
        isPlainRecord: false,
        pageIndex: 0,
        pageSize: 2,
        rows: dataTableContextRowsMock,
        selectedDocsState: buildSelectedDocsState(['i::1::', 'i::2::']),
        setIsCompareActive: jest.fn(),
        setIsFilterActive: jest.fn(),
        toastNotifications: servicesMock.toastNotifications,
      };
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: props.selectedDocsState,
      };

      renderWithTableContext(<DataTableDocumentToolbarBtn {...props} />, contextMock);

      expect(getSelectionToolbarButton(2)).toBeVisible();

      const button = screen.getByText('Select all 5');
      expect(button).toBeVisible();

      await userEvent.click(button);

      expect(props.selectedDocsState.selectAllDocs).toHaveBeenCalled();
    });

    it('it should render "Select all X" button even if on another page', () => {
      const props = {
        columns: ['test'],
        enableComparisonMode: true,
        fieldFormats: servicesMock.fieldFormats,
        isFilterActive: false,
        isPlainRecord: false,
        pageIndex: 1,
        pageSize: 2,
        rows: dataTableContextRowsMock,
        selectedDocsState: buildSelectedDocsState(['i::1::', 'i::2::']),
        setIsCompareActive: jest.fn(),
        setIsFilterActive: jest.fn(),
        toastNotifications: servicesMock.toastNotifications,
      };
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: props.selectedDocsState,
      };

      renderWithTableContext(<DataTableDocumentToolbarBtn {...props} />, contextMock);

      expect(getSelectionToolbarButton(2)).toBeVisible();
      expect(screen.getByText('Select all 5')).toBeVisible();
    });

    it('it should not render "Select all X" button if all rows are selected', () => {
      const props = {
        columns: ['test'],
        enableComparisonMode: true,
        fieldFormats: servicesMock.fieldFormats,
        isFilterActive: false,
        isPlainRecord: false,
        pageIndex: 1,
        pageSize: 2,
        rows: dataTableContextRowsMock,
        selectedDocsState: buildSelectedDocsState(dataTableContextRowsMock.map((row) => row.id)),
        setIsCompareActive: jest.fn(),
        setIsFilterActive: jest.fn(),
        toastNotifications: servicesMock.toastNotifications,
      };
      const contextMock = {
        ...dataTableContextMock,
        selectedDocsState: props.selectedDocsState,
      };

      renderWithTableContext(<DataTableDocumentToolbarBtn {...props} />, contextMock);

      expect(getSelectionToolbarButton(dataTableContextRowsMock.length)).toBeVisible();
      expect(screen.queryByText('Select all 5')).not.toBeInTheDocument();
    });
  });

  describe('DataTableCompareToolbarBtn', () => {
    const props = {
      columns: ['test'],
      enableComparisonMode: true,
      fieldFormats: servicesMock.fieldFormats,
      isFilterActive: false,
      isPlainRecord: false,
      pageIndex: 0,
      pageSize: 2,
      rows: dataTableContextRowsMock,
      selectedDocsState: buildSelectedDocsState([]),
      setIsCompareActive: jest.fn(),
      setIsFilterActive: jest.fn(),
      toastNotifications: servicesMock.toastNotifications,
    };

    const renderCompareBtn = ({
      selectedDocIds = ['1', '2'],
      setIsCompareActive = jest.fn(),
    }: Partial<Parameters<typeof DataTableCompareToolbarBtn>[0]> = {}) => {
      renderWithTableContext(
        <DataTableDocumentToolbarBtn
          {...props}
          selectedDocsState={buildSelectedDocsState(selectedDocIds)}
          setIsCompareActive={setIsCompareActive}
        />,
        {
          ...dataTableContextMock,
          selectedDocsState: props.selectedDocsState,
        }
      );

      return {
        getButton: async () => {
          const menuButton = await screen.findByRole('button', { name: /Selected/ });

          await userEvent.click(menuButton);

          return screen.queryByTestId('unifiedDataTableCompareSelectedDocuments');
        },
      };
    };

    it('should render the compare button', async () => {
      const { getButton } = renderCompareBtn();

      expect(await getButton()).toBeInTheDocument();
    });

    it('should call setIsCompareActive when the button is clicked', async () => {
      const setIsCompareActive = jest.fn();

      const { getButton } = renderCompareBtn({ setIsCompareActive });

      const button = await getButton();
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();

      await userEvent.click(button!);

      expect(setIsCompareActive).toHaveBeenCalledWith(true);
    });

    it('should disable the button if limit is reached', async () => {
      const selectedDocIds = Array.from({ length: 500 }, (_, i) => i.toString());
      const setIsCompareActive = jest.fn();

      const { getButton } = renderCompareBtn({ selectedDocIds, setIsCompareActive });

      const button = await getButton();
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();

      await userEvent.click(button!);

      expect(setIsCompareActive).not.toHaveBeenCalled();
    });
  });
});
