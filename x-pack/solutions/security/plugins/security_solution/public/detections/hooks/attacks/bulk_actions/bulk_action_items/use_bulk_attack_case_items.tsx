/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import type { BulkActionsConfig } from '@kbn/response-ops-alerts-table/types';
import { useAssistantContext } from '@kbn/elastic-assistant';

import { useAddToExistingCase } from '../../../../../attack_discovery/pages/results/take_action/use_add_to_existing_case';
import { useAddToNewCase } from '../../../../../attack_discovery/pages/results/take_action/use_add_to_case';
import { APP_ID } from '../../../../../../common';
import { useKibana } from '../../../../../common/lib/kibana';
import { useAppToasts } from '../../../../../common/hooks/use_app_toasts';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { AttacksEventTypes } from '../../../../../common/lib/telemetry';
import type { AttacksActionTelemetrySource } from '../../../../../common/lib/telemetry';
import type { AttackToAttach } from '../../../../../cases/attachments/attack';
import { buildAttackAttachments } from '../../../../../cases/attachments/attack';
import { ADD_TO_EXISTING_CASE, ADD_TO_NEW_CASE, ATTACK_ALERTS_TRUNCATED } from '../translations';
import { ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT } from '../constants';
import type { BulkAttackActionItems } from '../types';
import { extractRelatedDetectionAlertIds } from '../utils/extract_related_detection_alert_ids';

export interface UseBulkAttackCaseItemsProps {
  /** Title used to initialize "create case" flyout */
  title: string;
  /** Optional callback when add-to-case action is triggered */
  onCasesAdd?: () => void;
  /** Optional callback to close the popover after triggering action */
  closePopover?: () => void;
  /** Source of the action for telemetry */
  telemetrySource?: AttacksActionTelemetrySource;
  /**
   * The single attack being attached, when the caller has the whole attack document to hand.
   * With `attackAttachmentsEnabled` on this is posted as a `security.attack` attachment plus a
   * single `security.alert` attachment holding its constituent alerts; otherwise the
   * markdown-comment payload built from the clicked rows is posted instead. `alertsIndex` is
   * resolved here from the assistant context, so callers don't supply it.
   */
  attackToAttach?: Omit<AttackToAttach, 'alertsIndex'>;
}

/**
 * Hook that provides bulk action items for adding attacks to a new or existing case.
 */
export const useBulkAttackCaseItems = ({
  title,
  onCasesAdd,
  closePopover,
  telemetrySource,
  attackToAttach,
}: UseBulkAttackCaseItemsProps): BulkAttackActionItems => {
  const {
    services: { cases, telemetry },
  } = useKibana();
  const { alertsIndexPattern } = useAssistantContext();
  const { addWarning } = useAppToasts();
  const attackAttachmentsEnabled = useIsExperimentalFeatureEnabled('attackAttachmentsEnabled');
  // A unified-only attachment type cannot be written when the Cases attachments framework is off,
  // so fall back to the markdown payload rather than failing the attach.
  const canAttachAttack =
    attackAttachmentsEnabled && cases.config.attachmentsEnabled && attackToAttach != null;
  const userCasesPermissions = cases.helpers.canUseCases([APP_ID]);
  const canCreateAndReadCases = userCasesPermissions.createComment && userCasesPermissions.read;
  const canUserCreateAndReadCases = useCallback(
    () => canCreateAndReadCases,
    [canCreateAndReadCases]
  );

  const { onAddToNewCase, disabled: isAddToNewCaseDisabled } = useAddToNewCase({
    canUserCreateAndReadCases,
    title,
    onClick: onCasesAdd,
  });

  const { onAddToExistingCase, disabled: isAddToExistingCaseDisabled } = useAddToExistingCase({
    canUserCreateAndReadCases,
    onClick: onCasesAdd,
  });

  /**
   * The `security.attack` payload for {@link attackToAttach}, or undefined when the feature is off
   * and the markdown-comment payload should be built from the clicked rows instead.
   */
  const attackAttachments = useMemo(() => {
    if (!canAttachAttack || attackToAttach == null) {
      return undefined;
    }

    return buildAttackAttachments({
      ...attackToAttach,
      alertsIndex: alertsIndexPattern ?? '',
    });
  }, [alertsIndexPattern, attackToAttach, canAttachAttack]);

  const warnIfTruncated = useCallback(() => {
    if (attackAttachments?.truncated) {
      addWarning({
        title: ATTACK_ALERTS_TRUNCATED({
          alertCount: attackAttachments.alertCount,
          attachedAlertCount: attackAttachments.attachedAlertCount,
        }),
      });
    }
  }, [addWarning, attackAttachments]);

  const onAddToNewCaseClick = useCallback<Required<BulkActionsConfig>['onClick']>(
    async (alertItems) => {
      const alertIds = extractRelatedDetectionAlertIds(alertItems);
      const markdownComments = alertItems
        .map((item) => {
          const value = item.data.find(
            (data) => data.field === ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT
          )?.value;
          if (!Array.isArray(value)) {
            return undefined;
          }
          return typeof value[0] === 'string' ? value[0] : undefined;
        })
        .filter((comment): comment is string => comment != null);

      if (telemetrySource) {
        telemetry.reportEvent(AttacksEventTypes.ActionAddedToCase, {
          source: telemetrySource,
          action: 'add_to_new_case',
        });
      }

      if (attackAttachments != null) {
        onAddToNewCase({
          alertIds: [],
          markdownComments: [],
          attachments: attackAttachments.attachments,
        });
        warnIfTruncated();
      } else {
        onAddToNewCase({ alertIds, markdownComments });
      }

      closePopover?.();
    },
    [attackAttachments, closePopover, onAddToNewCase, telemetrySource, telemetry, warnIfTruncated]
  );

  const onAddToExistingCaseClick = useCallback<Required<BulkActionsConfig>['onClick']>(
    async (alertItems) => {
      const alertIds = extractRelatedDetectionAlertIds(alertItems);
      const markdownComments = alertItems
        .map((item) => {
          const value = item.data.find(
            (data) => data.field === ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT
          )?.value;
          if (!Array.isArray(value)) {
            return undefined;
          }
          return typeof value[0] === 'string' ? value[0] : undefined;
        })
        .filter((comment): comment is string => comment != null);

      if (telemetrySource) {
        telemetry.reportEvent(AttacksEventTypes.ActionAddedToCase, {
          source: telemetrySource,
          action: 'add_to_existing_case',
        });
      }

      if (attackAttachments != null) {
        onAddToExistingCase({
          alertIds: [],
          markdownComments: [],
          attachments: attackAttachments.attachments,
        });
        warnIfTruncated();
      } else {
        onAddToExistingCase({ alertIds, markdownComments });
      }

      closePopover?.();
    },
    [
      attackAttachments,
      closePopover,
      onAddToExistingCase,
      telemetrySource,
      telemetry,
      warnIfTruncated,
    ]
  );

  const items = useMemo<BulkActionsConfig[]>(
    () =>
      canCreateAndReadCases
        ? [
            {
              name: ADD_TO_EXISTING_CASE,
              label: ADD_TO_EXISTING_CASE,
              key: 'attack-add-to-existing-case',
              'data-test-subj': 'attack-add-to-existing-case',
              disableOnQuery: true,
              disable: isAddToExistingCaseDisabled,
              onClick: onAddToExistingCaseClick,
            },
            {
              name: ADD_TO_NEW_CASE,
              label: ADD_TO_NEW_CASE,
              key: 'attack-add-to-new-case',
              'data-test-subj': 'attack-add-to-new-case',
              disableOnQuery: true,
              disable: isAddToNewCaseDisabled,
              onClick: onAddToNewCaseClick,
            },
          ]
        : [],
    [
      canCreateAndReadCases,
      isAddToExistingCaseDisabled,
      isAddToNewCaseDisabled,
      onAddToExistingCaseClick,
      onAddToNewCaseClick,
    ]
  );

  return useMemo(
    () => ({
      items,
      panels: [],
    }),
    [items]
  );
};
