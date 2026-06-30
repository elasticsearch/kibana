/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React, { useMemo, useReducer } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import { AlertsDataGrid } from './alerts_data_grid';
import type { AlertsDataGridProps, BulkActionsState } from '../types';
import type { AdditionalContext, RenderContext } from '../types';
import type { EuiDataGridColumnCellAction } from '@elastic/eui';
import { EuiButton, EuiButtonIcon, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { testQueryClientConfig } from '@kbn/alerts-ui-shared/src/common/test_utils/test_query_client_config';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import { bulkActionsReducer } from '../reducers/bulk_actions_reducer';
import { getJsDomPerformanceFix } from '../utils/test';
import { useCaseViewNavigation } from '../hooks/use_case_view_navigation';
import { act } from 'react-dom/test-utils';
import { AlertsTableContextProvider } from '../contexts/alerts_table_context';
import {
  mockRenderContext,
  mockColumns,
  mockAlerts,
  createMockBulkActionsState,
} from '../mocks/context.mock';
import {
  CELL_ACTIONS_EXPAND_TEST_ID,
  CELL_ACTIONS_POPOVER_TEST_ID,
  FIELD_BROWSER_BTN_TEST_ID,
  FIELD_BROWSER_CUSTOM_CREATE_BTN_TEST_ID,
  FIELD_BROWSER_TEST_ID,
} from '../constants';
import { useIndividualTagsActionContext } from '../contexts/individual_tags_action_context';
import { useTagsAction } from './tags/use_tags_action';

jest.mock('../hooks/use_case_view_navigation');
jest.mock('./tags/use_tags_action');

const cellActionOnClickMockedFn = jest.fn();
const mockOnChangeVisibleColumns = jest.fn();

const { fix, cleanup } = getJsDomPerformanceFix();

beforeAll(() => {
  fix();
});

afterAll(() => {
  cleanup();
});

export type BaseAlertsDataGridProps = AlertsDataGridProps;
export type TestAlertsDataGridProps = Partial<Omit<BaseAlertsDataGridProps, 'renderContext'>> & {
  renderContext?: Partial<RenderContext<AdditionalContext>>;
};

const queryClient = new QueryClient(testQueryClientConfig);

export const mockDataGridProps: Partial<BaseAlertsDataGridProps> = {
  pageSizeOptions: [1, 10, 20, 50, 100],
  leadingControlColumns: [],
  trailingControlColumns: [],
  columnVisibility: {
    visibleColumns: mockColumns.map((c) => c.id),
    setVisibleColumns: mockOnChangeVisibleColumns,
  },
  'data-test-subj': 'testTable',
  onToggleColumn: jest.fn(),
  onResetColumns: jest.fn(),
  query: {},
  sort: [],
  alertsQuerySnapshot: { request: [], response: [] },
  onSortChange: jest.fn(),
  additionalBulkActions: [
    {
      id: 0,
      items: [
        {
          label: 'Fake Bulk Action',
          key: 'fakeBulkAction',
          'data-test-subj': 'fake-bulk-action',
          disableOnQuery: false,
          onClick: () => {},
        },
      ],
    },
  ],
  fieldsBrowserOptions: {
    createFieldButton: () => <EuiButton data-test-subj={FIELD_BROWSER_CUSTOM_CREATE_BTN_TEST_ID} />,
  },
  casesConfiguration: { featureId: 'test-feature-id', owner: ['cases'] },
};

describe('AlertsDataGrid', () => {
  const useCaseViewNavigationMock = useCaseViewNavigation as jest.Mock;
  useCaseViewNavigationMock.mockReturnValue({ navigateToCaseView: jest.fn() });

  const TestComponent: React.FunctionComponent<
    Omit<TestAlertsDataGridProps, 'renderContext'> & {
      initialBulkActionsState?: BulkActionsState;
      renderContext?: Partial<RenderContext<AdditionalContext>>;
    }
  > = (props) => {
    const bulkActionsStore = useReducer(
      bulkActionsReducer,
      props.initialBulkActionsState || createMockBulkActionsState()
    );
    const renderContext: RenderContext<AdditionalContext> = useMemo(
      () => ({
        ...mockRenderContext,
        bulkActionsStore,
        ...props.renderContext,
      }),
      [bulkActionsStore, props.renderContext]
    );

    return (
      <AlertsTableContextProvider value={renderContext}>
        <QueryClientProvider client={queryClient} context={AlertsQueryContext}>
          <IntlProvider locale="en">
            <AlertsDataGrid {...({ ...props, renderContext } as BaseAlertsDataGridProps)} />
          </IntlProvider>
        </QueryClientProvider>
      </AlertsTableContextProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the tags action mock to default state
    const mockUseTagsAction = jest.mocked(useTagsAction);
    mockUseTagsAction.mockReset();
    mockUseTagsAction.mockImplementation(() => ({
      isFlyoutOpen: false,
      selectedAlerts: [],
      openFlyout: jest.fn(),
      onClose: jest.fn(),
      onSaveTags: jest.fn(),
      getAction: jest.fn(),
    }));
  });

  describe('Alerts table UI', () => {
    it('should support sorting', async () => {
      const { container } = render(<TestComponent {...mockDataGridProps} />);
      await userEvent.click(container.querySelector('.euiDataGridHeaderCell__button')!, {
        pointerEventsCheck: 0,
      });

      await waitForEuiPopoverOpen();

      await userEvent.click(
        screen.getByTestId(`dataGridHeaderCellActionGroup-${mockColumns[0].id}`),
        {
          pointerEventsCheck: 0,
        }
      );

      await userEvent.click(screen.getByTitle('Sort A-Z'), {
        pointerEventsCheck: 0,
      });

      expect(mockDataGridProps.onSortChange).toHaveBeenCalledWith([
        { direction: 'asc', id: 'kibana.alert.rule.name' },
      ]);
    });

    it('should support pagination', async () => {
      render(<TestComponent {...mockDataGridProps} />);
      await userEvent.click(screen.getByTestId('pagination-button-1'), {
        pointerEventsCheck: 0,
      });

      expect(mockRenderContext.onPageIndexChange).toHaveBeenCalledWith(1);
    });

    it('should show when it was updated', () => {
      render(<TestComponent {...mockDataGridProps} />);
      expect(screen.getByTestId('toolbar-updated-at')).not.toBe(null);
    });

    it('should show alerts count', () => {
      render(<TestComponent {...mockDataGridProps} />);
      expect(screen.getByTestId('toolbar-alerts-count')).not.toBe(null);
    });

    it('should show alert status', () => {
      render(
        <TestComponent
          {...mockDataGridProps}
          renderContext={{
            renderCellValue: undefined,
            pageSize: 10,
          }}
        />
      );
      expect(screen.queryAllByTestId('alertLifecycleStatusBadge')[0].textContent).toEqual(
        'Flapping'
      );
      expect(screen.queryAllByTestId('alertLifecycleStatusBadge')[1].textContent).toEqual('Active');
      expect(screen.queryAllByTestId('alertLifecycleStatusBadge')[2].textContent).toEqual(
        'Recovered'
      );
      expect(screen.queryAllByTestId('alertLifecycleStatusBadge')[3].textContent).toEqual(
        'Recovered'
      );
    });

    describe('Leading control columns', () => {
      it('should render other leading controls', () => {
        const props: TestAlertsDataGridProps = {
          ...mockDataGridProps,
          leadingControlColumns: [
            {
              id: 'selection',
              width: 67,
              headerCellRender: () => <span data-test-subj="testHeader">Test header</span>,
              rowCellRender: () => <h2 data-test-subj="testCell">Test cell</h2>,
            },
          ],
        };
        render(<TestComponent {...props} />);
        expect(screen.queryByTestId('testHeader')).not.toBe(null);
        expect(screen.queryByTestId('testCell')).not.toBe(null);
      });
    });

    describe('Actions column', () => {
      it('should render custom actions cells', () => {
        render(
          <TestComponent
            {...mockDataGridProps}
            renderContext={{
              renderActionsCell: () => (
                <>
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="testActionLabel" disableScreenReaderOutput>
                      <EuiButtonIcon
                        iconType="analyzeEvent"
                        color="primary"
                        onClick={() => {}}
                        size="s"
                        data-test-subj="testAction"
                        aria-label="testActionLabel"
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="testActionLabel2" disableScreenReaderOutput>
                      <EuiButtonIcon
                        iconType="analyzeEvent"
                        color="primary"
                        onClick={() => {}}
                        size="s"
                        data-test-subj="testAction2"
                        aria-label="testActionLabel2"
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                </>
              ),
            }}
          />
        );
        expect(screen.queryByTestId('testAction')).toBeInTheDocument();
        expect(screen.queryByTestId('testAction2')).toBeInTheDocument();
        expect(screen.queryByTestId('expandColumnCellOpenFlyoutButton-0')).not.toBeInTheDocument();
      });

      it('should render no action column if neither the action nor the expand action config is set', () => {
        render(
          <TestComponent
            {...mockDataGridProps}
            renderContext={{
              renderActionsCell: undefined,
            }}
          />
        );
        expect(screen.queryByTestId('expandColumnHeaderLabel')).not.toBeInTheDocument();
        expect(screen.queryByTestId('expandColumnCellOpenFlyoutButton')).not.toBeInTheDocument();
      });

      describe('row loading state on action', () => {
        type ExtractFunctionComponent<T> = T extends FunctionComponent<infer P> ? T : never;
        const mockRenderActionsCell = jest.fn(
          mockRenderContext.renderActionsCell as ExtractFunctionComponent<
            typeof mockRenderContext.renderActionsCell
          >
        );
        const props: TestAlertsDataGridProps = {
          ...mockDataGridProps,
          actionsColumnWidth: 124,
          renderContext: {
            pageSize: 10,
            renderActionsCell: mockRenderActionsCell,
          },
        };

        it('should show the row loader when callback triggered', async () => {
          render(<TestComponent {...props} />);
          fireEvent.click((await screen.findAllByTestId('testAction'))[0]);

          // the callback given to our clients to run when they want to update the loading state
          act(() => {
            mockRenderActionsCell.mock.calls[0][0].setIsActionLoading!(true);
          });

          expect(await screen.findAllByTestId('row-loader')).toHaveLength(1);
          const selectedOptions = await screen.findAllByTestId('dataGridRowCell');

          // first row, first column
          expect(within(selectedOptions[0]).getByLabelText('Loading')).toBeDefined();
          expect(
            within(selectedOptions[0]).queryByTestId('bulk-actions-row-cell')
          ).not.toBeInTheDocument();

          // second row, first column
          expect(within(selectedOptions[6]).queryByLabelText('Loading')).not.toBeInTheDocument();
          expect(within(selectedOptions[6]).getByTestId('bulk-actions-row-cell')).toBeDefined();
        });

        it('should show the row loader when callback triggered with false', async () => {
          const initialBulkActionsState = {
            ...createMockBulkActionsState(),
            rowSelection: new Map([[0, { isLoading: true }]]),
          };

          render(<TestComponent {...props} initialBulkActionsState={initialBulkActionsState} />);
          fireEvent.click((await screen.findAllByTestId('testAction'))[0]);

          // the callback given to our clients to run when they want to update the loading state
          act(() => {
            mockRenderActionsCell.mock.calls[0][0].setIsActionLoading!(false);
          });

          expect(screen.queryByTestId('row-loader')).not.toBeInTheDocument();
        });
      });
    });

    describe('Cell Actions', () => {
      const mockGetCellActionsForColumn = jest.fn(
        (columnId: string): EuiDataGridColumnCellAction[] => [
          ({ rowIndex, Component }) => {
            const label = 'Fake Cell First Action';
            return (
              <Component
                onClick={() => cellActionOnClickMockedFn(columnId, rowIndex)}
                data-test-subj={'fake-cell-first-action'}
                iconType="refresh"
                aria-label={label}
              />
            );
          },
        ]
      );
      const props: TestAlertsDataGridProps = {
        ...mockDataGridProps,
        cellActionsOptions: {
          getCellActionsForColumn: mockGetCellActionsForColumn,
          visibleCellActions: 2,
          disabledCellActions: [],
        },
      };

      it('should render cell actions on hover', async () => {
        render(<TestComponent {...props} />);

        const reasonFirstRow = (await screen.findAllByTestId('dataGridRowCell'))[3];

        fireEvent.mouseOver(reasonFirstRow);

        expect(await screen.findByTestId('fake-cell-first-action')).toBeInTheDocument();
      });

      it('should render expandable cell actions', async () => {
        render(<TestComponent {...props} />);
        const reasonFirstRow = (await screen.findAllByTestId('dataGridRowCell'))[3];

        fireEvent.mouseOver(reasonFirstRow);

        expect(await screen.findByTestId(CELL_ACTIONS_EXPAND_TEST_ID)).toBeVisible();

        fireEvent.click(await screen.findByTestId(CELL_ACTIONS_EXPAND_TEST_ID));

        expect(await screen.findByTestId(CELL_ACTIONS_POPOVER_TEST_ID)).toBeVisible();
        expect(await screen.findAllByLabelText(/fake cell first action/i)).toHaveLength(2);
      });
    });

    describe('Fields browser', () => {
      it('fields browser is working correctly', async () => {
        render(
          <TestComponent
            {...mockDataGridProps}
            initialBulkActionsState={{
              ...createMockBulkActionsState(),
              rowSelection: new Map(),
            }}
          />
        );

        const fieldBrowserBtn = screen.getByTestId(FIELD_BROWSER_BTN_TEST_ID);
        expect(fieldBrowserBtn).toBeVisible();

        fireEvent.click(fieldBrowserBtn);

        expect(await screen.findByTestId(FIELD_BROWSER_TEST_ID)).toBeVisible();

        expect(await screen.findByTestId(FIELD_BROWSER_CUSTOM_CREATE_BTN_TEST_ID)).toBeVisible();
      });

      it('syncs the columns state correctly between the column selector and the field selector', async () => {
        const columnToHide = mockColumns[0];
        render(
          <TestComponent
            {...mockDataGridProps}
            toolbarVisibility={{
              showColumnSelector: true,
            }}
            initialBulkActionsState={{
              ...createMockBulkActionsState(),
              rowSelection: new Map(),
            }}
          />
        );

        const fieldBrowserBtn = await screen.findByTestId(FIELD_BROWSER_BTN_TEST_ID);
        const columnSelectorBtn = await screen.findByTestId('dataGridColumnSelectorButton');

        // Open the column visibility selector and hide the column
        fireEvent.click(columnSelectorBtn);
        const columnVisibilityToggle = await screen.findByTestId(
          `dataGridColumnSelectorToggleColumnVisibility-${columnToHide.id}`
        );
        fireEvent.click(columnVisibilityToggle);

        // Open the field browser
        fireEvent.click(fieldBrowserBtn);
        expect(await screen.findByTestId(FIELD_BROWSER_TEST_ID)).toBeVisible();

        // The column should be checked in the field browser, independent of its visibility status
        const columnCheckbox: HTMLInputElement = await screen.findByTestId(
          `field-${columnToHide.id}-checkbox`
        );
        expect(columnCheckbox).toBeChecked();
      });

      it('should toggle column visibility on via column selector dropdown on a hidden column', async () => {
        const columnToDisplay = mockColumns[0].id;
        render(
          <TestComponent
            {...mockDataGridProps}
            toolbarVisibility={{
              showColumnSelector: true,
            }}
            columnVisibility={{
              visibleColumns: mockColumns.map((c) => c.id).filter((id) => id !== columnToDisplay),
              setVisibleColumns: mockOnChangeVisibleColumns,
            }}
          />
        );
        const columnSelectorBtn = await screen.findByTestId('dataGridColumnSelectorButton');

        fireEvent.click(columnSelectorBtn);

        const columnVisibilityToggle = await screen.findByTestId(
          `dataGridColumnSelectorToggleColumnVisibility-${columnToDisplay}`
        );

        fireEvent.click(columnVisibilityToggle);

        expect(mockOnChangeVisibleColumns).toHaveBeenLastCalledWith([
          'kibana.alert.rule.name',
          'kibana.alert.reason',
          'kibana.alert.status',
          'kibana.alert.case_ids',
        ]);
      });
    });

    describe('Expanded alert view', () => {
      it('should render the default alert flyout when `renderExpandedAlertView` is undefined', async () => {
        render(
          <TestComponent
            {...mockDataGridProps}
            renderContext={{
              expandedAlertIndex: 0,
            }}
          />
        );

        expect(await screen.findByTestId('alertFlyout')).toBeInTheDocument();
      });

      it('should render the expanded alert view when `expandedAlertIndex` is defined', async () => {
        render(
          <TestComponent
            {...mockDataGridProps}
            renderContext={{
              expandedAlertIndex: 0,
              renderExpandedAlertView: () => <div data-test-subj="expandedAlertView" />,
            }}
          />
        );

        expect(screen.getByTestId('expandedAlertView')).toBeInTheDocument();
      });

      it('should not render the expanded alert view when `expandedAlertIndex` is nullish', async () => {
        render(
          <TestComponent
            {...mockDataGridProps}
            renderContext={{
              expandedAlertIndex: null,
              renderExpandedAlertView: () => <div data-test-subj="expandedAlertView" />,
            }}
          />
        );

        expect(screen.queryByTestId('expandedAlertView')).not.toBeInTheDocument();
      });

      it('should not render any expanded alert view when `renderExpandedAlertView` is null', async () => {
        render(
          <TestComponent
            {...mockDataGridProps}
            renderContext={{
              expandedAlertIndex: 0,
              renderExpandedAlertView: null,
            }}
          />
        );

        expect(screen.queryByTestId('alertFlyout')).not.toBeInTheDocument();
        expect(screen.queryByTestId('expandedAlertView')).not.toBeInTheDocument();
      });
    });

    describe('Cases column', () => {
      const props: TestAlertsDataGridProps = {
        ...mockDataGridProps,
        renderContext: {
          pageSize: mockAlerts.length,
        },
      };

      it('should show the cases column', async () => {
        render(<TestComponent {...props} />);
        expect(await screen.findByText('Cases')).toBeInTheDocument();
      });

      it('should show the cases titles correctly', async () => {
        render(<TestComponent {...props} renderContext={{ pageSize: 10 }} />);
        expect(await screen.findByText('Test case')).toBeInTheDocument();
        expect(await screen.findByText('Test case 2')).toBeInTheDocument();
      });

      it('show loading skeleton if it loads cases', async () => {
        render(
          <TestComponent
            {...props}
            renderContext={{
              pageSize: 10,
              isLoading: true,
              isLoadingCases: true,
            }}
          />
        );

        expect((await screen.findAllByTestId('cases-cell-loading')).length).toBe(4);
      });

      it('shows the cases tooltip', async () => {
        render(<TestComponent {...props} />);
        expect(await screen.findByText('Test case')).toBeInTheDocument();

        await userEvent.hover(screen.getByText('Test case'));

        expect(await screen.findByTestId('cases-components-tooltip')).toBeInTheDocument();
      });
    });

    describe('Dynamic row height mode', () => {
      it('should render a non-virtualized grid body when the dynamicRowHeight option is on', async () => {
        const { container } = render(<TestComponent {...mockDataGridProps} dynamicRowHeight />);

        expect(container.querySelector('.euiDataGrid__customRenderBody')).toBeTruthy();
      });

      it('should render a virtualized grid body when the dynamicRowHeight option is off', async () => {
        const { container } = render(<TestComponent {...mockDataGridProps} />);

        expect(container.querySelector('.euiDataGrid__virtualized')).toBeTruthy();
      });
    });

    describe('Individual tags flyout', () => {
      const mockUseTagsAction = jest.mocked(useTagsAction);
      const mockAlert = {
        _id: 'alert-1',
        _index: 'test-index',
        version: 'v1',
        title: 'Test Alert',
        'kibana.alert.workflow_tags': ['tag1', 'tag2'],
      } as any;

      beforeEach(() => {
        // Reset the mock before each test
        mockUseTagsAction.mockReset();
        // Default mock: flyout closed
        mockUseTagsAction.mockImplementation(() => ({
          isFlyoutOpen: false,
          selectedAlerts: [],
          openFlyout: jest.fn(),
          onClose: jest.fn(),
          onSaveTags: jest.fn(),
          getAction: jest.fn(),
        }));
      });

      it('should not render individual tags flyout when closed', async () => {
        render(<TestComponent {...mockDataGridProps} />);

        // By default, the flyout should be closed
        expect(screen.queryByTestId('alerts-edit-tags-flyout')).not.toBeInTheDocument();
      });

      it('should render individual tags flyout when opened', async () => {
        const mockOnClose = jest.fn();
        const mockOnSaveTags = jest.fn();

        // Set up the mock implementation before rendering
        mockUseTagsAction.mockImplementation(() => ({
          isFlyoutOpen: true,
          selectedAlerts: [mockAlert],
          openFlyout: jest.fn(),
          onClose: mockOnClose,
          onSaveTags: mockOnSaveTags,
          getAction: jest.fn(),
        }));

        render(<TestComponent {...mockDataGridProps} />);

        expect(await screen.findByTestId('alerts-edit-tags-flyout')).toBeInTheDocument();
        expect(screen.getByTestId('alerts-edit-tags-flyout-title')).toBeInTheDocument();
      });

      it('should call onClose when cancel button is clicked', async () => {
        const mockOnClose = jest.fn();
        const mockOnSaveTags = jest.fn();

        mockUseTagsAction.mockImplementation(() => ({
          isFlyoutOpen: true,
          selectedAlerts: [mockAlert],
          openFlyout: jest.fn(),
          onClose: mockOnClose,
          onSaveTags: mockOnSaveTags,
          getAction: jest.fn(),
        }));

        render(<TestComponent {...mockDataGridProps} />);

        const cancelButton = await screen.findByTestId('alerts-edit-tags-flyout-cancel');
        await userEvent.click(cancelButton);

        // The onClose should be called
        expect(mockOnClose).toHaveBeenCalled();
      });

      it('should provide IndividualTagsActionContext to child components', async () => {
        const TestChildComponent = () => {
          try {
            const context = useIndividualTagsActionContext();
            return (
              <div data-test-subj="context-test">
                {context.isFlyoutOpen ? 'Flyout Open' : 'Flyout Closed'}
              </div>
            );
          } catch (e) {
            return <div data-test-subj="context-test">Context Not Available</div>;
          }
        };

        render(
          <TestComponent
            {...mockDataGridProps}
            renderContext={{
              renderActionsCell: () => <TestChildComponent />,
            }}
          />
        );

        // The context should be available (flyout closed by default)
        expect(await screen.findByTestId('context-test')).toHaveTextContent('Flyout Closed');
      });

      it('should render individual tags flyout with correct alert data', async () => {
        mockUseTagsAction.mockImplementation(() => ({
          isFlyoutOpen: true,
          selectedAlerts: [mockAlert],
          openFlyout: jest.fn(),
          onClose: jest.fn(),
          onSaveTags: jest.fn(),
          getAction: jest.fn(),
        }));

        render(<TestComponent {...mockDataGridProps} />);

        const flyout = await screen.findByTestId('alerts-edit-tags-flyout');
        expect(flyout).toBeInTheDocument();

        // Verify the flyout title is present
        expect(screen.getByTestId('alerts-edit-tags-flyout-title')).toBeInTheDocument();
      });
    });
  });
});
