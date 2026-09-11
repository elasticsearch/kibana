/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiContextMenu, EuiPopover, EuiPopoverTitle, useGeneratedHtmlId } from '@elastic/eui';
import React, { memo, useCallback, useMemo, useState } from 'react';
import type { SerializedFieldFormat } from '@kbn/field-formats-plugin/common';
import { getFieldFormat } from '../../../shared/utils/get_field_format';
import { useAlertsActions } from '../../../../detections/components/alerts_table/timeline_actions/use_alerts_actions';
import { withStatusDotIcons } from '../../../../common/utils/action_menu_items';
import { ALERT_STATUS_ICON_COLORS } from '../../../../common/components/toolbar/bulk_actions/use_bulk_action_items';
import type { Status } from '../../../../../common/api/detection_engine';
import {
  CHANGE_ALERT_STATUS,
  CLICK_TO_CHANGE_ALERT_STATUS,
} from '../../../../detections/components/alerts_table/translations';
import { FormattedFieldValue } from '../../../../timelines/components/timeline/body/renderers/formatted_field';
import type { FlyoutActionType } from '../../../../common/lib/telemetry';
import { FLYOUT_ACTION, FLYOUT_HEADER_ITEM, FLYOUT_TYPE } from '../../../../common/lib/telemetry';
import { useFlyoutTelemetry } from '../../../shared/hooks/use_flyout_telemetry';
import { wrapActionTelemetry } from '../utils/wrap_action_telemetry';

// Same status items as the footer's take-action menu (both come from `useAlertsActions`).
// Keyed on item.key (the stable action id from ALERT_STATUS_ACTION_IDS / ALERT_CLOSE_WITH_REASON_ACTION_ID).
const STATUS_ACTIONS_BY_ID: Partial<Record<string, FlyoutActionType>> = {
  open: FLYOUT_ACTION.STATUS_OPEN,
  acknowledge: FLYOUT_ACTION.STATUS_ACKNOWLEDGED,
  'close-alert-with-reason': FLYOUT_ACTION.STATUS_CLOSED,
};

export interface StatusPopoverButtonFieldInfo {
  data: {
    field: string;
    format?: string | SerializedFieldFormat;
    type: string;
  };
  values: string[];
  linkValue?: string;
}

interface StatusPopoverButtonProps {
  /**
   * Id of the document
   */
  eventId: string;
  /**
   * Value used to create a unique identifier in children components
   */
  contextId: string;
  /**
   * Information used to
   */
  enrichedFieldInfo: StatusPopoverButtonFieldInfo;
  /**
   * Maintain backwards compatibility // TODO remove when possible
   */
  scopeId: string;
  /**
   * Optional callback to refresh the hosting flyout after a status mutation.
   */
  onStatusUpdated?: () => void;
  /**
   * When true, suppresses the status-change popover regardless of user permissions.
   * Use this when status mutations are not possible (e.g. remote/CCS documents).
   */
  disabled: boolean;
}

/**
 * Renders a button and its popover to display the status of an alert and allows the user to change it.
 * It is used in the header of the document details flyout.
 */
export const StatusPopoverButton = memo(
  ({
    eventId,
    contextId,
    enrichedFieldInfo,
    scopeId,
    onStatusUpdated,
    disabled,
  }: StatusPopoverButtonProps) => {
    const popoverTitleId = useGeneratedHtmlId();
    const { reportActionClicked, reportHeaderItemClicked } = useFlyoutTelemetry();

    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const togglePopover = useCallback(() => setIsPopoverOpen((prev) => !prev), []);
    const closePopover = useCallback(() => setIsPopoverOpen(false), []);

    const handleBadgeClick = useCallback(() => {
      reportHeaderItemClicked({
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        item: FLYOUT_HEADER_ITEM.STATUS,
      });
      togglePopover();
    }, [reportHeaderItemClicked, togglePopover]);

    const { actionItems: rawActionItems, panels: actionItemsPanels } = useAlertsActions({
      closePopover,
      eventId,
      scopeId,
      alertStatus: enrichedFieldInfo.values[0] as Status,
      refetch: onStatusUpdated,
    });

    const actionItems = useMemo(
      () =>
        wrapActionTelemetry(
          withStatusDotIcons(rawActionItems, ALERT_STATUS_ICON_COLORS),
          STATUS_ACTIONS_BY_ID,
          reportActionClicked
        ),
      [rawActionItems, reportActionClicked]
    );

    const panels = useMemo(
      () => [{ id: 0, items: actionItems }, ...actionItemsPanels],
      [actionItems, actionItemsPanels]
    );

    // statusPopoverVisible controls popover availability: requires both write-capable
    // action items (i.e. user has update permissions) and the component not being disabled
    // (e.g. remote/CCS documents where status mutations are not possible).
    const statusPopoverVisible = useMemo(
      () => actionItems.length > 0 && !disabled,
      [actionItems, disabled]
    );

    const button = useMemo(
      () => (
        <FormattedFieldValue
          contextId={contextId}
          eventId={eventId}
          value={enrichedFieldInfo.values[0]}
          fieldName={enrichedFieldInfo.data.field}
          linkValue={enrichedFieldInfo.linkValue}
          fieldType={enrichedFieldInfo.data.type}
          fieldFormat={getFieldFormat(enrichedFieldInfo.data)}
          truncate={false}
          isButton={statusPopoverVisible}
          onClick={statusPopoverVisible ? handleBadgeClick : undefined}
          onClickAriaLabel={CLICK_TO_CHANGE_ALERT_STATUS}
        />
      ),
      [contextId, eventId, enrichedFieldInfo, handleBadgeClick, statusPopoverVisible]
    );

    // EuiPopover is not needed if statusPopoverVisible is false
    if (!statusPopoverVisible) {
      return button;
    }

    return (
      <EuiPopover
        aria-labelledby={popoverTitleId}
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        data-test-subj="alertStatus"
      >
        <EuiPopoverTitle id={popoverTitleId} paddingSize="m">
          {CHANGE_ALERT_STATUS}
        </EuiPopoverTitle>
        <EuiContextMenu
          panels={panels}
          initialPanelId={0}
          data-test-subj="event-details-alertStatusPopover"
        />
      </EuiPopover>
    );
  }
);

StatusPopoverButton.displayName = 'StatusPopoverButton';
