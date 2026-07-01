/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TableId } from '@kbn/securitysolution-data-table';
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
import { ENABLE_NEW_FLYOUT_SETTING } from '../../../../../common/constants';

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const original = jest.requireActual('react-redux');

  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});

jest.mock('../../../utils/route/use_route_spy');
jest.mock('../../../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => children,
}));

const mockOpenFlyout = jest.fn();
jest.mock('@kbn/expandable-flyout');

const mockedTelemetry = createTelemetryServiceMock();
const mockOpenSystemFlyout = jest.fn();
const mockDocumentFlyoutWrapper = jest.fn((_props?: unknown) => (
  <div>{'MockDocumentFlyoutWrapper'}</div>
));
const mockUiSettings = { get: jest.fn().mockReturnValue(false) };
jest.mock('../../../lib/kibana', () => {
  const original = jest.requireActual('../../../lib/kibana');
  return {
    ...original,
    useKibana: () => ({
      ...original.useKibana(),
      services: {
        ...original.useKibana().services,
        telemetry: mockedTelemetry,
        overlays: {
          ...original.useKibana().services.overlays,
          openSystemFlyout: mockOpenSystemFlyout,
        },
        uiSettings: mockUiSettings,
      },
    }),
  };
});
jest.mock('../../../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../../flyout_v2/document/main/document_flyout_wrapper', () => ({
  DocumentFlyoutWrapper: (props: unknown) => mockDocumentFlyoutWrapper(props),
}));
jest.mock('@kbn/kibana-react-plugin/public', () => {
  const original = jest.requireActual('@kbn/kibana-react-plugin/public');
  return {
    ...original,
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
    jest.mocked(useExpandableFlyoutApi).mockReturnValue({
      ...createExpandableFlyoutApiMock(),
      openFlyout: mockOpenFlyout,
    });
    jest.mocked(useExpandableFlyoutState).mockReturnValue({} as unknown as ExpandableFlyoutState);
    (useRouteSpy as jest.Mock).mockReturnValue([mockRouteSpy]);
    mockUiSettings.get.mockReturnValue(false);
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

  test('should open expandable flyout when enableNewFlyout setting is disabled', () => {
    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('expand-event'));

    expect(mockOpenFlyout).toHaveBeenCalled();
    expect(mockOpenSystemFlyout).not.toHaveBeenCalled();
  });

  test('should open system flyout when enableNewFlyout setting is enabled', () => {
    mockUiSettings.get.mockImplementation((key: string) =>
      key === ENABLE_NEW_FLYOUT_SETTING ? true : false
    );
    const refetch = jest.fn();

    const wrapper = render(
      <TestProviders>
        <RowAction {...defaultProps} refetch={refetch} />
      </TestProviders>
    );

    fireEvent.click(wrapper.getByTestId('expand-event'));

    expect(mockOpenFlyout).not.toHaveBeenCalled();
    expect(mockOpenSystemFlyout).toHaveBeenCalled();
    const flyoutElement = mockOpenSystemFlyout.mock.calls[0][0];
    expect(flyoutElement.props.documentId).toBe('1');
    expect(flyoutElement.props.indexName).toBeUndefined();
    expect(flyoutElement.props.renderCellActions).toBeDefined();
    expect(flyoutElement.props.onAlertUpdated).toEqual(expect.any(Function));
    flyoutElement.props.onAlertUpdated();
    expect(refetch).toHaveBeenCalledTimes(1);
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
