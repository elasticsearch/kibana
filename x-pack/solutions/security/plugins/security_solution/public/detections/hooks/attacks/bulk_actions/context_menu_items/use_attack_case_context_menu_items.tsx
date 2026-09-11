/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';

import { useBulkAttackCaseItems } from '../bulk_action_items/use_bulk_attack_case_items';
import { transformBulkActionsToContextMenuItems } from '../utils/transform_bulk_actions_to_context_menu_items';
import {
  ALERT_ATTACK_DISCOVERY_ALERT_IDS,
  ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT,
} from '../constants';
import type {
  AttackWithCase,
  BaseAttackContextMenuItemsProps,
  BulkAttackContextMenuItems,
} from '../types';
import type { AttackToAttach } from '../../../../../cases/attachments/attack';

export interface UseAttackCaseContextMenuItemsProps extends BaseAttackContextMenuItemsProps {
  /** Array of attacks with alert ids and markdown comments */
  attacksWithCase: AttackWithCase[];
  /** Title used to initialize "create case" flyout */
  title: string;
  /**
   * The single attack being attached. Supplied by surfaces that hold the whole attack document, so
   * that with `attackAttachmentsEnabled` on the attack is posted as a `security.attack` attachment
   * instead of a markdown comment. Omit it to keep the markdown-comment behaviour.
   */
  attackToAttach?: Omit<AttackToAttach, 'alertsIndex'>;
}

export const useAttackCaseContextMenuItems = ({
  attacksWithCase,
  title,
  closePopover,
  clearSelection,
  setIsLoading,
  refresh,
  telemetrySource,
  attackToAttach,
}: UseAttackCaseContextMenuItemsProps): BulkAttackContextMenuItems => {
  const bulkActionItems = useBulkAttackCaseItems({
    title,
    closePopover,
    telemetrySource,
    attackToAttach,
  });

  const alertItems = useMemo(
    () =>
      attacksWithCase.map((attack) => ({
        _id: attack.attackId,
        data: [
          { field: ALERT_ATTACK_DISCOVERY_ALERT_IDS, value: attack.relatedAlertIds },
          { field: ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT, value: [attack.markdownComment] },
        ],
        ecs: { _id: attack.attackId },
      })),
    [attacksWithCase]
  );

  const contextMenuItems = useMemo(
    () =>
      transformBulkActionsToContextMenuItems({
        bulkActionItems,
        alertItems,
        closePopover,
        clearSelection,
        setIsLoading,
        refresh,
      }),
    [bulkActionItems, alertItems, closePopover, clearSelection, setIsLoading, refresh]
  );

  return contextMenuItems;
};
