/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiContextMenu,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { getAttackDiscoveryMarkdown, getOriginalAlertIds } from '@kbn/elastic-assistant-common';
import {
  ATTACK_TAB_BULK_ACTIONS_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { useInvalidateFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { useAttackAssigneesContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items';
import { useAttackCaseContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_case_context_menu_items';
import { useAttackInvestigateInTimelineContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_investigate_in_timeline_context_menu_items';
import { useAttackRunWorkflowContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_run_workflow_context_menu_items';
import { useAttackTagsContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_tags_context_menu_items';
import { useAttackWorkflowStatusContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items';
import type {
  AttackWithCase,
  AttackWithWorkflowStatus,
} from '../../../../detections/hooks/attacks/bulk_actions/types';
import type { AttackToAttach } from '..';

/** The telemetry source every bulk action taken from this bar is attributed to. */
const TELEMETRY_SOURCE = 'case_attachment_table';

const TAKE_ACTION = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.tab.bulkTakeActionButtonLabel',
  { defaultMessage: 'Take action' }
);

const getSelectedLabel = (attackCount: number): string =>
  i18n.translate('xpack.securitySolution.attackDiscovery.cases.tab.selectedAttacksLabel', {
    defaultMessage: '{attackCount, plural, one {# attack selected} other {# attacks selected}}',
    values: { attackCount },
  });

/** Names the whole selection where a single row names its attack. */
const getSelectionTitle = (attackCount: number): string =>
  i18n.translate('xpack.securitySolution.attackDiscovery.cases.tab.selectedAttacksTitle', {
    defaultMessage: '{attackCount, plural, one {# attack} other {# attacks}}',
    values: { attackCount },
  });

/** One selected row. */
export interface SelectedAttack {
  /** The attack document `_id`, persisted as the attachment id. */
  attackId: string;
  /** The attack title, from the live document where it resolved and the snapshot otherwise. */
  title: string;
  /**
   * The live attack document. Absent where the row could not be resolved, which is what keeps it
   * out of every action: the bulk items read the live alert ids, tags, assignees and status.
   */
  attack?: AttackDiscoveryAlert;
}

export interface AttackTabBulkActionsProps {
  /** The selected rows. The bar renders nothing while this is empty. */
  selectedAttacks: readonly SelectedAttack[];
  /** Called once a bulk action lands, so the grid can drop a selection it has already acted on. */
  onActionSuccess: () => void;
}

/**
 * Builds the `security.attack` payload for a selection, which describes exactly one attack: a
 * selection of several falls back to the markdown-comment payload the bulk item builds from the
 * rows, as does an attack whose index is unknown.
 */
const getAttackToAttach = (
  attacks: readonly AttackDiscoveryAlert[]
): Omit<AttackToAttach, 'alertsIndex'> | undefined => {
  if (attacks.length !== 1) {
    return undefined;
  }

  const [attack] = attacks;

  if (attack.index == null) {
    return undefined;
  }

  return {
    id: attack.id,
    index: attack.index,
    title: attack.title,
    // The narrative the activity card renders from. Still anonymised here; the payload builder
    // de-anonymises and truncates it.
    summaryMarkdown: attack.summaryMarkdown,
    detailsMarkdown: attack.detailsMarkdown,
    entitySummaryMarkdown: attack.entitySummaryMarkdown,
    mitreAttackTactics: attack.mitreAttackTactics,
    timestamp: attack.timestamp,
    riskScore: attack.riskScore,
    alertIds: attack.alertIds,
    replacements: attack.replacements,
  };
};

/**
 * The attacks grid's bulk action bar: a count of the selection, and the attack take-action verbs
 * applied across it. Nothing here removes an attachment — an attack is removed from its own entry
 * in the case activity timeline, as an alert is.
 */
export const AttackTabBulkActions = ({
  selectedAttacks,
  onActionSuccess,
}: AttackTabBulkActionsProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const togglePopover = useCallback(() => setIsPopoverOpen((isOpen) => !isOpen), []);

  const invalidateAttackDiscoveriesCache = useInvalidateFindAttackDiscoveries();

  const onSuccess = useCallback(() => {
    invalidateAttackDiscoveriesCache();
    onActionSuccess();
  }, [invalidateAttackDiscoveriesCache, onActionSuccess]);

  // A row that resolved to nothing but its snapshot has no live document to act on, so it is
  // left out of every action rather than acted on with stale values.
  const resolvedAttacks = useMemo(
    () => selectedAttacks.flatMap(({ attack }) => (attack != null ? [attack] : [])),
    [selectedAttacks]
  );

  const baseAttackProps = useMemo(
    () =>
      resolvedAttacks.map((attack) => ({
        attackId: attack.id,
        attackIndex: attack.index,
        relatedAlertIds: getOriginalAlertIds({
          alertIds: attack.alertIds,
          replacements: attack.replacements,
        }),
      })),
    [resolvedAttacks]
  );

  const attacksWithWorkflowStatus = useMemo(
    () =>
      baseAttackProps.map((props, position) => ({
        ...props,
        workflowStatus: resolvedAttacks[position].alertWorkflowStatus,
      })) as AttackWithWorkflowStatus[],
    [baseAttackProps, resolvedAttacks]
  );

  const { items: workflowItems, panels: workflowPanels } = useAttackWorkflowStatusContextMenuItems({
    attacksWithWorkflowStatus,
    closePopover,
    onSuccess,
    telemetrySource: TELEMETRY_SOURCE,
  });

  const attacksWithTags = useMemo(
    () =>
      baseAttackProps.map((props, position) => ({
        ...props,
        tags: resolvedAttacks[position].tags,
      })),
    [baseAttackProps, resolvedAttacks]
  );

  const { items: tagsItems, panels: tagsPanels } = useAttackTagsContextMenuItems({
    attacksWithTags,
    closePopover,
    onSuccess,
    telemetrySource: TELEMETRY_SOURCE,
  });

  const attacksWithAssignees = useMemo(
    () =>
      baseAttackProps.map((props, position) => ({
        ...props,
        assignees: resolvedAttacks[position].assignees,
      })),
    [baseAttackProps, resolvedAttacks]
  );

  const { items: assignItems, panels: assignPanels } = useAttackAssigneesContextMenuItems({
    attacksWithAssignees,
    closePopover,
    onSuccess,
    telemetrySource: TELEMETRY_SOURCE,
  });

  const { items: runWorkflowItems, panels: runWorkflowPanels } =
    useAttackRunWorkflowContextMenuItems({
      attacksForWorkflowRun: baseAttackProps,
      closePopover,
      telemetrySource: TELEMETRY_SOURCE,
    });

  const { items: investigateInTimelineItems } = useAttackInvestigateInTimelineContextMenuItems({
    attacksWithTimelineAlerts: baseAttackProps,
    closePopover,
    telemetrySource: TELEMETRY_SOURCE,
  });

  // Only attachable where we know which index the attack document came from — the attachment
  // metadata requires it — so a selected attack without one is left out of the case items rather
  // than costing the rest of the selection the action.
  const attachableAttacks = useMemo(
    () => resolvedAttacks.filter(({ index }) => index != null),
    [resolvedAttacks]
  );

  const attacksWithCase = useMemo<AttackWithCase[]>(
    () =>
      attachableAttacks.map((attack) => ({
        attackId: attack.id,
        attackIndex: attack.index,
        relatedAlertIds: getOriginalAlertIds({
          alertIds: attack.alertIds,
          replacements: attack.replacements,
        }),
        markdownComment: getAttackDiscoveryMarkdown({
          attackDiscovery: attack,
          replacements: attack.replacements,
        }),
      })),
    [attachableAttacks]
  );

  const attackToAttach = useMemo(() => getAttackToAttach(attachableAttacks), [attachableAttacks]);

  const caseTitle = useMemo(
    () =>
      selectedAttacks.length === 1
        ? selectedAttacks[0].title
        : getSelectionTitle(selectedAttacks.length),
    [selectedAttacks]
  );

  const { items: caseItems } = useAttackCaseContextMenuItems({
    attacksWithCase,
    attackToAttach,
    closePopover,
    telemetrySource: TELEMETRY_SOURCE,
    title: caseTitle,
  });

  const menuItems = useMemo(
    () => [
      ...(attacksWithCase.length > 0 ? caseItems : []),
      ...workflowItems,
      ...tagsItems,
      ...assignItems,
      ...runWorkflowItems,
      ...investigateInTimelineItems,
    ],
    [
      assignItems,
      attacksWithCase.length,
      caseItems,
      investigateInTimelineItems,
      runWorkflowItems,
      tagsItems,
      workflowItems,
    ]
  );

  const panels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [
      { id: 0, items: menuItems },
      ...runWorkflowPanels,
      ...workflowPanels,
      ...assignPanels,
      ...tagsPanels,
    ],
    [assignPanels, menuItems, runWorkflowPanels, tagsPanels, workflowPanels]
  );

  if (selectedAttacks.length === 0) {
    return null;
  }

  return (
    <EuiFlexGroup
      alignItems="center"
      data-test-subj={ATTACK_TAB_BULK_ACTIONS_TEST_ID}
      gutterSize="s"
      responsive={false}
    >
      <EuiFlexItem grow={false}>
        <EuiText color="subdued" size="xs">
          {getSelectedLabel(selectedAttacks.length)}
        </EuiText>
      </EuiFlexItem>
      {/* A selection allowed to do nothing leaves nothing to open. */}
      {menuItems.length > 0 ? (
        <EuiFlexItem grow={false}>
          <EuiPopover
            anchorPosition="downLeft"
            aria-label={TAKE_ACTION}
            button={
              <EuiButtonEmpty
                data-test-subj={ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID}
                iconSide="right"
                iconType="arrowDown"
                onClick={togglePopover}
                size="xs"
              >
                {TAKE_ACTION}
              </EuiButtonEmpty>
            }
            closePopover={closePopover}
            id="attackTabBulkActionsPopover"
            isOpen={isPopoverOpen}
            panelPaddingSize="none"
            panelProps={{ 'data-test-subj': ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID }}
            repositionOnScroll
          >
            <EuiContextMenu initialPanelId={0} panels={panels} />
          </EuiPopover>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  );
};

AttackTabBulkActions.displayName = 'AttackTabBulkActions';
