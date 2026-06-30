/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiListGroup, EuiPopover, EuiToolTip } from '@elastic/eui';
import React, { useCallback, useEffect, useState } from 'react';
import { useChangeHistoryModal } from '@kbn/change-history-ui';
import { i18n } from '@kbn/i18n';

import {
  useWorkflowChangeHistoryEnabled,
  WorkflowChangeHistoryListItem,
} from '../../../features/change_history';

const WorkflowDetailActionsMenuContent = (): JSX.Element => {
  const { isOpen: isChangeHistoryOpen } = useChangeHistoryModal();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const closePopover = useCallback(() => {
    setIsPopoverOpen(false);
  }, []);

  const togglePopover = useCallback(() => {
    setIsPopoverOpen((isOpen) => !isOpen);
  }, []);

  useEffect(() => {
    if (isChangeHistoryOpen) {
      closePopover();
    }
  }, [closePopover, isChangeHistoryOpen]);

  const actionsMenuAriaLabel = i18n.translate(
    'workflows.workflowDetailHeader.actionsMenuButtonAriaLabel',
    {
      defaultMessage: 'Workflow actions',
    }
  );

  return (
    <EuiPopover
      aria-label={i18n.translate('workflows.workflowDetailHeader.actionsMenuAriaLabel', {
        defaultMessage: 'Workflow actions',
      })}
      button={
        <EuiToolTip content={actionsMenuAriaLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            display="base"
            iconType="boxesVertical"
            size="s"
            aria-label={actionsMenuAriaLabel}
            data-test-subj="workflowDetailActionsMenuButton"
            onClick={togglePopover}
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="s"
      anchorPosition="downRight"
    >
      <EuiListGroup maxWidth={false}>
        <WorkflowChangeHistoryListItem />
      </EuiListGroup>
    </EuiPopover>
  );
};

export const WorkflowDetailActionsMenu = (): JSX.Element | null => {
  const isChangeHistoryEnabled = useWorkflowChangeHistoryEnabled();

  if (!isChangeHistoryEnabled) {
    return null;
  }

  return <WorkflowDetailActionsMenuContent />;
};
