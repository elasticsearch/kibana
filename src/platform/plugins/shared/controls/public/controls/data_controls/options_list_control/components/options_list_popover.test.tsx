/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject, first } from 'rxjs';

import { EuiThemeProvider } from '@elastic/eui';
import { ControlValuesSource, DEFAULT_DSL_OPTIONS_LIST_STATE } from '@kbn/controls-constants';
import type { OptionsListDisplaySettings, OptionsListDSLControlState } from '@kbn/controls-schemas';
import type { DataView, DataViewField } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_view.stub';
import type { PublishingSubject } from '@kbn/presentation-publishing';
import type { RenderResult } from '@testing-library/react';
import { render as rtlRender, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { coreServices, dataViewsService } from '../../../../services/kibana_services';
import { getMockedFinalizeApi } from '../../../mocks/control_mocks';
import type { OptionsListComponentApi } from '../../../types';
import { getOptionsListContextMock } from '../../mocks/api_mocks';
import { getOptionsListControlFactory } from '../get_options_list_control_factory';
import * as ControlContextModule from '../options_list_context_provider';
import { OptionsListControlContext } from '../options_list_context_provider';
import type { DSLOptionsListComponentApi } from '../types';
import { OptionsListPopover } from './options_list_popover';

const render = (ui: React.ReactElement) => {
  return rtlRender(ui, { wrapper: EuiThemeProvider });
};

const factory = getOptionsListControlFactory();
const mockFetch = jest.fn();
const contextSpy = jest.spyOn(ControlContextModule, 'useOptionsListContext');

describe('Options list popover', () => {
  const waitForSubjectToPublish = async (subject: PublishingSubject<any>) => {
    return await waitFor(
      async () =>
        new Promise<void>((resolve) => {
          subject.pipe(first()).subscribe(() => resolve());
        })
    );
  };
  const getRealControlContext = async ({
    uuid,
    overwriteState,
  }: {
    uuid: string;
    overwriteState?: Partial<OptionsListDSLControlState>;
  }): Promise<{
    componentApi: DSLOptionsListComponentApi;
    displaySettings: OptionsListDisplaySettings;
  }> => {
    contextSpy.mockClear(); // ensures that we get the up-to-date context

    const finalizeApi = getMockedFinalizeApi(uuid, factory);
    const { Component } = await factory.buildEmbeddable({
      initializeDrilldownsManager: jest.fn(),
      initialState: {
        ...DEFAULT_DSL_OPTIONS_LIST_STATE,
        values_source: ControlValuesSource.FIELD,
        data_view_id: 'myDataViewId',
        field_name: 'myFieldName',
        ...overwriteState,
      } as OptionsListDSLControlState,
      finalizeApi,
      uuid,
      parentApi: {},
    });
    await waitFor(() => {
      expect(mockFetch).toBeCalled();
    });
    mockFetch.mockClear(); // resets so that we wait for fetch again on the next call

    render(<Component />); // makes component context available via spy; we will not actually use this component
    const context = contextSpy.mock.results[0].value;
    return context;
  };
  const mountComponent = ({
    componentApi,
    displaySettings,
  }: {
    componentApi: OptionsListComponentApi;
    displaySettings: OptionsListDisplaySettings;
  }) => {
    return render(
      <OptionsListControlContext.Provider
        value={{
          componentApi,
          displaySettings,
        }}
      >
        <OptionsListPopover />
      </OptionsListControlContext.Provider>
    );
  };

  const clickShowOnlySelections = async (popover: RenderResult) => {
    const showOnlySelectedButton = popover.getByTestId('optionsList-control-show-only-selected');
    await userEvent.click(showOnlySelectedButton);
  };

  beforeAll(async () => {
    const getDataView = async (id: string): Promise<DataView> => {
      if (id !== 'myDataViewId') {
        throw new Error(`Simulated error: no data view found for id ${id}`);
      }
      const stubDataView = createStubDataView({
        spec: {
          id: 'myDataViewId',
          fields: {
            myFieldName: {
              name: 'myFieldName',
              customLabel: 'My field name',
              type: 'string',
              esTypes: ['keyword'],
              aggregatable: true,
              searchable: true,
            },
          },
          title: 'logstash-*',
          timeFieldName: '@timestamp',
        },
      });
      stubDataView.getFormatterForField = jest.fn().mockImplementation(() => {
        return {
          convertToText: (value: string) => `${value}:formatted`,
          toJSON: (value: any) => JSON.stringify(value),
        };
      });
      return stubDataView;
    };
    dataViewsService.get = jest.fn().mockImplementation(getDataView);
    coreServices.http.fetch = mockFetch.mockResolvedValue({
      suggestions: [
        { value: 'woof', docCount: 10 },
        { value: 'bark', docCount: 15 },
        { value: 'meow', docCount: 12 },
      ],
    });
  });

  test('no available options', async () => {
    const contextMock = getOptionsListContextMock();
    contextMock.componentApi.setAvailableOptions([]);
    const popover = mountComponent(contextMock);

    const availableOptionsDiv = popover.getByTestId('optionsList-control-available-options');
    const noOptionsDiv = within(availableOptionsDiv).getByTestId(
      'optionsList-control-noSelectionsMessage'
    );
    expect(noOptionsDiv).toBeInTheDocument();
  });

  test('clicking options calls `makeSelection`', async () => {
    const contextMock = getOptionsListContextMock();
    contextMock.componentApi.setAvailableOptions([
      { value: 'woof', docCount: 5 },
      { value: 'bark', docCount: 10 },
      { value: 'meow', docCount: 12 },
    ]);
    const popover = mountComponent(contextMock);

    const existsOption = popover.getByTestId('optionsList-control-selection-exists');
    await userEvent.click(existsOption);
    expect(contextMock.componentApi.makeSelection).toBeCalledWith('exists-option', false);

    let woofOption = popover.getByTestId('optionsList-control-selection-woof');
    await userEvent.click(woofOption);
    expect(contextMock.componentApi.makeSelection).toBeCalledWith('woof', false);

    // simulate `makeSelection`
    contextMock.componentApi.setSelectedOptions(['woof']);

    await clickShowOnlySelections(popover);
    woofOption = popover.getByTestId('optionsList-control-selection-woof');
    await userEvent.click(woofOption);
    expect(contextMock.componentApi.makeSelection).toBeCalledWith('woof', true);
  });

  test('renders a selectable "(blank)" option', async () => {
    mockFetch.mockResolvedValueOnce({
      suggestions: [
        { value: 'woof', docCount: 10 },
        { value: 'bark', docCount: 15 },
        { value: 'meow', docCount: 12 },
        { value: '', docCount: 20 },
      ],
    });
    const context = await getRealControlContext({ uuid: 'test-control' });
    const popover = mountComponent(context);

    const option = popover.getByTestId('optionsList-control-selection-');
    await userEvent.click(option);
    expect(option).toBeChecked();

    await userEvent.click(option);
    expect(option).not.toBeChecked();
  });

  describe('show only selected', () => {
    test('show only selected options', async () => {
      const contextMock = getOptionsListContextMock();
      const selections = ['woof', 'bark'];
      contextMock.componentApi.setAvailableOptions([
        { value: 'woof', docCount: 5 },
        { value: 'bark', docCount: 10 },
        { value: 'meow', docCount: 12 },
      ]);
      const popover = mountComponent(contextMock);
      contextMock.componentApi.setSelectedOptions(selections);

      await clickShowOnlySelections(popover);
      const availableOptionsDiv = popover.getByTestId('optionsList-control-available-options');
      const availableOptionsList = within(availableOptionsDiv).getByRole('listbox');
      const availableOptions = within(availableOptionsList).getAllByRole('option');
      availableOptions.forEach((child, i) => {
        expect(child).toHaveTextContent(`${selections[i]}. Checked option.`);
      });
    });

    test('display error message when the show only selected toggle is true but there are no selections', async () => {
      const contextMock = getOptionsListContextMock();
      contextMock.componentApi.setAvailableOptions([
        { value: 'woof', docCount: 5 },
        { value: 'bark', docCount: 10 },
        { value: 'meow', docCount: 12 },
      ]);
      contextMock.componentApi.setSelectedOptions([]);
      const popover = mountComponent(contextMock);

      await clickShowOnlySelections(popover);
      const availableOptionsDiv = popover.getByTestId('optionsList-control-available-options');
      const noSelectionsDiv = within(availableOptionsDiv).getByTestId(
        'optionsList-control-selectionsEmptyMessage'
      );
      expect(noSelectionsDiv).toBeInTheDocument();
    });

    test('disable search and sort when show only selected toggle is true', async () => {
      const contextMock = getOptionsListContextMock();
      contextMock.componentApi.setAvailableOptions([
        { value: 'woof', docCount: 5 },
        { value: 'bark', docCount: 10 },
        { value: 'meow', docCount: 12 },
      ]);
      contextMock.componentApi.setSelectedOptions(['woof', 'bark']);
      const popover = mountComponent(contextMock);

      let searchBox = popover.getByTestId('optionsList-control-search-input');
      let sortButton = popover.getByTestId('optionsListControl__sortingOptionsButton');
      expect(searchBox).not.toBeDisabled();
      expect(sortButton).not.toBeDisabled();

      await clickShowOnlySelections(popover);
      searchBox = popover.getByTestId('optionsList-control-search-input');
      sortButton = popover.getByTestId('optionsListControl__sortingOptionsButton');
      expect(searchBox).toBeDisabled();
      expect(sortButton).toBeDisabled();
    });

    test('deselects when showOnlySelected is true', async () => {
      const context = await getRealControlContext({
        uuid: 'test-control',
        overwriteState: { selected_options: ['woof', 'bark'] },
      });
      const popover = mountComponent(context);

      await userEvent.click(popover.getByTestId('optionsList-control-show-only-selected'));
      expect(popover.getByTestId('optionsList-control-selection-woof')).toBeChecked();
      expect(popover.getByTestId('optionsList-control-selection-bark')).toBeChecked();
      expect(popover.queryByTestId('optionsList-control-selection-meow')).toBeNull();

      await userEvent.click(popover.getByTestId('optionsList-control-selection-bark'));

      expect(popover.getByTestId('optionsList-control-selection-woof')).toBeChecked();
      expect(popover.queryByTestId('optionsList-control-selection-bark')).toBeNull();
      expect(popover.queryByTestId('optionsList-control-selection-meow')).toBeNull();
    });
  });

  describe('invalid selections', () => {
    test('test single invalid selection', async () => {
      const contextMock = getOptionsListContextMock();
      contextMock.componentApi.setAvailableOptions([
        { value: 'woof', docCount: 5 },
        { value: 'bark', docCount: 75 },
      ]);
      const popover = mountComponent(contextMock);
      contextMock.componentApi.setSelectedOptions(['woof', 'bark']);
      contextMock.componentApi.setInvalidSelections(new Set(['woof']));
      await waitForSubjectToPublish(contextMock.componentApi.selectedOptions$);

      const validSelection = popover.getByTestId('optionsList-control-selection-bark');
      expect(validSelection).toHaveTextContent('bark. Checked option.');
      expect(
        within(validSelection).getByTestId('optionsList-document-count-badge')
      ).toHaveTextContent('75');
      const title = popover.getByTestId('optionList__invalidSelectionLabel');
      expect(title).toHaveTextContent('Invalid selection');
      const invalidSelection = popover.getByTestId('optionsList-control-invalid-selection-woof');
      expect(invalidSelection).toHaveTextContent('woof. Checked option.');
      expect(invalidSelection).toHaveClass('optionsList__selectionInvalid');
    });

    test('test title when multiple invalid selections', async () => {
      const contextMock = getOptionsListContextMock();
      contextMock.componentApi.setAvailableOptions([
        { value: 'woof', docCount: 5 },
        { value: 'bark', docCount: 75 },
      ]);
      contextMock.componentApi.setSelectedOptions(['bark', 'woof', 'meow']);
      contextMock.componentApi.setInvalidSelections(new Set(['woof', 'meow']));
      const popover = mountComponent(contextMock);

      const title = popover.getByTestId('optionList__invalidSelectionLabel');
      expect(title).toHaveTextContent('Invalid selections');
    });
  });

  describe('include/exclude toggle', () => {
    test('should default to exclude = false', async () => {
      const contextMock = getOptionsListContextMock();
      const popover = mountComponent(contextMock);
      const includeButton = popover.getByTestId('optionsList__includeResults');
      const excludeButton = popover.getByTestId('optionsList__excludeResults');
      expect(includeButton).toHaveAttribute('aria-pressed', 'true');
      expect(excludeButton).toHaveAttribute('aria-pressed', 'false');
    });

    test('if exclude = true, select appropriate button in button group', async () => {
      const contextMock = getOptionsListContextMock();
      const popover = mountComponent(contextMock);
      contextMock.componentApi.setExclude(true);
      await waitForSubjectToPublish(contextMock.componentApi.exclude$);

      const includeButton = popover.getByTestId('optionsList__includeResults');
      const excludeButton = popover.getByTestId('optionsList__excludeResults');
      expect(includeButton).toHaveAttribute('aria-pressed', 'false');
      expect(excludeButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('"Exists" option', () => {
    test('if existsSelected = false and no suggestions, then "Exists" does not show up', async () => {
      const contextMock = getOptionsListContextMock();
      contextMock.componentApi.setAvailableOptions([]);
      const popover = mountComponent(contextMock);

      contextMock.componentApi.setExistsSelected(false);

      const existsOption = popover.queryByTestId('optionsList-control-selection-exists');
      expect(existsOption).toBeNull();
    });

    test('if existsSelected = true, "Exists" is the only option when "Show only selected options" is toggled', async () => {
      const contextMock = getOptionsListContextMock();
      contextMock.componentApi.setAvailableOptions([
        { value: 'woof', docCount: 5 },
        { value: 'bark', docCount: 75 },
      ]);
      const popover = mountComponent(contextMock);

      contextMock.componentApi.setExistsSelected(true);
      await clickShowOnlySelections(popover);

      const availableOptionsDiv = popover.getByTestId('optionsList-control-available-options');
      const availableOptionsList = within(availableOptionsDiv).getByRole('listbox');
      const availableOptions = within(availableOptionsList).getAllByRole('option');
      expect(availableOptions[0]).toHaveTextContent('Exists. Checked option.');
    });

    test('clicking another option unselects "Exists"', async () => {
      const context = await getRealControlContext({ uuid: 'test-control' });
      const popover = mountComponent(context);

      const existsOption = popover.getByTestId('optionsList-control-selection-exists');
      expect(existsOption).not.toBeChecked();
      await userEvent.click(existsOption);
      await waitFor(() => {
        expect(existsOption).toBeChecked();
      });
      const option = popover.getByTestId('optionsList-control-selection-woof');
      await userEvent.click(option);
      await waitFor(() => {
        expect(option).toBeChecked();
      });
      expect(existsOption).not.toBeChecked();
    });

    test('clicking "Exists" unselects all other selections', async () => {
      const context = await getRealControlContext({ uuid: 'test-control' });
      const popover = mountComponent(context);

      const woofOption = popover.getByTestId('optionsList-control-selection-woof');
      const barkOption = popover.getByTestId('optionsList-control-selection-bark');
      const meowOption = popover.getByTestId('optionsList-control-selection-meow');
      const existsOption = popover.getByTestId('optionsList-control-selection-exists');

      context.componentApi.setSelectedOptions(['woof', 'bark']);
      await waitFor(() => {
        expect(woofOption).toBeChecked();
        expect(barkOption).toBeChecked();
      });
      expect(meowOption).not.toBeChecked();
      expect(existsOption).not.toBeChecked();

      await userEvent.click(existsOption);
      await waitFor(() => {
        expect(existsOption).toBeChecked();
      });
      expect(woofOption).not.toBeChecked();
      expect(barkOption).not.toBeChecked();
      expect(meowOption).not.toBeChecked();

      await userEvent.click(existsOption);
      await waitFor(() => {
        expect(existsOption).not.toBeChecked();
      });
    });
  });

  describe('field formatter', () => {
    const contextMock = getOptionsListContextMock();
    const mockedFormatter = jest
      .fn()
      .mockImplementation((value: string | number) => `formatted:${value}`);
    contextMock.componentApi.fieldFormatter = new BehaviorSubject(
      mockedFormatter as (value: string | number) => string
    );

    afterEach(() => {
      mockedFormatter.mockClear();
    });

    test('uses field formatter on suggestions', async () => {
      contextMock.componentApi.setAvailableOptions([
        { value: 1000, docCount: 1 },
        { value: 123456789, docCount: 4 },
      ]);
      contextMock.testOnlyMethods.setField({
        name: 'Test number field',
        type: 'number',
      } as DataViewField);
      const popover = mountComponent(contextMock);

      expect(mockedFormatter).toHaveBeenNthCalledWith(1, 1000);
      expect(mockedFormatter).toHaveBeenNthCalledWith(2, 123456789);
      const options = await popover.findAllByRole('option');
      expect(options[0].textContent).toEqual('Exists');
      expect(
        options[1].getElementsByClassName('euiSelectableListItem__text')[0].textContent
      ).toEqual('formatted:1000');
      expect(
        options[2].getElementsByClassName('euiSelectableListItem__text')[0].textContent
      ).toEqual('formatted:123456789');
    });

    test('converts string to number for date field', async () => {
      contextMock.componentApi.setAvailableOptions([
        { value: 1721283696000, docCount: 1 },
        { value: 1721295533000, docCount: 2 },
      ]);
      contextMock.testOnlyMethods.setField({
        name: 'Test date field',
        type: 'date',
      } as DataViewField);

      mountComponent(contextMock);
      expect(mockedFormatter).toHaveBeenNthCalledWith(1, 1721283696000);
      expect(mockedFormatter).toHaveBeenNthCalledWith(2, 1721295533000);
    });
  });

  describe('single select', () => {
    test('replace selection when singleSelect is true', async () => {
      const context = await getRealControlContext({
        uuid: 'test-control',
        overwriteState: { selected_options: ['woof', 'bark'], single_select: true },
      });
      const popover = mountComponent(context);

      expect(popover.getByTestId('optionsList-control-selection-woof')).toBeChecked();
      expect(popover.queryByTestId('optionsList-control-selection-bark')).not.toBeChecked();
      expect(popover.queryByTestId('optionsList-control-selection-meow')).not.toBeChecked();

      await userEvent.click(popover.getByTestId('optionsList-control-selection-bark'));

      expect(popover.getByTestId('optionsList-control-selection-woof')).not.toBeChecked();
      expect(popover.queryByTestId('optionsList-control-selection-bark')).toBeChecked();
      expect(popover.queryByTestId('optionsList-control-selection-meow')).not.toBeChecked();
    });
  });

  describe('advanced settings', () => {
    const ensureComponentIsHidden = async ({
      displaySettings,
      testSubject,
    }: {
      displaySettings: Partial<OptionsListDisplaySettings>;
      testSubject: string;
    }) => {
      const contextMock = getOptionsListContextMock();
      contextMock.displaySettings = displaySettings;
      const popover = mountComponent(contextMock);
      const test = popover.queryByTestId(testSubject);
      expect(test).toBeNull();
    };

    test('can hide exists option', async () => {
      ensureComponentIsHidden({
        displaySettings: { hide_exists: true },
        testSubject: 'optionsList-control-selection-exists',
      });
    });

    test('can hide include/exclude toggle', async () => {
      ensureComponentIsHidden({
        displaySettings: { hide_exclude: true },
        testSubject: 'optionsList__includeExcludeButtonGroup',
      });
    });

    test('can hide sorting button', async () => {
      ensureComponentIsHidden({
        displaySettings: { hide_sort: true },
        testSubject: 'optionsListControl__sortingOptionsButton',
      });
    });
  });
});
