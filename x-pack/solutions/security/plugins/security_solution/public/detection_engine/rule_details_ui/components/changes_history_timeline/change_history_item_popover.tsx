/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexItem,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { useBoolState } from '../../../../common/hooks/use_bool_state';
import * as i18n from './translations';

interface ChangeHistoryItemPopoverProps {
  onRestore?: () => void;
  onClick?: () => void;
  isRestoring?: boolean;
}

export const ChangeHistoryItemPopover = memo(function ChangeHistoryItemPopover({
  onRestore,
  onClick,
  isRestoring,
}: ChangeHistoryItemPopoverProps): JSX.Element | null {
  const [isPopoverOpen, , closePopover, togglePopover] = useBoolState();
  const popoverButton = useMemo(
    () => (
      <EuiToolTip content={i18n.RESTORE_ACTIONS_LABEL} disableScreenReaderOutput>
        <EuiButtonIcon
          iconType="boxesVertical"
          aria-label={i18n.RESTORE_ACTIONS_LABEL}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onClick?.();
            togglePopover();
          }}
        />
      </EuiToolTip>
    ),
    [onClick, togglePopover]
  );

  if (!onRestore) {
    return null;
  }

  return (
    <EuiFlexItem grow={false}>
      <EuiPopover
        button={popoverButton}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        anchorPosition="leftCenter"
        aria-label={i18n.RESTORE_ACTIONS_LABEL}
        ownFocus
        repositionOnScroll
      >
        <EuiContextMenuPanel
          items={[
            <EuiContextMenuItem
              key="restore"
              icon="undo"
              disabled={isRestoring}
              onClick={() => {
                closePopover();
                onRestore();
              }}
            >
              {i18n.RESTORE_REVISION_LABEL}
            </EuiContextMenuItem>,
          ]}
        />
      </EuiPopover>
    </EuiFlexItem>
  );
});
