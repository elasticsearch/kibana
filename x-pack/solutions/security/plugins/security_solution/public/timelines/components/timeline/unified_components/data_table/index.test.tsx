/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createMockStore, mockTimelineData, TestProviders } from '../../../../../common/mock';
import type { ComponentProps } from 'react';
import React from 'react';
import { TimelineDataTable } from '.';
import { TimelineId, TimelineTabs } from '../../../../../../common/types';
import { DataLoadingState } from '@kbn/unified-data-table';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { DataView } from '@kbn/data-views-plugin/common';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { getColumnHeaders } from '../../body/column_headers/helpers';
import {
  mockBrowserFieldsWithId,
  mockDataViewSpec,
} from '../../../../../data_view_manager/mocks/timeline_data_view';
import * as timelineActions from '../../../../store/actions';
import { defaultUdtHeaders } from '../../body/column_headers/default_headers';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import { useIsNewFlyoutEnabled } from '../../../../../common/hooks/use_is_new_flyout_enabled';
import { useFlyoutApi } from '../../../../../flyout_v2/use_flyout_api';
import { createFlyoutApiMock } from '../../../../../flyout_v2/use_flyout_api.mock';
import { PageScope } from '../../../../../data_view_manager/constants';
import { SECURITY_CELL_ACTIONS_DETAILS_FLYOUT } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { useOpenFlyout } from '../../../../../flyout_v2/shared/hooks/use_open_flyout';

jest.mock('../../../../../common/hooks/use_is_new_flyout_enabled', () => ({
  useIsNewFlyoutEnabled: jest.fn().mockReturnValue(false),
}));
jest.mock('../../../../../flyout_v2/use_flyout_api');
jest.mock('../../../../../flyout_v2/shared/hooks/use_open_flyout');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: jest.fn(() => ({
    pathname: '',
    search: '',
  })),
}));

const onFieldEditedMock = jest.fn();
const refetchMock = jest.fn();
const onFetchMoreRecordsMock = jest.fn();

const openFlyoutMock = jest.fn();
const mockOpenSystemFlyout = jest.fn();
const mockUiSettingsGet = jest.fn().mockReturnValue(false);
const mockPaginatedDocumentFlyout = jest.fn((_props?: unknown) => (
  <div>{'MockPaginatedDocumentFlyout'}</div>
));

const updateSampleSizeSpy = jest.spyOn(timelineActions, 'updateSampleSize');

jest.mock('@kbn/expandable-flyout');
jest.mock('../../../../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../../../flyout_v2/document/pagination/paginated_document_flyout', () => ({
  PaginatedDocumentFlyout: (props: unknown) => mockPaginatedDocumentFlyout(props),
}));
jest.mock('../../../../../common/lib/kibana', () => {
  const original = jest.requireActual('../../../../../common/lib/kibana');

  return {
    ...original,
    useKibana: () => ({
      ...original.useKibana(),
      services: {
        ...original.useKibana().services,
        overlays: {
          ...original.useKibana().services.overlays,
          openSystemFlyout: mockOpenSystemFlyout,
        },
        uiSettings: {
          ...original.useKibana().services.uiSettings,
          get: mockUiSettingsGet,
        },
      },
    }),
  };
});

const initialEnrichedColumns = getColumnHeaders(defaultUdtHeaders, mockBrowserFieldsWithId);

const initialEnrichedColumnsIds = initialEnrichedColumns.map((c) => c.id);
const mockAttackTimelineData = [
  {
    ...mockTimelineData[0],
    _id: 'attack-1',
    data: [
      ...mockTimelineData[0].data,
      { field: 'kibana.alert.attack_discovery.alert_ids', value: ['alert-1'] },
      { field: 'kibana.alert.rule.rule_type_id', value: ['attack-discovery'] },
    ],
    ecs: {
      ...mockTimelineData[0].ecs,
      _index: 'attack-index',
    },
  },
];

type TestComponentProps = Partial<ComponentProps<typeof TimelineDataTable>> & {
  store?: ReturnType<typeof createMockStore>;
};

// These tests can take more than standard timeout of 5s
// that is why we are setting it to 10s
const SPECIAL_TEST_TIMEOUT = 50000;

const mockDataView = new DataView({
  spec: mockDataViewSpec,
  fieldFormats: fieldFormatsMock,
});

const TestComponent = (props: TestComponentProps) => {
  const { store = createMockStore(), ...restProps } = props;
  return (
    <TestProviders store={store}>
      <TimelineDataTable
        columns={initialEnrichedColumns}
        columnIds={initialEnrichedColumnsIds}
        dataView={mockDataView}
        activeTab={TimelineTabs.query}
        timelineId={TimelineId.test}
        itemsPerPage={50}
        itemsPerPageOptions={[10, 25, 50, 100]}
        rowRenderers={[]}
        leadingControlColumns={[]}
        sort={[['@timestamp', 'desc']]}
        events={mockTimelineData}
        onFieldEdited={onFieldEditedMock}
        refetch={refetchMock}
        dataLoadingState={DataLoadingState.loaded}
        totalCount={mockTimelineData.length}
        onFetchMoreRecords={onFetchMoreRecordsMock}
        updatedAt={Date.now()}
        onSetColumns={jest.fn()}
        onFilter={jest.fn()}
        {...restProps}
      />
    </TestProviders>
  );
};

const getTimelineFromStore = (
  store: ReturnType<typeof createMockStore>,
  timelineId: string = TimelineId.test
) => {
  return store.getState().timeline.timelineById[timelineId];
};

describe('unified data table', () => {
  let flyoutApi: ReturnType<typeof createFlyoutApiMock>;

  beforeEach(() => {
    (useExpandableFlyoutApi as jest.Mock).mockReturnValue({
      openFlyout: openFlyoutMock,
      closeFlyout: jest.fn(),
    });
    mockUiSettingsGet.mockReturnValue(false);
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(false);
    flyoutApi = createFlyoutApiMock();
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    jest
      .mocked(useOpenFlyout)
      .mockReturnValue(mockOpenSystemFlyout.mockReturnValue({ close: jest.fn() }));
  });
  afterEach(() => {
    updateSampleSizeSpy.mockClear();
    jest.clearAllMocks();
  });

  it(
    'should display unified data table',
    async () => {
      render(<TestComponent />);
      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();
    },
    SPECIAL_TEST_TIMEOUT
  );

  it(
    'opens attack flyout when expanded row is an attack discovery alert',
    async () => {
      render(<TestComponent events={mockAttackTimelineData} />);
      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      fireEvent.click(screen.getByTestId('docTableExpandToggleColumn'));

      await waitFor(() => {
        expect(openFlyoutMock).toHaveBeenCalledWith({
          right: {
            id: 'attack-details-right',
            params: {
              attackId: 'attack-1',
              indexName: 'attack-index',
            },
          },
        });
      });
    },
    SPECIAL_TEST_TIMEOUT
  );

  it(
    'opens the paginated timeline document flyout when enableNewFlyout setting is enabled and row is not an attack',
    async () => {
      jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

      render(<TestComponent />);
      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      fireEvent.click(screen.getAllByTestId('docTableExpandToggleColumn')[0]);

      // openSystemFlyout receives the element but does not render it in tests,
      // so verify the props on the element passed to the system flyout instead.
      await waitFor(() => {
        expect(mockOpenSystemFlyout).toHaveBeenCalled();
      });

      // element is the PaginationStoreProvider wrapper around PaginatedDocumentFlyout
      const element = mockOpenSystemFlyout.mock.calls[0][0] as React.ReactElement;
      expect(element.props.value).toMatchObject({
        subscribe: expect.any(Function),
        getSnapshot: expect.any(Function),
        setState: expect.any(Function),
      });
      expect(element.props.children.props.onAlertUpdated).toBe(refetchMock);

      expect(flyoutApi.openDocumentFlyoutFromIndex).not.toHaveBeenCalled();
      expect(mockPaginatedDocumentFlyout).not.toHaveBeenCalled();
    },
    SPECIAL_TEST_TIMEOUT
  );

  it(
    'resolves the paginated document index from the row rather than its ECS fields',
    async () => {
      jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

      // The row carries a concrete `_index`, while ECS — which is optional and often
      // absent — does not. `DocumentFlyoutWrapper` skips the search on a null index, so
      // resolving from ECS would leave the flyout stuck on its loading state.
      const eventWithoutEcsIndex = [
        {
          ...mockTimelineData[0],
          _index: 'timeline-index',
          ecs: { ...mockTimelineData[0].ecs, _index: undefined },
        },
      ];

      render(<TestComponent events={eventWithoutEcsIndex} totalCount={1} />);
      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      fireEvent.click(screen.getAllByTestId('docTableExpandToggleColumn')[0]);

      await waitFor(() => {
        expect(mockOpenSystemFlyout).toHaveBeenCalled();
      });

      const element = mockOpenSystemFlyout.mock.calls[0][0] as React.ReactElement;
      expect(element.props.value.getSnapshot()).toMatchObject({
        flyoutDocumentId: mockTimelineData[0]._id,
        flyoutDocumentIndexName: 'timeline-index',
      });
    },
    SPECIAL_TEST_TIMEOUT
  );

  it(
    'updates the expanded row icon when the document flyout paginates',
    async () => {
      jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

      render(<TestComponent />);
      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      const expandButtons = screen.getAllByTestId('docTableExpandToggleColumn');
      fireEvent.click(expandButtons[0]);

      await waitFor(() => {
        expect(expandButtons[0].firstChild).toHaveAttribute('data-euiicon-type', 'minimize');
      });

      const flyoutBody = mockOpenSystemFlyout.mock.calls[0][0] as React.ReactElement;

      act(() => {
        flyoutBody.props.value.getSnapshot().openDocumentFlyoutImpl?.(1);
      });

      await waitFor(() => {
        expect(expandButtons[0].firstChild).toHaveAttribute('data-euiicon-type', 'maximize');
        expect(expandButtons[1].firstChild).toHaveAttribute('data-euiicon-type', 'minimize');
      });
    },
    SPECIAL_TEST_TIMEOUT
  );

  it(
    'opens the new document flyout with a cell-action renderer bound to the timeline scope',
    async () => {
      jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

      render(<TestComponent />);
      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      fireEvent.click(screen.getAllByTestId('docTableExpandToggleColumn')[0]);

      await waitFor(() => {
        expect(mockOpenSystemFlyout).toHaveBeenCalled();
      });

      // element is the PaginationStoreProvider; PaginatedDocumentFlyout is its children
      const flyoutBody = mockOpenSystemFlyout.mock.calls[0][0] as React.ReactElement;
      const { renderCellActions } = flyoutBody.props.children.props;

      // Even when a cell passes an empty scopeId, the bound timeline scope must win so Filter
      // In/Out target the timeline's own filter manager instead of the page behind it.
      const cellAction = renderCellActions?.({
        field: 'host.name',
        value: ['host-1'],
        scopeId: '',
        children: null,
      }) as React.ReactElement;

      expect(cellAction.props.metadata).toEqual({ scopeId: TimelineId.test });
      expect(cellAction.props.sourcererScopeId).toEqual(PageScope.timeline);
      // The details-flyout trigger is required so the "Toggle column in table" action (only
      // registered on that trigger) is available on Timeline alert/event fields in the new flyout.
      expect(cellAction.props.triggerId).toEqual(SECURITY_CELL_ACTIONS_DETAILS_FLYOUT);
      expect(cellAction.props.visibleCellActions).toEqual(6);
    },
    SPECIAL_TEST_TIMEOUT
  );

  it(
    'opens the new attack flyout when enableNewFlyout setting is enabled and row is an attack discovery alert',
    async () => {
      jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

      render(<TestComponent events={mockAttackTimelineData} />);
      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      fireEvent.click(screen.getByTestId('docTableExpandToggleColumn'));

      await waitFor(() => {
        expect(flyoutApi.openAttackFlyout).toHaveBeenCalledWith(
          expect.objectContaining({
            attackId: 'attack-1',
            indexName: 'attack-index',
          })
        );
      });

      // attack rows no longer go through the inline system flyout or the document flyout api
      expect(mockOpenSystemFlyout).not.toHaveBeenCalled();
      expect(mockPaginatedDocumentFlyout).not.toHaveBeenCalled();
    },
    SPECIAL_TEST_TIMEOUT
  );

  describe('custom cell rendering based on data Type', () => {
    it(
      'should render source.ip as link',
      async () => {
        const eventsWithSourceIp = mockTimelineData.filter(
          (event) => event.ecs?.source?.ip?.length ?? -1 > 0
        );

        const { container } = render(<TestComponent events={eventsWithSourceIp} />);

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        const sourceIpCell = container.querySelector(
          '[data-gridcell-column-id="source.ip"][data-test-subj="dataGridRowCell"]'
        ) as HTMLElement;

        expect(sourceIpCell).toBeVisible();

        expect(within(sourceIpCell).getByTestId('network-details')).toHaveClass('euiLink');
      },
      SPECIAL_TEST_TIMEOUT
    );
    it(
      'should render destination.ip as link',
      async () => {
        const eventsWithDestIp = mockTimelineData.filter(
          (event) => event.ecs?.destination?.ip?.length ?? -1 > 0
        );

        const { container } = render(<TestComponent events={eventsWithDestIp} />);

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        const destIpCell = container.querySelector(
          '[data-gridcell-column-id="destination.ip"][data-test-subj="dataGridRowCell"]'
        ) as HTMLElement;

        expect(destIpCell).toBeVisible();

        expect(within(destIpCell).getByTestId('network-details')).toHaveClass('euiLink');
      },
      SPECIAL_TEST_TIMEOUT
    );
    it(
      'should render host.name as link',
      async () => {
        const hostTestId = 'host-details-button';
        const eventsWithHostName = mockTimelineData.filter(
          (event) => event.ecs?.host?.name?.length ?? -1 > 0
        );

        const { container } = render(<TestComponent events={eventsWithHostName} />);

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        const hostNameCell = container.querySelector(
          '[data-gridcell-column-id="host.name"][data-test-subj="dataGridRowCell"]'
        ) as HTMLElement;

        expect(hostNameCell).toBeVisible();

        expect(within(hostNameCell).getByTestId(hostTestId)).toHaveClass('euiLink');
      },
      SPECIAL_TEST_TIMEOUT
    );
    it(
      'should render user.name as link',
      async () => {
        const userTestId = 'users-link-anchor';
        const eventsWithUserName = mockTimelineData.filter(
          (event) => event.ecs?.user?.name?.length ?? -1 > 0
        );

        const { container } = render(<TestComponent events={eventsWithUserName} />);

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        const userNameCell = container.querySelector(
          '[data-gridcell-column-id="user.name"][data-test-subj="dataGridRowCell"]'
        ) as HTMLElement;

        expect(userNameCell).toBeVisible();

        expect(within(userNameCell).getByTestId(userTestId)).toHaveClass('euiLink');
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  it(
    'should update sample size correctly',
    async () => {
      render(<TestComponent />);

      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      const toolbarSettings = screen.getByTestId('dataGridDisplaySelectorButton');

      fireEvent.click(toolbarSettings);

      await waitFor(() => {
        expect(screen.getAllByTestId('unifiedDataTableSampleSizeInput')[0]).toBeVisible();
      });

      fireEvent.change(screen.getAllByTestId('unifiedDataTableSampleSizeInput')[0], {
        target: { value: '10' },
      });

      updateSampleSizeSpy.mockClear();

      await waitFor(() => {
        expect(updateSampleSizeSpy).toHaveBeenCalledTimes(1);
        expect(updateSampleSizeSpy).toHaveBeenCalledWith({ id: TimelineId.test, sampleSize: 10 });
      });
    },
    SPECIAL_TEST_TIMEOUT
  );

  it(
    'should update row Height correctly',
    async () => {
      const rowHeight = {
        initial: 2,
        new: 4,
      };
      const customMockStore = createMockStore();

      customMockStore.dispatch(
        timelineActions.updateRowHeight({
          id: TimelineId.test,
          rowHeight: rowHeight.initial,
        })
      );

      render(
        <TestComponent store={customMockStore} events={[mockTimelineData[0]]} totalCount={1} />
      );

      expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

      const toolbarSettings = screen.getByTestId('dataGridDisplaySelectorButton');

      fireEvent.click(toolbarSettings);

      await waitFor(() => {
        expect(
          screen.getAllByTestId('unifiedDataTableRowHeightSettings_lineCountNumber')[0]
        ).toBeVisible();
      });
      expect(
        screen.getAllByTestId('unifiedDataTableRowHeightSettings_lineCountNumber')[0]
      ).toHaveValue(rowHeight.initial);

      fireEvent.change(
        screen.getAllByTestId('unifiedDataTableRowHeightSettings_lineCountNumber')[0],
        {
          target: { value: rowHeight.new },
        }
      );

      await waitFor(() => {
        expect(getTimelineFromStore(customMockStore)?.rowHeight).toEqual(rowHeight.new);
      });
    },
    SPECIAL_TEST_TIMEOUT
  );

  describe('pagination', () => {
    // change the number of items per page
    it(
      'should change the number of items per page',
      async () => {
        const customMockStore = createMockStore();
        render(<TestComponent store={customMockStore} />);
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();
        // make sure that items per page is as per the props passed above
        expect(screen.getByTestId('tablePaginationPopoverButton')).toHaveTextContent(
          `Rows per page: 50`
        );
        fireEvent.click(screen.getByTestId('tablePaginationPopoverButton'));
        fireEvent.click(screen.getByTestId(`tablePagination-25-rows`));
        await waitFor(() => {
          expect(getTimelineFromStore(customMockStore)?.itemsPerPage).toEqual(25);
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should be able to load more records once user have seen all the records loaded according to sample size',
      async () => {
        const customMockStore = createMockStore();
        customMockStore.dispatch(
          timelineActions.updateSampleSize({
            id: TimelineId.test,
            sampleSize: 10,
          })
        );
        render(
          <TestComponent
            store={customMockStore}
            itemsPerPage={25}
            events={structuredClone(mockTimelineData).slice(0, 10)}
          />
        );
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();
        expect(screen.getByTestId('dscGridSampleSizeFetchMoreLink')).toBeVisible();
        fireEvent.click(screen.getByTestId('dscGridSampleSizeFetchMoreLink'));
        await waitFor(() => {
          expect(onFetchMoreRecordsMock).toHaveBeenCalledTimes(1);
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });
});
