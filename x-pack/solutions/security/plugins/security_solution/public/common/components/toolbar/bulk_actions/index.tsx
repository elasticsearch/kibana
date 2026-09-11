/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiPopover, EuiButtonEmpty } from '@elastic/eui';
import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { EventsTableBulkActionMenu } from './events_table_bulk_action_menu';
import type { BulkActionGroups } from './use_bulk_action_items';

interface OwnProps {
  selectText: string;
  selectClearAllText: string;
  showClearSelection: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  bulkActionPanels: EuiContextMenuPanelDescriptor[];
  bulkActionGroups: BulkActionGroups;
  closePopoverRef?: React.MutableRefObject<() => void>;
}

const BulkActionsContainer = styled.div`
  display: inline-block;
  position: relative;
`;

BulkActionsContainer.displayName = 'BulkActionsContainer';

/**
 * Stateless component integrating the bulk actions menu and the select all button
 */
const BulkActionsComponent: React.FC<OwnProps> = ({
  selectText,
  selectClearAllText,
  showClearSelection,
  onSelectAll,
  onClearSelection,
  bulkActionPanels,
  bulkActionGroups,
  closePopoverRef,
}) => {
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);

  const toggleIsActionOpen = useCallback(() => {
    setIsActionsPopoverOpen((currentIsOpen) => !currentIsOpen);
  }, [setIsActionsPopoverOpen]);

  const closeActionPopover = useCallback(() => {
    setIsActionsPopoverOpen(false);
  }, [setIsActionsPopoverOpen]);

  useEffect(() => {
    if (closePopoverRef) {
      closePopoverRef.current = closeActionPopover;
    }
  }, [closePopoverRef, closeActionPopover]);

  const toggleSelectAll = useCallback(() => {
    if (!showClearSelection) {
      onSelectAll();
    } else {
      onClearSelection();
    }
  }, [onClearSelection, onSelectAll, showClearSelection]);

  return (
    <BulkActionsContainer data-test-subj="bulk-actions-button-container">
      <EuiPopover
        aria-label={selectText}
        isOpen={isActionsPopoverOpen}
        anchorPosition="upCenter"
        panelPaddingSize="none"
        button={
          <EuiButtonEmpty
            aria-label="selectedShowBulkActions"
            data-test-subj="selectedShowBulkActionsButton"
            size="xs"
            iconType="chevronSingleDown"
            iconSide="right"
            color="primary"
            onClick={toggleIsActionOpen}
          >
            {selectText}
          </EuiButtonEmpty>
        }
        closePopover={closeActionPopover}
      >
        <EventsTableBulkActionMenu panels={bulkActionPanels} groups={bulkActionGroups} />
      </EuiPopover>

      <EuiButtonEmpty
        size="xs"
        aria-label="selectAllAlerts"
        data-test-subj="selectAllAlertsButton"
        iconType={showClearSelection ? 'cross' : 'pagesSelect'}
        onClick={toggleSelectAll}
      >
        {selectClearAllText}
      </EuiButtonEmpty>
    </BulkActionsContainer>
  );
};

export const BulkActions = React.memo(BulkActionsComponent);
