/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiContextMenu } from '@elastic/eui';
import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import React, { useMemo } from 'react';
import { withActionIcons } from '../../../../common/utils/action_menu_items';
import { ALERT_TAG_ACTION_ID } from '../../../../common/components/toolbar/bulk_actions/use_bulk_alert_tags_items';
import { ADD_TO_CASE_ACTION_IDS } from '../../alerts_table/timeline_actions/use_add_to_case_actions';

interface AlertSummaryActionMenuProps {
  addToCaseItems: EuiContextMenuPanelItemDescriptor[];
  alertTagsItems: EuiContextMenuPanelItemDescriptor[];
  panels: EuiContextMenuPanelDescriptor[];
}

const ACTION_ICONS_BY_ID = {
  [ADD_TO_CASE_ACTION_IDS.addToCase]: 'briefcase',
  [ALERT_TAG_ACTION_ID]: 'tag',
} as const;

export const AlertSummaryActionMenu = ({
  addToCaseItems,
  alertTagsItems,
  panels,
}: AlertSummaryActionMenuProps) => {
  const items = useMemo(
    () => withActionIcons([...addToCaseItems, ...alertTagsItems], ACTION_ICONS_BY_ID),
    [addToCaseItems, alertTagsItems]
  );

  return <EuiContextMenu initialPanelId={0} panels={[{ id: 0, items }, ...panels]} />;
};
