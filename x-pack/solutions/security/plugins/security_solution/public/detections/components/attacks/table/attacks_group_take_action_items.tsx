/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiContextMenu } from '@elastic/eui';
import {
  type AttackDiscoveryAlert,
  getAttackDiscoveryMarkdown,
  getOriginalAlertIds,
} from '@kbn/elastic-assistant-common';
import React, { useCallback, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../../../common/lib/kibana';
import { useInvalidateFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import type { inputsModel } from '../../../../common/store';
import { inputsSelectors } from '../../../../common/store';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { useAttackAssigneesContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_assignees_context_menu_items';
import { useAttackWorkflowStatusContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items';
import type { AttackWithWorkflowStatus } from '../../../hooks/attacks/bulk_actions/types';
import { useAttackTagsContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_tags_context_menu_items';
import { useAttackInvestigateInTimelineContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_investigate_in_timeline_context_menu_items';
import { useAttackExploreInAttacksContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_explore_in_attacks_context_menu_items';
import { useAttackCaseContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_case_context_menu_items';
import { useAttackViewInAiAssistantContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_view_in_ai_assistant_context_menu_items';
import type { AttacksActionTelemetrySource } from '../../../../common/lib/telemetry/events/attacks/types';
import { useAttackRunWorkflowContextMenuItems } from '../../../hooks/attacks/bulk_actions/context_menu_items/use_attack_run_workflow_context_menu_items';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import type { AttackToAttach } from '../../../../cases/attachments/attack';

interface AttacksGroupTakeActionItemsProps {
  attack: AttackDiscoveryAlert;
  /** Optional callback to close the containing popover menu */
  closePopover?: () => void;
  /** Optional callback to run after an action is successfully taken */
  onActionSuccess?: () => void;
  /** Whether to include the AI assistant action in the menu (default true) */
  showAiAssistantAction?: boolean;
  /**
   * Whether to include the investigate in timeline / explore in attacks navigation action in the
   * menu (default true). Set to false where the surface already offers it as its own control.
   */
  showNavigationAction?: boolean;
  /** Telemetry source for action events (e.g. flyout vs table) */
  telemetrySource: AttacksActionTelemetrySource;
  /**
   * When true, only the "Investigate in Timeline" action is shown.
   * Use this for remote/CCS attacks where mutations are not possible.
   */
  isRemoteDocument: boolean;
}

const ADD_TO_DATASET = i18n.translate(
  'xpack.securitySolution.attacks.table.takeAction.addToDatasetButtonLabel',
  { defaultMessage: 'Add to dataset' }
);

export function AttacksGroupTakeActionItems({
  attack,
  closePopover,
  onActionSuccess,
  showAiAssistantAction = true,
  showNavigationAction = true,
  telemetrySource,
  isRemoteDocument,
}: AttacksGroupTakeActionItemsProps) {
  const {
    services: { evals },
  } = useKibana();
  const invalidateAttackDiscoveriesCache = useInvalidateFindAttackDiscoveries();
  const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuery(), []);
  const globalQueries = useDeepEqualSelector(getGlobalQuerySelector);
  const refetchQuery = useCallback(() => {
    globalQueries.forEach((q) => q.refetch && (q.refetch as inputsModel.Refetch)());
  }, [globalQueries]);

  const originalAlertIds = useMemo(
    () => getOriginalAlertIds({ alertIds: attack.alertIds, replacements: attack.replacements }),
    [attack.alertIds, attack.replacements]
  );

  const baseAttackProps = useMemo(() => {
    return { attackId: attack.id, attackIndex: attack.index, relatedAlertIds: originalAlertIds };
  }, [attack.id, attack.index, originalAlertIds]);

  const attacksWithAssignees = useMemo(() => {
    return [{ ...baseAttackProps, assignees: attack.assignees }];
  }, [attack.assignees, baseAttackProps]);

  const onSuccess = useCallback(() => {
    invalidateAttackDiscoveriesCache();
    refetchQuery();
    onActionSuccess?.();
  }, [invalidateAttackDiscoveriesCache, refetchQuery, onActionSuccess]);

  const { items: assignItems, panels: assignPanels } = useAttackAssigneesContextMenuItems({
    attacksWithAssignees,
    onSuccess,
    closePopover,
    telemetrySource,
  });

  const attacksWithWorkflowStatus = useMemo(() => {
    return [
      { ...baseAttackProps, workflowStatus: attack.alertWorkflowStatus },
    ] as AttackWithWorkflowStatus[];
  }, [attack.alertWorkflowStatus, baseAttackProps]);

  const { items: workflowItems, panels: workflowPanels } = useAttackWorkflowStatusContextMenuItems({
    attacksWithWorkflowStatus,
    onSuccess,
    closePopover,
    telemetrySource,
  });

  const attacksWithTags = useMemo(() => {
    return [{ ...baseAttackProps, tags: attack.tags }];
  }, [attack.tags, baseAttackProps]);

  const { items: tagsItems, panels: tagsPanels } = useAttackTagsContextMenuItems({
    attacksWithTags,
    onSuccess,
    closePopover,
    telemetrySource,
  });

  const attacksWithTimelineAlerts = useMemo(() => [{ ...baseAttackProps }], [baseAttackProps]);

  const { items: runWorkflowItems, panels: runWorkflowPanels } =
    useAttackRunWorkflowContextMenuItems({
      attacksForWorkflowRun: attacksWithTimelineAlerts,
      closePopover,
      telemetrySource,
    });

  const { items: investigateInTimelineItems } = useAttackInvestigateInTimelineContextMenuItems({
    attacksWithTimelineAlerts,
    closePopover,
    telemetrySource,
  });

  const { items: exploreInAttacksItems } = useAttackExploreInAttacksContextMenuItems({
    attack,
    closePopover,
  });

  const isInSecurityApp = useIsInSecurityApp();
  const navigationItems = isInSecurityApp ? investigateInTimelineItems : exploreInAttacksItems;

  const attacksWithCase = useMemo(
    () => [
      {
        ...baseAttackProps,
        markdownComment: getAttackDiscoveryMarkdown({
          attackDiscovery: attack,
          replacements: attack.replacements,
        }),
      },
    ],
    [attack, baseAttackProps]
  );

  // Only attachable as a `security.attack` when we know which index the attack document came
  // from — the attachment metadata requires it for the duplicate check and for status sync — so
  // without it the menu falls back to the markdown-comment payload.
  const attackToAttach = useMemo<Omit<AttackToAttach, 'alertsIndex'> | undefined>(
    () =>
      attack.index != null
        ? {
            id: attack.id,
            index: attack.index,
            title: attack.title,
            // The narrative the activity card renders from. Still anonymised here; the payload
            // builder de-anonymises and truncates it.
            summaryMarkdown: attack.summaryMarkdown,
            detailsMarkdown: attack.detailsMarkdown,
            entitySummaryMarkdown: attack.entitySummaryMarkdown,
            mitreAttackTactics: attack.mitreAttackTactics,
            timestamp: attack.timestamp,
            riskScore: attack.riskScore,
            // Raw (possibly anonymised) ids plus the replacements that reverse them; the payload
            // builder de-anonymises and dedupes.
            alertIds: attack.alertIds,
            replacements: attack.replacements,
          }
        : undefined,
    [
      attack.alertIds,
      attack.detailsMarkdown,
      attack.entitySummaryMarkdown,
      attack.id,
      attack.index,
      attack.mitreAttackTactics,
      attack.replacements,
      attack.riskScore,
      attack.summaryMarkdown,
      attack.timestamp,
      attack.title,
    ]
  );

  const { items: casesItems } = useAttackCaseContextMenuItems({
    closePopover,
    title: attack.title,
    attacksWithCase,
    telemetrySource,
    attackToAttach,
  });
  const { items: viewInAiAssistantItems } = useAttackViewInAiAssistantContextMenuItems({
    attack,
    closePopover,
    telemetrySource,
  });

  const addToDatasetAction = useMemo(() => {
    if (!evals?.getAddToDatasetAction) return null;

    return evals.getAddToDatasetAction({
      label: ADD_TO_DATASET,
      title: ADD_TO_DATASET,
      onBeforeOpen: closePopover,
      initialExample: {
        input: {
          attackDiscovery: {
            id: attack.id,
            title: attack.title,
            alertIds: attack.alertIds,
            detailsMarkdown: attack.detailsMarkdown,
            summaryMarkdown: attack.summaryMarkdown,
            replacements: attack.replacements,
          },
        },
        output: {
          title: attack.title,
        },
        metadata: {
          source: 'security_attack_discovery',
          attack_discovery_id: attack.id,
        },
      },
    });
  }, [attack, closePopover, evals]);

  const datasetItems = useMemo(
    () =>
      addToDatasetAction != null
        ? [
            {
              'data-test-subj': 'addToDataset',
              key: 'addToDataset',
              name: addToDatasetAction.label,
              onClick: addToDatasetAction.onClick,
            },
          ]
        : [],
    [addToDatasetAction]
  );

  const defaultPanel: EuiContextMenuPanelDescriptor = useMemo(
    () => ({
      id: 0,
      items: isRemoteDocument
        ? [...navigationItems]
        : [
            ...casesItems,
            ...workflowItems,
            ...tagsItems,
            ...assignItems,
            ...runWorkflowItems,
            ...(showAiAssistantAction ? viewInAiAssistantItems : []),
            ...datasetItems,
            ...(showNavigationAction ? navigationItems : []),
          ],
    }),
    [
      isRemoteDocument,
      runWorkflowItems,
      workflowItems,
      assignItems,
      tagsItems,
      navigationItems,
      casesItems,
      showAiAssistantAction,
      showNavigationAction,
      viewInAiAssistantItems,
      datasetItems,
    ]
  );

  const panels: EuiContextMenuPanelDescriptor[] = useMemo(
    () =>
      isRemoteDocument
        ? [defaultPanel]
        : [defaultPanel, ...runWorkflowPanels, ...workflowPanels, ...assignPanels, ...tagsPanels],
    [isRemoteDocument, runWorkflowPanels, workflowPanels, assignPanels, defaultPanel, tagsPanels]
  );

  return <EuiContextMenu initialPanelId={defaultPanel.id} panels={panels} />;
}
