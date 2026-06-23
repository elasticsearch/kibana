/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import type { KnowledgeIndicator } from '@kbn/streams-ai';

interface RuleActionsCellProps {
  rule: KnowledgeIndicator;
  onDeleteRequest: (rule: KnowledgeIndicator) => void;
  isDisabled?: boolean;
}

export function RuleActionsCell({
  rule,
  onDeleteRequest,
  isDisabled = false,
}: RuleActionsCellProps) {
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  return (
    <EuiPopover
      aria-label={RULE_ACTIONS_MENU_POPOVER_ARIA_LABEL}
      button={
        <EuiToolTip content={RULE_ACTIONS_MENU_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="boxesVertical"
            aria-label={RULE_ACTIONS_MENU_BUTTON_ARIA_LABEL}
            isDisabled={isDisabled}
            onClick={() => setIsActionsMenuOpen((current) => !current)}
          />
        </EuiToolTip>
      }
      isOpen={isActionsMenuOpen}
      closePopover={() => setIsActionsMenuOpen(false)}
      panelPaddingSize="none"
      anchorPosition="downRight"
    >
      <EuiContextMenuPanel
        items={[
          <EuiContextMenuItem
            key="query-delete"
            icon="trash"
            disabled={isDisabled}
            onClick={() => {
              setIsActionsMenuOpen(false);
              onDeleteRequest(rule);
            }}
          >
            {RULE_ACTION_DELETE_LABEL}
          </EuiContextMenuItem>,
        ]}
      />
    </EuiPopover>
  );
}

const RULE_ACTIONS_MENU_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.streams.rulesTable.actionsMenuButtonAriaLabel',
  {
    defaultMessage: 'Rule actions',
  }
);

const RULE_ACTIONS_MENU_POPOVER_ARIA_LABEL = i18n.translate(
  'xpack.streams.rulesTable.actionsMenuPopoverAriaLabel',
  {
    defaultMessage: 'Rule actions menu',
  }
);

const RULE_ACTION_DELETE_LABEL = i18n.translate('xpack.streams.rulesTable.action.delete', {
  defaultMessage: 'Delete',
});
