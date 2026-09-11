/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { EuiButtonIcon, EuiPopover, EuiToolTip } from '@elastic/eui';
import type { EcsSecurityExtension } from '@kbn/securitysolution-ecs';
import type { Alert } from '@kbn/alerting-types';
import { i18n } from '@kbn/i18n';
import { expandDottedObject } from '../../../../../common/utils/expand_dotted';
import { useAlertTagsActions } from '../../alerts_table/timeline_actions/use_alert_tags_actions';
import { useAddToCaseActions } from '../../alerts_table/timeline_actions/use_add_to_case_actions';
import { AlertSummaryActionMenu } from '../action_menu/alert_summary_action_menu';

export const MORE_ACTIONS_BUTTON_TEST_ID = 'alert-summary-table-row-action-more-actions';

export const MORE_ACTIONS_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.alertSummary.table.moreActionsAriaLabel',
  {
    defaultMessage: 'More actions',
  }
);
export const ADD_TO_CASE_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.alertSummary.table.attachToCaseAriaLabel',
  {
    defaultMessage: 'Attach alert to case',
  }
);

export interface MoreActionsRowControlColumnProps {
  alert: Alert;
}

/**
 * Renders a horizontal 3-dot button which displays a context menu when clicked.
 * This is used in EASE alert summary table.
 * The following options are available:
 * - add to existing case
 * - add to new case
 * - apply alert tags
 */
export const MoreActionsRowControlColumn = memo(({ alert }: MoreActionsRowControlColumnProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const togglePopover = useCallback(() => setIsPopoverOpen((value) => !value), []);
  const closePopover = useCallback(() => setIsPopoverOpen(false), []);

  const ecsAlert = useMemo(() => expandDottedObject(alert) as EcsSecurityExtension, [alert]);

  const button = useMemo(
    () => (
      <EuiToolTip content={MORE_ACTIONS_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
        <EuiButtonIcon
          aria-label={MORE_ACTIONS_BUTTON_ARIA_LABEL}
          data-test-subj={MORE_ACTIONS_BUTTON_TEST_ID}
          iconType="boxesVertical"
          onClick={togglePopover}
        />
      </EuiToolTip>
    ),
    [togglePopover]
  );

  const nonEcsData = useMemo(
    () =>
      Object.entries(alert).map(([field, value]) => ({
        field,
        value: Array.isArray(value) ? (value as string[]) : value != null ? [String(value)] : [],
      })),
    [alert]
  );

  const { addToCaseActionItems } = useAddToCaseActions({
    ecsData: ecsAlert,
    nonEcsData,
    onMenuItemClick: closePopover,
    ariaLabel: ADD_TO_CASE_ARIA_LABEL,
  });

  const { alertTagsItems, alertTagsPanels } = useAlertTagsActions({
    closePopover,
    ecsRowData: ecsAlert,
  });

  return (
    <EuiPopover
      aria-label={MORE_ACTIONS_BUTTON_ARIA_LABEL}
      button={button}
      closePopover={togglePopover}
      isOpen={isPopoverOpen}
      panelPaddingSize="none"
    >
      <AlertSummaryActionMenu
        addToCaseItems={addToCaseActionItems}
        alertTagsItems={alertTagsItems}
        panels={alertTagsPanels}
      />
    </EuiPopover>
  );
});

MoreActionsRowControlColumn.displayName = 'MoreActionsRowControlColumn';
