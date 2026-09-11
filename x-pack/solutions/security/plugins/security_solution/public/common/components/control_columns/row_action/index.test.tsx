/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TableId } from '@kbn/securitysolution-data-table';
import { SECURITY_CELL_ACTIONS_DETAILS_FLYOUT } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import type { RowActionProps } from '.';
import { RowAction } from '.';
import { defaultHeaders, TestProviders } from '../../../mock';
import { getDefaultControlColumn } from '../../../../timelines/components/timeline/body/control_columns';
import { useRouteSpy } from '../../../utils/route/use_route_spy';
import type { RouteSpyState } from '../../../utils/route/types';
import { SecurityPageName } from '@kbn/deeplinks-security';
import { createTelemetryServiceMock } from '../../../lib/telemetry/telemetry_service.mock';
import { DocumentDetailsRightPanelKey } from '../../../../flyout/document_details/shared/constants/panel_keys';
import type { ExpandableFlyoutState } from '@kbn/expandable-flyout';
import { useExpandableFlyoutApi, useExpandableFlyoutState } from '@kbn/expandable-flyout';
import { createExpandableFlyoutApiMock } from '../../../mock/expandable_flyout';
import { useUserPrivileges } from '../../user_privileges';
import { initialUserPrivilegesState } from '../../user_privileges/user_privileges_context';
import { useIsNewFlyoutEnabled } from '../../../hooks/use_is_new_flyout_enabled';
import { useFlyoutApi } from '../../../../flyout_v2/use_flyout_api';
import { createFlyoutApiMock } from '../../../../flyout_v2/use_flyout_api.mock';

jest.mock('../../../hooks/use_is_new_flyout_enabled');
jest.mock('../../../../flyout_v2/use_flyout_api');
jest.mock('../../../hooks/use_space_id', () => ({
  useSpaceId: () => 'default',
}));
const mockDispatch = jest.fn();
jest.mock('react-redux-v7', () => {
  const original = jest.requireActual('react-redux-v7');

  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});

jest.mock('../../../utils/route/use_route_spy');

const mockOpenFlyout = jest.fn();
jest.mock('@kbn/expandable-flyout');

const mockedTelemetry = createTelemetryServiceMock();
jest.mock('../../../lib/kibana', () => {
  const original = jest.requireActual('../../../lib/kibana');
  return {
    ...original,
    useKibana: () => ({
      ...original.useKibana(),
      services: {
        ...original.useKibana().services,
        telemetry: mockedTelemetry,
      },
    }),
  };
});

jest.mock('../../user_privileges');

const mockRouteSpy: RouteSpyState = {
  pageName: SecurityPageName.overview,
  detailName: undefined,
  tabName: undefined,
  search: '',
  pathName: '/',
};
describe('RowAction', () => {
  let flyoutApi: ReturnType<typeof createFlyoutApiMock>;

  const sampleData = {
    _id: '1',
    data: [],
    ecs: {
      _id: '1',
    },
  };
  const defaultProps: RowActionProps = {
    esHitRecord: {
      _id: '1',
      _index: 'test-index',
      _source: {},
    },
    columnHeaders: defaultHeaders,
    controlColumn: getDefaultControlColumn(5)[0],
    data: sampleData,
    disabled: false,
    index: 1,
    isEventViewer: false,
    loadingEventIds: [],
    onRowSelected: jest.fn(),
    onRuleChange: jest.fn(),
    refetch: jest.fn(),
    selectedEventIds: {},
    tableId: TableId.test,
    width: 100,
    setEventsLoading: jest.fn(),
    setEventsDeleted: jest.fn(),
    pageRowIndex: 0,
    columnId: 'test-columnId',
    isDetails: false,
    isExpanded: false,
    isExpandable: false,
    rowIndex: 0,
    colIndex: 0,
    setCellProps: jest.fn(),
    tabType: 'query',
    showCheckboxes: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    flyoutApi = createFlyoutApiMock();
    jest.mocked(useExpandableFlyoutApi).mockReturnValue({
      ...createExpandableFlyoutApiMock(),
      openFlyout: mockOpenFlyout,
    });
    jest.mocked(useExpandableFlyoutState).mockReturnValue({} as unknown as ExpandableFlyoutState);
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    (useRouteSpy as jest.Mock).mockReturnValue([mockRouteSpy]);
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(false);
  });

  test('displays expand events button', () => {
    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} />
      </TestProviders>
    );
    expect(wrapper.getAllByTestId('expand-event')).not.toBeNull();
  });

  test('should always show expandable flyout if the page is attackDiscovery', () => {
    (useRouteSpy as jest.Mock).mockReturnValue([
      { ...mockRouteSpy, pageName: SecurityPageName.attackDiscovery },
    ]);
    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} />
      </TestProviders>
    );
    fireEvent.click(wrapper.getByTestId('expand-event'));
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockOpenFlyout).toHaveBeenCalledWith({
      right: {
        id: DocumentDetailsRightPanelKey,
        params: {
          id: '1',
          indexName: undefined,
          scopeId: 'table-test',
        },
      },
    });
  });

  test('should open the legacy expandable flyout when enableNewFlyout setting is disabled', () => {
    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('expand-event'));

    expect(mockOpenFlyout).toHaveBeenCalled();
    expect(flyoutApi.openDocumentFlyoutFromIndex).not.toHaveBeenCalled();
  });

  test('should open the new document flyout when enableNewFlyout setting is enabled', () => {
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);
    const refetch = jest.fn();

    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} refetch={refetch} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('expand-event'));

    expect(mockOpenFlyout).not.toHaveBeenCalled();
    expect(flyoutApi.openDocumentFlyoutFromIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: '1',
        indexName: undefined,
        renderCellActions: expect.any(Function),
        onAlertUpdated: expect.any(Function),
      })
    );

    const { onAlertUpdated } = flyoutApi.openDocumentFlyoutFromIndex.mock.calls[0][0];
    onAlertUpdated?.();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('uses the onExpandFlyout override when provided instead of opening the flyout directly', () => {
    const onExpandFlyout = jest.fn();
    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} onExpandFlyout={onExpandFlyout} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('expand-event'));

    expect(onExpandFlyout).toHaveBeenCalledTimes(1);
    expect(mockOpenFlyout).not.toHaveBeenCalled();
    expect(flyoutApi.openDocumentFlyoutFromIndex).not.toHaveBeenCalled();
    expect(mockedTelemetry.reportEvent).not.toHaveBeenCalled();
  });

  test('binds the new document flyout cell actions to the table scope and details-flyout trigger', () => {
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} tableId={TableId.hostsPageEvents} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('expand-event'));

    const { renderCellActions } = flyoutApi.openDocumentFlyoutFromIndex.mock.calls[0][0];

    // Event tables (e.g. Explore host/user pages) have no alerts table ref, but the renderer must
    // still bind the table scope and use the details-flyout trigger so the "Toggle column in table"
    // action is available and dispatches against the correct data table store.
    const cellAction = renderCellActions?.({
      field: 'host.name',
      value: ['host-1'],
      scopeId: '',
      children: null,
    }) as React.ReactElement;

    expect(cellAction.props.triggerId).toEqual(SECURITY_CELL_ACTIONS_DETAILS_FLYOUT);
    expect(cellAction.props.visibleCellActions).toEqual(6);
    expect(cellAction.props.metadata).toEqual({
      scopeId: TableId.hostsPageEvents,
      alertsTableRef: undefined,
    });
  });

  test('should open the pattern-based flyout for rule preview alerts, converting the backing index to its alias', () => {
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);
    const backingIndex = '.internal.preview.alerts-security.alerts-default';
    const aliasIndex = '.preview.alerts-security.alerts-default';

    const rulePreviewProps: RowActionProps = {
      ...defaultProps,
      tableId: TableId.rulePreview,
      data: {
        _id: '1',
        _index: backingIndex,
        data: [],
        ecs: { _id: '1' },
      },
      esHitRecord: {
        _id: '1',
        _index: backingIndex,
        _source: {},
      },
    };

    const wrapper = render(
      <TestProviders>
        <RowAction {...rulePreviewProps} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('expand-event'));

    // Rule preview must NOT use the index-based wrapper (which searches via a data view
    // pattern and cannot find preview backing indices); it must use the pattern-based
    // wrapper, which resolves the document via useTimelineEventsDetails directly.
    expect(mockOpenFlyout).not.toHaveBeenCalled();
    expect(flyoutApi.openDocumentFlyoutFromIndex).not.toHaveBeenCalled();
    expect(flyoutApi.openDocumentFlyoutFromPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: '1',
        indexName: aliasIndex,
      })
    );
  });

  describe('notes', () => {
    beforeEach(() => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        ...initialUserPrivilegesState(),
        notesPrivileges: { read: true, crud: true },
        timelinePrivileges: { read: true },
      });
    });

    test('should open the legacy expandable flyout when enableNewFlyout setting is disabled', () => {
      const wrapper = render(
        <TestProviders>
          <RowAction {...defaultProps} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId('timeline-notes-button-small'));

      expect(mockOpenFlyout).toHaveBeenCalled();
      expect(flyoutApi.openNotes).not.toHaveBeenCalled();
    });

    test('should open the new notes flyout when enableNewFlyout setting is enabled', () => {
      jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

      const wrapper = render(
        <TestProviders>
          <RowAction {...defaultProps} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId('timeline-notes-button-small'));

      expect(mockOpenFlyout).not.toHaveBeenCalled();
      expect(flyoutApi.openNotes).toHaveBeenCalledWith(
        expect.objectContaining({ hit: expect.any(Object) })
      );
    });
  });

  describe('privileges', () => {
    test('should show notes and timeline buttons when the user has the required privileges', () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        ...initialUserPrivilegesState(),
        notesPrivileges: { read: true },
        timelinePrivileges: { read: true },
      });

      const wrapper = render(
        <TestProviders>
          <RowAction {...defaultProps} />
        </TestProviders>
      );

      expect(wrapper.queryByTestId('timeline-notes-button-small')).toBeInTheDocument();
      expect(wrapper.queryByTestId('send-alert-to-timeline-button')).toBeInTheDocument();
    });

    test('should not show notes and timeline buttons when the user does not have the required privileges', () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        ...initialUserPrivilegesState(),
        notesPrivileges: { read: false },
        timelinePrivileges: { read: false },
      });

      const wrapper = render(
        <TestProviders>
          <RowAction {...defaultProps} />
        </TestProviders>
      );

      expect(wrapper.queryByTestId('timeline-notes-button-small')).not.toBeInTheDocument();
      expect(wrapper.queryByTestId('send-alert-to-timeline-button')).not.toBeInTheDocument();
    });
  });
});
