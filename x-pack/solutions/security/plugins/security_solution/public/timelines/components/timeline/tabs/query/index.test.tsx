/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComponentProps, FunctionComponent } from 'react';
import React, { useEffect } from 'react';
import QueryTabContent from '.';
import { defaultRowRenderers } from '../../body/renderers';
import { TimelineId } from '../../../../../../common/types/timeline';
import { useTimelineEventsDetails } from '../../../../containers/details';
import { mockSourcererScope } from '../../../../../sourcerer/containers/mocks';
import { ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/elastic-assistant-common';
import { ALERT_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import { DataLoadingState } from '@kbn/unified-data-table';
import {
  createMockStore,
  createSecuritySolutionStorageMock,
  mockGlobalState,
  mockTimelineData,
  TestProviders,
} from '../../../../../common/mock';
import { DefaultCellRenderer } from '../../cell_rendering/default_cell_renderer';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createStartServicesMock } from '../../../../../common/lib/kibana/kibana_react.mock';
import type { StartServices } from '../../../../../types';
import { useKibana } from '../../../../../common/lib/kibana';
import { useDispatch } from 'react-redux';
import type { ExperimentalFeatures } from '../../../../../../common';
import { allowedExperimentalValues } from '../../../../../../common';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import {
  defaultColumnHeaderType,
  defaultUdtHeaders,
} from '../../body/column_headers/default_headers';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { getEndpointPrivilegesInitialStateMock } from '../../../../../common/components/user_privileges/endpoint/mocks';
import * as timelineActions from '../../../../store/actions';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { createExpandableFlyoutApiMock } from '../../../../../common/mock/expandable_flyout';
import { userEvent } from '@testing-library/user-event';
import * as notesApi from '../../../../../notes/api/api';
import { getMockTimelineSearchSubscription } from '../../../../../common/mock/mock_timeline_search_service';
import * as useTimelineEventsModule from '../../../../containers';
import { useDataView } from '../../../../../data_view_manager/hooks/use_data_view';
import { useBrowserFields } from '../../../../../data_view_manager/hooks/use_browser_fields';
import { mockBrowserFields } from '@kbn/timelines-plugin/public/mock/browser_fields';
import { withIndices } from '../../../../../data_view_manager/hooks/__mocks__/use_data_view';

jest.mock('../../../../../data_view_manager/hooks/use_browser_fields');

jest.mock('../../../../../common/utils/route/use_route_spy', () => {
  return {
    useRouteSpy: jest.fn().mockReturnValue([
      {
        pageName: 'timeline',
      },
    ]),
  };
});

jest.mock('../../../../../common/components/user_privileges');

jest.mock('../../../../containers/details');

jest.mock('../../../fields_browser', () => ({
  useFieldBrowserOptions: jest.fn(),
}));

jest.mock('../../../../../sourcerer/containers/use_signal_helpers', () => ({
  useSignalHelpers: () => ({ signalIndexNeedsInit: false }),
}));

jest.mock('../../../../../common/hooks/use_experimental_features');

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: jest.fn(() => ({
    pathname: '',
    search: '',
  })),
}));

const { mockTimelineSearchSubscription } = getMockTimelineSearchSubscription();

// These tests can take more than standard timeout of 5s
// that is why we are increasing it.
const SPECIAL_TEST_TIMEOUT = 50000;

const useIsExperimentalFeatureEnabledMock = jest.fn((feature: keyof ExperimentalFeatures) => {
  return allowedExperimentalValues[feature];
});

jest.mock('../../../../../common/lib/kibana');

// unified-field-list is reporting multiple analytics events
jest.mock(`@elastic/ebt/client`);

const mockOpenFlyout = jest.fn();
const mockCloseFlyout = jest.fn();
jest.mock('@kbn/expandable-flyout');

const TestComponent = (props: Partial<ComponentProps<typeof QueryTabContent>>) => {
  const testComponentDefaultProps: ComponentProps<typeof QueryTabContent> = {
    timelineId: TimelineId.test,
    renderCellValue: DefaultCellRenderer,
    rowRenderers: defaultRowRenderers,
  };

  const dispatch = useDispatch();

  useEffect(() => {
    // Unified field list can be a culprit for long load times, so we wait for the timeline to be interacted with to load
    dispatch(timelineActions.showTimeline({ id: TimelineId.test, show: true }));

    // populating timeline so that it is not blank
    dispatch(
      timelineActions.applyKqlFilterQuery({
        id: TimelineId.test,
        filterQuery: {
          kuery: {
            kind: 'kuery',
            expression: '*',
          },
          serializedQuery: '*',
        },
      })
    );
  }, [dispatch]);

  return <QueryTabContent {...testComponentDefaultProps} {...props} />;
};

const customColumnOrder = [
  ...defaultUdtHeaders,
  {
    columnHeaderType: defaultColumnHeaderType,
    id: 'event.severity',
  },
];

const mockBaseState = structuredClone(mockGlobalState);

const mockState: typeof mockGlobalState = {
  ...mockBaseState,
  timeline: {
    ...mockBaseState.timeline,
    timelineById: {
      [TimelineId.test]: {
        ...mockBaseState.timeline.timelineById[TimelineId.test],
        /* 1 record for each page */
        itemsPerPage: 1,
        itemsPerPageOptions: [1, 2, 3, 4, 5],
        /* Returns 1 records in one query */
        sampleSize: 1,
        kqlQuery: {
          filterQuery: {
            kuery: {
              kind: 'kuery',
              expression: '*',
            },
            serializedQuery: '*',
          },
        },
      },
    },
  },
};

mockState.timeline.timelineById[TimelineId.test].columns = customColumnOrder;

const TestWrapper: FunctionComponent<React.PropsWithChildren<{}>> = ({ children }) => {
  return <TestProviders store={createMockStore(mockState)}>{children}</TestProviders>;
};

const renderTestComponents = (props?: Partial<ComponentProps<typeof TestComponent>>) => {
  return render(<TestComponent {...props} />, {
    wrapper: TestWrapper,
  });
};

const { storage: storageMock } = createSecuritySolutionStorageMock();

const useTimelineEventsSpy = jest.spyOn(useTimelineEventsModule, 'useTimelineEvents');

// Failing: See https://github.com/elastic/kibana/issues/224186
describe.skip('query tab with unified timeline', () => {
  const fetchNotesSpy = jest.spyOn(notesApi, 'fetchNotesByDocumentIds');
  beforeAll(() => {
    fetchNotesSpy.mockImplementation(jest.fn());
    jest.mocked(useExpandableFlyoutApi).mockImplementation(() => ({
      ...createExpandableFlyoutApiMock(),
      openFlyout: mockOpenFlyout,
      closeFlyout: mockCloseFlyout,
    }));

    // https://github.com/atlassian/react-beautiful-dnd/blob/4721a518356f72f1dac45b5fd4ee9d466aa2996b/docs/guides/setup-problem-detection-and-error-recovery.md#disable-logging
    Object.defineProperty(window, '__@hello-pangea/dnd-disable-dev-warnings', {
      get() {
        return true;
      },
    });
  });

  const baseKibanaServicesMock = createStartServicesMock();

  const kibanaServiceMock: StartServices = {
    ...baseKibanaServicesMock,
    storage: storageMock,
    data: {
      ...baseKibanaServicesMock.data,
      search: {
        ...baseKibanaServicesMock.data.search,
        search: mockTimelineSearchSubscription,
      },
    },
  };

  afterEach(() => {
    jest.clearAllMocks();
    storageMock.clear();
    fetchNotesSpy.mockClear();
    cleanup();
    localStorage.clear();
  });

  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = jest.fn(() => {
      return {
        width: 1000,
        height: 1000,
        x: 0,
        y: 0,
      } as DOMRect;
    });

    (useKibana as jest.Mock).mockImplementation(() => {
      return {
        services: kibanaServiceMock,
      };
    });

    (useTimelineEventsDetails as jest.Mock).mockImplementation(() => [false, {}]);

    jest.mocked(useDataView).mockReturnValue(withIndices(mockSourcererScope.selectedPatterns));

    jest.mocked(useBrowserFields).mockReturnValue(mockBrowserFields);

    (useIsExperimentalFeatureEnabled as jest.Mock).mockImplementation(
      useIsExperimentalFeatureEnabledMock
    );

    (useUserPrivileges as jest.Mock).mockReturnValue({
      notesPrivileges: { crud: true, read: true },
      timelinePrivileges: { crud: true, read: true },
      kibanaSecuritySolutionsPrivileges: { crud: true, read: true },
      endpointPrivileges: getEndpointPrivilegesInitialStateMock(),
      detectionEnginePrivileges: { loading: false, error: undefined, result: undefined },
    });
  });

  describe('render', () => {
    it(
      'should render unifiedDataTable in timeline',
      async () => {
        renderTestComponents();
        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should render unified-field-list in timeline',
      async () => {
        renderTestComponents();
        await waitFor(() => {
          expect(screen.getByTestId('timeline-sidebar')).toBeVisible();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
    it(
      'should show row-renderers correctly by default',
      async () => {
        renderTestComponents();
        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });

        expect(screen.getByTestId('timeline-row-renderer-0')).toBeVisible();
      },

      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should hide row-renderers when disabled',
      async () => {
        const { container } = renderTestComponents();
        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });

        expect(screen.getByTestId('timeline-row-renderer-0')).toBeVisible();

        fireEvent.click(screen.getByTestId('show-row-renderers-gear'));
        expect(screen.getByTestId('row-renderers-modal')).toBeVisible();

        fireEvent.click(screen.getByTestId('disable-all'));
        expect(
          screen.getAllByTestId('renderer-checkbox')[0].querySelector('[type="checkbox"]')
        ).not.toBeChecked();
        fireEvent.click(
          container.closest('body')!.querySelector('[aria-label="Closes this modal window"]')!
        );

        expect(screen.queryByTestId('row-renderers-modal')).not.toBeInTheDocument();

        expect(screen.queryByTestId('timeline-row-renderer-0')).not.toBeInTheDocument();
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  describe('pagination', () => {
    const mockStateWithNoteInTimeline = {
      ...mockState,
      timeline: {
        ...mockState.timeline,
        timelineById: {
          [TimelineId.test]: {
            ...mockState.timeline.timelineById[TimelineId.test],
            /* 1 record for each page */
            itemsPerPage: 1,
            itemsPerPageOptions: [1, 2, 3, 4, 5],
            savedObjectId: 'timeline-1', // match timelineId in mocked notes data
            pinnedEventIds: { '1': true },
            /* Returns 3 records */
            sampleSize: 3,
          },
        },
      },
    };
    afterEach(() => {
      jest.clearAllMocks();
    });

    it(
      'should paginate correctly',
      async () => {
        render(
          <TestProviders
            store={createMockStore({
              ...structuredClone(mockStateWithNoteInTimeline),
            })}
          >
            <TestComponent />
          </TestProviders>
        );

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();
        expect(screen.getByTestId('pagination-button-previous')).toBeVisible();

        expect(screen.getByTestId('tablePaginationPopoverButton')).toHaveTextContent(
          'Rows per page: 1'
        );

        expect(screen.getByTestId('pagination-button-0')).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('pagination-button-2')).toBeVisible();
        expect(screen.queryByTestId('pagination-button-3')).toBeNull();

        fireEvent.click(screen.getByTestId('pagination-button-2'));

        await waitFor(() => {
          expect(screen.getByTestId('pagination-button-2')).toHaveAttribute('aria-current', 'page');
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should load more records according to sample size correctly',
      async () => {
        render(
          <TestProviders
            store={createMockStore({
              ...structuredClone(mockStateWithNoteInTimeline),
            })}
          >
            <TestComponent />
          </TestProviders>
        );

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        await waitFor(() => {
          expect(screen.getByTestId('pagination-button-0')).toHaveAttribute('aria-current', 'page');
          expect(screen.getByTestId('pagination-button-2')).toBeVisible();
        });
        // Go to last page
        fireEvent.click(screen.getByTestId('pagination-button-2'));
        await waitFor(() => {
          expect(screen.getByTestId('dscGridSampleSizeFetchMoreLink')).toBeVisible();
        });
        fireEvent.click(screen.getByTestId('dscGridSampleSizeFetchMoreLink'));
        await waitFor(() => {
          expect(screen.getByTestId('pagination-button-2')).toHaveAttribute('aria-current', 'page');
          expect(screen.getByTestId('pagination-button-5')).toBeVisible();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should load notes for current page only',
      async () => {
        render(
          <TestProviders
            store={createMockStore({
              ...structuredClone(mockStateWithNoteInTimeline),
            })}
          >
            <TestComponent />
          </TestProviders>
        );

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getByTestId('pagination-button-previous')).toBeVisible();

        expect(screen.getByTestId('pagination-button-0')).toHaveAttribute('aria-current', 'page');
        expect(fetchNotesSpy).toHaveBeenCalledWith(['1']);

        // Page : 2

        fetchNotesSpy.mockClear();
        expect(screen.getByTestId('pagination-button-1')).toBeVisible();

        fireEvent.click(screen.getByTestId('pagination-button-1'));

        await waitFor(() => {
          expect(screen.getByTestId('pagination-button-1')).toHaveAttribute('aria-current', 'page');

          expect(fetchNotesSpy).toHaveBeenNthCalledWith(1, [mockTimelineData[1]._id]);
        });

        // Page : 3

        fetchNotesSpy.mockClear();
        expect(screen.getByTestId('pagination-button-2')).toBeVisible();
        fireEvent.click(screen.getByTestId('pagination-button-2'));

        await waitFor(() => {
          expect(screen.getByTestId('pagination-button-2')).toHaveAttribute('aria-current', 'page');

          expect(fetchNotesSpy).toHaveBeenNthCalledWith(1, [mockTimelineData[2]._id]);
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should load notes for correct page size',
      async () => {
        render(
          <TestProviders
            store={createMockStore({
              ...structuredClone(mockStateWithNoteInTimeline),
            })}
          >
            <TestComponent />
          </TestProviders>
        );

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getByTestId('pagination-button-previous')).toBeVisible();

        expect(screen.getByTestId('pagination-button-0')).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('tablePaginationPopoverButton')).toHaveTextContent(
          'Rows per page: 1'
        );
        fireEvent.click(screen.getByTestId('tablePaginationPopoverButton'));

        await waitFor(() => {
          expect(screen.getByTestId('tablePagination-2-rows')).toBeVisible();
        });

        fetchNotesSpy.mockClear();
        fireEvent.click(screen.getByTestId('tablePagination-2-rows'));

        await waitFor(() => {
          expect(fetchNotesSpy).toHaveBeenNthCalledWith(1, [
            mockTimelineData[0]._id,
            mockTimelineData[1]._id,
          ]);
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  const openDisplaySettings = async () => {
    expect(screen.getByTestId('dataGridDisplaySelectorButton')).toBeVisible();

    fireEvent.click(screen.getByTestId('dataGridDisplaySelectorButton'));

    await waitFor(() => {
      expect(
        screen
          .getAllByTestId('unifiedDataTableSampleSizeInput')
          .find((el) => el.getAttribute('type') === 'number')
      ).toBeVisible();
    });
  };

  const updateSampleSize = async (sampleSize: number) => {
    const sampleSizeInput = screen
      .getAllByTestId('unifiedDataTableSampleSizeInput')
      .find((el) => el.getAttribute('type') === 'number');

    expect(sampleSizeInput).toBeVisible();

    fireEvent.change(sampleSizeInput as HTMLElement, {
      target: { value: sampleSize },
    });
  };

  describe('controls', () => {
    it(
      'should reftech on sample size change',
      async () => {
        renderTestComponents();

        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });
        expect(screen.queryByTestId('pagination-button-1')).not.toBeInTheDocument();

        await openDisplaySettings();
        await updateSampleSize(2);
        await waitFor(() => {
          expect(screen.getByTestId('pagination-button-1')).toBeVisible();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  describe('columns', () => {
    it(
      'should move column left/right correctly ',
      async () => {
        const { container } = renderTestComponents();

        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });

        const messageColumnIndex =
          customColumnOrder.findIndex((header) => header.id === 'message') +
          //  offset for additional leading columns on left
          3;

        expect(container.querySelector('[data-gridcell-column-id="message"]')).toHaveAttribute(
          'data-gridcell-column-index',
          String(messageColumnIndex)
        );

        expect(container.querySelector('[data-gridcell-column-id="message"]')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('dataGridHeaderCellActionButton-message'));

        await waitFor(() => {
          expect(screen.getByTitle('Move left')).toBeEnabled();
        });

        fireEvent.click(screen.getByTitle('Move left'));

        await waitFor(() => {
          expect(container.querySelector('[data-gridcell-column-id="message"]')).toHaveAttribute(
            'data-gridcell-column-index',
            String(messageColumnIndex - 1)
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should remove column',
      async () => {
        const { container } = renderTestComponents();

        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });

        expect(container.querySelector('[data-gridcell-column-id="message"]')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('dataGridHeaderCellActionButton-message'));

        await waitFor(() => {
          expect(screen.getByTitle('Remove column')).toBeVisible();
        });

        fireEvent.click(screen.getByTitle('Remove column'));

        await waitFor(() => {
          expect(
            container.querySelector('[data-gridcell-column-id="message"]')
          ).not.toBeInTheDocument();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should sort date column',
      async () => {
        const { container } = renderTestComponents();
        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });

        expect(
          container.querySelector('[data-gridcell-column-id="@timestamp"]')
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('dataGridHeaderCellActionButton-@timestamp'));

        await waitFor(() => {
          expect(screen.getByTitle('Sort Old-New')).toBeVisible();
        });
        expect(screen.getByTitle('Unsort New-Old')).toBeVisible();

        useTimelineEventsSpy.mockClear();
        fireEvent.click(screen.getByTitle('Sort Old-New'));

        await waitFor(() => {
          expect(useTimelineEventsSpy).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              sort: [
                {
                  direction: 'asc',
                  esTypes: ['date'],
                  field: '@timestamp',
                  type: 'date',
                },
              ],
            })
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should sort string column correctly',
      async () => {
        const { container } = renderTestComponents();
        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });

        expect(
          container.querySelector('[data-gridcell-column-id="host.name"]')
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('dataGridHeaderCellActionButton-host.name'));

        await waitFor(() => {
          expect(screen.getByTestId('dataGridHeaderCellActionGroup-host.name')).toBeVisible();
        });

        expect(screen.getByTitle('Sort A-Z')).toBeVisible();
        expect(screen.getByTitle('Sort Z-A')).toBeVisible();

        useTimelineEventsSpy.mockClear();

        fireEvent.click(screen.getByTitle('Sort A-Z'));

        await waitFor(() => {
          expect(useTimelineEventsSpy).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              sort: [
                {
                  direction: 'desc',
                  esTypes: ['date'],
                  field: '@timestamp',
                  type: 'date',
                },
                {
                  direction: 'asc',
                  esTypes: [],
                  field: 'host.name',
                  type: 'string',
                },
              ],
            })
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should sort number column',
      async () => {
        const field = {
          name: 'event.severity',
          type: 'number',
        };

        const { container } = renderTestComponents();
        await waitFor(() => {
          expect(screen.getByTestId('discoverDocTable')).toBeVisible();
        });

        expect(
          container.querySelector(`[data-gridcell-column-id="${field.name}"]`)
        ).toBeInTheDocument();

        fireEvent.click(screen.getByTestId(`dataGridHeaderCellActionButton-${field.name}`));

        await waitFor(() => {
          expect(screen.getByTestId(`dataGridHeaderCellActionGroup-${field.name}`)).toBeVisible();
        });

        expect(screen.getByTitle('Sort Low-High')).toBeVisible();
        expect(screen.getByTitle('Sort High-Low')).toBeVisible();

        useTimelineEventsSpy.mockClear();

        fireEvent.click(screen.getByTitle('Sort Low-High'));

        await waitFor(() => {
          expect(useTimelineEventsSpy).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              sort: [
                {
                  direction: 'desc',
                  esTypes: ['date'],
                  field: '@timestamp',
                  type: 'date',
                },
                {
                  direction: 'asc',
                  esTypes: [],
                  field: field.name,
                  type: field.type,
                },
              ],
            })
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  describe('left controls', () => {
    it(
      'should clear all sorting',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getByTestId('dataGridColumnSortingButton')).toBeVisible();
        expect(
          screen.getByTestId('dataGridColumnSortingButton').querySelector('[role="marquee"]')
        ).toHaveTextContent('1');

        fireEvent.click(screen.getByTestId('dataGridColumnSortingButton'));

        // // timestamp sorting indicators
        expect(
          await screen.findByTestId('euiDataGridColumnSorting-sortColumn-@timestamp')
        ).toBeInTheDocument();

        expect(screen.getByTestId('dataGridHeaderCellSortingIcon-@timestamp')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('dataGridColumnSortingClearButton'));

        await waitFor(() => {
          expect(screen.queryByTestId('dataGridHeaderCellSortingIcon-@timestamp')).toBeNull();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should be able to sort by multiple columns',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getByTestId('dataGridColumnSortingButton')).toBeVisible();
        expect(
          screen.getByTestId('dataGridColumnSortingButton').querySelector('[role="marquee"]')
        ).toHaveTextContent('1');

        fireEvent.click(screen.getByTestId('dataGridColumnSortingButton'));

        // // timestamp sorting indicators
        expect(
          await screen.findByTestId('euiDataGridColumnSorting-sortColumn-@timestamp')
        ).toBeInTheDocument();

        expect(screen.getByTestId('dataGridHeaderCellSortingIcon-@timestamp')).toBeInTheDocument();

        // add more columns to sorting
        fireEvent.click(screen.getByText(/Pick fields to sort by/));

        await waitFor(() => {
          expect(
            screen.getByTestId('dataGridColumnSortingPopoverColumnSelection-event.severity')
          ).toBeInTheDocument();
        });

        fireEvent.click(
          screen.getByTestId('dataGridColumnSortingPopoverColumnSelection-event.severity')
        );

        // check new columns for sorting validity
        await waitFor(() => {
          expect(
            screen.getByTestId('dataGridHeaderCellSortingIcon-event.severity')
          ).toBeInTheDocument();
        });
        expect(
          screen.getByTestId('euiDataGridColumnSorting-sortColumn-event.severity')
        ).toBeInTheDocument();

        expect(screen.getByTestId('dataGridHeaderCellSortingIcon-@timestamp')).toBeInTheDocument();
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  describe('unified fields list', () => {
    it(
      'should remove the column when clicked on X sign',
      async () => {
        const field = {
          name: 'event.severity',
        };

        renderTestComponents();
        expect(await screen.findByTestId('timeline-sidebar')).toBeVisible();

        await waitFor(() => {
          expect(screen.getByTestId('fieldListGroupedSelectedFields-count')).toHaveTextContent(
            String(customColumnOrder.length)
          );
        });

        // column exists in the table
        expect(screen.getByTestId(`dataGridHeaderCell-${field.name}`)).toBeVisible();

        fireEvent.click(screen.getAllByTestId(`fieldToggle-${field.name}`)[0]);

        // column not longer exists in the table
        await waitFor(() => {
          expect(screen.getByTestId('fieldListGroupedSelectedFields-count')).toHaveTextContent(
            String(customColumnOrder.length - 1)
          );
        });
        expect(screen.queryAllByTestId(`dataGridHeaderCell-${field.name}`)).toHaveLength(0);
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should add the column when clicked on ⊕ sign',
      async () => {
        const field = {
          name: 'agent.id',
        };

        renderTestComponents();
        expect(await screen.findByTestId('timeline-sidebar')).toBeVisible();

        await waitFor(() => {
          expect(screen.getByTestId('fieldListGroupedSelectedFields-count')).toHaveTextContent(
            String(customColumnOrder.length)
          );
        });

        expect(screen.queryAllByTestId(`dataGridHeaderCell-${field.name}`)).toHaveLength(0);

        // column exists in the table
        const availableFields = screen.getByTestId('fieldListGroupedAvailableFields');

        fireEvent.click(within(availableFields).getByTestId(`fieldToggle-${field.name}`));

        await waitFor(() => {
          expect(screen.getByTestId('fieldListGroupedSelectedFields-count')).toHaveTextContent(
            String(customColumnOrder.length + 1)
          );
          expect(screen.queryAllByTestId(`dataGridHeaderCell-${field.name}`)).toHaveLength(1);
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should should show callout when field search does not matches any field',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('timeline-sidebar')).toBeVisible();

        await waitFor(() => {
          expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent(
            '43'
          );
        });

        fireEvent.change(screen.getByTestId('fieldListFiltersFieldSearch'), {
          target: { value: 'fake_field' },
        });

        await waitFor(() => {
          expect(
            screen.getByTestId('fieldListGroupedAvailableFieldsNoFieldsCallout-noFieldsMatch')
          ).toBeVisible();
        });

        expect(screen.getByTestId('fieldListGroupedAvailableFields-count')).toHaveTextContent('0');
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should toggle side bar correctly',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('timeline-sidebar')).toBeVisible();

        expect(screen.getByTestId('fieldListGroupedFieldGroups')).toBeVisible();

        fireEvent.click(screen.getByTitle('Hide sidebar'));

        await waitFor(() => {
          expect(screen.queryByTestId('fieldListGroupedFieldGroups')).not.toBeInTheDocument();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  describe('Leading actions - expand event', () => {
    it(
      'should expand and collapse event correctly',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getByTestId('docTableExpandToggleColumn').firstChild).toHaveAttribute(
          'data-euiicon-type',
          'expand'
        );

        // Open Flyout
        fireEvent.click(screen.getByTestId('docTableExpandToggleColumn'));

        await waitFor(() => {
          expect(mockOpenFlyout).toHaveBeenNthCalledWith(1, {
            right: {
              id: 'document-details-right',
              params: {
                id: '1',
                indexName: '',
                scopeId: TimelineId.test,
              },
            },
          });
        });

        expect(screen.getByTestId('docTableExpandToggleColumn').firstChild).toHaveAttribute(
          'data-euiicon-type',
          'minimize'
        );

        // Close Flyout
        fireEvent.click(screen.getByTestId('docTableExpandToggleColumn'));

        await waitFor(() => {
          expect(mockCloseFlyout).toHaveBeenNthCalledWith(1);
          expect(screen.getByTestId('docTableExpandToggleColumn').firstChild).toHaveAttribute(
            'data-euiicon-type',
            'expand'
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  describe('Leading actions - notes', () => {
    beforeEach(() => {
      (useIsExperimentalFeatureEnabled as jest.Mock).mockImplementation(
        jest.fn((feature: keyof ExperimentalFeatures) => allowedExperimentalValues[feature])
      );
    });

    // Flaky: https://github.com/elastic/kibana/issues/189794
    it.skip(
      'should have the notification dot & correct tooltip',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getAllByTestId('timeline-notes-button-small')).toHaveLength(1);
        expect(screen.getByTestId('timeline-notes-button-small')).not.toBeDisabled();

        expect(screen.getByTestId('timeline-notes-notification-dot')).toBeVisible();

        userEvent.hover(screen.getByTestId('timeline-notes-button-small'));

        await waitFor(() => {
          expect(screen.getByTestId('timeline-notes-tool-tip')).toBeInTheDocument();
          expect(screen.getByTestId('timeline-notes-tool-tip')).toHaveTextContent(
            '1 Note available. Click to view it & add more.'
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
    it(
      'should be able to add notes through expandable flyout',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        await waitFor(() => {
          expect(screen.getByTestId('timeline-notes-button-small')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('timeline-notes-button-small'));

        await waitFor(() => {
          expect(mockOpenFlyout).toHaveBeenCalled();
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should open the document details flyout with notes tab for a regular event',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        await waitFor(() => {
          expect(screen.getByTestId('timeline-notes-button-small')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('timeline-notes-button-small'));

        await waitFor(() => {
          expect(mockOpenFlyout).toHaveBeenCalledWith(
            expect.objectContaining({
              right: expect.objectContaining({ id: 'document-details-right' }),
              left: expect.objectContaining({ id: 'document-details-left' }),
            })
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should open the attack details flyout with notes tab for an attack discovery event',
      async () => {
        const attackDiscoveryEvent = {
          ...mockTimelineData[0],
          data: [
            ...mockTimelineData[0].data,
            {
              field: ALERT_RULE_TYPE_ID,
              value: [ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID],
            },
          ],
          ecs: {
            ...mockTimelineData[0].ecs,
            _index: '.alerts-security.attack.discovery.alerts-default-000001',
          },
        };

        useTimelineEventsSpy.mockReturnValue([
          DataLoadingState.loaded,
          {
            id: 'id',
            pageInfo: {
              activePage: 0,
              querySize: 0,
            },
            events: [attackDiscoveryEvent],
            rawEvents: [{ _id: attackDiscoveryEvent._id, _index: attackDiscoveryEvent.ecs._index }],
            inspect: { dsl: [], response: [] },
            totalCount: 1,
            loadNextBatch: jest.fn(),
            refreshedAt: 0,
            refetch: jest.fn(),
          },
        ]);

        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        await waitFor(() => {
          expect(screen.getByTestId('timeline-notes-button-small')).not.toBeDisabled();
        });

        fireEvent.click(screen.getByTestId('timeline-notes-button-small'));

        await waitFor(() => {
          expect(mockOpenFlyout).toHaveBeenCalledWith(
            expect.objectContaining({
              right: expect.objectContaining({ id: 'attack-details-right' }),
              left: expect.objectContaining({ id: 'attack-details-left' }),
            })
          );
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });

  describe('Leading actions - pin', () => {
    beforeEach(() => {
      (useIsExperimentalFeatureEnabled as jest.Mock).mockImplementation(
        jest.fn((feature: keyof ExperimentalFeatures) => allowedExperimentalValues[feature])
      );
    });
    it(
      'should disable pinning when event has notes attached in timeline',
      async () => {
        const mockStateWithNoteInTimeline = {
          ...mockState,
          timeline: {
            ...mockState.timeline,
            timelineById: {
              [TimelineId.test]: {
                ...mockState.timeline.timelineById[TimelineId.test],
                savedObjectId: 'timeline-1', // match timelineId in mocked notes data
                pinnedEventIds: { '1': true },
              },
            },
          },
        };

        render(
          <TestProviders
            store={createMockStore({
              ...structuredClone(mockStateWithNoteInTimeline),
            })}
          >
            <TestComponent />
          </TestProviders>
        );

        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getAllByTestId('pin')).toHaveLength(1);
        // disabled because it is already pinned
        expect(screen.getByTestId('pin')).toBeDisabled();

        fireEvent.mouseOver(screen.getByTestId('pin'));

        await waitFor(() => {
          expect(screen.getByTestId('timeline-action-pin-tool-tip')).toBeVisible();
          expect(screen.getByTestId('timeline-action-pin-tool-tip')).toHaveTextContent(
            'This event cannot be unpinned because it has notes in Timeline'
          );
          /*
           * Above event is alert and not an event but `getEventType` in
           * x-pack/solutions/security/plugins/security_solution/public/timelines/components/timeline/body/helpers.tsx
           * returns it has event and not an alert even though, it has event.kind as signal.
           * Need to see if it is okay
           *
           * */
        });
      },
      SPECIAL_TEST_TIMEOUT
    );

    it(
      'should allow pinning when event has notes but notes are not attached in current timeline',
      async () => {
        renderTestComponents();
        expect(await screen.findByTestId('discoverDocTable')).toBeVisible();

        expect(screen.getAllByTestId('pin')).toHaveLength(1);
        expect(screen.getByTestId('pin')).not.toBeDisabled();

        fireEvent.mouseOver(screen.getByTestId('pin'));
        await waitFor(() => {
          expect(screen.getByTestId('timeline-action-pin-tool-tip')).toBeVisible();
          expect(screen.getByTestId('timeline-action-pin-tool-tip')).toHaveTextContent('Pin event');
        });
      },
      SPECIAL_TEST_TIMEOUT
    );
  });
});
