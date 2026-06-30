/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { EuiButtonIcon, EuiContextMenu, EuiPopover, EuiToolTip } from '@elastic/eui';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { ENTITY_ANOMALY_TABLE_ACTIONS_COLUMN_TOOLTIP } from '../translations';
import type { TableRow } from './types';
import { useAnomalyTableRowActions } from '../../../api/hooks/use_anomaly_table_row_actions';

interface AnomalyRowActionsMenuProps {
  row: TableRow;
  timeRange: { from: string; to: string };
}

export const AnomalyRowActionsMenu: React.FC<AnomalyRowActionsMenuProps> = ({ row, timeRange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const closePopover = useCallback(() => setIsOpen(false), []);
  const togglePopover = useCallback(() => setIsOpen((value) => !value), []);

  const { actions } = useAnomalyTableRowActions({ row, timeRange, closePopover });

  const panels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [
      {
        id: 0,
        items: actions.map((action) => ({
          name: action.label,
          icon: action.icon,
          onClick: action.onClick,
        })),
      },
    ],
    [actions]
  );

  const button = (
    <EuiToolTip content={ENTITY_ANOMALY_TABLE_ACTIONS_COLUMN_TOOLTIP} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType="boxesVertical"
        aria-label={ENTITY_ANOMALY_TABLE_ACTIONS_COLUMN_TOOLTIP}
        onClick={togglePopover}
        color={isOpen ? 'primary' : 'text'}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      aria-label={ENTITY_ANOMALY_TABLE_ACTIONS_COLUMN_TOOLTIP}
      button={button}
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downRight"
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};
