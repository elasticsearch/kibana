/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import { BehaviorSubject } from 'rxjs';
import { getDataTableRecords, realHits } from '../../../../__fixtures__/real_hits';
import React from 'react';
import type { DiscoverSidebarResponsiveProps } from './discover_sidebar_responsive';
import { DiscoverSidebarResponsive } from './discover_sidebar_responsive';
import type { DiscoverServices } from '../../../../build_services';
import type { SidebarToggleState } from '../../../types';
import { FetchStatus } from '../../../types';
import type { DataDocuments$ } from '../../state_management/discover_data_state_container';
import { stubLogstashDataView } from '@kbn/data-plugin/common/stubs';
import {
  getDiscoverInternalStateMock,
  type InternalStateMockToolkit,
} from '../../../../__mocks__/discover_state.mock';
import * as ExistingFieldsServiceApi from '@kbn/unified-field-list/src/services/field_existing/load_field_existing';
import { resetExistingFieldsCache } from '@kbn/unified-field-list/src/hooks/use_existing_fields';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import type { AggregateQuery, Query } from '@kbn/es-query';
import { buildDataTableRecord } from '@kbn/discover-utils';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DiscoverCustomizationId } from '../../../../customizations/customization_service';
import type { SearchBarCustomization } from '../../../../customizations';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { UnifiedFieldListRestorableState } from '@kbn/unified-field-list';
import { internalStateActions } from '../../state_management/redux';
import { nextTick } from '@kbn/test-jest-helpers';

// There are some flaky tests in this file because they render a big DOM tree, which can take some time to run the tests.
const EXTENDED_TIMEOUT = 60_000;
jest.setTimeout(EXTENDED_TIMEOUT);

type TestWrapperProps = DiscoverSidebarResponsiveProps & { selectedDataView: DataView };

const mockSearchBarCustomization: SearchBarCustomization = {
  id: 'search_bar',
  CustomDataViewPicker: jest
    .fn(() => <div data-test-subj="custom-data-view-picker" />)
    .mockName('CustomDataViewPickerMock'),
};

let mockUseCustomizations = false;

jest.mock('../../../../customizations', () => ({
  ...jest.requireActual('../../../../customizations'),
  useDiscoverCustomization: jest.fn((id: DiscoverCustomizationId) => {
    if (!mockUseCustomizations) {
      return undefined;
    }

    switch (id) {
      case 'search_bar':
        return mockSearchBarCustomization;
      default:
        throw new Error(`Unknown customization id: ${id}`);
    }
  }),
}));

const mockGetRecommendedFieldsAccessor = jest.fn();

jest.mock('../../../../context_awareness/hooks/use_profile_accessor', () => ({
  useProfileAccessor: jest.fn((accessorId: string) => {
    if (accessorId === 'getRecommendedFields') {
      return mockGetRecommendedFieldsAccessor;
    }
    return jest.fn(() => ({}));
  }),
}));

jest.mock('lodash', () => {
  const original = jest.requireActual('lodash');

  return {
    ...original,
    debounce: (fn: unknown) => fn,
  };
});

jest.mock('@kbn/unified-field-list/src/services/field_stats', () => ({
  loadFieldStats: jest.fn().mockResolvedValue({
    totalDocuments: 1624,
    sampledDocuments: 1624,
    sampledValues: 3248,
    topValues: {
      buckets: [
        {
          count: 1349,
          key: 'gif',
        },
        {
          count: 1206,
          key: 'zip',
        },
        {
          count: 329,
          key: 'css',
        },
        {
          count: 164,
          key: 'js',
        },
        {
          count: 111,
          key: 'png',
        },
        {
          count: 89,
          key: 'jpg',
        },
      ],
    },
  }),
}));

function createMockServices() {
  const mockServices = {
    ...createDiscoverServicesMock(),
    capabilities: {
      visualize: {
        show: true,
      },
      discover: {
        save: false,
      },
      getState: () => ({
        query: { query: '', language: 'lucene' },
        filters: [],
      }),
    },
    docLinks: { links: { discover: { fieldTypeHelp: '' } } },
  } as unknown as DiscoverServices;
  return mockServices;
}

const mockfieldCounts: Record<string, number> = {};
const mockCalcFieldCounts = jest.fn(() => {
  return mockfieldCounts;
});

jest.mock('@kbn/discover-utils/src/utils/calc_field_counts', () => ({
  calcFieldCounts: () => mockCalcFieldCounts(),
}));

jest.spyOn(ExistingFieldsServiceApi, 'loadFieldExisting');

function getCompProps(options?: { hits?: DataTableRecord[] }): TestWrapperProps {
  const dataView = stubLogstashDataView;
  dataView.toSpec = jest.fn(() => ({}));

  const hits = options?.hits ?? getDataTableRecords(dataView);

  for (const hit of hits) {
    for (const key of Object.keys(hit.flattened)) {
      mockfieldCounts[key] = (mockfieldCounts[key] || 0) + 1;
    }
  }

  return {
    columns: ['extension'],
    documents$: new BehaviorSubject({
      fetchStatus: FetchStatus.COMPLETE,
      result: hits,
    }) as DataDocuments$,
    onChangeDataView: jest.fn(),
    onAddBreakdownField: jest.fn(),
    onAddFilter: jest.fn(),
    onAddField: jest.fn(),
    onRemoveField: jest.fn(),
    selectedDataView: dataView,
    trackUiMetric: jest.fn(),
    onFieldEdited: jest.fn(),
    onDataViewCreated: jest.fn(),
    sidebarToggleState$: new BehaviorSubject<SidebarToggleState>({
      isCollapsed: false,
      toggle: () => {},
    }),
  };
}

async function setupToolkit({
  query,
  hideSidebar,
  fieldListUiState,
  services,
}: {
  query?: Query | AggregateQuery;
  hideSidebar?: boolean;
  fieldListUiState?: Partial<UnifiedFieldListRestorableState>;
  services?: DiscoverServices;
}): Promise<InternalStateMockToolkit> {
  const toolkit = getDiscoverInternalStateMock({ services });
  await toolkit.initializeTabs();
  await toolkit.initializeSingleTab({ tabId: toolkit.getCurrentTab().id });

  toolkit.internalState.dispatch(
    toolkit.injectCurrentTab(internalStateActions.setAppState)({
      appState: {
        query: query ?? { query: '', language: 'lucene' },
        filters: [],
        hideSidebar,
      },
    })
  );
  if (fieldListUiState) {
    toolkit.internalState.dispatch(
      toolkit.injectCurrentTab(internalStateActions.setFieldListUiState)({
        fieldListUiState,
      })
    );
  }
  return toolkit;
}

async function renderComponent(
  props: TestWrapperProps,
  appStateParams: {
    query?: Query | AggregateQuery;
    hideSidebar?: boolean;
    fieldListUiState?: Partial<UnifiedFieldListRestorableState>;
  } = {},
  services?: DiscoverServices
) {
  const mockedServices = services ?? createMockServices();
  const toolkit = await setupToolkit({ ...appStateParams, services: mockedServices });

  mockedServices.data.dataViews.getIdsWithTitle = jest.fn(async () =>
    props.selectedDataView
      ? [{ id: props.selectedDataView.id!, title: props.selectedDataView.title! }]
      : []
  );
  mockedServices.data.dataViews.get = jest.fn().mockImplementation(async (id) => {
    return [props.selectedDataView].find((d) => d!.id === id);
  });
  mockedServices.data.query.getState = jest
    .fn()
    .mockImplementation(() => toolkit.getCurrentTab().appState);

  // Set the current data view in runtime state
  toolkit.internalState.dispatch(
    internalStateActions.setDataView({
      tabId: toolkit.getCurrentTab().id,
      dataView: props.selectedDataView,
    })
  );

  const user = userEvent.setup({
    pointerEventsCheck: PointerEventsCheckLevel.Never,
    skipHover: true,
  });
  const result = render(
    <DiscoverToolkitTestProvider toolkit={toolkit}>
      <DiscoverSidebarResponsive {...props} />
    </DiscoverToolkitTestProvider>
  );

  await act(async () => {
    await nextTick();
  });

  return {
    result,
    user,
  };
}

describe('discover responsive sidebar', function () {
  let props: TestWrapperProps;

  beforeEach(async () => {
    (ExistingFieldsServiceApi.loadFieldExisting as jest.Mock).mockImplementation(async () => ({
      indexPatternTitle: 'test',
      existingFieldNames: Object.keys(mockfieldCounts),
    }));
    props = getCompProps();
    mockUseCustomizations = false;

    // Setup default recommended fields mock
    mockGetRecommendedFieldsAccessor.mockImplementation(() => () => ({ recommendedFields: [] }));
  });

  afterEach(() => {
    mockCalcFieldCounts.mockClear();
    (ExistingFieldsServiceApi.loadFieldExisting as jest.Mock).mockClear();
    mockGetRecommendedFieldsAccessor.mockClear();
    resetExistingFieldsCache();
  });

  it('should have loading indicators during fields existence loading', async function () {
    let resolveFunction: (arg: unknown) => void;
    (ExistingFieldsServiceApi.loadFieldExisting as jest.Mock).mockReset();
    (ExistingFieldsServiceApi.loadFieldExisting as jest.Mock).mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFunction = resolve;
      });
    });

    const { result } = await renderComponent(
      {
        ...props,
        fieldListVariant: 'list-always',
      },
      {},
      undefined
    );

    expect(screen.getByTestId('fieldListGroupedAvailableFields-countLoading')).toBeInTheDocument();
    expect(screen.queryByTestId('fieldListGroupedAvailableFields-count')).not.toBeInTheDocument();

    expect(result.container.querySelector('.euiProgress')).not.toBeNull();

    resolveFunction!({
      indexPatternTitle: 'test-loaded',
      existingFieldNames: Object.keys(mockfieldCounts),
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('fieldListGroupedAvailableFields-countLoading')
      ).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toBeInTheDocument();
    expect(result.container.querySelector('.euiProgress')).toBeNull();

    expect(ExistingFieldsServiceApi.loadFieldExisting).toHaveBeenCalledTimes(1);
  });

  it('should have Selected Fields, Available Fields, Popular and Meta Fields sections', async function () {
    await renderComponent(props);

    expect(screen.getByTestId('fieldListGroupedSelectedFields-count')).toHaveTextContent('1');
    expect(screen.getByTestId('fieldListGroupedPopularFields-count')).toHaveTextContent('4');
    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('3');
    expect(screen.getByTestId('fieldListGroupedEmptyFields-count')).toHaveTextContent('20');
    expect(screen.getByTestId('fieldListGroupedMetaFields-count')).toHaveTextContent('2');
    expect(screen.queryByTestId('fieldListGroupedUnmappedFields-count')).not.toBeInTheDocument();
    expect(mockCalcFieldCounts.mock.calls.length).toBe(1);

    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '1 selected field. 4 popular fields. 3 available fields. 20 empty fields. 2 meta fields.'
    );

    expect(ExistingFieldsServiceApi.loadFieldExisting).toHaveBeenCalledTimes(1);
  });

  describe('when the input is not focused', () => {
    it('should set a11y attributes for the search input in the field list', async function () {
      await renderComponent(props);

      const a11yDescription = screen.getByTestId('fieldListGrouped__ariaDescription');
      expect(a11yDescription).toHaveAttribute('aria-live', 'off');
      expect(a11yDescription).toHaveTextContent(
        '1 selected field. 4 popular fields. 3 available fields. 20 empty fields. 2 meta fields.'
      );

      const searchInput = screen.getByTestId('fieldListFiltersFieldSearch');
      expect(searchInput).toHaveAttribute('aria-describedby', a11yDescription.id);
    });
  });

  describe('when the input is focused', () => {
    it('should set a11y attributes for the search input in the field list', async function () {
      const { user } = await renderComponent(props);
      const searchInput = screen.getByTestId('fieldListFiltersFieldSearch');
      const a11yDescription = screen.getByTestId('fieldListGrouped__ariaDescription');
      await user.click(searchInput);
      expect(searchInput).toHaveAttribute('aria-describedby', a11yDescription.id);

      expect(a11yDescription).toHaveAttribute('aria-live', 'polite');
      expect(a11yDescription).toHaveTextContent(
        '1 selected field. 4 popular fields. 3 available fields. 20 empty fields. 2 meta fields.'
      );
    });
  });

  it('should not have selected fields if no columns selected', async function () {
    const propsWithoutColumns = {
      ...props,
      columns: [],
    };
    await renderComponent(propsWithoutColumns);

    expect(screen.queryByTestId('fieldListGroupedSelectedFields-count')).not.toBeInTheDocument();
    expect(screen.getByTestId('fieldListGroupedPopularFields-count')).toHaveTextContent('4');
    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('3');
    expect(screen.getByTestId('fieldListGroupedEmptyFields-count')).toHaveTextContent('20');
    expect(screen.getByTestId('fieldListGroupedMetaFields-count')).toHaveTextContent('2');
    expect(screen.queryByTestId('fieldListGroupedUnmappedFields-count')).not.toBeInTheDocument();

    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '4 popular fields. 3 available fields. 20 empty fields. 2 meta fields.'
    );
  });

  it('should not calculate counts if documents are not fetched yet', async function () {
    const propsWithoutDocuments: TestWrapperProps = {
      ...props,
      documents$: new BehaviorSubject({
        fetchStatus: FetchStatus.UNINITIALIZED,
        result: undefined,
      }) as DataDocuments$,
    };
    await renderComponent(propsWithoutDocuments, {}, undefined);
    expect(screen.queryByTestId('fieldListGroupedAvailableFields-count')).not.toBeInTheDocument();

    expect(mockCalcFieldCounts.mock.calls.length).toBe(0);
    expect(ExistingFieldsServiceApi.loadFieldExisting).not.toHaveBeenCalled();
  });

  it('should allow adding breakdown field', async function () {
    const { user } = await renderComponent(props);
    const availableFields = screen.getByTestId('fieldListGroupedAvailableFields');
    await user.click(within(availableFields).getByTestId('field-extension-showDetails'));
    const addBreakdownButton = await screen.findByTestId(
      'fieldPopoverHeader_addBreakdownField-extension'
    );
    await user.click(addBreakdownButton);
    expect(props.onAddBreakdownField).toHaveBeenCalled();
  });
  it('should allow selecting fields', async function () {
    const { user } = await renderComponent(props);
    const availableFields = screen.getByTestId('fieldListGroupedAvailableFields');
    await user.click(within(availableFields).getByTestId('fieldToggle-bytes'));
    expect(props.onAddField).toHaveBeenCalledWith('bytes');
  });
  it('should allow deselecting fields', async function () {
    const { user } = await renderComponent(props);
    const selectedFields = screen.getByTestId('fieldListGroupedSelectedFields');
    await user.click(within(selectedFields).getByTestId('fieldToggle-extension'));
    expect(props.onRemoveField).toHaveBeenCalledWith('extension');
  });
  it('should allow adding filters', async function () {
    const { user } = await renderComponent(props);
    const availableFields = screen.getByTestId('fieldListGroupedAvailableFields');
    await user.click(within(availableFields).getByTestId('field-extension-showDetails'));
    await user.click(await screen.findByTestId('plus-extension-gif'));
    expect(props.onAddFilter).toHaveBeenCalled();
  });
  it('should allow adding "exist" filter', async function () {
    const { user } = await renderComponent(props);
    const availableFields = screen.getByTestId('fieldListGroupedAvailableFields');
    await user.click(within(availableFields).getByTestId('field-extension-showDetails'));
    await user.click(await screen.findByTestId('discoverFieldListPanelAddExistFilter-extension'));
    expect(props.onAddFilter).toHaveBeenCalledWith('_exists_', 'extension', '+');
  });

  it('should allow searching by string, and calcFieldCount should just be executed once', async function () {
    const { user } = await renderComponent(props);

    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('3');
    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '1 selected field. 4 popular fields. 3 available fields. 20 empty fields. 2 meta fields.'
    );

    const input = screen.getByTestId('fieldListFiltersFieldSearch');
    await user.clear(input);
    await user.type(input, 'byte');

    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('1');
    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '1 popular field. 1 available field. 0 meta fields.'
    );
    expect(mockCalcFieldCounts.mock.calls.length).toBe(1);
  });

  it('should allow filtering by field type', async function () {
    const { user } = await renderComponent(props);

    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('3');
    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '1 selected field. 4 popular fields. 3 available fields. 20 empty fields. 2 meta fields.'
    );

    await user.click(screen.getByTestId('fieldListFiltersFieldTypeFilterToggle'));
    await user.click(await screen.findByTestId('typeFilter-number'));

    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('2');
    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '1 popular field. 2 available fields. 1 empty field. 0 meta fields.'
    );

    expect(mockCalcFieldCounts.mock.calls.length).toBe(1);
  });

  it('should restore sidebar state after switching tabs', async function () {
    await renderComponent(props, {
      fieldListUiState: {
        nameFilter: 'byte',
        selectedFieldTypes: ['number'],
        pageSize: 10,
        scrollTop: 0,
        accordionState: {},
      },
    });

    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('1');
    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '1 popular field. 1 available field. 0 meta fields.'
    );

    expect(screen.getByTestId('fieldListFiltersFieldSearch')).toHaveValue('byte');
  });

  it('should restore collapsed state state after switching tabs', async function () {
    const { result: collapsedRender } = await renderComponent(
      props,
      {
        hideSidebar: true,
      },
      undefined
    );

    expect(screen.queryByTestId('fieldList')).not.toBeInTheDocument();

    collapsedRender.unmount();

    const { result: expandedRender } = await renderComponent(
      props,
      {
        hideSidebar: false,
      },
      undefined
    );

    await screen.findByTestId('fieldList');

    expect(screen.getByTestId('fieldList')).toBeInTheDocument();

    expandedRender.unmount();
  });

  it('should show "Add a field" button to create a runtime field', async () => {
    const services = createMockServices();
    await renderComponent(props, {}, services);
    expect(services.dataViewEditor.userPermissions.editDataView).toHaveBeenCalled();
    expect(screen.getAllByTestId('dataView-add-field_btn')).toHaveLength(1);
  });

  it('should render correctly in the ES|QL mode', async () => {
    const propsWithEsqlMode = {
      ...props,
      columns: ['extension', 'bytes'],
      onAddFilter: undefined,
      documents$: new BehaviorSubject({
        fetchStatus: FetchStatus.COMPLETE,
        result: getDataTableRecords(stubLogstashDataView),
        esqlQueryColumns: [
          { id: '1', name: 'extension', meta: { type: 'text' } },
          { id: '2', name: 'bytes', meta: { type: 'number' } },
          { id: '3', name: '@timestamp', meta: { type: 'date' } },
        ],
      }) as DataDocuments$,
    };
    await renderComponent(
      propsWithEsqlMode,
      {
        query: { esql: 'FROM `index`' },
      },
      undefined
    );

    expect(screen.queryAllByTestId('indexPattern-add-field_btn')).toHaveLength(0);

    expect(screen.getByTestId('fieldListGroupedSelectedFields-count')).toHaveTextContent('2');
    expect(screen.queryByTestId('fieldListGroupedPopularFields-count')).not.toBeInTheDocument();
    expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('3');
    expect(screen.queryByTestId('fieldListGroupedEmptyFields-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fieldListGroupedMetaFields-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('fieldListGroupedUnmappedFields-count')).not.toBeInTheDocument();

    expect(mockCalcFieldCounts.mock.calls.length).toBe(0);

    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '2 selected fields. 3 available fields.'
    );
  });

  it('should render correctly unmapped fields', async () => {
    const propsWithUnmappedField = getCompProps({
      hits: [
        buildDataTableRecord(realHits[0], stubLogstashDataView),
        buildDataTableRecord(
          {
            _index: 'logstash-2014.09.09',
            _id: '1945',
            _score: 1,
            _source: {
              extension: 'gif',
              bytes: 10617.2,
              test_unmapped: 'show me too',
            },
          },
          stubLogstashDataView
        ),
      ],
    });
    await renderComponent(propsWithUnmappedField);

    expect(screen.getByTestId('fieldListGrouped__ariaDescription')).toHaveTextContent(
      '1 selected field. 4 popular fields. 3 available fields. 1 unmapped field. 20 empty fields. 2 meta fields.'
    );
  });

  it('should not show "Add a field" button in viewer mode', async () => {
    const services = createMockServices();
    services.dataViewFieldEditor.userPermissions.editIndexPattern = jest.fn(() => false);
    await renderComponent(props, {}, services);
    expect(services.dataViewEditor.userPermissions.editDataView).toHaveBeenCalled();
    expect(screen.queryAllByTestId('dataView-add-field_btn')).toHaveLength(0);
  });

  it('should hide field list if documents status is not initialized', async function () {
    await renderComponent(
      {
        ...props,
        documents$: new BehaviorSubject({
          fetchStatus: FetchStatus.UNINITIALIZED,
        }) as DataDocuments$,
      },
      {},
      undefined
    );
    expect(screen.queryByTestId('fieldListGroupedFieldGroups')).not.toBeInTheDocument();
  });

  it('should render "Add a field" button', async () => {
    const services = createMockServices();
    const { user } = await renderComponent(
      {
        ...props,
        fieldListVariant: 'list-always',
      },
      {},
      services
    );
    const addFieldButton = screen.getByTestId('dataView-add-field_btn');
    await user.click(addFieldButton);
    expect(services.dataViewFieldEditor.openEditor).toHaveBeenCalledTimes(1);
  });

  it('should render "Edit field" button', async () => {
    const services = createMockServices();
    const { user } = await renderComponent(props, {}, services);
    const availableFields = screen.getByTestId('fieldListGroupedAvailableFields');
    await user.click(within(availableFields).getByTestId('field-bytes'));
    const editFieldButton = await screen.findByTestId('discoverFieldListPanelEdit-bytes');
    await user.click(editFieldButton);
    expect(services.dataViewFieldEditor.openEditor).toHaveBeenCalledTimes(1);
  });

  it('should not render Add/Edit field buttons in viewer mode', async () => {
    const services = createMockServices();
    services.dataViewFieldEditor.userPermissions.editIndexPattern = jest.fn(() => false);
    const { user } = await renderComponent(props, {}, services);
    expect(screen.queryAllByTestId('dataView-add-field_btn')).toHaveLength(0);
    const availableFields = screen.getByTestId('fieldListGroupedAvailableFields');
    await user.click(within(availableFields).getByTestId('field-bytes'));
    expect(screen.queryByTestId('discoverFieldListPanelEdit-bytes')).not.toBeInTheDocument();
    expect(services.dataViewEditor.userPermissions.editDataView).toHaveBeenCalled();
  });

  it('should render buttons in data view picker correctly', async () => {
    const services = createMockServices();
    const propsWithPicker: TestWrapperProps = {
      ...props,
      fieldListVariant: 'button-and-flyout-always',
      documents$: new BehaviorSubject({
        fetchStatus: FetchStatus.UNINITIALIZED,
      }) as DataDocuments$,
    };
    const { user } = await renderComponent(propsWithPicker, {}, services);
    // open flyout
    await user.click(screen.getByTestId('discover-sidebar-fields-button'));

    // open data view picker
    await user.click(await screen.findByTestId('dataView-switch-link'));
    expect(await screen.findByTestId('changeDataViewPopover')).toBeInTheDocument();

    // check "Add a field"
    expect(screen.getAllByTestId('indexPattern-add-field')).toHaveLength(1);

    // click "Create a data view"
    const createDataViewButton = screen.getByTestId('dataview-create-new');
    await user.click(createDataViewButton);
    expect(services.dataViewEditor.openEditor).toHaveBeenCalled();
  });

  it('should not render buttons in data view picker when in viewer mode', async () => {
    const services = createMockServices();
    services.dataViewEditor.userPermissions.editDataView = jest.fn(() => false);
    services.dataViewFieldEditor.userPermissions.editIndexPattern = jest.fn(() => false);
    const propsWithPicker: TestWrapperProps = {
      ...props,
      fieldListVariant: 'button-and-flyout-always',
      documents$: new BehaviorSubject({
        fetchStatus: FetchStatus.UNINITIALIZED,
      }) as DataDocuments$,
    };
    const { user } = await renderComponent(propsWithPicker, {}, services);
    // open flyout
    await user.click(screen.getByTestId('discover-sidebar-fields-button'));

    // open data view picker
    await user.click(await screen.findByTestId('dataView-switch-link'));
    expect(await screen.findByTestId('changeDataViewPopover')).toBeInTheDocument();

    // check that buttons are not present
    expect(screen.queryAllByTestId('dataView-add-field')).toHaveLength(0);
    expect(screen.queryAllByTestId('dataview-create-new')).toHaveLength(0);
  });

  describe('search bar customization', () => {
    it('should not render CustomDataViewPicker', async () => {
      mockUseCustomizations = false;
      const { user } = await renderComponent(
        {
          ...props,
          fieldListVariant: 'button-and-flyout-always',
          documents$: new BehaviorSubject({
            fetchStatus: FetchStatus.UNINITIALIZED,
          }) as DataDocuments$,
        },
        {},
        undefined
      );

      await user.click(screen.getByTestId('discover-sidebar-fields-button'));

      expect(screen.queryByTestId('custom-data-view-picker')).not.toBeInTheDocument();
    });

    it('should render CustomDataViewPicker', async () => {
      mockUseCustomizations = true;
      const { user } = await renderComponent(
        {
          ...props,
          fieldListVariant: 'button-and-flyout-always',
          documents$: new BehaviorSubject({
            fetchStatus: FetchStatus.UNINITIALIZED,
          }) as DataDocuments$,
        },
        {},
        undefined
      );

      await user.click(screen.getByTestId('discover-sidebar-fields-button'));

      expect(await screen.findByTestId('custom-data-view-picker')).toBeInTheDocument();
    });

    it('should sync sidebar toggle state', async function () {
      const expandedSidebarToggleState$ = new BehaviorSubject<SidebarToggleState>({
        isCollapsed: true,
        toggle: () => {},
      });

      const { result: expandedRender } = await renderComponent({
        ...props,
        sidebarToggleState$: expandedSidebarToggleState$,
      });

      await waitFor(() => {
        expect(expandedSidebarToggleState$.value.isCollapsed).toBe(false);
        expect(expandedSidebarToggleState$.value.toggle).toBeDefined();
      });

      expandedRender.unmount();

      const collapsedSidebarToggleState$ = new BehaviorSubject<SidebarToggleState>({
        isCollapsed: false,
        toggle: () => {},
      });

      await renderComponent(
        {
          ...props,
          sidebarToggleState$: collapsedSidebarToggleState$,
        },
        {
          hideSidebar: true,
        }
      );

      await waitFor(() => {
        expect(collapsedSidebarToggleState$.value.isCollapsed).toBe(true);
        expect(collapsedSidebarToggleState$.value.toggle).toBeDefined();
      });
    });
  });

  describe('recommended fields', () => {
    it('should call getRecommendedFieldsAccessor on component mount', async () => {
      await renderComponent({
        ...props,
        documents$: new BehaviorSubject({
          fetchStatus: FetchStatus.UNINITIALIZED,
        }) as DataDocuments$,
      });

      expect(mockGetRecommendedFieldsAccessor).toHaveBeenCalled();
    });

    it('should use profile accessor to get recommended fields', async () => {
      const mockRecommendedFields = [
        { name: 'service.name', type: 'keyword' },
        { name: 'host.name', type: 'keyword' },
      ];
      const mockAccessorFn = jest.fn(() => ({ recommendedFields: mockRecommendedFields }));
      mockGetRecommendedFieldsAccessor.mockImplementation(() => mockAccessorFn);

      await renderComponent({
        ...props,
        documents$: new BehaviorSubject({
          fetchStatus: FetchStatus.UNINITIALIZED,
        }) as DataDocuments$,
      });

      expect(mockGetRecommendedFieldsAccessor).toHaveBeenCalled();
      expect(mockAccessorFn).toHaveBeenCalled();
    });

    it('should use fallback function when profile accessor returns fallback', async () => {
      mockGetRecommendedFieldsAccessor.mockImplementation((fallback) => {
        expect(typeof fallback).toBe('function');
        return fallback;
      });

      await renderComponent({
        ...props,
        documents$: new BehaviorSubject({
          fetchStatus: FetchStatus.UNINITIALIZED,
        }) as DataDocuments$,
      });

      expect(mockGetRecommendedFieldsAccessor).toHaveBeenCalled();
      // Verify the fallback function was called with the expected structure
      const fallbackCall = mockGetRecommendedFieldsAccessor.mock.calls[0];
      expect(typeof fallbackCall[0]).toBe('function');
      expect(fallbackCall[0]()).toEqual({ recommendedFields: [] });
    });
  });
});
