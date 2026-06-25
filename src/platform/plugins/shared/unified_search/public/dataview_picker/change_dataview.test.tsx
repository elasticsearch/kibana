/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { indexPatternEditorPluginMock as dataViewEditorPluginMock } from '@kbn/data-view-editor-plugin/public/mocks';
import { ChangeDataView } from './change_dataview';
import { dataViewMock, dataViewMockEsql } from './mocks/dataview';
import type { DataViewPickerProps } from './data_view_picker';

// Mock DOM measurement functions to prevent EUI truncation width errors
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 500,
});

Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
  configurable: true,
  value: 400,
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  value: 500,
});

describe('DataView component', () => {
  const createMockWebStorage = () => ({
    clear: jest.fn(),
    getItem: jest.fn(),
    key: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
    length: 0,
  });

  const createMockStorage = () => ({
    storage: createMockWebStorage(),
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
  });

  const getStorage = (v: boolean) => {
    const storage = createMockStorage();
    storage.get.mockReturnValue(v);
    return storage;
  };

  function wrapDataViewComponentInContext(
    testProps?: Partial<DataViewPickerProps>,
    storageValue: boolean = false,
    uiSettingValue: boolean = false
  ) {
    const dataViewEditorMock = dataViewEditorPluginMock.createStartContract();
    (dataViewEditorMock.userPermissions.editDataView as jest.Mock).mockReturnValue(true);

    // Mock openEditor to immediately call onSave callback when called
    (dataViewEditorMock.openEditor as jest.Mock).mockImplementation(({ onSave }) => {
      if (onSave) {
        // Simulate saving by calling onSave with a mock data view
        setTimeout(() => {
          onSave({ id: 'new-dataview', title: 'New Data View' });
        }, 0);
      }
      return jest.fn(); // Return a mock close function
    });
    let dataMock = dataPluginMock.createStartContract();
    dataMock = {
      ...dataMock,
      dataViews: {
        ...dataMock.dataViews,
        getIdsWithTitle: jest.fn().mockReturnValue([]),
        get: jest.fn().mockReturnValue({ isPersisted: () => true }),
      },
    };
    const services = {
      data: dataMock,
      storage: getStorage(storageValue),
      dataViewEditor: dataViewEditorMock,
      uiSettings: {
        get: jest.fn(() => uiSettingValue),
      },
    };

    const defaultProps = {
      currentDataViewId: 'dataview-1',
      trigger: {
        label: 'Dataview 1',
        title: 'Dataview 1',
        fullWidth: true,
        'data-test-subj': 'dataview-trigger',
      },
      onChangeDataView: jest.fn(),
    };

    return (
      <I18nProvider>
        <KibanaContextProvider services={services}>
          <ChangeDataView {...defaultProps} {...testProps} />
        </KibanaContextProvider>
      </I18nProvider>
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'should not render the add runtime field menu if addField is not given',
      hasAddField: false,
      expectPresent: false,
    },
    {
      description: 'should render the add runtime field menu if addField is given',
      hasAddField: true,
      expectPresent: true,
    },
  ])('$description', async ({ hasAddField, expectPresent }) => {
    const addFieldSpy = jest.fn();
    const testProps = hasAddField ? { onAddField: addFieldSpy } : {};

    render(wrapDataViewComponentInContext(testProps, !hasAddField));

    await userEvent.click(screen.getByTestId('dataview-trigger'));

    expect(screen.getByTestId('changeDataViewPopover')).toBeInTheDocument();
    const addFieldButton = screen.queryByTestId('indexPattern-add-field');

    if (expectPresent) {
      expect(addFieldButton).toBeInTheDocument();
      expect(addFieldButton).toHaveTextContent('Add a field to this data view');
      await userEvent.click(addFieldButton!);
      expect(addFieldSpy).toHaveBeenCalled();
    } else {
      expect(addFieldButton).not.toBeInTheDocument();
    }
  });

  it.each([
    {
      description: 'should not render the add dataview menu if onDataViewCreated is not given',
      hasOnDataViewCreated: false,
      expectPresent: false,
    },
    {
      description: 'should render the add dataview menu if onDataViewCreated is given',
      hasOnDataViewCreated: true,
      expectPresent: true,
    },
  ])('$description', async ({ hasOnDataViewCreated, expectPresent }) => {
    const addDataViewSpy = jest.fn();
    const testProps = hasOnDataViewCreated ? { onDataViewCreated: addDataViewSpy } : {};

    render(wrapDataViewComponentInContext(testProps, !hasOnDataViewCreated));

    await userEvent.click(screen.getByTestId('dataview-trigger'));
    expect(screen.getByTestId('changeDataViewPopover')).toBeInTheDocument();
    const createButton = screen.queryByTestId('dataview-create-new');

    if (expectPresent) {
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveTextContent('Create a data view');
      await userEvent.click(createButton!);
      await waitFor(() => {
        expect(addDataViewSpy).toHaveBeenCalled();
      });
    } else {
      expect(createButton).not.toBeInTheDocument();
    }
  });

  it('should properly handle ad hoc data views', async () => {
    render(
      wrapDataViewComponentInContext({
        onDataViewCreated: jest.fn(),
        savedDataViews: [
          {
            id: 'dataview-1',
            title: 'dataview-1',
          },
        ],
        adHocDataViews: [dataViewMock],
      })
    );

    await userEvent.click(screen.getByTestId('dataview-trigger'));

    // Verify both saved and ad hoc dataviews are visible
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^the-data-view / })).toBeInTheDocument();

    // Verify the ad hoc data view has the "Temporary" badge
    expect(screen.getByTestId('dataViewItemTempBadge-the-data-view')).toBeInTheDocument();
    expect(screen.getByText('Temporary')).toBeInTheDocument();
  });

  it('should properly handle ES|QL ad hoc data views', async () => {
    render(
      wrapDataViewComponentInContext({
        savedDataViews: [
          {
            id: 'dataview-1',
            title: 'dataview-1',
          },
        ],
        adHocDataViews: [dataViewMockEsql],
      })
    );

    await userEvent.click(screen.getByTestId('dataview-trigger'));

    // Verify that ES|QL ad hoc dataviews are filtered out, only saved dataview should be visible
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^the-data-view-esql / })).not.toBeInTheDocument();
  });

  it('should properly handle managed data views', async () => {
    render(
      wrapDataViewComponentInContext({
        savedDataViews: [
          {
            id: 'dataview-1',
            title: 'dataview-1',
          },
          {
            id: 'the-data-view-id',
            title: 'the-data-view-title',
            name: 'the-data-view',
            type: 'default',
            managed: true,
          },
        ],
      })
    );

    await userEvent.click(screen.getByTestId('dataview-trigger'));

    // Verify both saved and managed dataviews are visible
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^the-data-view / })).toBeInTheDocument();

    // Verify the managed data view has the "Managed" badge
    expect(screen.getByTestId('dataViewItemManagedBadge-the-data-view')).toBeInTheDocument();
    expect(screen.getByText('Managed')).toBeInTheDocument();
  });

  it('should properly handle both ad hoc and managed data views together', async () => {
    render(
      wrapDataViewComponentInContext({
        savedDataViews: [
          {
            id: 'dataview-1',
            title: 'dataview-1',
          },
          {
            id: 'managed-dataview-id',
            title: 'managed-dataview-title',
            name: 'managed-dataview',
            type: 'default',
            managed: true,
          },
        ],
        adHocDataViews: [dataViewMock],
      })
    );

    await userEvent.click(screen.getByTestId('dataview-trigger'));

    // Verify all three data views are visible (saved, ad hoc, and managed)
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: /^dataview-1 / })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^the-data-view / })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^managed-dataview / })).toBeInTheDocument();

    // Verify the badges for special types
    expect(screen.getByTestId('dataViewItemTempBadge-the-data-view')).toBeInTheDocument();
    expect(screen.getByTestId('dataViewItemManagedBadge-managed-dataview')).toBeInTheDocument();
    expect(screen.getByText('Temporary')).toBeInTheDocument();
    expect(screen.getByText('Managed')).toBeInTheDocument();
  });

  it('should call onClosePopover when it is given and popover is closed', async () => {
    const onClosePopoverSpy = jest.fn();
    const addDataViewSpy = jest.fn();

    render(
      wrapDataViewComponentInContext({
        onClosePopover: onClosePopoverSpy,
        onDataViewCreated: addDataViewSpy,
      })
    );

    await userEvent.click(screen.getByTestId('dataview-trigger'));

    expect(screen.getByTestId('dataview-create-new')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('dataview-create-new'));

    expect(onClosePopoverSpy).toHaveBeenCalled();
  });
});
