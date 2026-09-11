/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import {
  ATTACK_TAB_BULK_ACTIONS_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { TestProviders } from '../../../../common/mock/test_providers';
import { useAttackAssigneesContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items';
import { useAttackCaseContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_case_context_menu_items';
import { useAttackInvestigateInTimelineContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_investigate_in_timeline_context_menu_items';
import { useAttackRunWorkflowContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_run_workflow_context_menu_items';
import { useAttackTagsContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_tags_context_menu_items';
import { useAttackWorkflowStatusContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items';
import type { SelectedAttack } from './attack_tab_bulk_actions';
import { AttackTabBulkActions } from './attack_tab_bulk_actions';

jest.mock('../../../../common/lib/kibana');
jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items'
);
jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_case_context_menu_items'
);
jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_investigate_in_timeline_context_menu_items'
);
jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_run_workflow_context_menu_items'
);
jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_tags_context_menu_items'
);
jest.mock(
  '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items'
);

const mockInvalidateFindAttackDiscoveries = jest.fn();
jest.mock('../../../../attack_discovery/pages/use_find_attack_discoveries', () => ({
  useInvalidateFindAttackDiscoveries: () => mockInvalidateFindAttackDiscoveries,
}));

const useAttackAssigneesContextMenuItemsMock = useAttackAssigneesContextMenuItems as jest.Mock;
const useAttackCaseContextMenuItemsMock = useAttackCaseContextMenuItems as jest.Mock;
const useAttackInvestigateInTimelineContextMenuItemsMock =
  useAttackInvestigateInTimelineContextMenuItems as jest.Mock;
const useAttackRunWorkflowContextMenuItemsMock = useAttackRunWorkflowContextMenuItems as jest.Mock;
const useAttackTagsContextMenuItemsMock = useAttackTagsContextMenuItems as jest.Mock;
const useAttackWorkflowStatusContextMenuItemsMock =
  useAttackWorkflowStatusContextMenuItems as jest.Mock;

/** Every menu item the bar composes, named as its hook's real items are. */
const ITEM_NAMES = {
  addToExistingCase: 'Add to existing case',
  addToNewCase: 'Add to new case',
  assignees: 'Assignees',
  investigateInTimeline: 'Investigate in Timeline',
  runWorkflow: 'Run workflow',
  tags: 'Tags',
  workflowStatus: 'Mark as acknowledged',
} as const;

const menuItems = (...names: string[]) => ({
  items: names.map((name) => ({ name, key: name, onClick: jest.fn() })),
  panels: [],
});

const buildAttack = (overrides: Partial<AttackDiscoveryAlert> = {}): AttackDiscoveryAlert =>
  ({
    id: 'attack-1',
    title: 'Credential dumping on host-1',
    summaryMarkdown: 'An adversary dumped credentials on {{ host.name host-1 }}',
    detailsMarkdown: 'The adversary dumped credentials',
    entitySummaryMarkdown: '{{ host.name host-1 }}',
    mitreAttackTactics: ['Credential Access'],
    riskScore: 42,
    timestamp: '2024-05-01T08:30:00.000Z',
    index: '.alerts-security.attack.discovery.alerts-default',
    alertIds: ['alert-1', 'alert-2'],
    alertWorkflowStatus: 'open',
    assignees: ['ada'],
    tags: ['triage'],
    replacements: {},
    ...overrides,
  } as unknown as AttackDiscoveryAlert);

const resolvedSelection: SelectedAttack[] = [
  { attackId: 'attack-1', title: 'Credential dumping on host-1', attack: buildAttack() },
  {
    attackId: 'attack-2',
    title: 'Lateral movement to host-2',
    attack: buildAttack({
      id: 'attack-2',
      title: 'Lateral movement to host-2',
      alertIds: ['alert-3'],
    }),
  },
];

describe('AttackTabBulkActions', () => {
  const onActionSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useAttackCaseContextMenuItemsMock.mockReturnValue(
      menuItems(ITEM_NAMES.addToExistingCase, ITEM_NAMES.addToNewCase)
    );
    useAttackWorkflowStatusContextMenuItemsMock.mockReturnValue(
      menuItems(ITEM_NAMES.workflowStatus)
    );
    useAttackTagsContextMenuItemsMock.mockReturnValue(menuItems(ITEM_NAMES.tags));
    useAttackAssigneesContextMenuItemsMock.mockReturnValue(menuItems(ITEM_NAMES.assignees));
    useAttackRunWorkflowContextMenuItemsMock.mockReturnValue(menuItems(ITEM_NAMES.runWorkflow));
    useAttackInvestigateInTimelineContextMenuItemsMock.mockReturnValue(
      menuItems(ITEM_NAMES.investigateInTimeline)
    );
  });

  const renderBar = (selectedAttacks: SelectedAttack[]) =>
    render(
      <TestProviders>
        <AttackTabBulkActions onActionSuccess={onActionSuccess} selectedAttacks={selectedAttacks} />
      </TestProviders>
    );

  const openMenu = async () => {
    await userEvent.click(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID));

    return screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID);
  };

  it('renders nothing while no row is selected', () => {
    renderBar([]);

    expect(screen.queryByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).not.toBeInTheDocument();
  });

  it('counts the selection', () => {
    renderBar(resolvedSelection);

    expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).toHaveTextContent(
      '2 attacks selected'
    );
  });

  it('counts a single selected row', () => {
    renderBar([resolvedSelection[0]]);

    expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).toHaveTextContent(
      '1 attack selected'
    );
  });

  it('opens nothing until the action is used', () => {
    renderBar(resolvedSelection);

    expect(screen.queryByTestId(ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID)).not.toBeInTheDocument();
  });

  it('offers the attack take-action verbs across the selection', async () => {
    renderBar(resolvedSelection);

    const menu = await openMenu();

    Object.values(ITEM_NAMES).forEach((name) => {
      expect(within(menu).getByText(name)).toBeInTheDocument();
    });
  });

  it('opens by keyboard', async () => {
    renderBar(resolvedSelection);

    screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID).focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID)).toBeInTheDocument();
  });

  it('offers no way to remove an attachment', async () => {
    renderBar(resolvedSelection);

    const menu = await openMenu();

    expect(within(menu).queryByText(/remove/i)).not.toBeInTheDocument();
    expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).not.toHaveTextContent(/remove/i);
  });

  it('renders no action at all when nothing the selection may do is permitted', () => {
    [
      useAttackCaseContextMenuItemsMock,
      useAttackWorkflowStatusContextMenuItemsMock,
      useAttackTagsContextMenuItemsMock,
      useAttackAssigneesContextMenuItemsMock,
      useAttackRunWorkflowContextMenuItemsMock,
      useAttackInvestigateInTimelineContextMenuItemsMock,
    ].forEach((hook) => hook.mockReturnValue(menuItems()));

    renderBar(resolvedSelection);

    expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID)).not.toBeInTheDocument();
  });

  it('drops an item whose own gate leaves it out', async () => {
    useAttackTagsContextMenuItemsMock.mockReturnValue(menuItems());

    renderBar(resolvedSelection);

    const menu = await openMenu();

    expect(within(menu).queryByText(ITEM_NAMES.tags)).not.toBeInTheDocument();
    expect(within(menu).getByText(ITEM_NAMES.assignees)).toBeInTheDocument();
  });

  describe('the attacks each action is applied to', () => {
    it('passes the whole selection to the workflow status, tags and assignee items', () => {
      renderBar(resolvedSelection);

      expect(useAttackWorkflowStatusContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithWorkflowStatus: [
            {
              attackId: 'attack-1',
              attackIndex: '.alerts-security.attack.discovery.alerts-default',
              relatedAlertIds: ['alert-1', 'alert-2'],
              workflowStatus: 'open',
            },
            {
              attackId: 'attack-2',
              attackIndex: '.alerts-security.attack.discovery.alerts-default',
              relatedAlertIds: ['alert-3'],
              workflowStatus: 'open',
            },
          ],
        })
      );
      expect(useAttackTagsContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithTags: [
            expect.objectContaining({ attackId: 'attack-1', tags: ['triage'] }),
            expect.objectContaining({ attackId: 'attack-2', tags: ['triage'] }),
          ],
        })
      );
      expect(useAttackAssigneesContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithAssignees: [
            expect.objectContaining({ attackId: 'attack-1', assignees: ['ada'] }),
            expect.objectContaining({ attackId: 'attack-2', assignees: ['ada'] }),
          ],
        })
      );
    });

    it('passes the whole selection to the run workflow and timeline items', () => {
      renderBar(resolvedSelection);

      expect(useAttackRunWorkflowContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksForWorkflowRun: [
            expect.objectContaining({ attackId: 'attack-1' }),
            expect.objectContaining({ attackId: 'attack-2' }),
          ],
        })
      );
      expect(useAttackInvestigateInTimelineContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithTimelineAlerts: [
            expect.objectContaining({
              attackId: 'attack-1',
              relatedAlertIds: ['alert-1', 'alert-2'],
            }),
            expect.objectContaining({ attackId: 'attack-2', relatedAlertIds: ['alert-3'] }),
          ],
        })
      );
    });

    it('leaves a row whose live attack could not be resolved out of every action', () => {
      renderBar([resolvedSelection[0], { attackId: 'attack-unresolved', title: 'Snapshot only' }]);

      expect(useAttackWorkflowStatusContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithWorkflowStatus: [expect.objectContaining({ attackId: 'attack-1' })],
        })
      );
      expect(useAttackTagsContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithTags: [expect.objectContaining({ attackId: 'attack-1' })],
        })
      );
      expect(useAttackAssigneesContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithAssignees: [expect.objectContaining({ attackId: 'attack-1' })],
        })
      );
      expect(useAttackRunWorkflowContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksForWorkflowRun: [expect.objectContaining({ attackId: 'attack-1' })],
        })
      );
      expect(useAttackInvestigateInTimelineContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithTimelineAlerts: [expect.objectContaining({ attackId: 'attack-1' })],
        })
      );
      expect(useAttackCaseContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithCase: [expect.objectContaining({ attackId: 'attack-1' })],
        })
      );
    });

    it('still counts an unresolved row in the selection it names', () => {
      renderBar([resolvedSelection[0], { attackId: 'attack-unresolved', title: 'Snapshot only' }]);

      expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).toHaveTextContent(
        '2 attacks selected'
      );
    });
  });

  describe('the case items', () => {
    it('attaches a single selected attack as an attack attachment', () => {
      renderBar([resolvedSelection[0]]);

      expect(useAttackCaseContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Credential dumping on host-1',
          attackToAttach: expect.objectContaining({
            id: 'attack-1',
            index: '.alerts-security.attack.discovery.alerts-default',
            title: 'Credential dumping on host-1',
            alertIds: ['alert-1', 'alert-2'],
          }),
        })
      );
    });

    it('names the selection by count, and attaches no single attack, for several rows', () => {
      renderBar(resolvedSelection);

      expect(useAttackCaseContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '2 attacks', attackToAttach: undefined })
      );
    });

    it('excludes an attack whose index is unknown, keeping the items for the rest', () => {
      renderBar([
        resolvedSelection[0],
        {
          attackId: 'attack-3',
          title: 'No index',
          attack: buildAttack({ id: 'attack-3', index: undefined }),
        },
      ]);

      expect(useAttackCaseContextMenuItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attacksWithCase: [expect.objectContaining({ attackId: 'attack-1' })],
        })
      );
    });

    it('drops the case items entirely when nothing in the selection can be attached', async () => {
      renderBar([
        {
          attackId: 'attack-3',
          title: 'No index',
          attack: buildAttack({ id: 'attack-3', index: undefined }),
        },
      ]);

      const menu = await openMenu();

      expect(within(menu).queryByText(ITEM_NAMES.addToExistingCase)).not.toBeInTheDocument();
      expect(within(menu).queryByText(ITEM_NAMES.addToNewCase)).not.toBeInTheDocument();
      expect(within(menu).getByText(ITEM_NAMES.workflowStatus)).toBeInTheDocument();
    });
  });

  it('attributes every action to the case attachment table', () => {
    renderBar(resolvedSelection);

    [
      useAttackCaseContextMenuItemsMock,
      useAttackWorkflowStatusContextMenuItemsMock,
      useAttackTagsContextMenuItemsMock,
      useAttackAssigneesContextMenuItemsMock,
      useAttackRunWorkflowContextMenuItemsMock,
      useAttackInvestigateInTimelineContextMenuItemsMock,
    ].forEach((hook) => {
      expect(hook).toHaveBeenCalledWith(
        expect.objectContaining({ telemetrySource: 'case_attachment_table' })
      );
    });
  });

  describe('once an action lands', () => {
    const succeed = () => {
      const { onSuccess } = useAttackWorkflowStatusContextMenuItemsMock.mock.calls[0][0];
      onSuccess();
    };

    it('clears the selection', () => {
      renderBar(resolvedSelection);

      succeed();

      expect(onActionSuccess).toHaveBeenCalledTimes(1);
    });

    it('refreshes the section', () => {
      renderBar(resolvedSelection);

      succeed();

      expect(mockInvalidateFindAttackDiscoveries).toHaveBeenCalledTimes(1);
    });

    it('is reported by the tags and assignee items too', () => {
      renderBar(resolvedSelection);

      expect(useAttackTagsContextMenuItemsMock.mock.calls[0][0].onSuccess).toBe(
        useAttackWorkflowStatusContextMenuItemsMock.mock.calls[0][0].onSuccess
      );
      expect(useAttackAssigneesContextMenuItemsMock.mock.calls[0][0].onSuccess).toBe(
        useAttackWorkflowStatusContextMenuItemsMock.mock.calls[0][0].onSuccess
      );
    });
  });
});
