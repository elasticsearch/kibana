/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import { StatusPopoverButton } from './status_popover_button';
import { TestProviders } from '../../../../common/mock';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { useAlertsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions';
import { useFlyoutTelemetry } from '../../../shared/hooks/use_flyout_telemetry';
import { FLYOUT_ACTION, FLYOUT_HEADER_ITEM, FLYOUT_TYPE } from '../../../../common/lib/telemetry';

// The real `FormattedFieldValue` pulls in the entity-store, endpoint, and network field renderers,
// making it by far the heaviest thing rendered in this suite. For the status field it only ever
// renders a plain `EuiBadge`, so we mock it down to that badge (preserving the click handler and the
// `chevronSingleDown` icon the popover-open assertions rely on) to keep each render within the 5s budget.
jest.mock('../../../../timelines/components/timeline/body/renderers/formatted_field', () => {
  const { EuiBadge } = jest.requireActual('@elastic/eui');
  return {
    FormattedFieldValue: ({
      value,
      isButton,
      onClick,
      onClickAriaLabel,
    }: {
      value: string;
      isButton?: boolean;
      onClick?: () => void;
      onClickAriaLabel?: string;
    }) => (
      <EuiBadge
        color="default"
        onClick={onClick}
        onClickAriaLabel={onClickAriaLabel}
        iconType={isButton ? 'chevronSingleDown' : undefined}
        iconSide={isButton ? 'right' : undefined}
      >
        {value}
      </EuiBadge>
    ),
  };
});

const mockReportActionClicked = jest.fn();
const mockReportHeaderItemClicked = jest.fn();
jest.mock('../../../shared/hooks/use_flyout_telemetry');
const mockUseFlyoutTelemetry = useFlyoutTelemetry as jest.Mock;

// `useAlertsActions` is mocked (rather than exercised for real) so these tests stay focused on
// this component's own rendering/wrapping logic, without needing a redux store wired up for the
// real status-update dispatch. The fixtures below mirror the real hook's item shape: the
// acknowledged item is a plain `onClick`, while the closed item is a pure panel-navigation item
// (no `onClick`, just a `panel` id) — matching how `useBulkClosingReasonItems` builds it in
// production, to exercise `wrapActionTelemetry`'s panel-navigation handling.
jest.mock('../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions');
const mockUseAlertsActions = useAlertsActions as jest.Mock;

const acknowledgedItem = {
  key: 'acknowledge',
  'data-test-subj': 'acknowledged-alert-status',
  name: 'Mark as acknowledged',
  onClick: jest.fn(),
};
const closedItem = {
  key: 'close-alert-with-reason',
  'data-test-subj': 'alert-close-context-menu-item',
  name: 'Mark as closed',
  panel: 'ALERT_CLOSING_REASON_PANEL_ID',
};

const props = {
  eventId: 'testid',
  contextId: 'alerts-page',
  enrichedFieldInfo: {
    contextId: 'alerts-page',
    eventId: 'testid',
    fieldType: 'string',
    scopeId: 'alerts-page',
    data: {
      field: 'kibana.alert.workflow_status',
      format: 'string',
      type: 'string',
      isObjectArray: false,
    },
    values: ['open'],
    fieldFromBrowserField: {
      category: 'kibana',
      count: 0,
      name: 'kibana.alert.workflow_status',
      type: 'string',
      esTypes: ['keyword'],
      scripted: false,
      searchable: true,
      aggregatable: true,
      readFromDocValues: true,
      format: { id: 'string' },
      shortDotsEnable: false,
      isMapped: true,
      indexes: ['apm-*-transaction*'],
      description: '',
      example: '',
      fields: {},
    },
  },
  scopeId: 'alerts-page',
  handleOnEventClosed: jest.fn(),
  disabled: false,
};

type AlertsPriveleges = Partial<ReturnType<typeof useAlertsPrivileges>>;

const writePriveleges: AlertsPriveleges = { hasAlertsUpdate: true };
const readPriveleges: AlertsPriveleges = {
  hasAlertsRead: true,
};

jest.mock('../../../../detections/containers/detection_engine/alerts/use_alerts_privileges');

describe('StatusPopoverButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFlyoutTelemetry.mockReturnValue({
      reportActionClicked: mockReportActionClicked,
      reportHeaderItemClicked: mockReportHeaderItemClicked,
    });
    mockUseAlertsActions.mockReturnValue({
      actionItems: [acknowledgedItem, closedItem],
      panels: [],
    });
  });
  test('it renders the correct status', () => {
    (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);

    const { getByText } = render(
      <TestProviders>
        <StatusPopoverButton {...props} />
      </TestProviders>
    );

    getByText('open');
  });

  test('decorates status items with coloured dot icons', async () => {
    (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
    const { getByText, getByTestId } = render(
      <TestProviders>
        <StatusPopoverButton {...props} />
      </TestProviders>
    );

    getByText('open').click();
    await waitForEuiPopoverOpen();

    expect(
      getByTestId('acknowledged-alert-status').querySelector('[data-euiicon-type="dot"]')
    ).toBeInTheDocument();
    expect(
      getByTestId('alert-close-context-menu-item').querySelector('[data-euiicon-type="dot"]')
    ).toBeInTheDocument();
  });

  test('it shows the correct options when clicked', async () => {
    (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
    const { getByText, container } = render(
      <TestProviders>
        <StatusPopoverButton {...props} />
      </TestProviders>
    );

    getByText('open').click();
    await waitForEuiPopoverOpen();

    expect(container.querySelector('.euiBadge__icon')).not.toBeNull();
    getByText('Mark as acknowledged');
    getByText('Mark as closed');
  });

  test('does not open the popover when disabled, even with write privileges', () => {
    (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
    const { getByText, queryByRole } = render(
      <TestProviders>
        <StatusPopoverButton {...props} disabled={true} />
      </TestProviders>
    );

    getByText('open').click();

    expect(queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Status should be text when user does not have write priveleges', () => {
    (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(readPriveleges);
    mockUseAlertsActions.mockReturnValue({ actionItems: [], panels: [] });
    const { getByText, container } = render(
      <TestProviders>
        <StatusPopoverButton {...props} />
      </TestProviders>
    );

    getByText('open').click();

    // Check the popover downward arrow should not be visible
    expect(container.querySelector('.euiBadge__icon')).toBeNull();

    // popover should not open when hence checking that popover is not open
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  describe('action telemetry', () => {
    it('reports FlyoutHeaderItemClicked when the status badge is clicked to open the popover', async () => {
      (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
      const { getByText } = render(
        <TestProviders>
          <StatusPopoverButton {...props} />
        </TestProviders>
      );

      getByText('open').click();

      expect(mockReportHeaderItemClicked).toHaveBeenCalledWith({
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        item: FLYOUT_HEADER_ITEM.STATUS,
      });
    });

    it('reports FlyoutActionClicked when marking as acknowledged', async () => {
      (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
      const { getByText } = render(
        <TestProviders>
          <StatusPopoverButton {...props} />
        </TestProviders>
      );

      getByText('open').click();
      await waitForEuiPopoverOpen();

      getByText('Mark as acknowledged').click();

      expect(mockReportActionClicked).toHaveBeenCalledWith({
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        action: FLYOUT_ACTION.STATUS_ACKNOWLEDGED,
      });
      // The original handler still fires alongside telemetry.
      expect(acknowledgedItem.onClick).toHaveBeenCalledTimes(1);
    });

    it('reports FlyoutActionClicked when marking as closed, without breaking panel navigation', async () => {
      (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
      const { getByText } = render(
        <TestProviders>
          <StatusPopoverButton {...props} />
        </TestProviders>
      );

      getByText('open').click();
      await waitForEuiPopoverOpen();

      // `closedItem` has no `onClick` of its own — it's a pure panel-navigation item (matching
      // production's closing-reason sub-panel). EUI defers panel-navigation items' `onClick` to a
      // `requestAnimationFrame` callback (so it runs after any outside-click-detector logic
      // settles), so the report only shows up after that tick — hence `waitFor`.
      getByText('Mark as closed').click();

      await waitFor(() => {
        expect(mockReportActionClicked).toHaveBeenCalledWith({
          flyoutType: FLYOUT_TYPE.DOCUMENT,
          action: FLYOUT_ACTION.STATUS_CLOSED,
        });
      });
    });

    it('reports FlyoutActionClicked when marking as open', async () => {
      (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
      mockUseAlertsActions.mockReturnValue({
        actionItems: [
          {
            key: 'open',
            'data-test-subj': 'open-alert-status',
            name: 'Mark as open',
            onClick: jest.fn(),
          },
        ],
        panels: [],
      });
      const { getByText } = render(
        <TestProviders>
          <StatusPopoverButton {...props} />
        </TestProviders>
      );

      getByText('open').click();
      await waitForEuiPopoverOpen();

      getByText('Mark as open').click();

      expect(mockReportActionClicked).toHaveBeenCalledWith({
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        action: FLYOUT_ACTION.STATUS_OPEN,
      });
    });

    it('does not report telemetry for an unmapped action item', async () => {
      (useAlertsPrivileges as jest.Mock<AlertsPriveleges>).mockReturnValue(writePriveleges);
      mockUseAlertsActions.mockReturnValue({
        actionItems: [
          {
            key: 'custom',
            'data-test-subj': 'custom-item',
            name: 'Custom item',
            onClick: jest.fn(),
          },
        ],
        panels: [],
      });
      const { getByText } = render(
        <TestProviders>
          <StatusPopoverButton {...props} />
        </TestProviders>
      );

      getByText('open').click();
      await waitForEuiPopoverOpen();

      getByText('Custom item').click();

      expect(mockReportActionClicked).not.toHaveBeenCalled();
    });
  });
});
