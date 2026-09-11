/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import { EuiButton, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { flattenObject } from '@kbn/object-utils';
import { useEaseDetailsContext } from '../context';
import { useAddToCaseActions } from '../../../detections/components/alerts_table/timeline_actions/use_add_to_case_actions';
import { useAlertTagsActions } from '../../../detections/components/alerts_table/timeline_actions/use_alert_tags_actions';
import { AlertSummaryActionMenu } from '../../../detections/components/alert_summary/action_menu/alert_summary_action_menu';

export const TAKE_ACTION_BUTTON_TEST_ID = 'alert-summary-flyout-take-action';

export const TAKE_ACTION_BUTTON = i18n.translate(
  'xpack.securitySolution.alertSummary.flyout.takeActionsAriaLabel',
  {
    defaultMessage: 'Take action',
  }
);
export const ADD_TO_CASE_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.alertSummary.flyout.attachToCaseAriaLabel',
  {
    defaultMessage: 'Attach alert to case',
  }
);

/**
 * Take action button in the panel footer.
 * This is used in EASE alert summary page.
 * The following options are available:
 * - add to existing case
 * - add to new case
 * - apply alert tags
 */
export const TakeActionButton = memo(() => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const { dataAsNestedObject } = useEaseDetailsContext();

  const togglePopover = useCallback(() => setIsPopoverOpen((value) => !value), []);
  const closePopover = useCallback(() => setIsPopoverOpen(false), []);

  const button = useMemo(
    () => (
      <EuiButton
        aria-label={TAKE_ACTION_BUTTON}
        data-test-subj={TAKE_ACTION_BUTTON_TEST_ID}
        fill
        iconSide="right"
        iconType="chevronSingleDown"
        onClick={togglePopover}
      >
        {TAKE_ACTION_BUTTON}
      </EuiButton>
    ),
    [togglePopover]
  );

  const nonEcsData = useMemo(() => {
    const flattened = flattenObject(dataAsNestedObject);
    return Object.entries(flattened).map(([key, value]) => ({
      field: key,
      value: value as string[],
    }));
  }, [dataAsNestedObject]);

  const { addToCaseActionItems } = useAddToCaseActions({
    ecsData: dataAsNestedObject,
    nonEcsData,
    onMenuItemClick: closePopover,
    ariaLabel: ADD_TO_CASE_ARIA_LABEL,
  });

  const { alertTagsItems, alertTagsPanels } = useAlertTagsActions({
    closePopover,
    ecsRowData: dataAsNestedObject,
  });

  return (
    <EuiPopover
      aria-label={TAKE_ACTION_BUTTON}
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

TakeActionButton.displayName = 'TakeActionButton';
