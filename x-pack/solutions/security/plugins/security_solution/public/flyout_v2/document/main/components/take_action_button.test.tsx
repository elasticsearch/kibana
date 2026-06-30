/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { useAddToCaseActions } from '../../../../detections/components/alerts_table/timeline_actions/use_add_to_case_actions';
import { useAlertsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions';
import { useAlertAssigneesActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_assignees_actions';
import { useAlertTagsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alert_tags_actions';
import { useInvestigateInTimeline } from '../../../../detections/components/alerts_table/timeline_actions/use_investigate_in_timeline';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { useHostIsolationAction } from '../../../../common/components/endpoint/host_isolation/from_alerts/use_host_isolation_action';
import { TakeActionButton } from './take_action_button';
import { FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID } from './test_ids';

jest.mock(
  '../../../../detections/components/alerts_table/timeline_actions/use_add_to_case_actions'
);
jest.mock('../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions');
jest.mock(
  '../../../../detections/components/alerts_table/timeline_actions/use_alert_assignees_actions'
);
jest.mock('../../../../detections/components/alerts_table/timeline_actions/use_alert_tags_actions');
jest.mock(
  '../../../../detections/components/alerts_table/timeline_actions/use_investigate_in_timeline'
);
jest.mock('../../../../common/hooks/is_in_security_app');
jest.mock(
  '../../../../common/components/endpoint/host_isolation/from_alerts/use_host_isolation_action',
  () => ({
    useHostIsolationAction: jest.fn(),
  })
);
jest.mock(
  '../../../../common/components/endpoint/host_isolation/from_alerts/host_isolation_flyout',
  () => ({
    HostIsolationFlyout: ({
      isolateAction,
      onClose,
    }: {
      isolateAction: string;
      onClose: () => void;
    }) => (
      <button type="button" data-test-subj={`hostIsolationMock-${isolateAction}`} onClick={onClose}>
        {`isolation-mock-${isolateAction}`}
      </button>
    ),
  })
);

const mockUseResponderActionItem = jest.fn().mockReturnValue([]);
jest.mock('../../../../common/components/endpoint/responder', () => ({
  useResponderActionItem: (...args: unknown[]) => mockUseResponderActionItem(...args),
}));

const mockUseExploreActions = jest.fn().mockReturnValue({ exploreActionItems: [] });
jest.mock('../hooks/use_explore_actions', () => ({
  useExploreActions: (...args: unknown[]) => mockUseExploreActions(...args),
}));

const mockUseRunAlertWorkflowPanel = jest.fn().mockReturnValue({
  runWorkflowMenuItem: [],
  runAlertWorkflowPanel: [],
});
jest.mock(
  '../../../../detections/components/alerts_table/timeline_actions/use_run_alert_workflow_panel',
  () => ({
    useRunAlertWorkflowPanel: (...args: unknown[]) => mockUseRunAlertWorkflowPanel(...args),
  })
);

const mockUseRunDocumentWorkflowPanel = jest.fn().mockReturnValue({
  runWorkflowMenuItem: [],
  runDocumentWorkflowPanel: [],
});
jest.mock(
  '../../../../detections/components/alerts_table/timeline_actions/use_run_document_workflow_panel',
  () => ({
    useRunDocumentWorkflowPanel: (...args: unknown[]) => mockUseRunDocumentWorkflowPanel(...args),
  })
);

const mockUseAddToCaseActions = useAddToCaseActions as jest.Mock;
const mockUseAlertsActions = useAlertsActions as jest.Mock;
const mockUseAlertAssigneesActions = useAlertAssigneesActions as jest.Mock;
const mockUseAlertTagsActions = useAlertTagsActions as jest.Mock;

const createMockHit = (
  flattened: Record<string, unknown> = {},
  index: string = 'test-index'
): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-id', _index: index },
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const remoteAlertHit = createMockHit(
  { 'event.kind': 'signal' },
  'remote-cluster:.alerts-security.alerts-default'
);
const remoteEventHit = createMockHit(
  { 'event.kind': 'event' },
  'remote-cluster:.alerts-security.alerts-default'
);
const mockUseInvestigateInTimeline = useInvestigateInTimeline as jest.Mock;
const mockUseIsInSecurityApp = useIsInSecurityApp as jest.Mock;
const mockUseHostIsolationAction = useHostIsolationAction as jest.Mock;
const mockEcsData: Ecs = { _id: 'test-id', _index: 'test-index' };
const mockDetailsData = [
  {
    category: 'host',
    field: 'host.name',
    values: ['test-host'],
    originalValue: ['test-host'],
    isObjectArray: false,
  },
];
const mockRefetchFlyoutData = jest.fn().mockResolvedValue(undefined);
const mockOnAlertUpdated = jest.fn();
const mockOnShowNotes = jest.fn();
const defaultProps = {
  hit: createMockHit({ 'host.name': ['test-host'] }),
  ecsData: mockEcsData,
  refetchFlyoutData: mockRefetchFlyoutData,
  onAlertUpdated: mockOnAlertUpdated,
  onShowNotes: mockOnShowNotes,
};

const renderTakeActionButton = (props = defaultProps) => render(<TakeActionButton {...props} />);

describe('<TakeActionButton />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAddToCaseActions.mockReturnValue({ addToCaseActionItems: [] });
    mockUseAlertsActions.mockReturnValue({ actionItems: [], panels: [] });
    mockUseAlertAssigneesActions.mockReturnValue({
      alertAssigneesItems: [],
      alertAssigneesPanels: [],
    });
    mockUseAlertTagsActions.mockReturnValue({ alertTagsItems: [], alertTagsPanels: [] });
    mockUseInvestigateInTimeline.mockReturnValue({ investigateInTimelineActionItems: [] });
    mockUseIsInSecurityApp.mockReturnValue(true);
    mockUseRunAlertWorkflowPanel.mockReturnValue({
      runWorkflowMenuItem: [],
      runAlertWorkflowPanel: [],
    });
    mockUseExploreActions.mockReturnValue({ exploreActionItems: [] });
    mockUseResponderActionItem.mockReturnValue([]);
    mockUseHostIsolationAction.mockReturnValue([]);
  });

  it('should render the take action button', () => {
    const { getByTestId } = renderTakeActionButton();

    expect(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).toHaveTextContent('Take action');
  });

  it('should not be disabled', () => {
    const { getByTestId } = renderTakeActionButton();

    expect(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).not.toBeDisabled();
  });

  it('should be disabled when there are no action items (e.g. remote alert in Security app with no timeline items)', () => {
    mockUseIsInSecurityApp.mockReturnValue(true);
    mockUseInvestigateInTimeline.mockReturnValue({ investigateInTimelineActionItems: [] });

    const { getByTestId } = renderTakeActionButton({
      ...defaultProps,
      hit: remoteAlertHit,
    });

    expect(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).toBeDisabled();
  });

  it('should open the popover when the button is clicked', () => {
    const { getByTestId } = renderTakeActionButton();

    fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

    expect(document.querySelector('[data-test-subj="takeActionPanelMenu"]')).toBeInTheDocument();
  });

  it('should call useAddToCaseActions with the correct arguments', () => {
    renderTakeActionButton();

    expect(mockUseAddToCaseActions).toHaveBeenCalledWith(
      expect.objectContaining({
        ecsData: mockEcsData,
        nonEcsData: [{ field: 'host.name', value: ['test-host'] }],
        onSuccess: mockRefetchFlyoutData,
      })
    );
  });

  it('should call useInvestigateInTimeline with the correct arguments', () => {
    renderTakeActionButton();

    expect(mockUseInvestigateInTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ ecsRowData: mockEcsData })
    );
  });

  it('should include investigateInTimelineActionItems when in Security app', () => {
    mockUseIsInSecurityApp.mockReturnValue(true);
    const timelineItem = { name: 'Investigate in Timeline', onClick: jest.fn() };
    mockUseInvestigateInTimeline.mockReturnValue({
      investigateInTimelineActionItems: [timelineItem],
    });

    renderTakeActionButton();

    expect(mockUseInvestigateInTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ ecsRowData: mockEcsData })
    );
  });

  it('should not include investigateInTimelineActionItems when not in Security app (e.g. Discover)', () => {
    mockUseIsInSecurityApp.mockReturnValue(false);
    const timelineItem = { name: 'Investigate in Timeline', onClick: jest.fn() };
    mockUseInvestigateInTimeline.mockReturnValue({
      investigateInTimelineActionItems: [timelineItem],
    });

    const { queryByText } = renderTakeActionButton();

    fireEvent.click(queryByText('Take action')!.closest('button')!);

    expect(queryByText('Investigate in Timeline')).not.toBeInTheDocument();
  });

  it('should pass onAlertUpdated as refetch to useAlertsActions', () => {
    renderTakeActionButton();

    expect(mockUseAlertsActions).toHaveBeenCalledWith(
      expect.objectContaining({ refetch: mockOnAlertUpdated })
    );
  });

  it('should include status action items when alertStatus is present in hit', () => {
    const statusItem = { name: 'Mark as acknowledged', onClick: jest.fn() };
    mockUseAlertsActions.mockReturnValue({ actionItems: [statusItem], panels: [] });

    const alertHit = createMockHit({ 'kibana.alert.workflow_status': 'open' });
    renderTakeActionButton({ ...defaultProps, hit: alertHit });

    expect(mockUseAlertsActions).toHaveBeenCalledWith(
      expect.objectContaining({
        alertStatus: 'open',
        eventId: 'test-id',
        scopeId: '',
      })
    );
  });

  it('should not include status action items when alertStatus is not present in hit', () => {
    const statusItem = { name: 'Mark as acknowledged', onClick: jest.fn() };
    mockUseAlertsActions.mockReturnValue({ actionItems: [statusItem], panels: [] });

    renderTakeActionButton({ ...defaultProps, hit: createMockHit() });

    expect(mockUseAlertsActions).toHaveBeenCalledWith(
      expect.objectContaining({
        alertStatus: undefined,
      })
    );
  });

  it('should call useAlertAssigneesActions with ecsData and closePopover', () => {
    renderTakeActionButton();

    expect(mockUseAlertAssigneesActions).toHaveBeenCalledWith(
      expect.objectContaining({ ecsRowData: mockEcsData })
    );
  });

  it('should call onAlertUpdated and refetchFlyoutData when assignees are updated', () => {
    renderTakeActionButton();

    const assigneesCallArgs = mockUseAlertAssigneesActions.mock.calls[0][0];
    assigneesCallArgs.refetch();

    expect(mockOnAlertUpdated).toHaveBeenCalled();
    expect(mockRefetchFlyoutData).toHaveBeenCalled();
  });

  it('should call useAlertTagsActions with ecsData and onAlertUpdated as refetch', () => {
    renderTakeActionButton();

    expect(mockUseAlertTagsActions).toHaveBeenCalledWith(
      expect.objectContaining({
        ecsRowData: mockEcsData,
        refetch: mockOnAlertUpdated,
      })
    );
  });

  it('should call useRunAlertWorkflowPanel with ecsData and closePopover', () => {
    renderTakeActionButton();

    expect(mockUseRunAlertWorkflowPanel).toHaveBeenCalledWith(
      expect.objectContaining({ ecsRowData: mockEcsData })
    );
  });

  it('should call useExploreActions with the hit', () => {
    renderTakeActionButton();

    expect(mockUseExploreActions).toHaveBeenCalledWith(
      expect.objectContaining({ hit: defaultProps.hit })
    );
  });

  it('should call useRunDocumentWorkflowPanel with the document and closePopover', () => {
    const hit = createMockHit({ 'event.kind': 'event' });
    renderTakeActionButton({ ...defaultProps, hit });

    expect(mockUseRunDocumentWorkflowPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [expect.objectContaining({ _id: 'test-id', _index: 'test-index' })],
      })
    );
  });

  it('should call useResponderActionItem with field-browser data and closePopover', () => {
    renderTakeActionButton();

    expect(mockUseResponderActionItem).toHaveBeenCalledWith(mockDetailsData, expect.any(Function));
  });

  it('should include the Respond action for local documents in Discover', () => {
    mockUseIsInSecurityApp.mockReturnValue(false);
    mockUseResponderActionItem.mockReturnValue([
      {
        key: 'endpointResponseActions-action-item',
        name: 'Respond',
        onClick: jest.fn(),
      },
    ]);

    const { getByTestId, getByText } = renderTakeActionButton({
      ...defaultProps,
      hit: createMockHit({ 'event.kind': 'signal' }),
    });

    fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

    expect(getByText('Respond')).toBeInTheDocument();
  });

  it('should not include run workflow menu item when hook returns empty (no permissions)', () => {
    mockUseRunAlertWorkflowPanel.mockReturnValue({
      runWorkflowMenuItem: [],
      runAlertWorkflowPanel: [],
    });

    const { getByTestId, queryByText } = renderTakeActionButton();
    fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

    expect(queryByText('Run workflow')).not.toBeInTheDocument();
  });

  describe('alert vs non-alert document', () => {
    const statusItem = { name: 'Mark as acknowledged', onClick: jest.fn() };
    const assigneeItem = { name: 'Assign alert', onClick: jest.fn() };
    const tagsItem = { name: 'Apply alert tags', onClick: jest.fn() };
    const workflowItem = { name: 'Run workflow', onClick: jest.fn() };

    beforeEach(() => {
      mockUseAlertsActions.mockReturnValue({ actionItems: [statusItem], panels: [] });
      mockUseAlertAssigneesActions.mockReturnValue({
        alertAssigneesItems: [assigneeItem],
        alertAssigneesPanels: [],
      });
      mockUseAlertTagsActions.mockReturnValue({ alertTagsItems: [tagsItem], alertTagsPanels: [] });
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [workflowItem],
        runAlertWorkflowPanel: [],
      });
    });

    it('should include all items for alert documents (event.kind === signal)', () => {
      const alertHit = createMockHit({ 'event.kind': 'signal' });
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: alertHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Mark as acknowledged')).toBeInTheDocument();
      expect(getByText('Assign alert')).toBeInTheDocument();
      expect(getByText('Apply alert tags')).toBeInTheDocument();
      expect(queryByText('Add note')).not.toBeInTheDocument();
      expect(getByText('Run workflow')).toBeInTheDocument();
    });

    it('should exclude some items for non-alert documents', () => {
      const eventHit = createMockHit({ 'event.kind': 'event' });
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: eventHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(queryByText('Mark as acknowledged')).not.toBeInTheDocument();
      expect(queryByText('Assign alert')).not.toBeInTheDocument();
      expect(queryByText('Apply alert tags')).not.toBeInTheDocument();
      expect(getByText('Add note')).toBeInTheDocument();
      expect(queryByText('Run workflow')).not.toBeInTheDocument();
    });

    it('should use useRunAlertWorkflowPanel menu items for alert documents', () => {
      const alertWorkflowItem = { name: 'Alert workflow', onClick: jest.fn() };
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [alertWorkflowItem],
        runAlertWorkflowPanel: [],
      });
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [{ name: 'Document workflow', onClick: jest.fn() }],
        runDocumentWorkflowPanel: [],
      });

      const alertHit = createMockHit({ 'event.kind': 'signal' });
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: alertHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Alert workflow')).toBeInTheDocument();
      expect(queryByText('Document workflow')).not.toBeInTheDocument();
    });

    it('should use useRunDocumentWorkflowPanel menu items for non-alert documents', () => {
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [{ name: 'Alert workflow', onClick: jest.fn() }],
        runAlertWorkflowPanel: [],
      });
      const documentWorkflowItem = { name: 'Document workflow', onClick: jest.fn() };
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [documentWorkflowItem],
        runDocumentWorkflowPanel: [],
      });

      const eventHit = createMockHit({ 'event.kind': 'event' });
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: eventHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Document workflow')).toBeInTheDocument();
      expect(queryByText('Alert workflow')).not.toBeInTheDocument();
    });

    it('should exclude some items when event.kind is not set', () => {
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: createMockHit(),
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(queryByText('Mark as acknowledged')).not.toBeInTheDocument();
      expect(queryByText('Assign alert')).not.toBeInTheDocument();
      expect(queryByText('Apply alert tags')).not.toBeInTheDocument();
      expect(getByText('Add note')).toBeInTheDocument();
      expect(queryByText('Run workflow')).not.toBeInTheDocument();
    });
  });

  describe('remote document', () => {
    const timelineItem = { name: 'Investigate in timeline', onClick: jest.fn() };
    const caseItem = { name: 'Add to case', onClick: jest.fn() };
    const statusItem = { name: 'Mark as acknowledged', onClick: jest.fn() };
    const assigneeItem = { name: 'Assign alert', onClick: jest.fn() };
    const tagsItem = { name: 'Apply alert tags', onClick: jest.fn() };
    const workflowItem = { name: 'Run workflow', onClick: jest.fn() };

    beforeEach(() => {
      mockUseAddToCaseActions.mockReturnValue({ addToCaseActionItems: [caseItem] });
      mockUseAlertsActions.mockReturnValue({ actionItems: [statusItem], panels: [] });
      mockUseAlertAssigneesActions.mockReturnValue({
        alertAssigneesItems: [assigneeItem],
        alertAssigneesPanels: [],
      });
      mockUseAlertTagsActions.mockReturnValue({
        alertTagsItems: [tagsItem],
        alertTagsPanels: [],
      });
      mockUseInvestigateInTimeline.mockReturnValue({
        investigateInTimelineActionItems: [timelineItem],
      });
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [workflowItem],
        runAlertWorkflowPanel: [],
      });
      mockUseIsInSecurityApp.mockReturnValue(true);
    });

    it('should show only Investigate in Timeline for a remote alert', () => {
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: remoteAlertHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Investigate in timeline')).toBeInTheDocument();
      expect(queryByText('Add to case')).not.toBeInTheDocument();
      expect(queryByText('Mark as acknowledged')).not.toBeInTheDocument();
      expect(queryByText('Assign alert')).not.toBeInTheDocument();
      expect(queryByText('Apply alert tags')).not.toBeInTheDocument();
      expect(queryByText('Run workflow')).not.toBeInTheDocument();
      expect(queryByText('Add note')).not.toBeInTheDocument();
    });

    it('should show only Investigate in Timeline for a remote event', () => {
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: remoteEventHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Investigate in timeline')).toBeInTheDocument();
      expect(queryByText('Add to case')).not.toBeInTheDocument();
      expect(queryByText('Add note')).not.toBeInTheDocument();
      expect(queryByText('Run workflow')).not.toBeInTheDocument();
    });

    it('should show the explore item for a remote alert in Discover', () => {
      mockUseIsInSecurityApp.mockReturnValue(false);
      const exploreItem = { name: 'Explore in Alerts', onClick: jest.fn() };
      mockUseExploreActions.mockReturnValue({ exploreActionItems: [exploreItem] });

      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: remoteAlertHit,
      });

      expect(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).not.toBeDisabled();
      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));
      expect(getByText('Explore in Alerts')).toBeInTheDocument();
      expect(queryByText('Investigate in timeline')).not.toBeInTheDocument();
      expect(queryByText('Add to case')).not.toBeInTheDocument();
    });

    it('should show the explore item for a remote event in Discover', () => {
      mockUseIsInSecurityApp.mockReturnValue(false);
      const exploreItem = { name: 'Explore in Timeline', onClick: jest.fn() };
      mockUseExploreActions.mockReturnValue({ exploreActionItems: [exploreItem] });

      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: remoteEventHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Explore in Timeline')).toBeInTheDocument();
      expect(queryByText('Investigate in timeline')).not.toBeInTheDocument();
      expect(queryByText('Add to case')).not.toBeInTheDocument();
    });

    it('should show the full menu for a local alert (regression guard)', () => {
      const localAlertHit = createMockHit({ 'event.kind': 'signal' });
      const { getByTestId, getByText, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: localAlertHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Add to case')).toBeInTheDocument();
      expect(getByText('Mark as acknowledged')).toBeInTheDocument();
      expect(getByText('Assign alert')).toBeInTheDocument();
      expect(getByText('Apply alert tags')).toBeInTheDocument();
      expect(getByText('Run workflow')).toBeInTheDocument();
      expect(getByText('Investigate in timeline')).toBeInTheDocument();
      expect(queryByText('Add note')).not.toBeInTheDocument();
    });
  });

  it('should call onShowNotes when "Add note" is clicked', () => {
    const { getByTestId, getByText } = renderTakeActionButton({
      ...defaultProps,
      hit: createMockHit(),
    });

    fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));
    fireEvent.click(getByText('Add note'));

    expect(mockOnShowNotes).toHaveBeenCalledTimes(1);
  });

  describe('Explore action (Discover context only)', () => {
    const exploreItem = { name: 'Explore action', onClick: jest.fn() };

    it('should not include explore items when in Security app', () => {
      mockUseIsInSecurityApp.mockReturnValue(true);
      mockUseExploreActions.mockReturnValue({ exploreActionItems: [exploreItem] });

      const { getByTestId, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: createMockHit({ 'event.kind': 'signal' }),
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(queryByText('Explore action')).not.toBeInTheDocument();
    });

    it('should include explore items when not in Security app', () => {
      mockUseIsInSecurityApp.mockReturnValue(false);
      mockUseExploreActions.mockReturnValue({ exploreActionItems: [exploreItem] });

      const { getByTestId, getByText } = renderTakeActionButton({
        ...defaultProps,
        hit: createMockHit({ 'event.kind': 'signal' }),
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Explore action')).toBeInTheDocument();
    });
  });

  describe('Host isolation action', () => {
    const isolateMenuItem = {
      key: 'isolate-host-action-item',
      'data-test-subj': 'isolate-host-action-item',
      name: 'Isolate host',
    };

    it('should pass detailsData to useHostIsolationAction', () => {
      renderTakeActionButton();

      expect(mockUseHostIsolationAction).toHaveBeenCalledWith(
        expect.objectContaining({ detailsData: mockDetailsData })
      );
    });

    it('should include the isolate host item only for local alerts', () => {
      mockUseHostIsolationAction.mockReturnValue([isolateMenuItem]);

      const { getByTestId, getByText } = renderTakeActionButton({
        ...defaultProps,
        hit: createMockHit({ 'event.kind': 'signal' }),
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(getByText('Isolate host')).toBeInTheDocument();
    });

    it('should hide the isolate host item for non-alert documents', () => {
      mockUseHostIsolationAction.mockReturnValue([isolateMenuItem]);

      const { getByTestId, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: createMockHit({ 'event.kind': 'event' }),
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(queryByText('Isolate host')).not.toBeInTheDocument();
    });

    it('should hide the isolate host item for remote alerts', () => {
      mockUseHostIsolationAction.mockReturnValue([isolateMenuItem]);

      const { getByTestId, queryByText } = renderTakeActionButton({
        ...defaultProps,
        hit: remoteAlertHit,
      });

      fireEvent.click(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID));

      expect(queryByText('Isolate host')).not.toBeInTheDocument();
    });

    it('should render HostIsolation inline when isolation action is triggered', () => {
      let captured: ((action: 'isolateHost' | 'unisolateHost') => void) | undefined;
      mockUseHostIsolationAction.mockImplementation(
        ({ onAddIsolationStatusClick }: { onAddIsolationStatusClick: typeof captured }) => {
          captured = onAddIsolationStatusClick;
          return [];
        }
      );

      renderTakeActionButton({
        ...defaultProps,
        hit: createMockHit({ 'event.kind': 'signal' }),
      });

      expect(screen.queryByTestId('hostIsolationMock-isolateHost')).not.toBeInTheDocument();

      act(() => captured?.('isolateHost'));

      expect(screen.getByTestId('hostIsolationMock-isolateHost')).toBeInTheDocument();
    });

    it('should unmount HostIsolation when its onClose is called', () => {
      let captured: ((action: 'isolateHost' | 'unisolateHost') => void) | undefined;
      mockUseHostIsolationAction.mockImplementation(
        ({ onAddIsolationStatusClick }: { onAddIsolationStatusClick: typeof captured }) => {
          captured = onAddIsolationStatusClick;
          return [];
        }
      );

      renderTakeActionButton({
        ...defaultProps,
        hit: createMockHit({ 'event.kind': 'signal' }),
      });

      act(() => captured?.('isolateHost'));
      expect(screen.getByTestId('hostIsolationMock-isolateHost')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('hostIsolationMock-isolateHost'));

      expect(screen.queryByTestId('hostIsolationMock-isolateHost')).not.toBeInTheDocument();
    });
  });
});
