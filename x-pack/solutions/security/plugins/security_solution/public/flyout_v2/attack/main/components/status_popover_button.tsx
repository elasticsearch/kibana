/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiContextMenu, EuiPopover, EuiPopoverTitle, useGeneratedHtmlId } from '@elastic/eui';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { useInvalidateFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { useAttackWorkflowStatusContextMenuItems } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_workflow_status_context_menu_items';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { inputsSelectors } from '../../../../common/store';
import type { inputsModel } from '../../../../common/store';
import { useSpaceId } from '../../../../common/hooks/use_space_id';
import type { AlertWorkflowStatus } from '../../../../common/types';
import { FormattedFieldValue } from '../../../../timelines/components/timeline/body/renderers/formatted_field';
import { CLICK_TO_CHANGE_ALERT_STATUS } from '../../../../detections/components/alerts_table/translations';
import { STATUS_POPOVER_BUTTON_TEST_ID, STATUS_POPOVER_TEST_ID } from '../constants/test_ids';

const FIELD_WORKFLOW_STATUS = 'kibana.alert.workflow_status' as const;
const FIELD_ALERT_IDS = 'kibana.alert.attack_discovery.alert_ids' as const;

export interface StatusPopoverButtonProps {
  /**
   * The attack document. All required data (attackId, alertIds, workflowStatus) is read from here.
   */
  hit: DataTableRecord;
  /**
   * When true, suppresses the status-change popover regardless of user permissions.
   * Use this when status mutations are not possible (e.g. remote/CCS documents).
   */
  disabled: boolean;
  /**
   * Called after a successful status change. Should trigger any necessary data refresh.
   */
  onAttackUpdated: () => void;
}

/**
 * Renders a button showing the current workflow status of an attack. Clicking it opens a
 * popover menu to change the status.
 */
export const StatusPopoverButton = memo(
  ({ hit, disabled, onAttackUpdated }: StatusPopoverButtonProps) => {
    const attackId = useMemo(
      () => hit.raw._id ?? (getFieldValue(hit, '_id') as string) ?? '',
      [hit]
    );
    const currentSpaceId = useSpaceId();

    const workflowStatus = useMemo(
      () => getFieldValue(hit, FIELD_WORKFLOW_STATUS) as AlertWorkflowStatus,
      [hit]
    );

    const alertIds = useMemo(() => {
      const value = hit.flattened[FIELD_ALERT_IDS];
      if (!value) return [];
      const arr = Array.isArray(value) ? value : [value];
      return [...new Set(arr as string[])];
    }, [hit]);

    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const togglePopover = useCallback(() => setIsPopoverOpen((prev) => !prev), []);
    const closePopover = useCallback(() => setIsPopoverOpen(false), []);
    const statusTitleId = useGeneratedHtmlId();

    const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuery(), []);
    const globalQueries = useDeepEqualSelector(getGlobalQuerySelector);
    const refetchGlobalQuery = useCallback(() => {
      globalQueries.forEach((q) => q.refetch && (q.refetch as inputsModel.Refetch)());
    }, [globalQueries]);

    const invalidateFindAttackDiscoveries = useInvalidateFindAttackDiscoveries();

    const onWorkflowStatusChange = useCallback(() => {
      invalidateFindAttackDiscoveries();
      refetchGlobalQuery();
      onAttackUpdated();
    }, [invalidateFindAttackDiscoveries, refetchGlobalQuery, onAttackUpdated]);

    const { items, panels } = useAttackWorkflowStatusContextMenuItems({
      attacksWithWorkflowStatus: [
        {
          attackId,
          relatedAlertIds: alertIds,
          workflowStatus,
        },
      ],
      closePopover: togglePopover,
      onSuccess: onWorkflowStatusChange,
      telemetrySource: 'attacks_page_flyout_header',
    });

    const statusPopoverVisible = useMemo(() => items.length > 0 && !disabled, [items, disabled]);

    const button = useMemo(
      () => (
        <FormattedFieldValue
          contextId={`${currentSpaceId}-attack-flyout-v2-status-popover-button`}
          eventId={attackId}
          value={workflowStatus}
          fieldName={FIELD_WORKFLOW_STATUS}
          fieldType="keyword"
          truncate={false}
          isButton={statusPopoverVisible}
          onClick={statusPopoverVisible ? togglePopover : undefined}
          onClickAriaLabel={CLICK_TO_CHANGE_ALERT_STATUS}
        />
      ),
      [currentSpaceId, attackId, workflowStatus, statusPopoverVisible, togglePopover]
    );

    if (!statusPopoverVisible) {
      return button;
    }

    return (
      <EuiPopover
        aria-labelledby={statusTitleId}
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        data-test-subj={STATUS_POPOVER_TEST_ID}
      >
        <EuiPopoverTitle id={statusTitleId} paddingSize="m">
          {i18n.translate(
            'xpack.securitySolution.flyoutV2.attack.header.popover.changeAttackStatus',
            {
              defaultMessage: 'Change attack status',
            }
          )}
        </EuiPopoverTitle>
        <EuiContextMenu
          panels={[{ id: 0, items }, ...panels]}
          initialPanelId={0}
          data-test-subj={STATUS_POPOVER_BUTTON_TEST_ID}
        />
      </EuiPopover>
    );
  }
);

StatusPopoverButton.displayName = 'StatusPopoverButton';
