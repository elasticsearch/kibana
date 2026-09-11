/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { AttacksGroupTakeActionItems } from './attacks_group_take_action_items';
import { getMockAttackDiscoveryAlerts } from '../../../../attack_discovery/pages/mock/mock_attack_discovery_alerts';
import { useAttackViewInAiAssistantContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_view_in_ai_assistant_context_menu_items';
import { useAttackWorkflowStatusContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items';
import { useAttackAssigneesContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items';
import { useAttackTagsContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_tags_context_menu_items';
import { useAttackInvestigateInTimelineContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_investigate_in_timeline_context_menu_items';
import { useAttackExploreInAttacksContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_explore_in_attacks_context_menu_items';
import { useAttackCaseContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_case_context_menu_items';
import { useAttackRunWorkflowContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_run_workflow_context_menu_items';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import type { AttackToAttach } from '../../../../cases/attachments/attack';
import { buildAttackAttachments } from '../../../../cases/attachments/attack';

jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_view_in_ai_assistant_context_menu_items'
);
jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items'
);
jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items'
);
jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_tags_context_menu_items'
);
jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_run_workflow_context_menu_items'
);
jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_investigate_in_timeline_context_menu_items'
);
jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_explore_in_attacks_context_menu_items'
);
jest.mock(
  '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_case_context_menu_items'
);
jest.mock('../../../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: jest.fn(),
}));
const mockUseAttackViewInAiAssistantContextMenuItems =
  useAttackViewInAiAssistantContextMenuItems as jest.MockedFunction<
    typeof useAttackViewInAiAssistantContextMenuItems
  >;
const mockUseAttackWorkflowStatusContextMenuItems =
  useAttackWorkflowStatusContextMenuItems as jest.MockedFunction<
    typeof useAttackWorkflowStatusContextMenuItems
  >;
const mockUseAttackAssigneesContextMenuItems =
  useAttackAssigneesContextMenuItems as jest.MockedFunction<
    typeof useAttackAssigneesContextMenuItems
  >;
const mockUseAttackTagsContextMenuItems = useAttackTagsContextMenuItems as jest.MockedFunction<
  typeof useAttackTagsContextMenuItems
>;
const mockUseAttackInvestigateInTimelineContextMenuItems =
  useAttackInvestigateInTimelineContextMenuItems as jest.MockedFunction<
    typeof useAttackInvestigateInTimelineContextMenuItems
  >;
const mockUseAttackExploreInAttacksContextMenuItems =
  useAttackExploreInAttacksContextMenuItems as jest.MockedFunction<
    typeof useAttackExploreInAttacksContextMenuItems
  >;
const mockUseIsInSecurityApp = useIsInSecurityApp as jest.MockedFunction<typeof useIsInSecurityApp>;
const mockUseAttackCaseContextMenuItems = useAttackCaseContextMenuItems as jest.MockedFunction<
  typeof useAttackCaseContextMenuItems
>;

const mockUseAttackRunWorkflowContextMenuItems =
  useAttackRunWorkflowContextMenuItems as jest.MockedFunction<
    typeof useAttackRunWorkflowContextMenuItems
  >;
const mockAttack = getMockAttackDiscoveryAlerts()[0];

function renderAttack(attack: AttackDiscoveryAlert, isRemoteDocument = false) {
  return render(
    <TestProviders>
      <AttacksGroupTakeActionItems
        attack={attack}
        telemetrySource="attacks_page_group_take_action"
        isRemoteDocument={isRemoteDocument}
      />
    </TestProviders>
  );
}

describe('AttacksGroupTakeActionItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock returns for context menu hooks
    mockUseAttackViewInAiAssistantContextMenuItems.mockReturnValue({
      items: [
        {
          name: 'View in AI Assistant',
          key: 'viewInAiAssistant',
          'data-test-subj': 'viewInAiAssistant',
        },
      ],
    });
    mockUseAttackWorkflowStatusContextMenuItems.mockReturnValue({
      items: [
        { name: 'Mark as acknowledged', key: 'markAsAcknowledged' },
        { name: 'Mark as closed', key: 'markAsClosed' },
        { name: 'Mark as open', key: 'markAsOpen' },
      ],
      panels: [],
    });
    mockUseAttackAssigneesContextMenuItems.mockReturnValue({
      items: [
        { name: 'Assign alert', key: 'assignAlert' },
        { name: 'Unassign alert', key: 'unassignAlert' },
      ],
      panels: [],
    });
    mockUseAttackTagsContextMenuItems.mockReturnValue({
      items: [{ name: 'Apply alert tags', key: 'applyAlertTags' }],
      panels: [],
    });
    mockUseAttackInvestigateInTimelineContextMenuItems.mockReturnValue({
      items: [{ name: 'Investigate in Timeline', key: 'investigateInTimeline' }],
      panels: [],
    });
    mockUseAttackExploreInAttacksContextMenuItems.mockReturnValue({
      items: [{ name: 'Explore in Attacks', key: 'exploreInAttacks' }],
    });
    mockUseIsInSecurityApp.mockReturnValue(true);
    mockUseAttackCaseContextMenuItems.mockReturnValue({
      items: [],
      panels: [],
    });
    mockUseAttackRunWorkflowContextMenuItems.mockReturnValue({
      items: [
        {
          name: 'Run workflow',
          key: 'run-attack-workflow-action',
          panel: 'BULK_RUN_WORKFLOW_PANEL_ID',
          'data-test-subj': 'run-attack-workflow-action',
        },
      ],
      panels: [],
    });
  });

  describe('telemetry', () => {
    it('passes telemetrySource to all hooks', () => {
      renderAttack(mockAttack);
      const expectedTelemetrySource = 'attacks_page_group_take_action';

      expect(mockUseAttackViewInAiAssistantContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({ telemetrySource: expectedTelemetrySource })
      );
      expect(mockUseAttackWorkflowStatusContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({ telemetrySource: expectedTelemetrySource })
      );
      expect(mockUseAttackAssigneesContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({ telemetrySource: expectedTelemetrySource })
      );
      expect(mockUseAttackTagsContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({ telemetrySource: expectedTelemetrySource })
      );
      expect(mockUseAttackInvestigateInTimelineContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({ telemetrySource: expectedTelemetrySource })
      );
      expect(mockUseAttackCaseContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({ telemetrySource: expectedTelemetrySource })
      );
    });
  });

  describe('workflow items', () => {
    describe("when attack's status is open", () => {
      const openAttack = { ...mockAttack, alertWorkflowStatus: 'open' };

      it('should render the `acknowledged` action item', async () => {
        const { findByText } = renderAttack(openAttack);
        expect(await findByText('Mark as acknowledged')).toBeInTheDocument();
      });
      it('should render the `close` action item', async () => {
        const { findByText } = renderAttack(openAttack);
        expect(await findByText('Mark as closed')).toBeInTheDocument();
      });
      it('should NOT render the `open` action item', async () => {
        mockUseAttackWorkflowStatusContextMenuItems.mockReturnValue({
          items: [
            { name: 'Mark as acknowledged', key: 'markAsAcknowledged' },
            { name: 'Mark as closed', key: 'markAsClosed' },
          ],
          panels: [],
        });
        const { queryByText } = renderAttack(openAttack);
        expect(queryByText('Mark as open')).not.toBeInTheDocument();
      });
    });
    describe("when attack's status is closed", () => {
      const openAttack = { ...mockAttack, alertWorkflowStatus: 'closed' };

      it('should render the `acknowledged` action item', async () => {
        const { findByText } = renderAttack(openAttack);
        expect(await findByText('Mark as acknowledged')).toBeInTheDocument();
      });
      it('should NOT render the `close` action item', async () => {
        mockUseAttackWorkflowStatusContextMenuItems.mockReturnValue({
          items: [
            { name: 'Mark as acknowledged', key: 'markAsAcknowledged' },
            { name: 'Mark as open', key: 'markAsOpen' },
          ],
          panels: [],
        });
        const { queryByText } = renderAttack(openAttack);
        expect(queryByText('Mark as closed')).not.toBeInTheDocument();
      });
      it('should render the `open` action item', async () => {
        const { findByText } = renderAttack(openAttack);
        expect(await findByText('Mark as open')).toBeInTheDocument();
      });
    });
    describe("when attack's status is acknowledged", () => {
      const openAttack = { ...mockAttack, alertWorkflowStatus: 'acknowledged' };

      it('should NOT render the `acknowledged` action item', async () => {
        mockUseAttackWorkflowStatusContextMenuItems.mockReturnValue({
          items: [
            { name: 'Mark as closed', key: 'markAsClosed' },
            { name: 'Mark as open', key: 'markAsOpen' },
          ],
          panels: [],
        });
        const { queryByText } = renderAttack(openAttack);
        expect(queryByText('Mark as acknowledged')).not.toBeInTheDocument();
      });
      it('should render the `close` action item', async () => {
        const { findByText } = renderAttack(openAttack);
        expect(await findByText('Mark as closed')).toBeInTheDocument();
      });
      it('should render the `open` action item', async () => {
        const { findByText } = renderAttack(openAttack);
        expect(await findByText('Mark as open')).toBeInTheDocument();
      });
    });
  });

  describe('assignment', () => {
    it('should render the `assign` action item', async () => {
      const { findByText } = renderAttack(mockAttack);
      expect(await findByText('Assign alert')).toBeInTheDocument();
    });
    it('should render the `unassign` action item', async () => {
      const { findByText } = renderAttack(mockAttack);
      expect(await findByText('Unassign alert')).toBeInTheDocument();
    });
  });

  describe('tags', () => {
    it('should render the `apply tags` action item', async () => {
      const { findByText } = renderAttack(mockAttack);
      expect(await findByText('Apply alert tags')).toBeInTheDocument();
    });
  });

  describe('investigate in timeline / explore in attacks', () => {
    it('renders `Investigate in Timeline` when inside the Security Solution app', async () => {
      mockUseIsInSecurityApp.mockReturnValue(true);
      const { findByText, queryByText } = renderAttack(mockAttack);

      expect(await findByText('Investigate in Timeline')).toBeInTheDocument();
      expect(queryByText('Explore in Attacks')).not.toBeInTheDocument();
    });

    it('renders `Explore in Attacks` instead of `Investigate in Timeline` when outside the Security Solution app', async () => {
      mockUseIsInSecurityApp.mockReturnValue(false);
      const { findByText, queryByText } = renderAttack(mockAttack);

      expect(await findByText('Explore in Attacks')).toBeInTheDocument();
      expect(queryByText('Investigate in Timeline')).not.toBeInTheDocument();
    });

    describe('showNavigationAction', () => {
      const renderWithNavigationAction = (showNavigationAction?: boolean) =>
        render(
          <TestProviders>
            <AttacksGroupTakeActionItems
              attack={mockAttack}
              showNavigationAction={showNavigationAction}
              telemetrySource="attacks_page_group_take_action"
              isRemoteDocument={false}
            />
          </TestProviders>
        );

      beforeEach(() => {
        mockUseAttackCaseContextMenuItems.mockReturnValue({
          items: [
            { name: 'Add to existing case', key: 'addToExistingCase' },
            { name: 'Add to new case', key: 'addToNewCase' },
          ],
          panels: [],
        });
      });

      it('renders the navigation item by default', async () => {
        mockUseIsInSecurityApp.mockReturnValue(true);
        const { findByText } = renderWithNavigationAction();

        expect(await findByText('Investigate in Timeline')).toBeInTheDocument();
      });

      it('renders the other action items when the navigation item is shown', async () => {
        mockUseIsInSecurityApp.mockReturnValue(true);
        const { findByText } = renderWithNavigationAction(true);

        expect(await findByText('Add to existing case')).toBeInTheDocument();
        expect(await findByText('Add to new case')).toBeInTheDocument();
        expect(await findByText('Mark as acknowledged')).toBeInTheDocument();
        expect(await findByText('Assign alert')).toBeInTheDocument();
        expect(await findByText('Apply alert tags')).toBeInTheDocument();
        expect(await findByText('Run workflow')).toBeInTheDocument();
        expect(await findByText('View in AI Assistant')).toBeInTheDocument();
      });

      it('omits `Investigate in Timeline` when false and inside the Security Solution app', () => {
        mockUseIsInSecurityApp.mockReturnValue(true);
        const { queryByText } = renderWithNavigationAction(false);

        expect(queryByText('Investigate in Timeline')).not.toBeInTheDocument();
      });

      it('omits `Explore in Attacks` when false and outside the Security Solution app', () => {
        mockUseIsInSecurityApp.mockReturnValue(false);
        const { queryByText } = renderWithNavigationAction(false);

        expect(queryByText('Explore in Attacks')).not.toBeInTheDocument();
      });

      it('keeps the other action items when the navigation item is omitted', async () => {
        mockUseIsInSecurityApp.mockReturnValue(true);
        const { findByText } = renderWithNavigationAction(false);

        expect(await findByText('Add to existing case')).toBeInTheDocument();
        expect(await findByText('Add to new case')).toBeInTheDocument();
        expect(await findByText('Mark as acknowledged')).toBeInTheDocument();
        expect(await findByText('Assign alert')).toBeInTheDocument();
        expect(await findByText('Apply alert tags')).toBeInTheDocument();
        expect(await findByText('Run workflow')).toBeInTheDocument();
        expect(await findByText('View in AI Assistant')).toBeInTheDocument();
      });

      it('keeps the other action items sub-panels reachable when the navigation item is omitted', async () => {
        mockUseIsInSecurityApp.mockReturnValue(true);
        mockUseAttackTagsContextMenuItems.mockReturnValue({
          items: [{ name: 'Apply alert tags', key: 'applyAlertTags', panel: 'attackTagsPanel' }],
          panels: [
            {
              id: 'attackTagsPanel',
              title: 'Apply alert tags',
              content: <div>{'Tag selector'}</div>,
            },
          ],
        });

        const { findByText } = renderWithNavigationAction(false);
        fireEvent.click(await findByText('Apply alert tags'));

        expect(await findByText('Tag selector')).toBeInTheDocument();
      });

      it('keeps the navigation-only menu for a remote document', async () => {
        mockUseIsInSecurityApp.mockReturnValue(true);
        const { findByText, queryByText } = render(
          <TestProviders>
            <AttacksGroupTakeActionItems
              attack={mockAttack}
              showNavigationAction={false}
              telemetrySource="attacks_page_group_take_action"
              isRemoteDocument={true}
            />
          </TestProviders>
        );

        expect(await findByText('Investigate in Timeline')).toBeInTheDocument();
        expect(queryByText('Add to existing case')).not.toBeInTheDocument();
        expect(queryByText('Add to new case')).not.toBeInTheDocument();
        expect(queryByText('Mark as acknowledged')).not.toBeInTheDocument();
        expect(queryByText('Assign alert')).not.toBeInTheDocument();
        expect(queryByText('Apply alert tags')).not.toBeInTheDocument();
        expect(queryByText('Run workflow')).not.toBeInTheDocument();
        expect(queryByText('View in AI Assistant')).not.toBeInTheDocument();
      });
    });
  });

  describe('run workflow', () => {
    it('should render the `Run workflow` action item', async () => {
      const { findByText } = renderAttack(mockAttack);
      expect(await findByText('Run workflow')).toBeInTheDocument();
    });

    it('should not render the `Run workflow` action item when hook returns no items', () => {
      mockUseAttackRunWorkflowContextMenuItems.mockReturnValue({ items: [], panels: [] });

      const { queryByText } = renderAttack(mockAttack);
      expect(queryByText('Run workflow')).not.toBeInTheDocument();
    });
  });

  describe('attack case attachment', () => {
    it('passes the attack to attach to the cases hook', () => {
      const attack = { ...mockAttack, index: '.alerts-security.attack.discovery.alerts-default' };
      renderAttack(attack);

      expect(mockUseAttackCaseContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({
          attackToAttach: {
            id: attack.id,
            index: attack.index,
            title: attack.title,
            summaryMarkdown: attack.summaryMarkdown,
            detailsMarkdown: attack.detailsMarkdown,
            entitySummaryMarkdown: attack.entitySummaryMarkdown,
            mitreAttackTactics: attack.mitreAttackTactics,
            timestamp: attack.timestamp,
            riskScore: attack.riskScore,
            alertIds: attack.alertIds,
            replacements: attack.replacements,
          },
        })
      );
    });

    it('builds a de-anonymised narrative snapshot from what it passes', () => {
      const attack = { ...mockAttack, index: '.alerts-security.attack.discovery.alerts-default' };
      renderAttack(attack);

      const { attackToAttach } = mockUseAttackCaseContextMenuItems.mock.calls[0][0];
      const [attackAttachment] = buildAttackAttachments({
        ...(attackToAttach as Omit<AttackToAttach, 'alertsIndex'>),
        alertsIndex: '.alerts-security.alerts-default',
      }).attachments;

      expect(attackAttachment).toEqual(
        expect.objectContaining({
          metadata: expect.objectContaining({
            detailsMarkdown: expect.stringContaining('SRVMAC08'),
            entitySummaryMarkdown: expect.stringContaining('SRVMAC08'),
            summaryMarkdown: expect.stringContaining('SRVMAC08'),
            mitreAttackTactics: attack.mitreAttackTactics,
            timestamp: attack.timestamp,
          }),
        })
      );
    });

    it('omits the attack to attach when the source index is unknown', () => {
      renderAttack({ ...mockAttack, index: undefined });

      expect(mockUseAttackCaseContextMenuItems).toHaveBeenCalledWith(
        expect.objectContaining({ attackToAttach: undefined })
      );
    });
  });

  describe('view in ai assistant', () => {
    it('should render the `View in AI Assistant` action item', async () => {
      const { findByText } = renderAttack(mockAttack);
      expect(await findByText('View in AI Assistant')).toBeInTheDocument();
    });

    it('should not render the action item when hook returns no items', async () => {
      mockUseAttackViewInAiAssistantContextMenuItems.mockReturnValue({
        items: [],
      });

      const { queryByText } = renderAttack(mockAttack);
      expect(queryByText('View in AI Assistant')).not.toBeInTheDocument();
    });

    it('should not render the action item when showAiAssistantAction is false', () => {
      const { queryByText } = render(
        <TestProviders>
          <AttacksGroupTakeActionItems
            attack={mockAttack}
            showAiAssistantAction={false}
            telemetrySource="attacks_page_group_take_action"
            isRemoteDocument={false}
          />
        </TestProviders>
      );
      expect(queryByText('View in AI Assistant')).not.toBeInTheDocument();
    });
  });

  describe('when isRemoteDocument is true', () => {
    it('renders only the Investigate in Timeline action when in Security Solution app', () => {
      mockUseIsInSecurityApp.mockReturnValue(true);
      const { queryByText } = renderAttack(mockAttack, true);

      expect(queryByText('Investigate in Timeline')).toBeInTheDocument();
    });

    it('renders only the Explore in Attacks action when outside Security Solution app', () => {
      mockUseIsInSecurityApp.mockReturnValue(false);
      const { queryByText } = renderAttack(mockAttack, true);

      expect(queryByText('Explore in Attacks')).toBeInTheDocument();
      expect(queryByText('Investigate in Timeline')).not.toBeInTheDocument();
    });

    it('hides all other actions', () => {
      const { queryByText } = renderAttack(mockAttack, true);

      expect(queryByText('Mark as acknowledged')).not.toBeInTheDocument();
      expect(queryByText('View in AI Assistant')).not.toBeInTheDocument();
      expect(queryByText('Assign alert')).not.toBeInTheDocument();
      expect(queryByText('Apply alert tags')).not.toBeInTheDocument();
      expect(queryByText('Run workflow')).not.toBeInTheDocument();
    });
  });
});
